import { NextResponse } from "next/server";

import { SHOP_PRODUCTS } from "@/data/shop-products";
import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProductPatchBody {
  productId?: string;
  priceStarsCents?: number | null;
  stock?: number | null;
  isPublished?: boolean | null;
  isFeatured?: boolean | null;
  badge?: string | null;
}

const normalizeProductId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase();
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();

  const products = SHOP_PRODUCTS.map((product) => {
    const override = config.productOverrides[product.id];

    return {
      ...product,
      adminOverride: override ?? null,
      effectivePriceStarsCents: typeof override?.priceStarsCents === "number" ? override.priceStarsCents : product.priceStarsCents,
      effectiveStock: typeof override?.stock === "number" ? override.stock : product.attributes.stock,
      effectivePublished: override?.isPublished ?? true,
    };
  });

  return NextResponse.json({ products });
}

export async function PATCH(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:manage")) {
    return forbiddenResponse();
  }

  let payload: ProductPatchBody;

  try {
    payload = (await request.json()) as ProductPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const productId = normalizeProductId(payload.productId);

  if (!SHOP_PRODUCTS.some((product) => product.id === productId)) {
    return NextResponse.json({ error: "Unknown productId" }, { status: 404 });
  }

  const updatedConfig = await mutateShopAdminConfig((current) => {
    const productOverrides = { ...current.productOverrides };
    const now = new Date().toISOString();
    const existing = productOverrides[productId] ?? { productId, updatedAt: now };

    const next = {
      ...existing,
      updatedAt: now,
      priceStarsCents:
        typeof payload.priceStarsCents === "number" && Number.isFinite(payload.priceStarsCents)
          ? Math.max(1, Math.round(payload.priceStarsCents))
          : payload.priceStarsCents === null
            ? undefined
            : existing.priceStarsCents,
      stock:
        typeof payload.stock === "number" && Number.isFinite(payload.stock)
          ? Math.max(0, Math.min(999, Math.round(payload.stock)))
          : payload.stock === null
            ? undefined
            : existing.stock,
      isPublished:
        typeof payload.isPublished === "boolean" ? payload.isPublished : payload.isPublished === null ? undefined : existing.isPublished,
      isFeatured:
        typeof payload.isFeatured === "boolean" ? payload.isFeatured : payload.isFeatured === null ? undefined : existing.isFeatured,
      badge:
        typeof payload.badge === "string"
          ? payload.badge.trim().slice(0, 40)
          : payload.badge === null
            ? undefined
            : existing.badge,
    };

    const hasValues =
      typeof next.priceStarsCents === "number" ||
      typeof next.stock === "number" ||
      typeof next.isPublished === "boolean" ||
      typeof next.isFeatured === "boolean" ||
      typeof next.badge === "string";

    if (!hasValues) {
      delete productOverrides[productId];
    } else {
      productOverrides[productId] = next;
    }

    return {
      ...current,
      productOverrides,
      updatedAt: now,
    };
  });

  return NextResponse.json({ productOverride: updatedConfig.productOverrides[productId] ?? null });
}
