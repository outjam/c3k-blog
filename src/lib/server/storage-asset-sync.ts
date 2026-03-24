import {
  buildPreviewStorageAssetId,
  buildPreviewStorageResourceKey,
  buildReleaseDeliveryResourceKey,
  buildReleaseStorageAssetId,
  inferAudioMimeType,
  inferStorageAudioFormatFromUrl,
  resolveStorageSourceUrlCandidate,
} from "@/lib/storage-resource-key";
import {
  deleteStorageAssetsByIds,
  listStorageAssets,
  listStorageBags,
  upsertStorageAsset,
} from "@/lib/server/storage-registry-store";
import type { ArtistTrack } from "@/types/shop";
import type { StorageAsset } from "@/types/storage";

export interface StorageArtistTrackSyncSummary {
  trackId: string;
  releaseSlug: string;
  upsertedAssetIds: string[];
  deletedAssetIds: string[];
  skippedDeleteAssetIds: string[];
  desiredAssetCount: number;
}

const isAutoManagedTrackAssetId = (trackId: string, assetId: string): boolean => {
  return assetId.startsWith(`release-asset:${trackId}:`) || assetId === `preview-asset:${trackId}`;
};

const inferReleaseFileName = (track: ArtistTrack, format: ArtistTrack["formats"][number]["format"]): string => {
  return `${track.slug}.${format}`;
};

const inferPreviewFileName = (
  track: ArtistTrack,
  format: ArtistTrack["formats"][number]["format"],
): string => {
  return `${track.slug}-preview.${format}`;
};

const buildDesiredAssets = (track: ArtistTrack): Array<{
  id: string;
  releaseSlug: string;
  trackId?: string;
  artistTelegramUserId: number;
  resourceKey: string;
  assetType: StorageAsset["assetType"];
  format: StorageAsset["format"];
  sourceUrl?: string;
  audioFileId?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes: number;
}> => {
  const releaseAssets = track.formats.map((entry) => {
    const sourceUrl = resolveStorageSourceUrlCandidate(entry.audioFileId);

    return {
      id: buildReleaseStorageAssetId(track.id, entry.format),
      releaseSlug: track.slug,
      trackId: track.id,
      artistTelegramUserId: track.artistTelegramUserId,
      resourceKey: buildReleaseDeliveryResourceKey(track.slug, entry.format),
      assetType: "audio_master" as const,
      format: entry.format,
      sourceUrl,
      audioFileId: entry.audioFileId,
      fileName: inferReleaseFileName(track, entry.format),
      mimeType: inferAudioMimeType(entry.format),
      sizeBytes: 0,
    };
  });

  const previewFormat =
    inferStorageAudioFormatFromUrl(track.previewUrl) ??
    track.formats.find((entry) => entry.isDefault)?.format ??
    track.formats[0]?.format;
  const previewSourceUrl = resolveStorageSourceUrlCandidate(track.previewUrl);

  const previewAsset =
    previewFormat && previewSourceUrl
      ? [
          {
            id: buildPreviewStorageAssetId(track.id),
            releaseSlug: track.slug,
            trackId: track.id,
            artistTelegramUserId: track.artistTelegramUserId,
            resourceKey: buildPreviewStorageResourceKey(track.slug),
            assetType: "audio_preview" as const,
            format: previewFormat,
            sourceUrl: previewSourceUrl,
            audioFileId: undefined,
            fileName: inferPreviewFileName(track, previewFormat),
            mimeType: inferAudioMimeType(previewFormat),
            sizeBytes: 0,
          },
        ]
      : [];

  return [...releaseAssets, ...previewAsset];
};

export const syncStorageAssetsForArtistTrack = async (
  track: ArtistTrack,
): Promise<StorageArtistTrackSyncSummary> => {
  const desiredAssets = buildDesiredAssets(track);
  const desiredIds = new Set(desiredAssets.map((entry) => entry.id));

  for (const desired of desiredAssets) {
    await upsertStorageAsset({
      id: desired.id,
      releaseSlug: desired.releaseSlug,
      trackId: desired.trackId,
      artistTelegramUserId: desired.artistTelegramUserId,
      resourceKey: desired.resourceKey,
      audioFileId: desired.audioFileId,
      assetType: desired.assetType,
      format: desired.format,
      sourceUrl: desired.sourceUrl,
      fileName: desired.fileName,
      mimeType: desired.mimeType,
      sizeBytes: desired.sizeBytes,
    });
  }

  const [currentAssets, currentBags] = await Promise.all([
    listStorageAssets(),
    listStorageBags(),
  ]);
  const bagBoundAssetIds = new Set(currentBags.map((bag) => bag.assetId));
  const staleAutoManagedAssetIds = currentAssets
    .filter((asset) => isAutoManagedTrackAssetId(track.id, asset.id))
    .map((asset) => asset.id)
    .filter((id) => !desiredIds.has(id));
  const skippedDeleteAssetIds = staleAutoManagedAssetIds.filter((id) =>
    bagBoundAssetIds.has(id),
  );
  const deletableAssetIds = staleAutoManagedAssetIds.filter(
    (id) => !bagBoundAssetIds.has(id),
  );
  const deletedAssetIds =
    deletableAssetIds.length > 0
      ? await deleteStorageAssetsByIds(deletableAssetIds)
      : [];

  return {
    trackId: track.id,
    releaseSlug: track.slug,
    upsertedAssetIds: desiredAssets.map((entry) => entry.id),
    deletedAssetIds,
    skippedDeleteAssetIds,
    desiredAssetCount: desiredAssets.length,
  };
};

export const syncStorageAssetsForArtistTracks = async (
  tracks: ArtistTrack[],
): Promise<StorageArtistTrackSyncSummary[]> => {
  const summaries: StorageArtistTrackSyncSummary[] = [];

  for (const track of tracks) {
    summaries.push(await syncStorageAssetsForArtistTrack(track));
  }

  return summaries;
};
