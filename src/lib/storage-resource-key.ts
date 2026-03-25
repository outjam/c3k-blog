import type { ArtistAudioFormat } from "@/types/shop";

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

export const buildReleaseDeliveryResourceKey = (
  releaseSlug: string,
  format: ArtistAudioFormat,
): string => {
  return `release:${releaseSlug}:${format}`;
};

export const buildTrackDeliveryResourceKey = (
  releaseSlug: string,
  trackId: string,
  format: ArtistAudioFormat,
): string => {
  return `track:${releaseSlug}:${trackId}:${format}`;
};

export const buildPreviewStorageResourceKey = (
  releaseSlug: string,
): string => {
  return `preview:${releaseSlug}`;
};

export const buildReleaseStorageAssetId = (
  trackId: string,
  format: ArtistAudioFormat,
): string => {
  return normalizeSafeId(`release-asset:${trackId}:${format}`, 120) || `release-asset-${Date.now()}`;
};

export const buildTrackStorageAssetId = (
  releaseTrackId: string,
  itemTrackId: string,
  format: ArtistAudioFormat,
): string => {
  return (
    normalizeSafeId(`track-asset:${releaseTrackId}:${itemTrackId}:${format}`, 120) ||
    `track-asset-${Date.now()}`
  );
};

export const buildPreviewStorageAssetId = (trackId: string): string => {
  return normalizeSafeId(`preview-asset:${trackId}`, 120) || `preview-asset-${Date.now()}`;
};

export const inferAudioMimeType = (format: ArtistAudioFormat): string => {
  switch (format) {
    case "aac":
      return "audio/aac";
    case "alac":
      return "audio/mp4";
    case "flac":
      return "audio/flac";
    case "ogg":
      return "audio/ogg";
    case "wav":
      return "audio/wav";
    case "mp3":
    default:
      return "audio/mpeg";
  }
};

export const inferStorageAudioFormatFromUrl = (
  value: string | undefined,
): ArtistAudioFormat | null => {
  const normalized = String(value ?? "").trim().toLowerCase();

  if (!normalized) {
    return null;
  }

  const clean = normalized.split("?")[0]?.split("#")[0] ?? normalized;

  if (clean.endsWith(".aac") || clean.endsWith(".m4a")) {
    return "aac";
  }

  if (clean.endsWith(".alac")) {
    return "alac";
  }

  if (clean.endsWith(".flac")) {
    return "flac";
  }

  if (clean.endsWith(".ogg") || clean.endsWith(".oga")) {
    return "ogg";
  }

  if (clean.endsWith(".wav") || clean.endsWith(".wave")) {
    return "wav";
  }

  if (clean.endsWith(".mp3")) {
    return "mp3";
  }

  try {
    const parsed = new URL(normalized, "https://c3k.local");
    const explicitFormat = parsed.searchParams.get("format")?.trim().toLowerCase();

    if (explicitFormat === "aac" || explicitFormat === "alac" || explicitFormat === "flac" || explicitFormat === "ogg" || explicitFormat === "wav" || explicitFormat === "mp3") {
      return explicitFormat;
    }
  } catch {
    return null;
  }

  return null;
};

export const resolveStorageSourceUrlCandidate = (
  value: string | undefined,
): string | undefined => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalized) || normalized.startsWith("/")) {
    return normalized;
  }

  return undefined;
};
