import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { C3K_STORAGE_ENABLED } from "@/lib/storage-config";
import { runStorageIngest } from "@/lib/server/storage-ingest";
import {
  claimStorageIngestJob,
  getStorageIngestJob,
  listStorageIngestJobs,
  updateStorageIngestJob,
} from "@/lib/server/storage-ingest-store";
import { telegramBotRequest } from "@/lib/server/telegram-bot";
import { verifyTonStorageRuntimePointer } from "@/lib/server/storage-ton-runtime-verification";
import {
  appendStorageHealthEvent,
  listStorageAssets,
  listStorageBags,
  upsertStorageBag,
  upsertStorageBagFile,
} from "@/lib/server/storage-registry-store";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import { reconcileStorageDeliveryRequestsForRuntimeAsset } from "@/lib/server/storage-delivery";
import { getTonStorageRuntimeBridgeStatus } from "@/lib/server/storage-ton-runtime-bridge";
import type { StorageAsset, StorageBag, StorageIngestJob, StorageIngestMode } from "@/types/storage";

const UPLOAD_WORKER_STALE_MS = 20 * 60 * 1000;
const execFileAsync = promisify(execFile);
const STORAGE_DAEMON_CLI_BIN = String(process.env.C3K_STORAGE_TON_DAEMON_CLI_BIN || "storage-daemon-cli").trim();
const STORAGE_UPLOAD_MODE = String(process.env.C3K_STORAGE_TON_UPLOAD_BRIDGE_MODE || "simulated")
  .trim()
  .toLowerCase();

const parseCliArgs = (): string[] => {
  const raw = String(process.env.C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON || "").trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
};

const STORAGE_DAEMON_CLI_ARGS = parseCliArgs();

const pickPreferredBag = (bags: StorageBag[], assetId: string): StorageBag | null => {
  const candidates = bags.filter((entry) => entry.assetId === assetId);

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt || left.createdAt);
    const rightTime = Date.parse(right.updatedAt || right.createdAt);
    return rightTime - leftTime;
  })[0] ?? null;
};

const fetchTelegramFileBytes = async (fileId: string): Promise<Uint8Array | null> => {
  const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

  if (!botToken || !fileId) {
    return null;
  }

  const fileInfo = await telegramBotRequest<TelegramFileInfo>("getFile", { file_id: fileId });

  if (!fileInfo.ok || !fileInfo.result?.file_path) {
    return null;
  }

  const response = await fetch(`https://api.telegram.org/file/bot${botToken}/${fileInfo.result.file_path}`, {
    method: "GET",
    cache: "no-store",
  }).catch(() => null);

  if (!response?.ok) {
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  return bytes.byteLength > 0 ? bytes : null;
};

const probeHttpSource = async (
  sourceUrl: string,
): Promise<{
  ok: boolean;
  httpStatus?: number;
  contentLength?: number;
  error?: string;
}> => {
  const headResponse = await fetch(sourceUrl, {
    method: "HEAD",
    cache: "no-store",
  }).catch(() => null);

  if (headResponse?.ok) {
    return {
      ok: true,
      httpStatus: headResponse.status,
      contentLength: Number(headResponse.headers.get("content-length") || "0") || undefined,
    };
  }

  const getResponse = await fetch(sourceUrl, {
    method: "GET",
    headers: {
      range: "bytes=0-0",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!getResponse) {
    return {
      ok: false,
      error: "source_url_fetch_failed",
    };
  }

  await getResponse.body?.cancel().catch(() => null);

  return {
    ok: getResponse.ok,
    httpStatus: getResponse.status,
    contentLength: Number(getResponse.headers.get("content-length") || "0") || undefined,
    error: getResponse.ok ? undefined : `source_url_http_${getResponse.status}`,
  };
};

export interface StorageUploadWorkerQueueStatus {
  runtimeMode: string;
  enabled: boolean;
  prepared: number;
  processing: number;
  uploaded: number;
  failed: number;
}

export interface ClaimedStorageUploadJob {
  job: StorageIngestJob;
  asset: StorageAsset;
  bag: StorageBag | null;
  uploadTarget: {
    sourceUrl?: string;
    audioFileId?: string;
    fileName?: string;
    mimeType?: string;
    sizeBytes: number;
    checksumSha256?: string;
    existingPointer?: string;
    existingBagExternalId?: string;
  };
}

export interface StorageUploadSourceBinary {
  ok: boolean;
  bytes?: Uint8Array;
  mimeType?: string;
  fileName?: string;
  sourceKind?: "source_url" | "telegram_file";
  error?: string;
}

export interface SimulatedTonStorageUploadSummary {
  processed: number;
  uploaded: number;
  failed: number;
  remainingPrepared: number;
}

export interface StorageUploadRunOnceSummary {
  processed: number;
  uploaded: number;
  failed: number;
  remainingPrepared: number;
  mode: string;
  jobId?: string;
  bagExternalId?: string;
  tonstorageUri?: string;
  runtimeFetchStatus?: StorageBag["runtimeFetchStatus"];
  runtimeFetchError?: string;
  message?: string;
  error?: string;
}

export interface StorageUploadSourceProbeSummary {
  checkedAt: string;
  assetId: string;
  ok: boolean;
  sourceKind?: "source_url" | "telegram_file";
  sourcePointer?: string;
  fileName?: string;
  mimeType?: string;
  httpStatus?: number;
  contentLength?: number;
  telegramFilePath?: string;
  bridgeUploadMode: string;
  realUploadReady: boolean;
  gatewayRetrievalReady: boolean;
  nextAction: string;
  error?: string;
}

export interface StoragePrepareAndUploadSummary {
  assetId: string;
  mode: StorageIngestMode;
  ingestSelectedAssets: number;
  ingestPreparedJobs: number;
  ingestFailedJobs: number;
  ingestCreatedBags: number;
  ingestReusedBags: number;
  upload: StorageUploadRunOnceSummary;
  endToEndReady: boolean;
  message: string;
}

interface TelegramFileInfo {
  file_path?: string;
}

const sanitizeFileName = (value: string | undefined): string => {
  const base = String(value || "asset.bin")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return base || "asset.bin";
};

const quoteCli = (value: string): string => {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

const parseBagIds = (value: string): string[] => {
  const matches = String(value || "").match(/\b[a-f0-9]{64}\b/gi) || [];
  return [...new Set(matches.map((entry) => entry.toLowerCase()))];
};

const runDaemonCliCommand = async (command: string): Promise<string> => {
  const { stdout, stderr } = await execFileAsync(
    STORAGE_DAEMON_CLI_BIN,
    [...STORAGE_DAEMON_CLI_ARGS, "-c", command],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return [stdout, stderr].filter(Boolean).join("\n").trim();
};

const listTonStorageBagIds = async (): Promise<string[]> => {
  const output = await runDaemonCliCommand("list --hashes");
  return parseBagIds(output);
};

const buildAssetRuntimeEntityId = (assetId: string): string => {
  return `asset-${String(assetId || "").trim()}`;
};

const appendAssetRuntimeEvent = async (input: {
  assetId: string;
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
}) => {
  const assetId = String(input.assetId || "").trim();

  if (!assetId) {
    return;
  }

  await appendStorageHealthEvent({
    entityType: "runtime",
    entityId: buildAssetRuntimeEntityId(assetId),
    severity: input.severity,
    code: input.code,
    message: input.message,
  }).catch(() => null);
};

const mapUploadFailureToAssetEventCode = (failureCode: string | undefined): string => {
  switch (String(failureCode || "").trim()) {
    case "source_url_fetch_failed":
    case "telegram_file_fetch_failed":
    case "missing_source_pointer":
    case "empty_source_payload":
      return "upload_source_fetch_failed";
    default:
      return "upload_cycle_failed";
  }
};

const uploadViaTonStorageCli = async (
  claimed: ClaimedStorageUploadJob,
  source: Required<Pick<StorageUploadSourceBinary, "bytes" | "fileName">>,
): Promise<{
  bagExternalId: string;
  tonstorageUri: string;
  filePath: string;
  replicasActual: number;
  replicasTarget: number;
  bagStatus: StorageBag["status"];
  message: string;
}> => {
  const tempDir = await mkdtemp(join(tmpdir(), "c3k-tonstorage-upload-"));
  const safeFileName = sanitizeFileName(
    claimed.asset.fileName || claimed.uploadTarget.fileName || source.fileName || basename(`asset.${claimed.asset.format || "bin"}`),
  );
  const sourcePath = join(tempDir, safeFileName);

  try {
    await writeFile(sourcePath, Buffer.from(source.bytes));

    const beforeBagIds = await listTonStorageBagIds();
    const createDescription = `C3K ${claimed.asset.releaseSlug || claimed.asset.id || claimed.job.id || "asset"}`;
    const createOutput = await runDaemonCliCommand(
      `create --copy --json ${quoteCli(sourcePath)} -d ${quoteCli(createDescription)}`,
    );
    const afterBagIds = await listTonStorageBagIds();
    const createdBagId = afterBagIds.find((entry) => !beforeBagIds.includes(entry)) || parseBagIds(createOutput)[0];

    if (!createdBagId) {
      throw new Error("storage-daemon-cli did not return a BagID");
    }

    return {
      bagExternalId: createdBagId,
      tonstorageUri: `tonstorage://${createdBagId}/${safeFileName}`,
      filePath: safeFileName,
      replicasActual: 1,
      replicasTarget: 3,
      bagStatus: "uploaded",
      message: `storage-daemon-cli created bag ${createdBagId}.`,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
};

export const getStorageUploadWorkerQueueStatus = async (): Promise<StorageUploadWorkerQueueStatus> => {
  const runtimeStatus = getStorageRuntimeStatus();
  const jobs = await listStorageIngestJobs({ limit: 500 });
  const scoped = jobs.filter((job) => job.mode === "tonstorage_testnet");

  return {
    runtimeMode: runtimeStatus.mode,
    enabled: C3K_STORAGE_ENABLED && runtimeStatus.mode === "tonstorage_testnet",
    prepared: scoped.filter((job) => job.status === "prepared").length,
    processing: scoped.filter((job) => job.status === "processing").length,
    uploaded: scoped.filter((job) => job.status === "uploaded").length,
    failed: scoped.filter((job) => job.status === "failed").length,
  };
};

export const claimTonStorageUploadJob = async (): Promise<ClaimedStorageUploadJob | null> => {
  return claimTonStorageUploadJobTargeted({});
};

export const claimTonStorageUploadJobTargeted = async (input?: {
  assetId?: string;
  bagId?: string;
  jobId?: string;
}): Promise<ClaimedStorageUploadJob | null> => {
  const runtimeStatus = getStorageRuntimeStatus();

  if (!C3K_STORAGE_ENABLED || runtimeStatus.mode !== "tonstorage_testnet") {
    return null;
  }

  const lockId = `storage-upload-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const job = await claimStorageIngestJob({
    mode: "tonstorage_testnet",
    staleAfterMs: UPLOAD_WORKER_STALE_MS,
    lockId,
    assetId: input?.assetId,
    bagId: input?.bagId,
    jobId: input?.jobId,
  });

  if (!job) {
    return null;
  }

  const [assets, bags] = await Promise.all([listStorageAssets(), listStorageBags()]);
  const asset = assets.find((entry) => entry.id === job.assetId);

  if (!asset) {
    await updateStorageIngestJob(job.id, {
      status: "failed",
      workerLockId: null,
      workerLockedAt: null,
      completedAt: new Date().toISOString(),
      failureCode: "asset_not_found",
      failureMessage: "Asset disappeared before upload worker claim.",
      message: "Asset disappeared before upload worker claim.",
    });
    return null;
  }

  const bag = (job.bagId ? bags.find((entry) => entry.id === job.bagId) ?? null : null) ?? pickPreferredBag(bags, asset.id);

  return {
    job,
    asset,
    bag,
    uploadTarget: {
      sourceUrl: asset.sourceUrl,
      audioFileId: asset.audioFileId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      sizeBytes: asset.sizeBytes,
      checksumSha256: asset.checksumSha256,
      existingPointer: bag?.tonstorageUri,
      existingBagExternalId: bag?.bagId,
    },
  };
};

export const completeTonStorageUploadJob = async (input: {
  jobId: string;
  workerLockId: string;
  ok: boolean;
  bagExternalId?: string;
  tonstorageUri?: string;
  metaFileUrl?: string;
  filePath?: string;
  replicasActual?: number;
  replicasTarget?: number;
  bagStatus?: StorageBag["status"];
  message?: string;
  failureCode?: string;
  failureMessage?: string;
}): Promise<{
  ok: boolean;
  reason?: string;
  job?: StorageIngestJob | null;
  bag?: StorageBag | null;
}> => {
  const job = await getStorageIngestJob(input.jobId);

  if (!job) {
    return { ok: false, reason: "job_not_found" };
  }

  if (job.mode !== "tonstorage_testnet") {
    return { ok: false, reason: "wrong_mode" };
  }

  if (!job.workerLockId || job.workerLockId !== input.workerLockId) {
    return { ok: false, reason: "lock_mismatch" };
  }

  const [assets, bags] = await Promise.all([listStorageAssets(), listStorageBags()]);
  const asset = assets.find((entry) => entry.id === job.assetId);

  if (!asset) {
    const failedJob = await updateStorageIngestJob(job.id, {
      status: "failed",
      workerLockId: null,
      workerLockedAt: null,
      completedAt: new Date().toISOString(),
      failureCode: "asset_not_found",
      failureMessage: "Asset not found during upload completion.",
      message: "Asset not found during upload completion.",
    });
    await appendAssetRuntimeEvent({
      assetId: job.assetId,
      severity: "warning",
      code: "upload_cycle_failed",
      message: `Upload completion не нашёл asset ${job.assetId}.`,
    });
    return { ok: false, reason: "asset_not_found", job: failedJob };
  }

  const existingBag =
    (job.bagId ? bags.find((entry) => entry.id === job.bagId) ?? null : null) ?? pickPreferredBag(bags, asset.id);

  if (!input.ok) {
    const failedJob = await updateStorageIngestJob(job.id, {
      status: "failed",
      workerLockId: null,
      workerLockedAt: null,
      completedAt: new Date().toISOString(),
      failureCode: input.failureCode ?? "upload_failed",
      failureMessage: input.failureMessage ?? "External storage upload worker reported failure.",
      message: input.message ?? "TON Storage upload failed.",
    });

    const failedBag =
      existingBag
        ? await upsertStorageBag({
            id: existingBag.id,
            assetId: existingBag.assetId,
            bagId: existingBag.bagId,
            description: existingBag.description,
            tonstorageUri: existingBag.tonstorageUri,
            metaFileUrl: existingBag.metaFileUrl,
            runtimeMode: "tonstorage_testnet",
            runtimeLabel: "TON Storage testnet",
            status: "degraded",
            replicasTarget: existingBag.replicasTarget,
            replicasActual: existingBag.replicasActual,
          })
        : null;

    await appendAssetRuntimeEvent({
      assetId: asset.id,
      severity: "warning",
      code: mapUploadFailureToAssetEventCode(input.failureCode),
      message:
        input.failureMessage ??
        input.message ??
        `Upload cycle не завершился успешно для ${asset.id}.`,
    });

    return { ok: true, job: failedJob, bag: failedBag };
  }

  const bag = await upsertStorageBag({
    id: existingBag?.id ?? job.bagId ?? `autobag:${asset.id}`,
    assetId: asset.id,
    bagId: input.bagExternalId ?? existingBag?.bagId,
    description: existingBag?.description,
    tonstorageUri: input.tonstorageUri ?? existingBag?.tonstorageUri,
    metaFileUrl: input.metaFileUrl ?? existingBag?.metaFileUrl ?? asset.sourceUrl,
    runtimeMode: "tonstorage_testnet",
    runtimeLabel: "TON Storage testnet",
    status:
      input.bagStatus ??
      ((input.replicasActual ?? existingBag?.replicasActual ?? 1) > 0 ? "uploaded" : "created"),
    replicasTarget: input.replicasTarget ?? existingBag?.replicasTarget ?? 3,
    replicasActual: input.replicasActual ?? existingBag?.replicasActual ?? 1,
    runtimeFetchStatus: "pending",
    runtimeFetchCheckedAt: null,
    runtimeFetchVerifiedAt: null,
    runtimeFetchUrl: null,
    runtimeFetchError: null,
  });

  const bagFilePath =
    String(input.filePath ?? "").trim() || asset.fileName || `${asset.id}.${asset.format}`;

  if (bag) {
    await upsertStorageBagFile({
      id: `${bag.id}:${bagFilePath}`,
      bagId: bag.id,
      path: bagFilePath,
      sizeBytes: asset.sizeBytes,
      priority: 0,
      mimeType: asset.mimeType,
    });
  }

  const verification =
    bag
      ? await verifyTonStorageRuntimePointer({
          bagId: bag.bagId,
          storagePointer: input.tonstorageUri ?? bag.tonstorageUri,
          filePath: bagFilePath,
        })
      : null;

  const verifiedBag =
    bag && verification
      ? await upsertStorageBag({
          id: bag.id,
          assetId: bag.assetId,
          bagId: bag.bagId,
          description: bag.description,
          tonstorageUri: bag.tonstorageUri,
          metaFileUrl: bag.metaFileUrl,
          runtimeMode: bag.runtimeMode,
          runtimeLabel: bag.runtimeLabel,
          status: verification.status === "verified" ? "healthy" : bag.status,
          replicasTarget: bag.replicasTarget,
          replicasActual: bag.replicasActual,
          runtimeFetchStatus: verification.status,
          runtimeFetchCheckedAt: verification.checkedAt,
          runtimeFetchVerifiedAt: verification.verifiedAt ?? null,
          runtimeFetchUrl: verification.gatewayUrl ?? null,
          runtimeFetchError: verification.error ?? null,
        })
      : bag;

  if (verifiedBag && verification?.status === "verified") {
    await appendStorageHealthEvent({
      entityType: "bag",
      entityId: verifiedBag.id,
      severity: "info",
      code: "runtime_fetch_verified",
      message: `Gateway подтвердил доступность ${verifiedBag.tonstorageUri || verifiedBag.bagId || verifiedBag.id}.`,
    });
  } else if (verifiedBag && verification?.status === "failed") {
    await appendStorageHealthEvent({
      entityType: "bag",
      entityId: verifiedBag.id,
      severity: "warning",
      code: "runtime_fetch_failed",
      message: verification.error || "Gateway пока не смог подтвердить runtime pointer.",
    });
  }

  const completedJob = await updateStorageIngestJob(job.id, {
    bagId: verifiedBag?.id ?? bag?.id ?? job.bagId,
    status: "uploaded",
    storagePointer:
      input.tonstorageUri ?? verifiedBag?.tonstorageUri ?? bag?.tonstorageUri ?? input.bagExternalId ?? verifiedBag?.bagId ?? bag?.bagId ?? null,
    workerLockId: null,
    workerLockedAt: null,
    completedAt: new Date().toISOString(),
    failureCode: null,
    failureMessage: null,
    message:
      verification?.status === "verified"
        ? input.message ?? "TON Storage upload confirmed and gateway-verified."
        : verification?.status === "failed"
          ? `${input.message ?? "TON Storage upload confirmed."} Gateway verification still failing.`
        : input.message ?? "TON Storage upload confirmed by external worker.",
  });

  if (verifiedBag) {
    await reconcileStorageDeliveryRequestsForRuntimeAsset({
      assetId: asset.id,
      bagId: verifiedBag.id,
    }).catch(() => null);
  }

  await appendAssetRuntimeEvent({
    assetId: asset.id,
    severity: verification?.status === "failed" ? "warning" : "info",
    code: verification?.status === "failed" ? "upload_cycle_failed" : "upload_cycle_completed",
    message:
      verification?.status === "failed"
        ? `Upload завершён для ${asset.id}, но gateway verification пока не прошёл.`
        : `Upload cycle завершён для ${asset.id}.`,
  });

  return { ok: true, job: completedJob, bag: verifiedBag ?? bag };
};

export const fetchTonStorageUploadSource = async (input: {
  jobId: string;
  workerLockId: string;
}): Promise<StorageUploadSourceBinary> => {
  const job = await getStorageIngestJob(input.jobId);

  if (!job) {
    return { ok: false, error: "job_not_found" };
  }

  if (job.mode !== "tonstorage_testnet") {
    return { ok: false, error: "wrong_mode" };
  }

  if (!job.workerLockId || job.workerLockId !== input.workerLockId) {
    return { ok: false, error: "lock_mismatch" };
  }

  const assets = await listStorageAssets();
  const asset = assets.find((entry) => entry.id === job.assetId);

  if (!asset) {
    return { ok: false, error: "asset_not_found" };
  }

  if (asset.sourceUrl) {
    const response = await fetch(asset.sourceUrl, {
      method: "GET",
      cache: "no-store",
    }).catch(() => null);

    if (!response?.ok) {
      return { ok: false, error: "source_url_fetch_failed" };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength === 0) {
      return { ok: false, error: "empty_source_payload" };
    }

    return {
      ok: true,
      bytes,
      mimeType: asset.mimeType || response.headers.get("content-type") || "application/octet-stream",
      fileName: asset.fileName || `${asset.id}.${asset.format}`,
      sourceKind: "source_url",
    };
  }

  if (asset.audioFileId) {
    const bytes = await fetchTelegramFileBytes(asset.audioFileId);

    if (!bytes) {
      return { ok: false, error: "telegram_file_fetch_failed" };
    }

    return {
      ok: true,
      bytes,
      mimeType: asset.mimeType || "application/octet-stream",
      fileName: asset.fileName || `${asset.id}.${asset.format}`,
      sourceKind: "telegram_file",
    };
  }

  return { ok: false, error: "missing_source_pointer" };
};

export const probeTonStorageUploadSourceForAsset = async (input: {
  assetId: string;
}): Promise<StorageUploadSourceProbeSummary> => {
  const checkedAt = new Date().toISOString();
  const assetId = String(input.assetId || "").trim();
  const bridgeStatus = getTonStorageRuntimeBridgeStatus();
  const assets = await listStorageAssets();
  const asset = assets.find((entry) => entry.id === assetId) ?? null;

  if (!asset) {
    return {
      checkedAt,
      assetId,
      ok: false,
      bridgeUploadMode: bridgeStatus.uploadMode,
      realUploadReady: bridgeStatus.realUploadReady,
      gatewayRetrievalReady: bridgeStatus.gatewayRetrievalReady,
      nextAction: "Такого asset нет в storage registry.",
      error: "asset_not_found",
    };
  }

  if (asset.sourceUrl) {
    const sourceProbe = await probeHttpSource(asset.sourceUrl);
    const summary: StorageUploadSourceProbeSummary = {
      checkedAt,
      assetId: asset.id,
      ok: sourceProbe.ok,
      sourceKind: "source_url",
      sourcePointer: asset.sourceUrl,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      httpStatus: sourceProbe.httpStatus,
      contentLength: sourceProbe.contentLength,
      bridgeUploadMode: bridgeStatus.uploadMode,
      realUploadReady: bridgeStatus.realUploadReady,
      gatewayRetrievalReady: bridgeStatus.gatewayRetrievalReady,
      nextAction: !sourceProbe.ok
        ? "Проверь доступность source URL и только потом запускай upload."
        : bridgeStatus.uploadMode !== "tonstorage_cli"
          ? "Источник доступен. Для живого TON Storage upload переключи bridge на tonstorage_cli."
          : !bridgeStatus.realUploadReady
            ? "Источник доступен. Дожми daemon CLI и worker secret, затем запускай upload."
            : "Источник доступен. Можно запускать upload once или внешний worker.",
      error: sourceProbe.error,
    };

    await appendAssetRuntimeEvent({
      assetId: asset.id,
      severity: summary.ok ? "info" : "warning",
      code: summary.ok ? "asset_source_probe_ready" : "asset_source_probe_failed",
      message: summary.ok
        ? `Source URL подтверждён для ${asset.id}.`
        : `Source URL недоступен для ${asset.id}: ${summary.error || "probe failed"}.`,
    });

    return summary;
  }

  if (asset.audioFileId) {
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

    if (!botToken) {
      const summary: StorageUploadSourceProbeSummary = {
        checkedAt,
        assetId: asset.id,
        ok: false,
        sourceKind: "telegram_file",
        sourcePointer: asset.audioFileId,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        bridgeUploadMode: bridgeStatus.uploadMode,
        realUploadReady: bridgeStatus.realUploadReady,
        gatewayRetrievalReady: bridgeStatus.gatewayRetrievalReady,
        nextAction: "Задай TELEGRAM_BOT_TOKEN, чтобы worker мог получить исходный файл из Telegram.",
        error: "telegram_bot_token_missing",
      };

      await appendAssetRuntimeEvent({
        assetId: asset.id,
        severity: "warning",
        code: "asset_source_probe_failed",
        message: "Для Telegram source не хватает TELEGRAM_BOT_TOKEN.",
      });

      return summary;
    }

    const fileInfo = await telegramBotRequest<TelegramFileInfo>("getFile", { file_id: asset.audioFileId });

    if (!fileInfo.ok || !fileInfo.result?.file_path) {
      const summary: StorageUploadSourceProbeSummary = {
        checkedAt,
        assetId: asset.id,
        ok: false,
        sourceKind: "telegram_file",
        sourcePointer: asset.audioFileId,
        fileName: asset.fileName,
        mimeType: asset.mimeType,
        bridgeUploadMode: bridgeStatus.uploadMode,
        realUploadReady: bridgeStatus.realUploadReady,
        gatewayRetrievalReady: bridgeStatus.gatewayRetrievalReady,
        nextAction: "Проверь, что audioFileId ещё валиден и бот может вызвать getFile.",
        error: "telegram_file_probe_failed",
      };

      await appendAssetRuntimeEvent({
        assetId: asset.id,
        severity: "warning",
        code: "asset_source_probe_failed",
        message: `Telegram source недоступен для ${asset.id}.`,
      });

      return summary;
    }

    const summary: StorageUploadSourceProbeSummary = {
      checkedAt,
      assetId: asset.id,
      ok: true,
      sourceKind: "telegram_file",
      sourcePointer: asset.audioFileId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      telegramFilePath: fileInfo.result.file_path,
      bridgeUploadMode: bridgeStatus.uploadMode,
      realUploadReady: bridgeStatus.realUploadReady,
      gatewayRetrievalReady: bridgeStatus.gatewayRetrievalReady,
      nextAction:
        bridgeStatus.uploadMode !== "tonstorage_cli"
          ? "Источник доступен через Telegram. Для живого upload переключи bridge на tonstorage_cli."
          : !bridgeStatus.realUploadReady
            ? "Telegram source доступен. Дожми daemon CLI и worker secret, затем запускай upload."
            : "Telegram source доступен. Можно запускать upload once или внешний worker.",
    };

    await appendAssetRuntimeEvent({
      assetId: asset.id,
      severity: "info",
      code: "asset_source_probe_ready",
      message: `Telegram source подтверждён для ${asset.id}.`,
    });

    return summary;
  }

  const summary: StorageUploadSourceProbeSummary = {
    checkedAt,
    assetId: asset.id,
    ok: false,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    bridgeUploadMode: bridgeStatus.uploadMode,
    realUploadReady: bridgeStatus.realUploadReady,
    gatewayRetrievalReady: bridgeStatus.gatewayRetrievalReady,
    nextAction: "Укажи source URL или Telegram file id для этого asset перед живым upload.",
    error: "missing_source_pointer",
  };

  await appendAssetRuntimeEvent({
    assetId: asset.id,
    severity: "warning",
    code: "asset_source_probe_failed",
    message: `У ${asset.id} нет source URL или Telegram file id для live upload.`,
  });

  return summary;
};

export const runSimulatedTonStorageUploadPass = async (
  limit = 5,
): Promise<SimulatedTonStorageUploadSummary> => {
  const safeLimit = Math.max(1, Math.min(20, Math.round(Number(limit) || 5)));
  let processed = 0;
  let uploaded = 0;
  let failed = 0;

  for (let index = 0; index < safeLimit; index += 1) {
    let claimed: ClaimedStorageUploadJob | null = null;

    try {
      claimed = await claimTonStorageUploadJob();
    } catch {
      failed += 1;
      continue;
    }

    if (!claimed) {
      break;
    }

    processed += 1;
    try {
      const simulatedPointer =
        claimed.bag?.tonstorageUri ??
        `tonstorage://testnet/c3k-runtime/${claimed.bag?.bagId || claimed.job.bagId || claimed.asset.id}`;

      const result = await completeTonStorageUploadJob({
        jobId: claimed.job.id,
        workerLockId: claimed.job.workerLockId || "",
        ok: Boolean(claimed.uploadTarget.sourceUrl || claimed.uploadTarget.audioFileId),
        bagExternalId: claimed.bag?.bagId,
        tonstorageUri: simulatedPointer,
        metaFileUrl: claimed.uploadTarget.sourceUrl ?? claimed.bag?.metaFileUrl,
        filePath: claimed.asset.fileName,
        replicasActual: Math.max(1, claimed.bag?.replicasActual ?? 1),
        replicasTarget: Math.max(1, claimed.bag?.replicasTarget ?? 3),
        bagStatus: "uploaded",
        message: "Simulated TON Storage upload completed in test mode.",
        failureCode: "missing_source_pointer",
        failureMessage: "Simulated upload could not proceed without sourceUrl or audioFileId.",
      });

      if (result.ok && result.job?.status === "uploaded") {
        uploaded += 1;
      } else {
        failed += 1;
      }
    } catch {
      failed += 1;
    }
  }

  const status = await getStorageUploadWorkerQueueStatus();

  return {
    processed,
    uploaded,
    failed,
    remainingPrepared: status.prepared,
  };
};

export const runSingleTonStorageUploadCycle = async (input?: {
  assetId?: string;
  bagId?: string;
  jobId?: string;
}): Promise<StorageUploadRunOnceSummary> => {
  const claimed = await claimTonStorageUploadJobTargeted(input);
  const targetedAssetId = String(input?.assetId || "").trim() || claimed?.asset.id || "";

  if (!claimed) {
    await appendAssetRuntimeEvent({
      assetId: targetedAssetId,
      severity: "warning",
      code: "upload_cycle_not_found",
      message: "Upload cycle не нашёл prepared job для выбранного asset.",
    });
    const status = await getStorageUploadWorkerQueueStatus();
    return {
      processed: 0,
      uploaded: 0,
      failed: 0,
      remainingPrepared: status.prepared,
      mode: STORAGE_UPLOAD_MODE,
      message: "Prepared jobs не найдены.",
    };
  }

  const source = await fetchTonStorageUploadSource({
    jobId: claimed.job.id,
    workerLockId: claimed.job.workerLockId || "",
  });

  if (!source.ok || !source.bytes || !source.fileName) {
    await completeTonStorageUploadJob({
      jobId: claimed.job.id,
      workerLockId: claimed.job.workerLockId || "",
      ok: false,
      failureCode: source.error || "source_fetch_failed",
      failureMessage: source.error || "Не удалось получить исходный файл для upload.",
      message: source.error || "Не удалось получить исходный файл для upload.",
    }).catch(() => null);

    const status = await getStorageUploadWorkerQueueStatus();
    return {
      processed: 1,
      uploaded: 0,
      failed: 1,
      remainingPrepared: status.prepared,
      mode: STORAGE_UPLOAD_MODE,
      jobId: claimed.job.id,
      error: source.error || "source_fetch_failed",
    };
  }

  try {
    const uploadResult =
      STORAGE_UPLOAD_MODE === "tonstorage_cli"
        ? await uploadViaTonStorageCli(claimed, {
            bytes: source.bytes,
            fileName: source.fileName,
          })
        : {
            bagExternalId: claimed.bag?.bagId,
            tonstorageUri:
              claimed.bag?.tonstorageUri ??
              `tonstorage://testnet/c3k-runtime/${claimed.bag?.bagId || claimed.job.bagId || claimed.asset.id}`,
            filePath: sanitizeFileName(source.fileName),
            replicasActual: Math.max(1, claimed.bag?.replicasActual ?? 1),
            replicasTarget: Math.max(1, claimed.bag?.replicasTarget ?? 3),
            bagStatus: "uploaded" as StorageBag["status"],
            message: "Server-side simulated upload completed.",
          };

    const result = await completeTonStorageUploadJob({
      jobId: claimed.job.id,
      workerLockId: claimed.job.workerLockId || "",
      ok: true,
      bagExternalId: uploadResult.bagExternalId,
      tonstorageUri: uploadResult.tonstorageUri,
      metaFileUrl: claimed.uploadTarget.sourceUrl ?? claimed.bag?.metaFileUrl,
      filePath: uploadResult.filePath,
      replicasActual: uploadResult.replicasActual,
      replicasTarget: uploadResult.replicasTarget,
      bagStatus: uploadResult.bagStatus,
      message: uploadResult.message,
    });

    const status = await getStorageUploadWorkerQueueStatus();
    return {
      processed: 1,
      uploaded: result.ok && result.job?.status === "uploaded" ? 1 : 0,
      failed: result.ok && result.job?.status === "uploaded" ? 0 : 1,
      remainingPrepared: status.prepared,
      mode: STORAGE_UPLOAD_MODE,
      jobId: claimed.job.id,
      bagExternalId: uploadResult.bagExternalId,
      tonstorageUri: uploadResult.tonstorageUri,
      runtimeFetchStatus: result.bag?.runtimeFetchStatus,
      runtimeFetchError: result.bag?.runtimeFetchError,
      message: uploadResult.message,
      error: result.ok ? undefined : result.reason,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "upload_failed";
    await completeTonStorageUploadJob({
      jobId: claimed.job.id,
      workerLockId: claimed.job.workerLockId || "",
      ok: false,
      failureCode: "server_upload_failed",
      failureMessage: message,
      message,
    }).catch(() => null);
    const status = await getStorageUploadWorkerQueueStatus();
    return {
      processed: 1,
      uploaded: 0,
      failed: 1,
      remainingPrepared: status.prepared,
      mode: STORAGE_UPLOAD_MODE,
      jobId: claimed.job.id,
      error: message,
    };
  }
};

export const runPrepareAndUploadStorageAssetCycle = async (input: {
  assetId: string;
  mode?: StorageIngestMode;
  requestedByTelegramUserId?: number;
}): Promise<
  | { ok: false; error: string }
  | { ok: true; summary: StoragePrepareAndUploadSummary }
> => {
  const assetId = String(input.assetId || "").trim();

  if (!assetId) {
    return {
      ok: false,
      error: "assetId is required",
    };
  }

  const mode = input.mode ?? "tonstorage_testnet";
  const ingest = await runStorageIngest({
    assetIds: [assetId],
    onlyMissingBags: false,
    limit: 1,
    mode,
    requestedByTelegramUserId: input.requestedByTelegramUserId,
  });

  if (!ingest.ok) {
    return {
      ok: false,
      error: ingest.message,
    };
  }

  const upload = await runSingleTonStorageUploadCycle({ assetId });
  const endToEndReady = upload.uploaded > 0 && upload.runtimeFetchStatus === "verified";
  const message =
    upload.processed === 0
      ? "Ingest завершён, но upload stage не нашёл prepared job."
      : upload.runtimeFetchStatus === "verified"
        ? "Asset подготовлен, загружен и подтверждён через runtime gateway."
        : upload.runtimeFetchStatus === "failed"
          ? "Asset подготовлен и загружен, но runtime gateway пока не подтвердил pointer."
          : upload.uploaded > 0
            ? "Asset подготовлен и загружен, runtime verification ещё не подтверждён."
            : "Asset подготовлен, но upload не завершился успешно.";

  return {
    ok: true,
    summary: {
      assetId,
      mode,
      ingestSelectedAssets: ingest.summary.selectedAssets,
      ingestPreparedJobs: ingest.summary.preparedJobs,
      ingestFailedJobs: ingest.summary.failedJobs,
      ingestCreatedBags: ingest.summary.createdBags,
      ingestReusedBags: ingest.summary.reusedBags,
      upload,
      endToEndReady,
      message,
    },
  };
};
