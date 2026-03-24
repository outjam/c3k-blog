import { getStorageIngestState } from "@/lib/server/storage-ingest-store";
import { getStorageRegistrySnapshot } from "@/lib/server/storage-registry-store";
import type { ArtistReleaseStorageSummary } from "@/types/shop";
import type { StorageAsset, StorageBag, StorageBagFile, StorageIngestJob } from "@/types/storage";

const parseTimestamp = (value: string | undefined): number => {
  const timestamp = new Date(value ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const formatStorageLabel = (value: ArtistReleaseStorageSummary["status"]): string => {
  switch (value) {
    case "verified":
      return "Проверен в storage";
    case "archived":
      return "Архивирован";
    case "prepared":
      return "Готов к upload";
    case "syncing":
      return "Готовится";
    case "attention":
      return "Нужно внимание";
    default:
      return "Ещё не в storage";
  }
};

const formatStorageNote = (input: {
  status: ArtistReleaseStorageSummary["status"];
  assetCount: number;
  sourceReadyAssetCount: number;
  bagCount: number;
  uploadedBagCount: number;
  verifiedBagCount: number;
  failedBagCount: number;
  pendingJobCount: number;
  preparedJobCount: number;
  failedJobCount: number;
  pointerReadyCount: number;
}): string => {
  if (input.status === "verified") {
    return `${input.verifiedBagCount} bag подтверждён через runtime, релиз уже можно считать честно архивированным.`;
  }

  if (input.status === "archived") {
    return `${input.uploadedBagCount} bag уже загружен, но runtime verification ещё не завершён.`;
  }

  if (input.status === "prepared") {
    return `Metadata и pointer уже готовы. Осталось прогнать upload worker для ${input.preparedJobCount} job.`;
  }

  if (input.status === "syncing") {
    return `Assets уже созданы (${input.assetCount}), сейчас идёт подготовка bag/runtime слоя.`;
  }

  if (input.status === "attention") {
    if (input.failedJobCount > 0) {
      return `Есть ${input.failedJobCount} failed ingest job. Нужно проверить source, bag и runtime contour.`;
    }

    if (input.failedBagCount > 0) {
      return `Есть ${input.failedBagCount} bag с runtime problem. Нужен reverify или повторный upload.`;
    }

    if (input.assetCount > input.sourceReadyAssetCount) {
      return "Часть файлов ещё не имеет честного source для storage upload.";
    }

    return "Storage contour по релизу требует ручной проверки.";
  }

  return "После sync релиз получит assets, bags и archive status без ручного трекинга.";
};

const buildReleaseStorageSummary = (input: {
  assets: StorageAsset[];
  bags: StorageBag[];
  bagFiles: StorageBagFile[];
  jobs: StorageIngestJob[];
}): ArtistReleaseStorageSummary => {
  const assetIds = new Set(input.assets.map((entry) => entry.id));
  const bags = input.bags.filter((entry) => assetIds.has(entry.assetId));
  const bagIds = new Set(bags.map((entry) => entry.id));
  const bagFiles = input.bagFiles.filter((entry) => bagIds.has(entry.bagId));
  const jobs = input.jobs.filter((entry) => assetIds.has(entry.assetId));

  const assetCount = input.assets.length;
  const sourceReadyAssetCount = input.assets.filter((entry) => Boolean(entry.sourceUrl || entry.audioFileId)).length;
  const bagCount = bags.length;
  const uploadedBagCount = bags.filter((entry) =>
    entry.status === "uploaded" || entry.status === "replicating" || entry.status === "healthy",
  ).length;
  const verifiedBagCount = bags.filter((entry) => entry.runtimeFetchStatus === "verified").length;
  const failedBagCount = bags.filter(
    (entry) => entry.runtimeFetchStatus === "failed" || entry.status === "degraded" || entry.status === "disabled",
  ).length;
  const fileCount = bagFiles.length;
  const pendingJobCount = jobs.filter((entry) => entry.status === "queued" || entry.status === "processing").length;
  const preparedJobCount = jobs.filter((entry) => entry.status === "prepared").length;
  const failedJobCount = jobs.filter((entry) => entry.status === "failed").length;
  const pointerReadyCount = bags.filter((entry) => Boolean(entry.tonstorageUri || entry.bagId)).length;
  const runtimeMode = [...bags]
    .sort((left, right) => parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt))[0]?.runtimeMode ??
    [...jobs].sort((left, right) => parseTimestamp(right.updatedAt) - parseTimestamp(left.updatedAt))[0]?.mode;
  const lastActivityAt = [...input.assets, ...bags, ...jobs]
    .map((entry) => entry.updatedAt || entry.createdAt)
    .sort((left, right) => parseTimestamp(right) - parseTimestamp(left))[0];

  const status: ArtistReleaseStorageSummary["status"] =
    failedJobCount > 0 || failedBagCount > 0 || (assetCount > 0 && sourceReadyAssetCount < assetCount)
      ? "attention"
      : verifiedBagCount > 0
        ? "verified"
        : uploadedBagCount > 0 || pointerReadyCount > 0
          ? "archived"
          : preparedJobCount > 0
            ? "prepared"
            : pendingJobCount > 0 || bagCount > 0 || assetCount > 0
              ? "syncing"
              : "not_synced";

  return {
    status,
    label: formatStorageLabel(status),
    note: formatStorageNote({
      status,
      assetCount,
      sourceReadyAssetCount,
      bagCount,
      uploadedBagCount,
      verifiedBagCount,
      failedBagCount,
      pendingJobCount,
      preparedJobCount,
      failedJobCount,
      pointerReadyCount,
    }),
    assetCount,
    sourceReadyAssetCount,
    bagCount,
    uploadedBagCount,
    verifiedBagCount,
    failedBagCount,
    fileCount,
    pendingJobCount,
    preparedJobCount,
    failedJobCount,
    pointerReadyCount,
    runtimeMode,
    lastActivityAt,
  };
};

export const buildArtistReleaseStorageSummaryMap = async (
  releases: Array<{ trackId: string; releaseSlug: string }>,
): Promise<Record<string, ArtistReleaseStorageSummary>> => {
  const normalized = releases.filter((entry) => entry.trackId && entry.releaseSlug);

  if (normalized.length === 0) {
    return {};
  }

  const [registrySnapshot, ingestState] = await Promise.all([
    getStorageRegistrySnapshot(),
    getStorageIngestState(),
  ]);

  if (!registrySnapshot) {
    return {};
  }

  const assets = Object.values(registrySnapshot.assets);
  const bags = Object.values(registrySnapshot.bags);
  const bagFiles = Object.values(registrySnapshot.bagFiles);
  const jobs = ingestState ? Object.values(ingestState.jobs) : [];

  return Object.fromEntries(
    normalized.map((release) => {
      const matchingAssets = assets.filter(
        (entry) => entry.releaseSlug === release.releaseSlug || entry.trackId === release.trackId,
      );

      return [
        release.trackId,
        buildReleaseStorageSummary({
          assets: matchingAssets,
          bags,
          bagFiles,
          jobs,
        }),
      ];
    }),
  );
};
