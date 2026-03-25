import { listStorageIngestJobs } from "@/lib/server/storage-ingest-store";
import {
  appendStorageHealthEvent,
  listStorageBags,
} from "@/lib/server/storage-registry-store";
import { runTonStorageRuntimePreflight } from "@/lib/server/storage-ton-runtime-preflight";
import { probeTonStorageUploadSourceForAsset } from "@/lib/server/storage-upload-worker";

export interface StorageAssetLiveReadinessSummary {
  checkedAt: string;
  assetId: string;
  sourceReady: boolean;
  sourceKind?: "source_url" | "telegram_file";
  bridgeUploadMode: string;
  bridgeReady: boolean;
  gatewayReady: boolean;
  serverUploadReady: boolean;
  nodeUploadReady: boolean;
  preparedJobId?: string;
  latestJobId?: string;
  latestJobStatus?: string;
  latestJobMode?: string;
  bagId?: string;
  bagStatus?: string;
  storagePointer?: string;
  runtimeFetchStatus?: string;
  runtimeFetchUrl?: string;
  endToEndReady: boolean;
  readyForLiveUpload: boolean;
  nextAction: string;
  notes: string[];
}

const buildAssetRuntimeEntityId = (assetId: string): string => {
  return `asset-${String(assetId || "").trim()}`;
};

export const buildStorageAssetLiveReadiness = async (input: {
  assetId: string;
}): Promise<StorageAssetLiveReadinessSummary> => {
  const checkedAt = new Date().toISOString();
  const assetId = String(input.assetId || "").trim();

  const [sourceProbe, preflight, jobs, bags] = await Promise.all([
    probeTonStorageUploadSourceForAsset({ assetId }),
    runTonStorageRuntimePreflight(),
    listStorageIngestJobs({ assetId, limit: 20 }),
    listStorageBags(),
  ]);

  const latestJob = jobs[0] ?? null;
  const preparedJob = jobs.find((job) => job.mode === "tonstorage_testnet" && job.status === "prepared") ?? null;
  const bag =
    bags
      .filter((entry) => entry.assetId === assetId)
      .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0] ??
    null;

  const endToEndReady = bag?.runtimeFetchStatus === "verified";
  const serverUploadReady =
    sourceProbe.ok &&
    preflight.overallReady &&
    Boolean(preparedJob || latestJob?.status === "prepared");
  const nodeUploadReady =
    sourceProbe.ok &&
    preflight.gatewayOk &&
    Boolean(preparedJob || latestJob?.status === "prepared");
  const readyForLiveUpload = serverUploadReady || nodeUploadReady;

  const nextAction = endToEndReady
    ? "Asset уже delivery-ready через runtime. Проверяй web или Telegram delivery."
    : !sourceProbe.ok
      ? sourceProbe.nextAction
      : !preparedJob
          ? "Подготовь runtime bags именно для этого asset, затем запускай живой upload."
          : serverUploadReady
            ? "Asset готов к живому upload. Можно запускать upload once на этом runtime или внешний worker."
            : nodeUploadReady
              ? "Asset готов к живому upload с локальной ноды. На Vercel bridge остаётся simulated, поэтому запускай desktop node или внешний worker, а не server-side upload once."
              : preflight.nextActions[0] || "Дожми bridge preflight перед живым upload.";

  const notes = [
    sourceProbe.sourceKind ? `source ${sourceProbe.sourceKind}` : "",
    latestJob ? `latest job ${latestJob.status}` : "jobs пока нет",
    preparedJob ? `prepared job ${preparedJob.id}` : "prepared job пока нет",
    bag ? `bag ${bag.status}` : "bag пока нет",
    bag?.runtimeFetchStatus ? `runtime ${bag.runtimeFetchStatus}` : "runtime ещё не подтверждён",
    nodeUploadReady && !serverUploadReady ? "живой upload должен идти с локальной ноды, а не с Vercel runtime" : "",
  ].filter(Boolean);

  const summary: StorageAssetLiveReadinessSummary = {
    checkedAt,
    assetId,
    sourceReady: sourceProbe.ok,
    sourceKind: sourceProbe.sourceKind,
    bridgeUploadMode: preflight.uploadMode,
    bridgeReady: preflight.overallReady,
    gatewayReady: preflight.gatewayOk,
    serverUploadReady,
    nodeUploadReady,
    preparedJobId: preparedJob?.id,
    latestJobId: latestJob?.id,
    latestJobStatus: latestJob?.status,
    latestJobMode: latestJob?.mode,
    bagId: bag?.id,
    bagStatus: bag?.status,
    storagePointer: bag?.tonstorageUri,
    runtimeFetchStatus: bag?.runtimeFetchStatus,
    runtimeFetchUrl: bag?.runtimeFetchUrl,
    endToEndReady,
    readyForLiveUpload,
    nextAction,
    notes,
  };

  await appendStorageHealthEvent({
    entityType: "runtime",
    entityId: buildAssetRuntimeEntityId(assetId),
    severity: summary.endToEndReady || summary.readyForLiveUpload ? "info" : "warning",
    code: summary.endToEndReady
      ? "asset_live_ready"
      : summary.serverUploadReady
        ? "asset_live_upload_ready"
        : summary.nodeUploadReady
          ? "asset_live_node_upload_ready"
          : "asset_live_blocked",
    message: nextAction,
  }).catch(() => null);

  return summary;
};
