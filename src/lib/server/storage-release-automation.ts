import { runStorageIngest } from "@/lib/server/storage-ingest";
import { listStorageBags } from "@/lib/server/storage-registry-store";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import { runSingleTonStorageUploadCycle } from "@/lib/server/storage-upload-worker";

export interface ReleaseStorageAutomationSummary {
  runtimeMode: "test_prepare" | "tonstorage_testnet";
  runtimeLabel: string;
  assetIds: string[];
  ingestQueuedJobs: number;
  ingestPreparedJobs: number;
  ingestFailedJobs: number;
  ingestCreatedBags: number;
  ingestReusedBags: number;
  autoUploadAttempted: boolean;
  autoUploadProcessed: number;
  autoUploadUploaded: number;
  autoUploadFailed: number;
  uploadedBagCount: number;
  verifiedBagCount: number;
  message: string;
}

const normalizeAssetIds = (value: string[]): string[] => {
  return Array.from(
    new Set(
      value
        .map((entry) => String(entry || "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 256);
};

export const automatePublishedReleaseStorage = async (input: {
  assetIds: string[];
  requestedByTelegramUserId?: number;
}): Promise<
  | { ok: false; error: string }
  | { ok: true; summary: ReleaseStorageAutomationSummary }
> => {
  const assetIds = normalizeAssetIds(input.assetIds);

  if (assetIds.length === 0) {
    return {
      ok: false,
      error: "storage_assets_missing",
    };
  }

  const runtime = getStorageRuntimeStatus();
  const ingest = await runStorageIngest({
    assetIds,
    onlyMissingBags: false,
    limit: assetIds.length,
    mode: runtime.mode,
    requestedByTelegramUserId: input.requestedByTelegramUserId,
  });

  if (!ingest.ok) {
    return {
      ok: false,
      error: ingest.message,
    };
  }

  let autoUploadProcessed = 0;
  let autoUploadUploaded = 0;
  let autoUploadFailed = 0;

  if (runtime.mode === "tonstorage_testnet") {
    for (const assetId of assetIds) {
      const upload = await runSingleTonStorageUploadCycle({ assetId });
      autoUploadProcessed += upload.processed;
      autoUploadUploaded += upload.uploaded;
      autoUploadFailed += upload.failed;
    }
  }

  const bags = await listStorageBags();
  const scopedBags = bags.filter((bag) => assetIds.includes(bag.assetId));
  const uploadedBagCount = scopedBags.filter((bag) => bag.status === "uploaded" || bag.status === "healthy" || bag.status === "replicating").length;
  const verifiedBagCount = scopedBags.filter((bag) => bag.runtimeFetchStatus === "verified").length;

  const message =
    runtime.mode === "tonstorage_testnet"
      ? autoUploadUploaded > 0
        ? "Публикация автоматически подготовила asset, запустила upload и попыталась подтвердить runtime pointer."
        : "Публикация автоматически подготовила asset для TON Storage. Если runtime bridge ещё не готов, upload догонит внешний worker."
      : "Публикация автоматически подготовила asset в local test storage contour.";

  return {
    ok: true,
    summary: {
      runtimeMode: runtime.mode,
      runtimeLabel: runtime.label,
      assetIds,
      ingestQueuedJobs: ingest.summary.queuedJobs,
      ingestPreparedJobs: ingest.summary.preparedJobs,
      ingestFailedJobs: ingest.summary.failedJobs,
      ingestCreatedBags: ingest.summary.createdBags,
      ingestReusedBags: ingest.summary.reusedBags,
      autoUploadAttempted: runtime.mode === "tonstorage_testnet",
      autoUploadProcessed,
      autoUploadUploaded,
      autoUploadFailed,
      uploadedBagCount,
      verifiedBagCount,
      message,
    },
  };
};
