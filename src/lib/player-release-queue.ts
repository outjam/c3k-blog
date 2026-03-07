import type { ShopProduct } from "@/types/shop";

export interface ReleasePlaybackTrack {
  id: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  sourceUrl: string;
  releaseSlug?: string;
  durationSec?: number;
}

const normalizeTrackId = (value: string, index: number): string => {
  const normalized = String(value || `track-${index + 1}`)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return normalized || `track-${index + 1}`;
};

export const buildReleasePlaybackQueue = (product: ShopProduct): ReleasePlaybackTrack[] => {
  const releaseSlug = String(product.slug || "").trim() || product.id;
  const artistName = product.artistName || product.subtitle || "Culture3k";
  const tracklist = Array.isArray(product.releaseTracklist) ? product.releaseTracklist : [];

  const queueFromTracklist = tracklist.reduce<ReleasePlaybackTrack[]>((acc, track, index) => {
    const sourceUrl = String(track.previewUrl || product.previewUrl || "").trim();
    if (!sourceUrl) {
      return acc;
    }

    const trackId = normalizeTrackId(track.id, index);
    const item: ReleasePlaybackTrack = {
      id: `${releaseSlug}:${trackId}`,
      title: String(track.title || `${product.title} #${index + 1}`).trim(),
      artist: artistName,
      coverUrl: product.image,
      sourceUrl,
      releaseSlug,
    };

    if (typeof track.durationSec === "number") {
      item.durationSec = track.durationSec;
    }

    acc.push(item);
    return acc;
  }, []);

  if (queueFromTracklist.length > 0) {
    return queueFromTracklist;
  }

  const fallbackSource = String(product.previewUrl || "").trim();
  if (!fallbackSource) {
    return [];
  }

  return [
    {
      id: `${releaseSlug}:track-1`,
      title: product.title,
      artist: artistName,
      coverUrl: product.image,
      sourceUrl: fallbackSource,
      releaseSlug,
    },
  ];
};
