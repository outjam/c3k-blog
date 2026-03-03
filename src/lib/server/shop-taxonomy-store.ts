import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import type { ShopProductCategory } from "@/types/shop";

interface CategoryDbRow {
  id?: number;
  code?: string;
  label?: string;
  emoji?: string | null;
  description?: string | null;
  sort_order?: number;
}

interface SubcategoryDbRow {
  id?: number;
  category_id?: number;
  code?: string;
  label?: string;
  description?: string | null;
  sort_order?: number;
}

const normalizeCode = (value: unknown): string => {
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
  const text = String(value ?? "").trim().slice(0, 220);
  return text || undefined;
};

const normalizeOrder = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
};

const requirePostgres = (): void => {
  if (!getPostgresHttpConfig()) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
  }
};

const readRawCategories = async (): Promise<CategoryDbRow[]> => {
  const query = new URLSearchParams();
  query.set("select", "id,code,label,emoji,description,sort_order");
  query.set("order", "sort_order.asc,id.asc");

  const rows = await postgresTableRequest<CategoryDbRow[]>({
    method: "GET",
    path: "/categories",
    query,
  });

  if (!rows) {
    throw new Error("Failed to read categories");
  }

  return rows;
};

const readRawSubcategories = async (): Promise<SubcategoryDbRow[]> => {
  const query = new URLSearchParams();
  query.set("select", "id,category_id,code,label,description,sort_order");
  query.set("order", "sort_order.asc,id.asc");

  const rows = await postgresTableRequest<SubcategoryDbRow[]>({
    method: "GET",
    path: "/subcategories",
    query,
  });

  if (!rows) {
    throw new Error("Failed to read subcategories");
  }

  return rows;
};

const readCategoryByCode = async (categoryCode: string): Promise<CategoryDbRow | null> => {
  const query = new URLSearchParams();
  query.set("select", "id,code,label,emoji,description,sort_order");
  query.set("code", `eq.${categoryCode}`);
  query.set("limit", "1");

  const rows = await postgresTableRequest<CategoryDbRow[]>({
    method: "GET",
    path: "/categories",
    query,
  });

  if (!rows || rows.length === 0) {
    return null;
  }

  return rows[0] ?? null;
};

export const listShopProductCategories = async (): Promise<ShopProductCategory[]> => {
  requirePostgres();
  const [categoryRows, subcategoryRows] = await Promise.all([readRawCategories(), readRawSubcategories()]);

  const categoriesById = new Map<number, ShopProductCategory>();

  for (const row of categoryRows) {
    const numericId = Number(row.id);
    const code = normalizeCode(row.code);
    const label = normalizeLabel(row.label);

    if (!Number.isFinite(numericId) || !code || !label) {
      continue;
    }

    categoriesById.set(numericId, {
      id: code,
      label,
      emoji: row.emoji ? String(row.emoji).trim().slice(0, 8) : undefined,
      description: normalizeDescription(row.description),
      order: normalizeOrder(row.sort_order, 10),
      subcategories: [],
    });
  }

  for (const row of subcategoryRows) {
    const parentId = Number(row.category_id);
    const parent = categoriesById.get(parentId);

    if (!parent) {
      continue;
    }

    const code = normalizeCode(row.code);
    const label = normalizeLabel(row.label);

    if (!code || !label) {
      continue;
    }

    parent.subcategories.push({
      id: code,
      label,
      description: normalizeDescription(row.description),
      order: normalizeOrder(row.sort_order, 10),
    });
  }

  return Array.from(categoriesById.values())
    .map((category) => ({
      ...category,
      subcategories: category.subcategories.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id)),
    }))
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
};

export const createShopProductCategory = async (input: {
  code?: string;
  label: string;
  emoji?: string;
  description?: string;
}): Promise<void> => {
  requirePostgres();
  const code = normalizeCode(input.code || input.label);
  const label = normalizeLabel(input.label);

  if (!code || !label) {
    throw new Error("Invalid category payload");
  }

  const existing = await readCategoryByCode(code);

  if (existing) {
    throw new Error("Category already exists");
  }

  const categories = await readRawCategories();
  const maxOrder = categories.reduce((acc, row) => Math.max(acc, normalizeOrder(row.sort_order, 0)), 0);

  const created = await postgresTableRequest<CategoryDbRow[]>({
    method: "POST",
    path: "/categories",
    body: {
      code,
      label,
      emoji: input.emoji ? String(input.emoji).trim().slice(0, 8) : null,
      description: normalizeDescription(input.description) ?? null,
      sort_order: maxOrder + 10,
    },
    prefer: "return=representation",
  });

  if (!created) {
    throw new Error("Failed to create category");
  }
};

export const updateShopProductCategory = async (
  categoryCode: string,
  patch: {
    label?: string;
    emoji?: string | null;
    description?: string | null;
    order?: number | null;
  },
): Promise<void> => {
  requirePostgres();
  const code = normalizeCode(categoryCode);

  if (!code) {
    throw new Error("Invalid categoryId");
  }

  const payload: Record<string, unknown> = {};

  if (patch.label !== undefined) {
    const label = normalizeLabel(patch.label);
    if (!label) {
      throw new Error("Invalid label");
    }
    payload.label = label;
  }

  if (patch.emoji !== undefined) {
    payload.emoji = patch.emoji === null ? null : String(patch.emoji).trim().slice(0, 8) || null;
  }

  if (patch.description !== undefined) {
    payload.description = patch.description === null ? null : normalizeDescription(patch.description) ?? null;
  }

  if (patch.order !== undefined) {
    payload.sort_order = patch.order === null ? null : normalizeOrder(patch.order, 10);
  }

  const query = new URLSearchParams();
  query.set("code", `eq.${code}`);

  const updated = await postgresTableRequest<CategoryDbRow[]>({
    method: "PATCH",
    path: "/categories",
    query,
    body: payload,
    prefer: "return=representation",
  });

  if (!updated) {
    throw new Error("Failed to update category");
  }
};

export const deleteShopProductCategory = async (categoryCode: string): Promise<void> => {
  requirePostgres();
  const code = normalizeCode(categoryCode);

  if (!code) {
    throw new Error("Invalid categoryId");
  }

  const query = new URLSearchParams();
  query.set("code", `eq.${code}`);

  const deleted = await postgresTableRequest<CategoryDbRow[]>({
    method: "DELETE",
    path: "/categories",
    query,
    prefer: "return=representation",
  });

  if (!deleted) {
    throw new Error("Failed to delete category");
  }
};

export const createShopProductSubcategory = async (input: {
  categoryCode: string;
  code?: string;
  label: string;
  description?: string;
}): Promise<void> => {
  requirePostgres();
  const categoryCode = normalizeCode(input.categoryCode);
  const subCode = normalizeCode(input.code || input.label);
  const label = normalizeLabel(input.label);

  if (!categoryCode || !subCode || !label) {
    throw new Error("Invalid subcategory payload");
  }

  const category = await readCategoryByCode(categoryCode);

  if (!category || !Number.isFinite(Number(category.id))) {
    throw new Error("Unknown categoryId");
  }

  const query = new URLSearchParams();
  query.set("select", "id,sort_order");
  query.set("category_id", `eq.${Number(category.id)}`);

  const existingRows = await postgresTableRequest<SubcategoryDbRow[]>({
    method: "GET",
    path: "/subcategories",
    query,
  });

  if (!existingRows) {
    throw new Error("Failed to inspect subcategories");
  }

  const maxOrder = existingRows.reduce((acc, row) => Math.max(acc, normalizeOrder(row.sort_order, 0)), 0);

  const created = await postgresTableRequest<SubcategoryDbRow[]>({
    method: "POST",
    path: "/subcategories",
    body: {
      category_id: Number(category.id),
      code: subCode,
      label,
      description: normalizeDescription(input.description) ?? null,
      sort_order: maxOrder + 10,
    },
    prefer: "return=representation",
  });

  if (!created) {
    throw new Error("Failed to create subcategory");
  }
};

export const updateShopProductSubcategory = async (
  categoryCode: string,
  subcategoryCode: string,
  patch: { label?: string; description?: string | null; order?: number | null },
): Promise<void> => {
  requirePostgres();
  const parentCode = normalizeCode(categoryCode);
  const code = normalizeCode(subcategoryCode);

  if (!parentCode || !code) {
    throw new Error("Invalid subcategoryId");
  }

  const category = await readCategoryByCode(parentCode);

  if (!category || !Number.isFinite(Number(category.id))) {
    throw new Error("Unknown categoryId");
  }

  const payload: Record<string, unknown> = {};

  if (patch.label !== undefined) {
    const label = normalizeLabel(patch.label);

    if (!label) {
      throw new Error("Invalid label");
    }

    payload.label = label;
  }

  if (patch.description !== undefined) {
    payload.description = patch.description === null ? null : normalizeDescription(patch.description) ?? null;
  }

  if (patch.order !== undefined) {
    payload.sort_order = patch.order === null ? null : normalizeOrder(patch.order, 10);
  }

  const query = new URLSearchParams();
  query.set("category_id", `eq.${Number(category.id)}`);
  query.set("code", `eq.${code}`);

  const updated = await postgresTableRequest<SubcategoryDbRow[]>({
    method: "PATCH",
    path: "/subcategories",
    query,
    body: payload,
    prefer: "return=representation",
  });

  if (!updated) {
    throw new Error("Failed to update subcategory");
  }
};

export const deleteShopProductSubcategory = async (categoryCode: string, subcategoryCode: string): Promise<void> => {
  requirePostgres();
  const parentCode = normalizeCode(categoryCode);
  const code = normalizeCode(subcategoryCode);

  if (!parentCode || !code) {
    throw new Error("Invalid subcategoryId");
  }

  const category = await readCategoryByCode(parentCode);

  if (!category || !Number.isFinite(Number(category.id))) {
    throw new Error("Unknown categoryId");
  }

  const query = new URLSearchParams();
  query.set("category_id", `eq.${Number(category.id)}`);
  query.set("code", `eq.${code}`);

  const deleted = await postgresTableRequest<SubcategoryDbRow[]>({
    method: "DELETE",
    path: "/subcategories",
    query,
    prefer: "return=representation",
  });

  if (!deleted) {
    throw new Error("Failed to delete subcategory");
  }
};
