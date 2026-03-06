import type { ArtistAudioFormat, CartItem, ShopProduct } from "@/types/shop";

export const isArtistAudioFormat = (value: unknown): value is ArtistAudioFormat => {
  return value === "mp3" || value === "aac" || value === "flac" || value === "wav" || value === "alac" || value === "ogg";
};

export const getFormatLabel = (format: ArtistAudioFormat): string => {
  switch (format) {
    case "aac":
      return "AAC";
    case "flac":
      return "FLAC";
    case "wav":
      return "WAV";
    case "alac":
      return "ALAC";
    case "ogg":
      return "OGG";
    case "mp3":
    default:
      return "MP3";
  }
};

export const getTrackFormats = (product: ShopProduct): Array<{ format: ArtistAudioFormat; priceStarsCents: number; isDefault: boolean }> => {
  if (!product.formats || product.formats.length === 0) {
    return [
      {
        format: "mp3",
        priceStarsCents: product.priceStarsCents,
        isDefault: true,
      },
    ];
  }

  const normalized = product.formats
    .filter((entry) => isArtistAudioFormat(entry.format))
    .map((entry) => ({
      format: entry.format,
      priceStarsCents: Math.max(1, Math.round(entry.priceStarsCents)),
      isDefault: Boolean(entry.isDefault),
    }));

  if (normalized.length === 0) {
    return [
      {
        format: "mp3",
        priceStarsCents: product.priceStarsCents,
        isDefault: true,
      },
    ];
  }

  if (!normalized.some((entry) => entry.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  return normalized;
};

export const getDefaultTrackFormat = (product: ShopProduct): ArtistAudioFormat => {
  const formats = getTrackFormats(product);
  return formats.find((entry) => entry.isDefault)?.format ?? formats[0]?.format ?? "mp3";
};

export const getProductPriceByFormat = (product: ShopProduct, format: ArtistAudioFormat | undefined): number => {
  const formats = getTrackFormats(product);
  const selected = format ? formats.find((entry) => entry.format === format) : formats.find((entry) => entry.isDefault);
  return selected?.priceStarsCents ?? product.priceStarsCents;
};

export const getCartItemKey = (item: Pick<CartItem, "productId" | "selectedFormat">): string => {
  return `${item.productId}::${item.selectedFormat ?? "default"}`;
};

export const isSameCartItem = (
  left: Pick<CartItem, "productId" | "selectedFormat">,
  right: Pick<CartItem, "productId" | "selectedFormat">,
): boolean => {
  return left.productId === right.productId && (left.selectedFormat ?? "") === (right.selectedFormat ?? "");
};
