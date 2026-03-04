import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import { listPublishedArtistProducts } from "@/lib/server/shop-artist-market";
import { readShopAdminConfig, toActivePromoRules } from "@/lib/server/shop-admin-config-store";
import type {
  ShopAppSettings,
  ShopCatalogArtist,
  ShopProduct,
  ShopProductCategory,
  ShopShowcaseCollectionView,
} from "@/types/shop";

type ProductCategory = ShopProduct["category"];

interface ProductDbRow {
  product_code?: string;
  slug?: string;
  title?: string;
  subtitle?: string;
  description?: string;
  image_url?: string;
  price_stars_cents?: number;
  old_price_stars_cents?: number | null;
  stock?: number;
  is_published?: boolean;
  is_featured?: boolean;
  rating?: number;
  reviews_count?: number;
  metadata?: Record<string, unknown>;
}

const DEFAULT_PRODUCT_IMAGE = "/posts/cover-pattern.svg";
const DEFAULT_ATTRIBUTES: ShopProduct["attributes"] = {
  material: "Глина",
  technique: "Ручная работа",
  color: "Натуральный",
  heightCm: 10,
  widthCm: 10,
  weightGr: 200,
  collection: "Classic",
  sku: "SKU-DEFAULT",
  stock: 0,
};

const isValidCategory = (value: unknown): value is ProductCategory => {
  return value === "figurine" || value === "vase" || value === "mug" || value === "lamp" || value === "plate";
};

const toDbProduct = (row: ProductDbRow): ShopProduct | null => {
  const id = String(row.product_code ?? "")
    .trim()
    .toLowerCase();
  const slug = String(row.slug ?? "")
    .trim()
    .toLowerCase();

  if (!id || !slug) {
    return null;
  }

  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const rawAttributes = metadata.attributes && typeof metadata.attributes === "object" ? metadata.attributes : {};
  const category = isValidCategory(metadata.category) ? metadata.category : "figurine";

  return {
    id,
    slug,
    title: String(row.title ?? "").trim() || `Товар ${id}`,
    subtitle: String(row.subtitle ?? "").trim() || "Описание",
    description: String(row.description ?? "").trim() || "Описание товара отсутствует.",
    category,
    categoryId: typeof metadata.categoryId === "string" ? metadata.categoryId : undefined,
    subcategoryId: typeof metadata.subcategoryId === "string" ? metadata.subcategoryId : undefined,
    image: String(row.image_url ?? "").trim() || DEFAULT_PRODUCT_IMAGE,
    priceStarsCents: Math.max(1, Math.round(Number(row.price_stars_cents ?? 1))),
    oldPriceStarsCents:
      typeof row.old_price_stars_cents === "number" && Number.isFinite(row.old_price_stars_cents)
        ? Math.max(1, Math.round(row.old_price_stars_cents))
        : undefined,
    rating: Math.max(0, Math.min(5, Number(row.rating ?? 0))),
    reviewsCount: Math.max(0, Math.round(Number(row.reviews_count ?? 0))),
    isNew: Boolean(metadata.isNew),
    isHit: Boolean(metadata.isHit),
    tags: Array.isArray(metadata.tags) ? metadata.tags.map((item) => String(item ?? "").slice(0, 42)).filter(Boolean) : [],
    attributes: {
      material: String((rawAttributes as { material?: string }).material ?? DEFAULT_ATTRIBUTES.material).slice(0, 120),
      technique: String((rawAttributes as { technique?: string }).technique ?? DEFAULT_ATTRIBUTES.technique).slice(0, 120),
      color: String((rawAttributes as { color?: string }).color ?? DEFAULT_ATTRIBUTES.color).slice(0, 120),
      heightCm: Math.max(
        1,
        Math.round(Number((rawAttributes as { heightCm?: number }).heightCm ?? DEFAULT_ATTRIBUTES.heightCm)),
      ),
      widthCm: Math.max(
        1,
        Math.round(Number((rawAttributes as { widthCm?: number }).widthCm ?? DEFAULT_ATTRIBUTES.widthCm)),
      ),
      weightGr: Math.max(
        1,
        Math.round(Number((rawAttributes as { weightGr?: number }).weightGr ?? DEFAULT_ATTRIBUTES.weightGr)),
      ),
      collection: String((rawAttributes as { collection?: string }).collection ?? DEFAULT_ATTRIBUTES.collection).slice(
        0,
        120,
      ),
      sku: String((rawAttributes as { sku?: string }).sku ?? `SKU-${id}`).slice(0, 60),
      stock: Math.max(0, Math.min(9999, Math.round(Number(row.stock ?? (rawAttributes as { stock?: number }).stock ?? 0)))),
    },
  };
};

const readProductsFromDb = async (): Promise<{ ok: true; products: ShopProduct[] } | { ok: false }> => {
  const query = new URLSearchParams();
  query.set(
    "select",
    "product_code,slug,title,subtitle,description,image_url,price_stars_cents,old_price_stars_cents,stock,is_published,is_featured,rating,reviews_count,metadata",
  );
  query.set("is_published", "eq.true");
  query.set("order", "updated_at.desc");

  const rows = await postgresTableRequest<ProductDbRow[]>({
    method: "GET",
    path: "/products",
    query,
  });

  if (!rows) {
    return { ok: false };
  }

  return {
    ok: true,
    products: rows
      .map((row) => toDbProduct(row))
      .filter((product): product is ShopProduct => Boolean(product)),
  };
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

export const getCatalogSnapshot = async (): Promise<{
  products: ShopProduct[];
  categories: ShopProductCategory[];
  promoRules: ReturnType<typeof toActivePromoRules>;
  settings: ShopAppSettings;
  artists: ShopCatalogArtist[];
  showcaseCollections: ShopShowcaseCollectionView[];
}> => {
  const config = await readShopAdminConfig();
  const hasPostgresConfig = Boolean(getPostgresHttpConfig());

  if (!hasPostgresConfig) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
  }

  const dbRead = await readProductsFromDb();

  if (!dbRead.ok) {
    throw new Error("Failed to load products from Postgres");
  }

  const baseProducts = dbRead.products;
  const artistProducts = listPublishedArtistProducts(config);
  const categories = [...config.productCategories];

  if (artistProducts.length > 0 && !categories.some((category) => category.id === "music")) {
    const maxOrder = categories.reduce((acc, category) => Math.max(acc, category.order), 0);
    categories.push({
      id: "music",
      label: "Музыка",
      emoji: "🎵",
      description: "Релизы артистов сообщества",
      order: maxOrder + 10,
      subcategories: [
        {
          id: "tracks",
          label: "Треки",
          description: "Цифровые релизы",
          order: 10,
        },
      ],
    });
  }

  categories.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label, "ru-RU"));

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const fallbackCategoryId = categories[0]?.id;
  const map = new Map<string, ShopProduct>(baseProducts.map((product) => [product.id, product]));

  const products = Array.from(map.values())
    .map((product) => {
      const override = config.productOverrides[product.id];
      const categoryId =
        override?.categoryId && categoryMap.has(override.categoryId)
          ? override.categoryId
          : categoryMap.has(product.category)
            ? product.category
            : fallbackCategoryId;
      const category = categoryId ? categoryMap.get(categoryId) : undefined;
      const subcategoryId =
        override?.subcategoryId && category?.subcategories.some((item) => item.id === override.subcategoryId)
          ? override.subcategoryId
          : undefined;
      const subcategory = subcategoryId ? category?.subcategories.find((item) => item.id === subcategoryId) : undefined;

      if (!override) {
        return {
          ...product,
          categoryId,
          subcategoryId,
          categoryLabel: category?.label,
          subcategoryLabel: subcategory?.label,
        };
      }

      const next = applyProductOverride(product, {
        priceStarsCents: typeof override.priceStarsCents === "number" ? override.priceStarsCents : product.priceStarsCents,
        attributes: {
          ...product.attributes,
          stock: typeof override.stock === "number" ? override.stock : product.attributes.stock,
        },
        isNew: typeof override.isFeatured === "boolean" ? override.isFeatured : product.isNew,
        isHit: typeof override.isFeatured === "boolean" ? override.isFeatured : product.isHit,
        subtitle: override.badge ? `${product.subtitle} • ${override.badge}` : product.subtitle,
        categoryId,
        subcategoryId,
        categoryLabel: category?.label,
        subcategoryLabel: subcategory?.label,
      });

      return override.isPublished === false ? null : next;
    })
    .filter((item): item is ShopProduct => Boolean(item));

  const combinedMap = new Map<string, ShopProduct>();
  products.forEach((product) => combinedMap.set(product.id, product));
  artistProducts.forEach((product) => combinedMap.set(product.id, product));
  const mergedProducts = Array.from(combinedMap.values());

  const tracksByArtist = new Map<number, typeof artistProducts>();
  artistProducts.forEach((trackProduct) => {
    if (!trackProduct.artistTelegramUserId) {
      return;
    }

    const current = tracksByArtist.get(trackProduct.artistTelegramUserId) ?? [];
    current.push(trackProduct);
    tracksByArtist.set(trackProduct.artistTelegramUserId, current);
  });

  const artists = Object.values(config.artistProfiles)
    .filter((artist) => artist.status === "approved")
    .map((artist) => {
      const artistTracks = tracksByArtist.get(artist.telegramUserId) ?? [];
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
      const ids = [...collection.productIds, ...collection.trackIds];
      const products = ids
        .map((id) => combinedMap.get(id))
        .filter((item): item is ShopProduct => Boolean(item));

      if (products.length === 0) {
        return null;
      }

      return {
        id: collection.id,
        title: collection.title,
        subtitle: collection.subtitle,
        description: collection.description,
        coverImage: collection.coverImage,
        order: collection.order,
        products,
      } satisfies ShopShowcaseCollectionView;
    })
    .filter((item): item is ShopShowcaseCollectionView => Boolean(item))
    .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru-RU"));

  return {
    products: mergedProducts,
    categories,
    promoRules: toActivePromoRules(config),
    settings: config.settings,
    artists,
    showcaseCollections,
  };
};
