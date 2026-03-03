import { SHOP_PRODUCTS } from "@/data/shop-products";
import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import { readShopAdminConfig, toActivePromoRules } from "@/lib/server/shop-admin-config-store";
import type { ShopAppSettings, ShopProduct, ShopProductCategory } from "@/types/shop";

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

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1";

const isValidCategory = (value: unknown): value is ProductCategory => {
  return value === "figurine" || value === "vase" || value === "mug" || value === "lamp" || value === "plate";
};

const defaultAttributes = SHOP_PRODUCTS[0]?.attributes;

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
    image: String(row.image_url ?? "").trim() || SHOP_PRODUCTS[0]?.image || "/posts/cover-pattern.svg",
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
      material: String((rawAttributes as { material?: string }).material ?? defaultAttributes?.material ?? "Глина").slice(0, 120),
      technique: String((rawAttributes as { technique?: string }).technique ?? defaultAttributes?.technique ?? "Ручная работа").slice(0, 120),
      color: String((rawAttributes as { color?: string }).color ?? defaultAttributes?.color ?? "Натуральный").slice(0, 120),
      heightCm: Math.max(
        1,
        Math.round(Number((rawAttributes as { heightCm?: number }).heightCm ?? defaultAttributes?.heightCm ?? 10)),
      ),
      widthCm: Math.max(
        1,
        Math.round(Number((rawAttributes as { widthCm?: number }).widthCm ?? defaultAttributes?.widthCm ?? 10)),
      ),
      weightGr: Math.max(
        1,
        Math.round(Number((rawAttributes as { weightGr?: number }).weightGr ?? defaultAttributes?.weightGr ?? 200)),
      ),
      collection: String((rawAttributes as { collection?: string }).collection ?? defaultAttributes?.collection ?? "Classic").slice(
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
}> => {
  const config = await readShopAdminConfig();
  const hasPostgresConfig = Boolean(getPostgresHttpConfig());

  if (POSTGRES_STRICT && !hasPostgresConfig) {
    throw new Error("Postgres strict mode is enabled, but SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY are missing");
  }

  let baseProducts = SHOP_PRODUCTS;

  if (hasPostgresConfig) {
    const dbRead = await readProductsFromDb();

    if (!dbRead.ok) {
      if (POSTGRES_STRICT) {
        throw new Error("Failed to load products from Postgres");
      }
    } else if (dbRead.products.length > 0 || POSTGRES_STRICT) {
      baseProducts = dbRead.products;
    }
  }

  const categories = config.productCategories;
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const fallbackCategoryId = categories[0]?.id;
  const map = new Map<string, ShopProduct>(baseProducts.map((product) => [product.id, product]));

  for (const product of Object.values(config.productRecords)) {
    map.set(product.id, product);
  }

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

  return {
    products,
    categories,
    promoRules: toActivePromoRules(config),
    settings: config.settings,
  };
};
