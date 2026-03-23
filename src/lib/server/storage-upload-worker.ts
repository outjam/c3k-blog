import { C3K_STORAGE_ENABLED } from "@/lib/storage-config";
import {
  claimStorageIngestJob,
  getStorageIngestJob,
  listStorageIngestJobs,
  updateStorageIngestJob,
} from "@/lib/server/storage-ingest-store";
import {
  listStorageAssets,
  listStorageBags,
  upsertStorageBag,
} from "@/lib/server/storage-registry-store";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import type { StorageAsset, StorageBag, StorageIngestJob } from "@/types/storage";

const UPLOAD_WORKER_STALE_MS = 20 * 60 * 1000;

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

export interface SimulatedTonStorageUploadSummary {
  processed: number;
  uploaded: number;
  failed: number;
  remainingPrepared: number;
}

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
  const runtimeStatus = getStorageRuntimeStatus();

  if (!C3K_STORAGE_ENABLED || runtimeStatus.mode !== "tonstorage_testnet") {
    return null;
  }

  const lockId = `storage-upload-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
  const job = await claimStorageIngestJob({
    mode: "tonstorage_testnet",
    staleAfterMs: UPLOAD_WORKER_STALE_MS,
    lockId,
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
  });

  const completedJob = await updateStorageIngestJob(job.id, {
    bagId: bag?.id ?? job.bagId,
    status: "uploaded",
    storagePointer: input.tonstorageUri ?? bag?.tonstorageUri ?? input.bagExternalId ?? bag?.bagId ?? null,
    workerLockId: null,
    workerLockedAt: null,
    completedAt: new Date().toISOString(),
    failureCode: null,
    failureMessage: null,
    message: input.message ?? "TON Storage upload confirmed by external worker.",
  });

  return { ok: true, job: completedJob, bag };
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
