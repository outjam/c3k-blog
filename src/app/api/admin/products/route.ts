import { NextResponse } from "next/server";

import { SHOP_PRODUCTS } from "@/data/shop-products";
import type { ShopProduct } from "@/types/shop";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";

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

const normalizeId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
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

const defaultProduct = SHOP_PRODUCTS[0] as ShopProduct;
const baseProductMap = new Map(SHOP_PRODUCTS.map((product) => [product.id, product]));

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
    category:
      patch.category === "figurine" ||
      patch.category === "vase" ||
      patch.category === "mug" ||
      patch.category === "lamp" ||
      patch.category === "plate"
        ? patch.category
        : current.category,
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

const createDefaultProductById = (id: string): ShopProduct => {
  return {
    ...defaultProduct,
    id,
    slug: normalizeSlug(id) || id,
    title: `Новый товар ${id}`,
    subtitle: "Новая карточка товара",
    description: "Заполните описание товара в админке.",
    tags: ["new"],
    attributes: {
      ...defaultProduct.attributes,
      sku: `SKU-${id.slice(0, 12).toUpperCase()}`,
      stock: 0,
    },
  };
};

const buildAdminProductsPayload = async () => {
  const config = await readShopAdminConfig();
  const categoryMap = new Map(config.productCategories.map((category) => [category.id, category]));
  const fallbackCategoryId = config.productCategories[0]?.id;
  const ids = new Set<string>([
    ...SHOP_PRODUCTS.map((product) => product.id),
    ...Object.keys(config.productRecords),
    ...Object.keys(config.productOverrides),
  ]);

  const products = Array.from(ids)
    .map((id) => {
      const base = baseProductMap.get(id);
      const record = config.productRecords[id];
      const source = record ?? base ?? null;

      if (!source) {
        return null;
      }

      const override = config.productOverrides[id];
      const categoryId =
        override?.categoryId && categoryMap.has(override.categoryId)
          ? override.categoryId
          : categoryMap.has(source.category)
            ? source.category
            : fallbackCategoryId;
      const category = categoryId ? categoryMap.get(categoryId) : undefined;
      const subcategoryId =
        override?.subcategoryId && category?.subcategories.some((entry) => entry.id === override.subcategoryId)
          ? override.subcategoryId
          : undefined;
      const subcategory = subcategoryId ? category?.subcategories.find((entry) => entry.id === subcategoryId) : undefined;

      return {
        ...source,
        categoryId,
        subcategoryId,
        categoryLabel: category?.label,
        subcategoryLabel: subcategory?.label,
        adminOverride: override ?? null,
        effectivePriceStarsCents: typeof override?.priceStarsCents === "number" ? override.priceStarsCents : source.priceStarsCents,
        effectiveStock: typeof override?.stock === "number" ? override.stock : source.attributes.stock,
        effectivePublished: override?.isPublished ?? true,
        isCustom: !base,
        sourceType: record ? (base ? "edited" : "custom") : "base",
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

  return NextResponse.json(await buildAdminProductsPayload());
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

  let payload: ProductCreateBody;

  try {
    payload = (await request.json()) as ProductCreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const sourcePatch = payload.product ?? {};
  const requestedId = normalizeId(sourcePatch.id);
  const id = requestedId || `custom-${Date.now().toString(36)}`;
  const now = new Date().toISOString();

  const created = await mutateShopAdminConfig((current) => {
    if (baseProductMap.has(id) || current.productRecords[id]) {
      throw new Error("Product id already exists");
    }

    const base = createDefaultProductById(id);
    const product = mergeProduct(base, {
      ...sourcePatch,
      id,
      slug: normalizeSlug(sourcePatch.slug ?? id) || id,
    });

    return {
      ...current,
      productRecords: {
        ...current.productRecords,
        [id]: product,
      },
      productOverrides: {
        ...current.productOverrides,
        [id]: {
          productId: id,
          updatedAt: now,
          isPublished: true,
        },
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Product id already exists") {
      return { __handled: true } as const;
    }

    throw error;
  });

  if (created && "__handled" in created) {
    return NextResponse.json({ error: "Product id already exists" }, { status: 409 });
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

  const now = new Date().toISOString();
  const result = await mutateShopAdminConfig((current) => {
    const base = baseProductMap.get(productId);
    const currentProduct = current.productRecords[productId] ?? base ?? null;

    if (!currentProduct) {
      throw new Error("Unknown productId");
    }

    const nextProduct = payload.product ? mergeProduct(currentProduct, payload.product) : currentProduct;
    const productRecords = {
      ...current.productRecords,
      [productId]: nextProduct,
    };

    const existingOverride = current.productOverrides[productId] ?? { productId, updatedAt: now };
    const categoryMap = new Map(current.productCategories.map((category) => [category.id, category]));
    const normalizedCategoryId =
      typeof payload.categoryId === "string"
        ? normalizeId(payload.categoryId).slice(0, 48)
        : payload.categoryId === null
          ? null
          : undefined;
    const normalizedSubcategoryId =
      typeof payload.subcategoryId === "string"
        ? normalizeId(payload.subcategoryId).slice(0, 48)
        : payload.subcategoryId === null
          ? null
          : undefined;
    const nextCategoryId =
      normalizedCategoryId === undefined
        ? existingOverride.categoryId
        : normalizedCategoryId === null
          ? undefined
          : normalizedCategoryId;
    const selectedCategory = nextCategoryId ? categoryMap.get(nextCategoryId) : undefined;

    if (nextCategoryId && !selectedCategory) {
      throw new Error("Unknown categoryId");
    }

    let nextSubcategoryId =
      normalizedSubcategoryId === undefined
        ? existingOverride.subcategoryId
        : normalizedSubcategoryId === null
          ? undefined
          : normalizedSubcategoryId;

    if (nextSubcategoryId) {
      const isValidSubcategory = Boolean(selectedCategory?.subcategories.some((item) => item.id === nextSubcategoryId));

      if (!isValidSubcategory) {
        if (normalizedSubcategoryId !== undefined) {
          throw new Error("Unknown subcategoryId");
        }

        nextSubcategoryId = undefined;
      }
    }

    const nextOverride = {
      ...existingOverride,
      updatedAt: now,
      priceStarsCents:
        typeof payload.priceStarsCents === "number" && Number.isFinite(payload.priceStarsCents)
          ? Math.max(1, Math.round(payload.priceStarsCents))
          : payload.priceStarsCents === null
            ? undefined
            : existingOverride.priceStarsCents,
      stock:
        typeof payload.stock === "number" && Number.isFinite(payload.stock)
          ? Math.max(0, Math.min(999, Math.round(payload.stock)))
          : payload.stock === null
            ? undefined
            : existingOverride.stock,
      isPublished:
        typeof payload.isPublished === "boolean" ? payload.isPublished : payload.isPublished === null ? undefined : existingOverride.isPublished,
      isFeatured:
        typeof payload.isFeatured === "boolean" ? payload.isFeatured : payload.isFeatured === null ? undefined : existingOverride.isFeatured,
      badge:
        typeof payload.badge === "string"
          ? payload.badge.trim().slice(0, 40)
          : payload.badge === null
            ? undefined
            : existingOverride.badge,
      categoryId: nextCategoryId,
      subcategoryId: nextSubcategoryId,
    };

    const hasValues =
      typeof nextOverride.priceStarsCents === "number" ||
      typeof nextOverride.stock === "number" ||
      typeof nextOverride.isPublished === "boolean" ||
      typeof nextOverride.isFeatured === "boolean" ||
      typeof nextOverride.badge === "string" ||
      typeof nextOverride.categoryId === "string" ||
      typeof nextOverride.subcategoryId === "string";

    const productOverrides = { ...current.productOverrides };

    if (hasValues) {
      productOverrides[productId] = nextOverride;
    } else {
      delete productOverrides[productId];
    }

    return {
      ...current,
      productRecords,
      productOverrides,
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message === "Unknown productId") {
      return { __handled: true } as const;
    }

    if (message === "Unknown categoryId" || message === "Unknown subcategoryId") {
      return { __handledError: message } as const;
    }

    throw error;
  });

  if (result && "__handled" in result) {
    return NextResponse.json({ error: "Unknown productId" }, { status: 404 });
  }

  if (result && "__handledError" in result) {
    return NextResponse.json({ error: result.__handledError }, { status: 400 });
  }

  return NextResponse.json(await buildAdminProductsPayload());
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

  const now = new Date().toISOString();
  await mutateShopAdminConfig((current) => {
    const nextRecords = { ...current.productRecords };
    const nextOverrides = { ...current.productOverrides };

    delete nextRecords[productId];
    delete nextOverrides[productId];

    return {
      ...current,
      productRecords: nextRecords,
      productOverrides: nextOverrides,
      updatedAt: now,
    };
  });

  return NextResponse.json(await buildAdminProductsPayload());
}
