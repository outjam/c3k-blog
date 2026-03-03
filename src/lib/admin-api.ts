"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { ShopAppSettings, ShopOrder, ShopProduct, ShopPromoCode, ShopOrderStatus } from "@/types/shop";

interface ApiErrorShape {
  error?: string;
}

export interface AdminDashboardData {
  metrics: {
    totalOrders: number;
    uniqueCustomers: number;
    revenueStarsCents: number;
    activePromoCodes: number;
    productOverrides: number;
    updatedAt: string;
  };
  statusCounters: Record<string, number>;
}

export interface AdminCustomer {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  ordersCount: number;
  totalSpentStarsCents: number;
  lastOrderAt: string;
}

export interface AdminProductWithMeta extends ShopProduct {
  adminOverride: {
    productId: string;
    priceStarsCents?: number;
    stock?: number;
    isPublished?: boolean;
    isFeatured?: boolean;
    badge?: string;
    updatedAt: string;
  } | null;
  effectivePriceStarsCents: number;
  effectiveStock: number;
  effectivePublished: boolean;
}

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as ApiErrorShape;
    return payload.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

const adminHeaders = (): HeadersInit => {
  return getTelegramAuthHeaders();
};

export const fetchAdminDashboard = async (): Promise<{ data: AdminDashboardData | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/dashboard", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { data: null, error: await parseApiError(response) };
    }

    return { data: (await response.json()) as AdminDashboardData };
  } catch {
    return { data: null, error: "Network error" };
  }
};

export const fetchAdminCustomers = async (): Promise<{ customers: AdminCustomer[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/customers", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { customers: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { customers?: AdminCustomer[] };
    return { customers: payload.customers ?? [] };
  } catch {
    return { customers: [], error: "Network error" };
  }
};

export const fetchAdminProducts = async (): Promise<{ products: AdminProductWithMeta[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/products", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { products: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { products?: AdminProductWithMeta[] };
    return { products: payload.products ?? [] };
  } catch {
    return { products: [], error: "Network error" };
  }
};

export const patchAdminProduct = async (payload: {
  productId: string;
  priceStarsCents?: number | null;
  stock?: number | null;
  isPublished?: boolean | null;
  isFeatured?: boolean | null;
  badge?: string | null;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch("/api/admin/products", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: await parseApiError(response) };
    }

    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
};

export const fetchAdminPromos = async (): Promise<{ promos: ShopPromoCode[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/promos", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { promos: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { promos?: ShopPromoCode[] };
    return { promos: payload.promos ?? [] };
  } catch {
    return { promos: [], error: "Network error" };
  }
};

export const createAdminPromo = async (payload: {
  code: string;
  label: string;
  discountType: "percent" | "fixed";
  discountValue: number;
  minSubtotalStarsCents?: number;
  usageLimit?: number | null;
  expiresAt?: string | null;
}): Promise<{ promos: ShopPromoCode[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/promos", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { promos: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { promos?: ShopPromoCode[] };
    return { promos: data.promos ?? [] };
  } catch {
    return { promos: [], error: "Network error" };
  }
};

export const patchAdminPromo = async (payload: {
  currentCode: string;
  code?: string;
  label?: string;
  discountType?: "percent" | "fixed";
  discountValue?: number;
  minSubtotalStarsCents?: number;
  active?: boolean;
  usageLimit?: number | null;
  expiresAt?: string | null;
}): Promise<{ promos: ShopPromoCode[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/promos", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { promos: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { promos?: ShopPromoCode[] };
    return { promos: data.promos ?? [] };
  } catch {
    return { promos: [], error: "Network error" };
  }
};

export const deleteAdminPromo = async (code: string): Promise<{ promos: ShopPromoCode[]; error?: string }> => {
  try {
    const response = await fetch(`/api/admin/promos?code=${encodeURIComponent(code)}`, {
      method: "DELETE",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { promos: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { promos?: ShopPromoCode[] };
    return { promos: data.promos ?? [] };
  } catch {
    return { promos: [], error: "Network error" };
  }
};

export const fetchAdminSettings = async (): Promise<{ settings: ShopAppSettings | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/settings", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { settings: null, error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { settings?: ShopAppSettings };
    return { settings: payload.settings ?? null };
  } catch {
    return { settings: null, error: "Network error" };
  }
};

export const patchAdminSettings = async (payload: Partial<ShopAppSettings>): Promise<{ settings: ShopAppSettings | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { settings: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { settings?: ShopAppSettings };
    return { settings: data.settings ?? null };
  } catch {
    return { settings: null, error: "Network error" };
  }
};

export const fetchPublicCatalog = async (): Promise<{
  products: ShopProduct[];
  promoRules: Array<{ code: string; label: string; discountType: "percent" | "fixed"; discountValue: number }>;
  settings: ShopAppSettings | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/shop/catalog", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return { products: [], promoRules: [], settings: null, error: await parseApiError(response) };
    }

    const payload = (await response.json()) as {
      products?: ShopProduct[];
      promoRules?: Array<{ code: string; label: string; discountType: "percent" | "fixed"; discountValue: number }>;
      settings?: ShopAppSettings;
    };

    return {
      products: payload.products ?? [],
      promoRules: payload.promoRules ?? [],
      settings: payload.settings ?? null,
    };
  } catch {
    return { products: [], promoRules: [], settings: null, error: "Network error" };
  }
};

export const fetchAdminOrders = async (params?: {
  status?: ShopOrderStatus | "all";
  query?: string;
}): Promise<{ orders: ShopOrder[]; error?: string }> => {
  const search = new URLSearchParams();

  if (params?.status && params.status !== "all") {
    search.set("status", params.status);
  }

  if (params?.query?.trim()) {
    search.set("query", params.query.trim());
  }

  try {
    const response = await fetch(`/api/shop/admin/orders${search.toString() ? `?${search.toString()}` : ""}`, {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { orders: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { orders?: ShopOrder[] };
    return { orders: payload.orders ?? [] };
  } catch {
    return { orders: [], error: "Network error" };
  }
};
