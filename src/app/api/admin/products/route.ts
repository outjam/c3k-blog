import { NextResponse } from "next/server";

import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { listShopProductCategories } from "@/lib/server/shop-taxonomy-store";
import type { ShopProduct } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProductPatchBody {
  productId?: string;
  product?: Partial<ShopProduct>;
  priceStarsCents?: number | null;
  stock?: number | null;
  isPublished?: boolean | null;
  isFeatured?: boolean | null;
  badge?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
}

interface ProductCreateBody {
  product?: Partial<ShopProduct>;
}

interface ProductDeleteBody {
  productId?: string;
}

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
  updated_at?: string;
}

interface ProductMetadata {
  category?: string;
  categoryId?: string;
  subcategoryId?: string;
  isNew?: boolean;
  isHit?: boolean;
  tags?: string[];
  badge?: string;
  attributes?: Partial<ShopProduct["attributes"]>;
}

const DEFAULT_PRODUCT_IMAGE = "/posts/cover-pattern.svg";
const DEFAULT_PRODUCT_CATEGORY = "uncategorized";
const DEFAULT_ATTRIBUTES: ShopProduct["attributes"] = {
  material: "",
  technique: "",
  color: "",
  heightCm: 1,
  widthCm: 1,
  weightGr: 1,
  collection: "",
  sku: "",
  stock: 0,
};

const normalizeId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const normalizeMetaId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const normalizeCategoryCode = (value: unknown): string | undefined => {
  const normalized = normalizeMetaId(value);
  return normalized || undefined;
};

const toMetadata = (value: unknown): ProductMetadata => {
  if (!value || typeof value !== "object") {
    return {};
  }

  const source = value as Record<string, unknown>;
  const tags = Array.isArray(source.tags)
    ? source.tags.map((tag) => String(tag ?? "").trim().slice(0, 42)).filter(Boolean).slice(0, 20)
    : undefined;

  return {
    category: normalizeCategoryCode(source.category),
    categoryId: normalizeCategoryCode(source.categoryId),
    subcategoryId: normalizeCategoryCode(source.subcategoryId),
    isNew: typeof source.isNew === "boolean" ? source.isNew : undefined,
    isHit: typeof source.isHit === "boolean" ? source.isHit : undefined,
    tags,
    badge: typeof source.badge === "string" ? source.badge.trim().slice(0, 40) : undefined,
    attributes: source.attributes && typeof source.attributes === "object" ? (source.attributes as ProductMetadata["attributes"]) : undefined,
  };
};

const toShopProduct = (row: ProductDbRow): ShopProduct | null => {
  const id = normalizeId(row.product_code);
  const slug = normalizeSlug(row.slug);

  if (!id || !slug) {
    return null;
  }

  const metadata = toMetadata(row.metadata);
  const attrs = metadata.attributes ?? {};
  const category = metadata.categoryId ?? metadata.category ?? DEFAULT_PRODUCT_CATEGORY;

  return {
    id,
    slug,
    title: String(row.title ?? "").trim() || `Товар ${id}`,
    subtitle: String(row.subtitle ?? "").trim() || "Описание",
    description: String(row.description ?? "").trim() || "Описание товара отсутствует.",
    category,
    categoryId: metadata.categoryId || undefined,
    subcategoryId: metadata.subcategoryId || undefined,
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
    tags: metadata.tags ?? [],
    attributes: {
      material: String(attrs.material ?? DEFAULT_ATTRIBUTES.material).slice(0, 120),
      technique: String(attrs.technique ?? DEFAULT_ATTRIBUTES.technique).slice(0, 120),
      color: String(attrs.color ?? DEFAULT_ATTRIBUTES.color).slice(0, 120),
      heightCm: Math.max(1, Math.round(Number(attrs.heightCm ?? DEFAULT_ATTRIBUTES.heightCm))),
      widthCm: Math.max(1, Math.round(Number(attrs.widthCm ?? DEFAULT_ATTRIBUTES.widthCm))),
      weightGr: Math.max(1, Math.round(Number(attrs.weightGr ?? DEFAULT_ATTRIBUTES.weightGr))),
      collection: String(attrs.collection ?? DEFAULT_ATTRIBUTES.collection).slice(0, 120),
      sku: String(attrs.sku ?? id).slice(0, 60),
      stock: Math.max(0, Math.min(9999, Math.round(Number(row.stock ?? attrs.stock ?? DEFAULT_ATTRIBUTES.stock)))),
    },
  };
};

const mergeProduct = (current: ShopProduct, patch: Partial<ShopProduct>): ShopProduct => {
  return {
    ...current,
    ...patch,
    id: normalizeId(patch.id ?? current.id) || current.id,
    slug: normalizeSlug(patch.slug ?? current.slug) || current.slug,
    title: String(patch.title ?? current.title).slice(0, 160),
    subtitle: String(patch.subtitle ?? current.subtitle).slice(0, 220),
    description: String(patch.description ?? current.description).slice(0, 5000),
    image: String(patch.image ?? current.image).slice(0, 3000),
    tags: Array.isArray(patch.tags)
      ? patch.tags.map((item) => String(item ?? "").slice(0, 42)).slice(0, 20)
      : current.tags,
    priceStarsCents: Math.max(1, Math.round(Number(patch.priceStarsCents ?? current.priceStarsCents))),
    oldPriceStarsCents:
      typeof patch.oldPriceStarsCents === "number" && Number.isFinite(patch.oldPriceStarsCents)
        ? Math.max(1, Math.round(patch.oldPriceStarsCents))
        : patch.oldPriceStarsCents === undefined
          ? current.oldPriceStarsCents
          : undefined,
    rating: Math.max(0, Math.min(5, Number(patch.rating ?? current.rating))),
    reviewsCount: Math.max(0, Math.round(Number(patch.reviewsCount ?? current.reviewsCount))),
    category: normalizeCategoryCode(patch.category) ?? current.category,
    isNew: typeof patch.isNew === "boolean" ? patch.isNew : current.isNew,
    isHit: typeof patch.isHit === "boolean" ? patch.isHit : current.isHit,
    attributes: {
      ...current.attributes,
      ...(patch.attributes ?? {}),
      material: String(patch.attributes?.material ?? current.attributes.material).slice(0, 120),
      technique: String(patch.attributes?.technique ?? current.attributes.technique).slice(0, 120),
      color: String(patch.attributes?.color ?? current.attributes.color).slice(0, 120),
      heightCm: Math.max(1, Math.round(Number(patch.attributes?.heightCm ?? current.attributes.heightCm))),
      widthCm: Math.max(1, Math.round(Number(patch.attributes?.widthCm ?? current.attributes.widthCm))),
      weightGr: Math.max(1, Math.round(Number(patch.attributes?.weightGr ?? current.attributes.weightGr))),
      collection: String(patch.attributes?.collection ?? current.attributes.collection).slice(0, 120),
      sku: String(patch.attributes?.sku ?? current.attributes.sku).slice(0, 60),
      stock: Math.max(0, Math.min(9999, Math.round(Number(patch.attributes?.stock ?? current.attributes.stock)))),
    },
  };
};

const createDefaultProductById = (id: string, options?: { category?: string }): ShopProduct => {
  return {
    id,
    slug: normalizeSlug(id) || id,
    title: `Новый товар ${id}`,
    subtitle: "Новая карточка товара",
    description: "Заполните описание товара в админке.",
    category: options?.category || DEFAULT_PRODUCT_CATEGORY,
    image: DEFAULT_PRODUCT_IMAGE,
    priceStarsCents: 1,
    oldPriceStarsCents: undefined,
    rating: 0,
    reviewsCount: 0,
    isNew: true,
    isHit: false,
    tags: ["new"],
    attributes: {
      ...DEFAULT_ATTRIBUTES,
      sku: id,
      stock: 0,
    },
  };
};

const requireDatabase = (): string | null => {
  if (getPostgresHttpConfig()) {
    return null;
  }

  return "Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY";
};

const toDbPayload = (options: {
  product: ShopProduct;
  baseMetadata?: ProductMetadata;
  isPublished: boolean;
  isFeatured: boolean;
  badge?: string;
  categoryId?: string;
  subcategoryId?: string;
}) => {
  const categoryId = normalizeCategoryCode(options.categoryId ?? options.product.category);
  const subcategoryId = normalizeCategoryCode(options.subcategoryId);

  const metadata: ProductMetadata = {
    ...options.baseMetadata,
    category: categoryId,
    categoryId,
    subcategoryId,
    isNew: options.product.isNew,
    isHit: options.product.isHit,
    tags: options.product.tags,
    badge: options.badge,
    attributes: {
      material: options.product.attributes.material,
      technique: options.product.attributes.technique,
      color: options.product.attributes.color,
      heightCm: options.product.attributes.heightCm,
      widthCm: options.product.attributes.widthCm,
      weightGr: options.product.attributes.weightGr,
      collection: options.product.attributes.collection,
      sku: options.product.attributes.sku,
      stock: options.product.attributes.stock,
    },
  };

  return {
    product_code: options.product.id,
    slug: options.product.slug,
    title: options.product.title,
    subtitle: options.product.subtitle,
    description: options.product.description,
    image_url: options.product.image,
    price_stars_cents: options.product.priceStarsCents,
    old_price_stars_cents: options.product.oldPriceStarsCents ?? null,
    stock: options.product.attributes.stock,
    is_published: options.isPublished,
    is_featured: options.isFeatured,
    rating: options.product.rating,
    reviews_count: options.product.reviewsCount,
    metadata,
  };
};

const readAllProducts = async (): Promise<ProductDbRow[] | null> => {
  const query = new URLSearchParams();
  query.set(
    "select",
    "product_code,slug,title,subtitle,description,image_url,price_stars_cents,old_price_stars_cents,stock,is_published,is_featured,rating,reviews_count,metadata,updated_at,category_id,subcategory_id",
  );
  query.set("order", "updated_at.desc");

  return postgresTableRequest<ProductDbRow[]>({
    method: "GET",
    path: "/products",
    query,
  });
};

const readOneProduct = async (productId: string): Promise<ProductDbRow | null> => {
  const query = new URLSearchParams();
  query.set(
    "select",
    "product_code,slug,title,subtitle,description,image_url,price_stars_cents,old_price_stars_cents,stock,is_published,is_featured,rating,reviews_count,metadata,updated_at,category_id,subcategory_id",
  );
  query.set("product_code", `eq.${productId}`);
  query.set("limit", "1");

  const rows = await postgresTableRequest<ProductDbRow[]>({
    method: "GET",
    path: "/products",
    query,
  });

  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0] ?? null;
};

const buildAdminProductsPayload = async () => {
  const [categories, rows] = await Promise.all([listShopProductCategories(), readAllProducts()]);

  if (!rows) {
    throw new Error("Failed to read products from Postgres");
  }

  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const fallbackCategoryId = categories[0]?.id;

  const products = rows
    .map((row) => {
      const source = toShopProduct(row);

      if (!source) {
        return null;
      }

      const metadata = toMetadata(row.metadata);
      const categoryIdFromMetadata = normalizeCategoryCode(metadata.categoryId);
      const legacyCategoryId = normalizeCategoryCode(metadata.category);
      const categoryIdFromSource = normalizeCategoryCode(source.category);
      const categoryId = categoryIdFromMetadata && categoryMap.has(categoryIdFromMetadata)
        ? categoryIdFromMetadata
        : legacyCategoryId && categoryMap.has(legacyCategoryId)
          ? legacyCategoryId
          : categoryIdFromSource && categoryMap.has(categoryIdFromSource)
            ? categoryIdFromSource
            : fallbackCategoryId;
      const category = categoryId ? categoryMap.get(categoryId) : undefined;
      const subcategoryId =
        normalizeCategoryCode(metadata.subcategoryId) &&
        category?.subcategories.some((entry) => entry.id === normalizeCategoryCode(metadata.subcategoryId))
          ? normalizeCategoryCode(metadata.subcategoryId)
          : undefined;
      const subcategory = subcategoryId ? category?.subcategories.find((entry) => entry.id === subcategoryId) : undefined;

      return {
        ...source,
        category: categoryId ?? source.category,
        categoryId,
        subcategoryId,
        categoryLabel: category?.label,
        subcategoryLabel: subcategory?.label,
        adminOverride: {
          productId: source.id,
          priceStarsCents: source.priceStarsCents,
          stock: source.attributes.stock,
          isPublished: row.is_published ?? true,
          isFeatured: row.is_featured ?? false,
          badge: metadata.badge,
          categoryId,
          subcategoryId,
          updatedAt: String(row.updated_at ?? new Date().toISOString()),
        },
        effectivePriceStarsCents: source.priceStarsCents,
        effectiveStock: source.attributes.stock,
        effectivePublished: row.is_published ?? true,
        isCustom: true,
        sourceType: "custom" as const,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((a, b) => a.title.localeCompare(b.title, "ru-RU"));

  return { products };
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:view")) {
    return forbiddenResponse();
  }

  const dbError = requireDatabase();

  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 500 });
  }

  try {
    return NextResponse.json(await buildAdminProductsPayload());
  } catch {
    return NextResponse.json({ error: "Failed to load products" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const dbError = requireDatabase();

  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 500 });
  }

  let payload: ProductCreateBody;

  try {
    payload = (await request.json()) as ProductCreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourcePatch = payload.product ?? {};
  const requestedId = normalizeId(sourcePatch.id);
  const id = requestedId || `custom-${Date.now().toString(36)}`;
  const existing = await readOneProduct(id);

  if (existing) {
    return NextResponse.json({ error: "Product id already exists" }, { status: 409 });
  }

  const categories = await listShopProductCategories();
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const fallbackCategoryId = categories[0]?.id;
  const requestedCategoryId = normalizeCategoryCode(sourcePatch.categoryId ?? sourcePatch.category);
  const categoryId =
    requestedCategoryId && categoryMap.has(requestedCategoryId) ? requestedCategoryId : fallbackCategoryId;
  const requestedSubcategoryId = normalizeCategoryCode(sourcePatch.subcategoryId);
  const subcategoryId =
    requestedSubcategoryId && categoryId && categoryMap.get(categoryId)?.subcategories.some((item) => item.id === requestedSubcategoryId)
      ? requestedSubcategoryId
      : undefined;

  const base = createDefaultProductById(id, { category: categoryId ?? DEFAULT_PRODUCT_CATEGORY });
  const product = mergeProduct(base, {
    ...sourcePatch,
    id,
    slug: normalizeSlug(sourcePatch.slug ?? id) || id,
    category: categoryId ?? sourcePatch.category ?? base.category,
  });

  const body = toDbPayload({
    product,
    isPublished: true,
    isFeatured: false,
    categoryId,
    subcategoryId,
  });

  const created = await postgresTableRequest<ProductDbRow[]>({
    method: "POST",
    path: "/products",
    body,
    prefer: "return=representation",
  });

  if (!created) {
    return NextResponse.json({ error: "Failed to create product" }, { status: 502 });
  }

  return NextResponse.json(await buildAdminProductsPayload());
}

export async function PATCH(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const dbError = requireDatabase();

  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 500 });
  }

  let payload: ProductPatchBody;

  try {
    payload = (await request.json()) as ProductPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = normalizeId(payload.productId ?? payload.product?.id);

  if (!productId) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }

  const [currentRow, categories] = await Promise.all([readOneProduct(productId), listShopProductCategories()]);

  if (!currentRow) {
    return NextResponse.json({ error: "Unknown productId" }, { status: 404 });
  }

  const currentProduct = toShopProduct(currentRow);

  if (!currentProduct) {
    return NextResponse.json({ error: "Invalid product payload in database" }, { status: 409 });
  }

  const currentMeta = toMetadata(currentRow.metadata);
  const categoryMap = new Map(categories.map((category) => [category.id, category]));

  const normalizedCategoryId =
    typeof payload.categoryId === "string"
      ? normalizeMetaId(payload.categoryId)
      : payload.categoryId === null
        ? null
        : undefined;
  const normalizedSubcategoryId =
    typeof payload.subcategoryId === "string"
      ? normalizeMetaId(payload.subcategoryId)
      : payload.subcategoryId === null
        ? null
        : undefined;

  const nextCategoryId =
    normalizedCategoryId === undefined
      ? normalizeCategoryCode(currentMeta.categoryId ?? currentProduct.categoryId ?? currentProduct.category)
      : normalizedCategoryId === null
        ? undefined
        : normalizedCategoryId;

  if (nextCategoryId && !categoryMap.has(nextCategoryId)) {
    return NextResponse.json({ error: "Unknown categoryId" }, { status: 400 });
  }

  const selectedCategory = nextCategoryId ? categoryMap.get(nextCategoryId) : undefined;

  let nextSubcategoryId =
    normalizedSubcategoryId === undefined
      ? currentMeta.subcategoryId
      : normalizedSubcategoryId === null
        ? undefined
        : normalizedSubcategoryId;

  if (nextSubcategoryId) {
    const isValidSubcategory = Boolean(selectedCategory?.subcategories.some((item) => item.id === nextSubcategoryId));

    if (!isValidSubcategory) {
      if (normalizedSubcategoryId !== undefined) {
        return NextResponse.json({ error: "Unknown subcategoryId" }, { status: 400 });
      }

      nextSubcategoryId = undefined;
    }
  }

  let nextProduct = payload.product ? mergeProduct(currentProduct, payload.product) : currentProduct;

  if (typeof payload.priceStarsCents === "number" && Number.isFinite(payload.priceStarsCents)) {
    nextProduct = { ...nextProduct, priceStarsCents: Math.max(1, Math.round(payload.priceStarsCents)) };
  }

  if (typeof payload.stock === "number" && Number.isFinite(payload.stock)) {
    nextProduct = {
      ...nextProduct,
      attributes: {
        ...nextProduct.attributes,
        stock: Math.max(0, Math.min(9999, Math.round(payload.stock))),
      },
    };
  }

  nextProduct = {
    ...nextProduct,
    category: nextCategoryId ?? nextProduct.category,
    categoryId: nextCategoryId,
    subcategoryId: nextSubcategoryId,
  };

  const isPublished =
    typeof payload.isPublished === "boolean"
      ? payload.isPublished
      : typeof currentRow.is_published === "boolean"
        ? currentRow.is_published
        : true;
  const isFeatured =
    typeof payload.isFeatured === "boolean"
      ? payload.isFeatured
      : typeof currentRow.is_featured === "boolean"
        ? currentRow.is_featured
        : false;

  const badge =
    typeof payload.badge === "string"
      ? payload.badge.trim().slice(0, 40)
      : payload.badge === null
        ? undefined
        : currentMeta.badge;

  const body = toDbPayload({
    product: nextProduct,
    baseMetadata: currentMeta,
    isPublished,
    isFeatured,
    badge,
    categoryId: nextCategoryId,
    subcategoryId: nextSubcategoryId,
  });

  const query = new URLSearchParams();
  query.set("product_code", `eq.${productId}`);

  const updated = await postgresTableRequest<ProductDbRow[]>({
    method: "PATCH",
    path: "/products",
    query,
    body,
    prefer: "return=representation",
  });

  if (!updated) {
    return NextResponse.json({ error: "Failed to update product" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const dbError = requireDatabase();

  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 500 });
  }

  let payload: ProductDeleteBody;

  try {
    payload = (await request.json()) as ProductDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = normalizeId(payload.productId);

  if (!productId) {
    return NextResponse.json({ error: "Invalid productId" }, { status: 400 });
  }

  const query = new URLSearchParams();
  query.set("product_code", `eq.${productId}`);

  const deleted = await postgresTableRequest<ProductDbRow[]>({
    method: "DELETE",
    path: "/products",
    query,
    prefer: "return=representation",
  });

  if (!deleted) {
    return NextResponse.json({ error: "Failed to delete product" }, { status: 502 });
  }

  return NextResponse.json(await buildAdminProductsPayload());
}
