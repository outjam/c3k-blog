import { readArtistCatalogSnapshot } from "@/lib/server/artist-catalog-store";
import { listPublishedArtistProductsFromSnapshot } from "@/lib/server/shop-artist-market";
import { readShopAdminConfig, toActivePromoRules } from "@/lib/server/shop-admin-config-store";
import { buildArtistReleaseStorageSummaryMap } from "@/lib/server/storage-archive-summary";
import type {
  ShopAppSettings,
  ShopCatalogArtist,
  ShopProduct,
  ShopProductCategory,
  ShopShowcaseCollectionView,
} from "@/types/shop";

const MUSIC_CATEGORY: ShopProductCategory = {
  id: "music",
  label: "Музыка",
  emoji: "🎵",
  description: "Цифровые аудио-релизы артистов",
  order: 10,
  subcategories: [
    {
      id: "tracks",
      label: "Треки",
      description: "Digital-only релизы",
      order: 10,
    },
  ],
};

const applyProductOverride = (product: ShopProduct, override: Partial<ShopProduct>): ShopProduct => {
  return {
    ...product,
    ...override,
    attributes: {
      ...product.attributes,
      ...(override.attributes ?? {}),
    },
  };
};

const compareTrackProducts = (left: ShopProduct, right: ShopProduct): number => {
  const leftPublished = new Date(left.publishedAt ?? 0).getTime();
  const rightPublished = new Date(right.publishedAt ?? 0).getTime();

  if (leftPublished !== rightPublished) {
    return rightPublished - leftPublished;
  }

  return left.title.localeCompare(right.title, "ru-RU");
};

export const getCatalogSnapshot = async (): Promise<{
  products: ShopProduct[];
  categories: ShopProductCategory[];
  promoRules: ReturnType<typeof toActivePromoRules>;
  settings: ShopAppSettings;
  artists: ShopCatalogArtist[];
  showcaseCollections: ShopShowcaseCollectionView[];
}> => {
  const config = await readShopAdminConfig();
  const category = MUSIC_CATEGORY;
  const subcategory = category.subcategories[0];
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    onlyApprovedProfiles: true,
    onlyPublishedTracks: true,
  });
  const artistProducts = listPublishedArtistProductsFromSnapshot(
    artistCatalog.profiles,
    artistCatalog.tracks,
  );
  const storageSummaries = await buildArtistReleaseStorageSummaryMap(
    artistCatalog.tracks.map((track) => ({
      trackId: track.id,
      releaseSlug: track.slug,
    })),
  );

  const products = artistProducts
    .map((trackProduct) => {
      const override = config.productOverrides[trackProduct.id];

      if (override?.isPublished === false) {
        return null;
      }

      const next = applyProductOverride(trackProduct, {
        kind: "digital_track",
        category: category.id,
        categoryId: category.id,
        subcategoryId: subcategory?.id,
        categoryLabel: category.label,
        subcategoryLabel: trackProduct.subcategoryLabel ?? subcategory?.label,
        priceStarsCents:
          typeof override?.priceStarsCents === "number" ? Math.max(1, Math.round(override.priceStarsCents)) : trackProduct.priceStarsCents,
        attributes: {
          ...trackProduct.attributes,
          stock: typeof override?.stock === "number" ? Math.max(1, Math.round(override.stock)) : trackProduct.attributes.stock,
        },
        isNew: typeof override?.isFeatured === "boolean" ? override.isFeatured : trackProduct.isNew,
        isHit: typeof override?.isFeatured === "boolean" ? override.isFeatured : trackProduct.isHit,
        subtitle: override?.badge ? `${trackProduct.subtitle} • ${override.badge}` : trackProduct.subtitle,
        storageSummary: storageSummaries[trackProduct.id] ?? trackProduct.storageSummary,
      });

      return next;
    })
    .filter((item): item is ShopProduct => Boolean(item))
    .sort(compareTrackProducts);

  const productById = new Map(products.map((product) => [product.id, product]));

  const tracksByArtist = new Map<number, typeof artistProducts>();
  products.forEach((trackProduct) => {
    if (!trackProduct.artistTelegramUserId) {
      return;
    }

    const current = tracksByArtist.get(trackProduct.artistTelegramUserId) ?? [];
    current.push(trackProduct);
    tracksByArtist.set(trackProduct.artistTelegramUserId, current);
  });

  const artists = artistCatalog.profiles
    .filter((artist) => artist.status === "approved")
    .map((artist) => {
      const artistTracks = tracksByArtist.get(artist.telegramUserId) ?? ([] as ShopProduct[]);
      const totalSalesCount = artistTracks.reduce((acc, item) => acc + item.reviewsCount, 0);

      return {
        telegramUserId: artist.telegramUserId,
        slug: artist.slug,
        displayName: artist.displayName,
        bio: artist.bio,
        avatarUrl: artist.avatarUrl,
        coverUrl: artist.coverUrl,
        followersCount: artist.followersCount,
        tracksCount: artistTracks.length,
        totalSalesCount,
        subscriptionEnabled: artist.subscriptionEnabled,
        subscriptionPriceStarsCents: artist.subscriptionPriceStarsCents,
      } satisfies ShopCatalogArtist;
    })
    .filter((artist) => artist.tracksCount > 0)
    .sort((a, b) => b.totalSalesCount - a.totalSalesCount || b.followersCount - a.followersCount);

  const showcaseCollections = config.showcaseCollections
    .filter((collection) => collection.isPublished)
    .map((collection) => {
      const ids = [...collection.trackIds, ...collection.productIds];
      const products = ids
        .map((id) => productById.get(id))
        .filter((item): item is ShopProduct => Boolean(item));

      if (products.length === 0) {
        return null;
      }

      const next: ShopShowcaseCollectionView = {
        id: collection.id,
        title: collection.title,
        subtitle: collection.subtitle,
        description: collection.description,
        coverImage: collection.coverImage,
        order: collection.order,
        products,
      };

      return next;
    })
    .filter((item): item is ShopShowcaseCollectionView => Boolean(item))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru-RU"));

  const settings: ShopAppSettings = {
    ...config.settings,
    defaultDeliveryFeeStarsCents: 0,
    freeDeliveryThresholdStarsCents: 0,
  };

  return {
    products,
    categories: [category],
    promoRules: toActivePromoRules(config),
    settings,
    artists,
    showcaseCollections,
  };
};
