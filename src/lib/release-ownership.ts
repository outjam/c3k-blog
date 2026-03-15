import { getFormatLabel, getTrackFormats } from "@/lib/shop-release-format";
import type { MintedReleaseNft } from "@/lib/social-hub";
import type { ArtistAudioFormat, ShopProduct } from "@/types/shop";

export interface ReleaseOwnershipViewModel {
  isFullReleaseOwned: boolean;
  isMinted: boolean;
  ownedTrackCount: number;
  totalTrackCount: number;
  availableFormatLabels: string[];
  ownedFormatLabels: string[];
}

export const groupTrackKeysByRelease = (
  trackKeys: string[],
): Map<string, string[]> => {
  const grouped = new Map<string, string[]>();

  trackKeys.forEach((entry) => {
    const [releaseSlug = "", trackId = ""] = String(entry).split("::", 2);

    if (!releaseSlug || !trackId) {
      return;
    }

    const next = grouped.get(releaseSlug) ?? [];
    if (!next.includes(trackId)) {
      next.push(trackId);
    }
    grouped.set(releaseSlug, next);
  });

  return grouped;
};

export const groupReleaseFormatKeysByRelease = (
  formatKeys: string[],
): Map<string, string[]> => {
  const grouped = new Map<string, string[]>();

  formatKeys.forEach((entry) => {
    const [releaseSlug = "", format = ""] = String(entry).split("::", 2);

    if (!releaseSlug || !format) {
      return;
    }

    const next = grouped.get(releaseSlug) ?? [];
    if (!next.includes(format)) {
      next.push(format);
    }
    grouped.set(releaseSlug, next);
  });

  return grouped;
};

export const buildReleaseOwnershipViewModel = (
  product: ShopProduct,
  input: {
    purchasedReleaseSlugs: string[];
    purchasedTrackKeys: string[];
    purchasedReleaseFormatKeys: string[];
    mintedReleaseNfts: MintedReleaseNft[];
  },
): ReleaseOwnershipViewModel => {
  const trackCount =
    Array.isArray(product.releaseTracklist) && product.releaseTracklist.length > 0
      ? product.releaseTracklist.length
      : 1;
  const trackIdsByRelease = groupTrackKeysByRelease(input.purchasedTrackKeys);
  const releaseFormatsByRelease = groupReleaseFormatKeysByRelease(
    input.purchasedReleaseFormatKeys,
  );
  const isFullReleaseOwned = input.purchasedReleaseSlugs.includes(product.slug);
  const ownedTrackCount = isFullReleaseOwned
    ? trackCount
    : (trackIdsByRelease.get(product.slug) ?? []).length;
  const availableFormatLabels = getTrackFormats(product).map((entry) =>
    getFormatLabel(entry.format),
  );
  const ownedFormatLabels = (releaseFormatsByRelease.get(product.slug) ?? [])
    .map((entry) => getFormatLabel(entry as ArtistAudioFormat))
    .filter(Boolean);
  const isMinted = input.mintedReleaseNfts.some(
    (entry) => entry.releaseSlug === product.slug,
  );

  return {
    isFullReleaseOwned,
    isMinted,
    ownedTrackCount,
    totalTrackCount: trackCount,
    availableFormatLabels,
    ownedFormatLabels,
  };
};
