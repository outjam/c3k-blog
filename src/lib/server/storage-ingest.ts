import { C3K_STORAGE_TEST_MODE_INGEST_ENABLED } from "@/lib/storage-config";
import {
  createStorageIngestJob,
  listStorageIngestJobs,
  updateStorageIngestJob,
} from "@/lib/server/storage-ingest-store";
import {
  listStorageAssets,
  listStorageBags,
  upsertStorageBag,
  upsertStorageBagFile,
} from "@/lib/server/storage-registry-store";
import type {
  StorageAsset,
  StorageBag,
  StorageIngestJob,
} from "@/types/storage";

const BAG_STATUS_PRIORITY: Record<StorageBag["status"], number> = {
  healthy: 6,
  replicating: 5,
  uploaded: 4,
  created: 3,
  draft: 2,
  degraded: 1,
  disabled: 0,
};

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const pickPreferredBag = (bags: StorageBag[], assetId: string): StorageBag | null => {
  return (
    bags
      .filter((entry) => entry.assetId === assetId)
      .sort((left, right) => {
        const byStatus = BAG_STATUS_PRIORITY[right.status] - BAG_STATUS_PRIORITY[left.status];

        if (byStatus !== 0) {
          return byStatus;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })[0] ?? null
  );
};

const hasActiveBag = (bags: StorageBag[], assetId: string): boolean => {
  return bags.some((bag) => bag.assetId === assetId && bag.status !== "disabled");
};

const buildTestBagExternalId = (asset: StorageAsset): string => {
  const base = normalizeSafeId(
    `c3k-test-${asset.releaseSlug || asset.trackId || asset.id}-${asset.format}`,
    160,
  );

  return base || `c3k-test-${Date.now()}`;
};

const buildTestTonstorageUri = (bagId: string, fileName: string): string => {
  const normalizedFileName = normalizeSafeId(fileName.replace(/\./g, "-"), 120) || "asset";
  return `tonstorage://c3k-test/${bagId}/${normalizedFileName}`;
};

const inferBagFilePath = (asset: StorageAsset): string => {
  if (asset.fileName) {
    return asset.fileName;
  }

  const base = normalizeSafeId(asset.releaseSlug || asset.trackId || asset.id, 80) || "asset";
  return `${base}.${asset.format}`;
};

const buildBagDescription = (asset: StorageAsset): string => {
  const scope = asset.trackId ? `track ${asset.trackId}` : `release ${asset.releaseSlug || asset.id}`;
  return `Test ingest bag for ${scope} (${asset.format}, ${asset.assetType})`;
};

const buildQueuedJobId = (assetId: string, index: number): string => {
  return normalizeSafeId(`ingest:${assetId}:${Date.now()}:${index}`, 120) || `ingest-${Date.now()}-${index}`;
};

const buildSelectedAssetList = async (input: {
  assetIds?: string[];
  onlyMissingBags?: boolean;
  limit?: number;
}): Promise<StorageAsset[]> => {
  const [assets, bags] = await Promise.all([listStorageAssets(), listStorageBags()]);
  const assetIdSet =
    input.assetIds && input.assetIds.length > 0
      ? new Set(input.assetIds.map((entry) => normalizeSafeId(entry, 120)).filter(Boolean))
      : null;

  const filtered = assets
    .filter((asset) => (assetIdSet ? assetIdSet.has(asset.id) : true))
    .filter((asset) => (input.onlyMissingBags === false ? true : !hasActiveBag(bags, asset.id)))
    .sort((left, right) => left.id.localeCompare(right.id));

  return input.limit ? filtered.slice(0, input.limit) : filtered;
};

export interface StorageTestIngestJobSummary {
  jobId: string;
  assetId: string;
  bagId?: string;
  status: StorageIngestJob["status"];
  reusedBag: boolean;
  hasFetchableSource: boolean;
  storagePointer?: string;
  message?: string;
  failureCode?: string;
}

export interface StorageTestIngestRunSummary {
  queuedJobs: number;
  processedJobs: number;
  preparedJobs: number;
  failedJobs: number;
  reusedBags: number;
  createdBags: number;
  warningJobs: number;
  selectedAssets: number;
  skippedAssets: number;
  summaries: StorageTestIngestJobSummary[];
}

export const runTestStorageIngest = async (input?: {
  assetIds?: string[];
  onlyMissingBags?: boolean;
  limit?: number;
  requestedByTelegramUserId?: number;
}): Promise<
  | { ok: false; reason: "disabled"; message: string }
  | { ok: true; summary: StorageTestIngestRunSummary }
> => {
  if (!C3K_STORAGE_TEST_MODE_INGEST_ENABLED) {
    return {
      ok: false,
      reason: "disabled",
      message: "Test ingest pipeline disabled by C3K_STORAGE_TEST_MODE_INGEST_ENABLED.",
    };
  }

  const limit = normalizePositiveInt(input?.limit, 25);
  const selectedAssets = await buildSelectedAssetList({
    assetIds: input?.assetIds,
    onlyMissingBags: input?.onlyMissingBags,
    limit,
  });
  const scopedAssetIds = new Set(selectedAssets.map((asset) => asset.id));
  const assetScopeRequested = Boolean(input?.assetIds && input.assetIds.length > 0);
  const existingOpenJobs = await listStorageIngestJobs({
    statuses: ["queued", "processing"],
  });
  const openAssetIds = new Set(existingOpenJobs.map((job) => job.assetId));
  const queueableAssets = selectedAssets.filter((asset) => !openAssetIds.has(asset.id));

  const createdJobs: StorageIngestJob[] = [];

  for (const [index, asset] of queueableAssets.entries()) {
    const job = await createStorageIngestJob({
      id: buildQueuedJobId(asset.id, index),
      assetId: asset.id,
      mode: "test_prepare",
      status: "queued",
      requestedByTelegramUserId: input?.requestedByTelegramUserId,
      message: "Queued for test bag preparation.",
      attemptCount: 0,
    });

    if (job) {
      createdJobs.push(job);
    }
  }

  const queuedJobs =
    createdJobs.length > 0
      ? createdJobs
      : (await listStorageIngestJobs({ statuses: ["queued"] }))
          .filter((job) =>
            assetScopeRequested || scopedAssetIds.size > 0 ? scopedAssetIds.has(job.assetId) : true,
          )
          .sort(
            (left, right) =>
              new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime(),
          )
          .slice(0, limit);

  const assetMap = new Map(selectedAssets.map((asset) => [asset.id, asset]));
  const summaries: StorageTestIngestJobSummary[] = [];

  for (const job of queuedJobs) {
    const [currentAssetList, currentBagList] = await Promise.all([
      assetMap.size > 0 ? Promise.resolve(Array.from(assetMap.values())) : listStorageAssets(),
      listStorageBags(),
    ]);
    const currentAsset =
      assetMap.get(job.assetId) ?? currentAssetList.find((entry) => entry.id === job.assetId) ?? null;
    const existingBag = currentAsset ? pickPreferredBag(currentBagList, currentAsset.id) : null;
    const startedAt = new Date().toISOString();

    await updateStorageIngestJob(job.id, {
      status: "processing",
      startedAt,
      completedAt: null,
      attemptCount: job.attemptCount + 1,
      failureCode: null,
      failureMessage: null,
      message: "Preparing test bag metadata.",
    });

    if (!currentAsset) {
      const failureMessage = "Storage asset not found in registry.";
      await updateStorageIngestJob(job.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        failureCode: "asset_not_found",
        failureMessage,
        message: failureMessage,
      });
      summaries.push({
        jobId: job.id,
        assetId: job.assetId,
        status: "failed",
        reusedBag: false,
        hasFetchableSource: false,
        message: failureMessage,
        failureCode: "asset_not_found",
      });
      continue;
    }

    if (!currentAsset.sourceUrl && !currentAsset.audioFileId) {
      const failureMessage = "Asset has no sourceUrl or audioFileId for test ingest preparation.";
      await updateStorageIngestJob(job.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        failureCode: "missing_source_pointer",
        failureMessage,
        message: failureMessage,
      });
      summaries.push({
        jobId: job.id,
        assetId: currentAsset.id,
        status: "failed",
        reusedBag: false,
        hasFetchableSource: false,
        message: failureMessage,
        failureCode: "missing_source_pointer",
      });
      continue;
    }

    const bagExternalId = existingBag?.bagId ?? buildTestBagExternalId(currentAsset);
    const bagRecordId = existingBag?.id ?? `autobag:${currentAsset.id}`;
    const bagFilePath = inferBagFilePath(currentAsset);
    const tonstorageUri =
      existingBag?.tonstorageUri ?? buildTestTonstorageUri(bagExternalId, bagFilePath);
    const metaFileUrl = currentAsset.sourceUrl ?? existingBag?.metaFileUrl;
    const hasFetchableSource = Boolean(currentAsset.sourceUrl);
    const bagStatus: StorageBag["status"] = hasFetchableSource ? "healthy" : "created";
    const bag = await upsertStorageBag({
      id: bagRecordId,
      assetId: currentAsset.id,
      bagId: bagExternalId,
      description: buildBagDescription(currentAsset),
      tonstorageUri,
      metaFileUrl,
      status: bagStatus,
      replicasTarget: existingBag?.replicasTarget || 1,
      replicasActual: hasFetchableSource ? Math.max(1, existingBag?.replicasActual ?? 0) : 0,
    });

    if (!bag) {
      const failureMessage = "Failed to create or update test bag.";
      await updateStorageIngestJob(job.id, {
        status: "failed",
        completedAt: new Date().toISOString(),
        failureCode: "bag_upsert_failed",
        failureMessage,
        message: failureMessage,
      });
      summaries.push({
        jobId: job.id,
        assetId: currentAsset.id,
        status: "failed",
        reusedBag: Boolean(existingBag),
        hasFetchableSource,
        message: failureMessage,
        failureCode: "bag_upsert_failed",
      });
      continue;
    }

    await upsertStorageBagFile({
      id: `${bag.id}:${bagFilePath}`,
      bagId: bag.id,
      path: bagFilePath,
      sizeBytes: currentAsset.sizeBytes,
      priority: 0,
      mimeType: currentAsset.mimeType,
    });

    const storagePointer = bag.tonstorageUri ?? bag.bagId ?? currentAsset.resourceKey;
    const message = hasFetchableSource
      ? existingBag
        ? "Test bag metadata refreshed from storage asset."
        : "Test bag prepared from storage asset."
      : "Test bag prepared without fetchable source URL; delivery stays limited until sourceUrl is added.";

    await updateStorageIngestJob(job.id, {
      bagId: bag.id,
      status: "prepared",
      storagePointer,
      completedAt: new Date().toISOString(),
      failureCode: null,
      failureMessage: null,
      message,
    });

    summaries.push({
      jobId: job.id,
      assetId: currentAsset.id,
      bagId: bag.id,
      status: "prepared",
      reusedBag: Boolean(existingBag),
      hasFetchableSource,
      storagePointer,
      message,
    });
  }

  return {
    ok: true,
    summary: {
      queuedJobs: createdJobs.length,
      processedJobs: summaries.length,
      preparedJobs: summaries.filter((entry) => entry.status === "prepared").length,
      failedJobs: summaries.filter((entry) => entry.status === "failed").length,
      reusedBags: summaries.filter((entry) => entry.reusedBag && entry.status === "prepared").length,
      createdBags: summaries.filter((entry) => !entry.reusedBag && entry.status === "prepared").length,
      warningJobs: summaries.filter(
        (entry) => entry.status === "prepared" && !entry.hasFetchableSource,
      ).length,
      selectedAssets: selectedAssets.length,
      skippedAssets: Math.max(0, selectedAssets.length - queueableAssets.length),
      summaries,
    },
  };
};
