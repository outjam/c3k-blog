import { NextResponse } from "next/server";

import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import {
  createShopProductCategory,
  createShopProductSubcategory,
  deleteShopProductCategory,
  deleteShopProductSubcategory,
  listShopProductCategories,
  updateShopProductCategory,
  updateShopProductSubcategory,
} from "@/lib/server/shop-taxonomy-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CategoryCreateBody {
  parentCategoryId?: string;
  label?: string;
  emoji?: string;
  description?: string;
  id?: string;
}

interface CategoryPatchBody {
  categoryId?: string;
  subcategoryId?: string;
  label?: string;
  emoji?: string | null;
  description?: string | null;
  order?: number | null;
}

interface CategoryDeleteBody {
  categoryId?: string;
  subcategoryId?: string;
}

const normalizeId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
};

const normalizeLabel = (value: unknown): string => {
  return String(value ?? "").trim().slice(0, 64);
};

const normalizeDescription = (value: unknown): string | undefined => {
  const result = String(value ?? "").trim().slice(0, 220);
  return result || undefined;
};

const toResponse = async () => {
  const categories = await listShopProductCategories();
  return NextResponse.json({ categories });
};

const toHandledError = (error: unknown): string => {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (
    message === "Unknown categoryId" ||
    message === "Invalid categoryId" ||
    message === "Invalid subcategoryId" ||
    message === "Invalid label" ||
    message === "Category already exists" ||
    message === "Invalid category payload" ||
    message === "Invalid subcategory payload"
  ) {
    return message;
  }

  return "Failed to mutate categories";
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:view")) {
    return forbiddenResponse();
  }

  try {
    return await toResponse();
  } catch {
    return NextResponse.json({ error: "Failed to load categories" }, { status: 502 });
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

  let payload: CategoryCreateBody;

  try {
    payload = (await request.json()) as CategoryCreateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const label = normalizeLabel(payload.label);

  if (!label) {
    return NextResponse.json({ error: "Label is required" }, { status: 400 });
  }

  const parentId = normalizeId(payload.parentCategoryId);

  try {
    if (parentId) {
      await createShopProductSubcategory({
        categoryCode: parentId,
        code: normalizeId(payload.id) || undefined,
        label,
        description: normalizeDescription(payload.description),
      });
    } else {
      await createShopProductCategory({
        code: normalizeId(payload.id) || undefined,
        label,
        emoji: payload.emoji ? String(payload.emoji).trim().slice(0, 8) : undefined,
        description: normalizeDescription(payload.description),
      });
    }

    return await toResponse();
  } catch (error: unknown) {
    const message = toHandledError(error);
    const status = message === "Failed to mutate categories" ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
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

  let payload: CategoryPatchBody;

  try {
    payload = (await request.json()) as CategoryPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const categoryId = normalizeId(payload.categoryId);

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const subcategoryId = normalizeId(payload.subcategoryId);
  const nextLabel = payload.label === undefined ? undefined : normalizeLabel(payload.label);

  if (payload.label !== undefined && !nextLabel) {
    return NextResponse.json({ error: "Invalid label" }, { status: 400 });
  }

  try {
    if (subcategoryId) {
      await updateShopProductSubcategory(categoryId, subcategoryId, {
        label: nextLabel,
        description:
          payload.description === undefined ? undefined : payload.description === null ? null : normalizeDescription(payload.description),
        order: typeof payload.order === "number" && Number.isFinite(payload.order) ? Math.max(1, Math.round(payload.order)) : undefined,
      });
    } else {
      await updateShopProductCategory(categoryId, {
        label: nextLabel,
        emoji: payload.emoji === undefined ? undefined : payload.emoji === null ? null : String(payload.emoji).trim().slice(0, 8),
        description:
          payload.description === undefined ? undefined : payload.description === null ? null : normalizeDescription(payload.description),
        order: typeof payload.order === "number" && Number.isFinite(payload.order) ? Math.max(1, Math.round(payload.order)) : undefined,
      });
    }

    return await toResponse();
  } catch (error: unknown) {
    const message = toHandledError(error);
    const status = message === "Failed to mutate categories" ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
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

  let payload: CategoryDeleteBody;

  try {
    payload = (await request.json()) as CategoryDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const categoryId = normalizeId(payload.categoryId);

  if (!categoryId) {
    return NextResponse.json({ error: "categoryId is required" }, { status: 400 });
  }

  const subcategoryId = normalizeId(payload.subcategoryId);

  try {
    if (subcategoryId) {
      await deleteShopProductSubcategory(categoryId, subcategoryId);
    } else {
      await deleteShopProductCategory(categoryId);
    }

    return await toResponse();
  } catch (error: unknown) {
    const message = toHandledError(error);
    const status = message === "Failed to mutate categories" ? 502 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
