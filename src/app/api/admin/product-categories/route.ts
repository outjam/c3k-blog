import { NextResponse } from "next/server";

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
  const config = await readShopAdminConfig();
  return NextResponse.json({ categories: config.productCategories });
};

const makeUniqueId = (base: string, occupied: Set<string>): string => {
  if (!occupied.has(base)) {
    return base;
  }

  let index = 2;

  while (occupied.has(`${base}-${index}`)) {
    index += 1;
  }

  return `${base}-${index}`;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "products:view")) {
    return forbiddenResponse();
  }

  return toResponse();
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

  const now = new Date().toISOString();

  const result = await mutateShopAdminConfig((current) => {
    const categories = [...current.productCategories];
    const parentId = normalizeId(payload.parentCategoryId);

    if (parentId) {
      const parentIndex = categories.findIndex((category) => category.id === parentId);

      if (parentIndex < 0) {
        throw new Error("Unknown categoryId");
      }

      const parent = categories[parentIndex];
      const occupiedIds = new Set(parent.subcategories.map((item) => item.id));
      const requestedId = normalizeId(payload.id);
      const baseId = requestedId || normalizeId(label) || `subcategory-${Date.now().toString(36)}`;
      const id = makeUniqueId(baseId, occupiedIds);
      const nextOrder = Math.max(10, ...parent.subcategories.map((item) => item.order + 10));
      const nextSubcategories = [...parent.subcategories, { id, label, description: normalizeDescription(payload.description), order: nextOrder }];

      categories[parentIndex] = {
        ...parent,
        subcategories: nextSubcategories.sort((a, b) => a.order - b.order),
      };

      return {
        ...current,
        productCategories: categories,
        updatedAt: now,
      };
    }

    const occupiedIds = new Set(categories.map((category) => category.id));
    const requestedId = normalizeId(payload.id);
    const baseId = requestedId || normalizeId(label) || `category-${Date.now().toString(36)}`;
    const id = makeUniqueId(baseId, occupiedIds);
    const nextOrder = Math.max(10, ...categories.map((category) => category.order + 10));
    const nextCategory = {
      id,
      label,
      emoji: payload.emoji ? String(payload.emoji).trim().slice(0, 8) : undefined,
      description: normalizeDescription(payload.description),
      order: nextOrder,
      subcategories: [],
    };

    return {
      ...current,
      productCategories: [...categories, nextCategory].sort((a, b) => a.order - b.order),
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Unknown categoryId") {
      return { __handled: true } as const;
    }

    throw error;
  });

  if (result && "__handled" in result) {
    return NextResponse.json({ error: "Unknown categoryId" }, { status: 404 });
  }

  return toResponse();
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

  const now = new Date().toISOString();

  const result = await mutateShopAdminConfig((current) => {
    const categories = [...current.productCategories];
    const categoryIndex = categories.findIndex((category) => category.id === categoryId);

    if (categoryIndex < 0) {
      throw new Error("Unknown categoryId");
    }

    const category = categories[categoryIndex];

    if (subcategoryId) {
      const subcategoryIndex = category.subcategories.findIndex((item) => item.id === subcategoryId);

      if (subcategoryIndex < 0) {
        throw new Error("Unknown subcategoryId");
      }

      const subcategory = category.subcategories[subcategoryIndex];
      const nextSubcategory = {
        ...subcategory,
        label: nextLabel ?? subcategory.label,
        description:
          payload.description === undefined
            ? subcategory.description
            : payload.description === null
              ? undefined
              : normalizeDescription(payload.description),
        order:
          typeof payload.order === "number" && Number.isFinite(payload.order)
            ? Math.max(1, Math.round(payload.order))
            : subcategory.order,
      };

      const nextSubcategories = [...category.subcategories];
      nextSubcategories[subcategoryIndex] = nextSubcategory;

      categories[categoryIndex] = {
        ...category,
        subcategories: nextSubcategories.sort((a, b) => a.order - b.order),
      };
    } else {
      categories[categoryIndex] = {
        ...category,
        label: nextLabel ?? category.label,
        emoji: payload.emoji === undefined ? category.emoji : payload.emoji === null ? undefined : String(payload.emoji).trim().slice(0, 8),
        description:
          payload.description === undefined
            ? category.description
            : payload.description === null
              ? undefined
              : normalizeDescription(payload.description),
        order:
          typeof payload.order === "number" && Number.isFinite(payload.order)
            ? Math.max(1, Math.round(payload.order))
            : category.order,
      };
    }

    return {
      ...current,
      productCategories: categories.sort((a, b) => a.order - b.order),
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Unknown categoryId" || message === "Unknown subcategoryId") {
      return { __handledError: message } as const;
    }

    throw error;
  });

  if (result && "__handledError" in result) {
    return NextResponse.json({ error: result.__handledError }, { status: 404 });
  }

  return toResponse();
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
  const now = new Date().toISOString();

  const result = await mutateShopAdminConfig((current) => {
    const categories = [...current.productCategories];
    const categoryIndex = categories.findIndex((category) => category.id === categoryId);

    if (categoryIndex < 0) {
      throw new Error("Unknown categoryId");
    }

    const productOverrides = { ...current.productOverrides };

    if (subcategoryId) {
      const category = categories[categoryIndex];
      const exists = category.subcategories.some((item) => item.id === subcategoryId);

      if (!exists) {
        throw new Error("Unknown subcategoryId");
      }

      categories[categoryIndex] = {
        ...category,
        subcategories: category.subcategories.filter((item) => item.id !== subcategoryId),
      };

      Object.entries(productOverrides).forEach(([productId, override]) => {
        if (override.categoryId === categoryId && override.subcategoryId === subcategoryId) {
          productOverrides[productId] = { ...override, subcategoryId: undefined, updatedAt: now };
        }
      });
    } else {
      if (categories.length <= 1) {
        throw new Error("Cannot delete last category");
      }

      categories.splice(categoryIndex, 1);

      Object.entries(productOverrides).forEach(([productId, override]) => {
        if (override.categoryId === categoryId) {
          productOverrides[productId] = {
            ...override,
            categoryId: undefined,
            subcategoryId: undefined,
            updatedAt: now,
          };
        }
      });
    }

    return {
      ...current,
      productCategories: categories.sort((a, b) => a.order - b.order),
      productOverrides,
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message === "Unknown categoryId" || message === "Unknown subcategoryId" || message === "Cannot delete last category") {
      return { __handledError: message } as const;
    }

    throw error;
  });

  if (result && "__handledError" in result) {
    return NextResponse.json({ error: result.__handledError }, { status: 400 });
  }

  return toResponse();
}
