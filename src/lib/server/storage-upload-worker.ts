import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

import { C3K_STORAGE_ENABLED } from "@/lib/storage-config";
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
  upsertStorageBagFile,
  upsertStorageBag,
} from "@/lib/server/storage-registry-store";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import { reconcileStorageDeliveryRequestsForRuntimeAsset } from "@/lib/server/storage-delivery";
import type { StorageAsset, StorageBag, StorageIngestJob } from "@/types/storage";

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
  message?: string;
  error?: string;
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
    const createOutput = await runDaemonCliCommand(`create ${quoteCli(sourcePath)} -d ${quoteCli(createDescription)}`);
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

export const runSimulatedTonStorageUploadPass = async (
  limit = 5,
): Promise<SimulatedTonStorageUploadSummary> => {
  const safeLimit = Math.max(1, Math.min(20, Math.round(Number(limit) || 5)));
  let processed = 0;
  let uploaded = 0;
  let failed = 0;

  for (let index = 0; index < safeLimit; index += 1) {
    const claimed = await claimTonStorageUploadJob();

    if (!claimed) {
      break;
    }

    processed += 1;
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

  if (!claimed) {
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
