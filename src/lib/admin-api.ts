"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type {
  ArtistProfile,
  ArtistTrack,
  ShowcaseCollection,
  ShopAdminMember,
  ShopCatalogArtist,
  ShopAdminPermission,
  ShopAdminRole,
  ShopAppSettings,
  ShopOrder,
  ShopOrderStatus,
  ShopProduct,
  ShopProductCategory,
  ShopPromoCode,
  ShopShowcaseCollectionView,
} from "@/types/shop";

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
    categoryId?: string;
    subcategoryId?: string;
    updatedAt: string;
  } | null;
  effectivePriceStarsCents: number;
  effectiveStock: number;
  effectivePublished: boolean;
  isCustom?: boolean;
  sourceType?: "base" | "edited" | "custom";
}

export interface AdminSession {
  telegramUserId: number;
  isAdmin: boolean;
  role: ShopAdminRole | null;
  permissions: ShopAdminPermission[];
}

export type AdminOrdersSort = "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "total_desc" | "total_asc";

export interface AdminOrdersPageInfo {
  limit: number;
  hasMore: boolean;
  nextCursor: string | null;
  sort: AdminOrdersSort;
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

export const fetchAdminProductCategories = async (): Promise<{ categories: ShopProductCategory[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/product-categories", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { categories: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { categories?: ShopProductCategory[] };
    return { categories: payload.categories ?? [] };
  } catch {
    return { categories: [], error: "Network error" };
  }
};

export const createAdminProductCategory = async (payload: {
  parentCategoryId?: string;
  label: string;
  emoji?: string;
  description?: string;
  id?: string;
}): Promise<{ categories: ShopProductCategory[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/product-categories", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { categories: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { categories?: ShopProductCategory[] };
    return { categories: data.categories ?? [] };
  } catch {
    return { categories: [], error: "Network error" };
  }
};

export const patchAdminProductCategory = async (payload: {
  categoryId: string;
  subcategoryId?: string;
  label?: string;
  emoji?: string | null;
  description?: string | null;
  order?: number | null;
}): Promise<{ categories: ShopProductCategory[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/product-categories", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { categories: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { categories?: ShopProductCategory[] };
    return { categories: data.categories ?? [] };
  } catch {
    return { categories: [], error: "Network error" };
  }
};

export const deleteAdminProductCategory = async (payload: {
  categoryId: string;
  subcategoryId?: string;
}): Promise<{ categories: ShopProductCategory[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/product-categories", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { categories: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { categories?: ShopProductCategory[] };
    return { categories: data.categories ?? [] };
  } catch {
    return { categories: [], error: "Network error" };
  }
};

export const patchAdminProduct = async (payload: {
  productId: string;
  priceStarsCents?: number | null;
  stock?: number | null;
  isPublished?: boolean | null;
  isFeatured?: boolean | null;
  badge?: string | null;
  categoryId?: string | null;
  subcategoryId?: string | null;
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

export const createAdminProduct = async (payload: {
  product?: Partial<ShopProduct>;
}): Promise<{ products: AdminProductWithMeta[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/products", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { products: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { products?: AdminProductWithMeta[] };
    return { products: data.products ?? [] };
  } catch {
    return { products: [], error: "Network error" };
  }
};

export const deleteAdminProduct = async (productId: string): Promise<{ products: AdminProductWithMeta[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/products", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify({ productId }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { products: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { products?: AdminProductWithMeta[] };
    return { products: data.products ?? [] };
  } catch {
    return { products: [], error: "Network error" };
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

export const fetchAdminSession = async (): Promise<{ session: AdminSession | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/session", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { session: null, error: await parseApiError(response) };
    }

    const payload = (await response.json()) as AdminSession;
    return { session: payload };
  } catch {
    return { session: null, error: "Network error" };
  }
};

export const fetchAdminMembers = async (): Promise<{ admins: ShopAdminMember[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/admins", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { admins: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { admins?: ShopAdminMember[] };
    return { admins: payload.admins ?? [] };
  } catch {
    return { admins: [], error: "Network error" };
  }
};

export const upsertAdminMember = async (payload: {
  telegramUserId: number;
  role: ShopAdminRole;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  disabled?: boolean;
}): Promise<{ admins: ShopAdminMember[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/admins", {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { admins: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { admins?: ShopAdminMember[] };
    return { admins: data.admins ?? [] };
  } catch {
    return { admins: [], error: "Network error" };
  }
};

export const removeAdminMember = async (telegramUserId: number): Promise<{ admins: ShopAdminMember[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/admins", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify({ telegramUserId }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { admins: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { admins?: ShopAdminMember[] };
    return { admins: data.admins ?? [] };
  } catch {
    return { admins: [], error: "Network error" };
  }
};

export const fetchPublicCatalog = async (): Promise<{
  products: ShopProduct[];
  categories: ShopProductCategory[];
  promoRules: Array<{ code: string; label: string; discountType: "percent" | "fixed"; discountValue: number }>;
  settings: ShopAppSettings | null;
  artists: ShopCatalogArtist[];
  showcaseCollections: ShopShowcaseCollectionView[];
  error?: string;
}> => {
  try {
    const response = await fetch("/api/shop/catalog", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        products: [],
        categories: [],
        promoRules: [],
        settings: null,
        artists: [],
        showcaseCollections: [],
        error: await parseApiError(response),
      };
    }

    const payload = (await response.json()) as {
      products?: ShopProduct[];
      categories?: ShopProductCategory[];
      promoRules?: Array<{ code: string; label: string; discountType: "percent" | "fixed"; discountValue: number }>;
      settings?: ShopAppSettings;
      artists?: ShopCatalogArtist[];
      showcaseCollections?: ShopShowcaseCollectionView[];
    };

    return {
      products: payload.products ?? [],
      categories: payload.categories ?? [],
      promoRules: payload.promoRules ?? [],
      settings: payload.settings ?? null,
      artists: payload.artists ?? [],
      showcaseCollections: payload.showcaseCollections ?? [],
    };
  } catch {
    return {
      products: [],
      categories: [],
      promoRules: [],
      settings: null,
      artists: [],
      showcaseCollections: [],
      error: "Network error",
    };
  }
};

export const fetchMyArtistProfile = async (): Promise<{
  profile: ArtistProfile | null;
  tracks: ArtistTrack[];
  donations: number;
  subscriptions: number;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/shop/artists/me", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        profile: null,
        tracks: [],
        donations: 0,
        subscriptions: 0,
        error: await parseApiError(response),
      };
    }

    const payload = (await response.json()) as {
      profile?: ArtistProfile | null;
      tracks?: ArtistTrack[];
      donations?: number;
      subscriptions?: number;
    };

    return {
      profile: payload.profile ?? null,
      tracks: payload.tracks ?? [],
      donations: Math.max(0, Math.round(Number(payload.donations ?? 0))),
      subscriptions: Math.max(0, Math.round(Number(payload.subscriptions ?? 0))),
    };
  } catch {
    return { profile: null, tracks: [], donations: 0, subscriptions: 0, error: "Network error" };
  }
};

export const upsertMyArtistProfile = async (payload: {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  donationEnabled?: boolean;
  subscriptionEnabled?: boolean;
  subscriptionPriceStarsCents?: number;
}): Promise<{ profile: ArtistProfile | null; error?: string }> => {
  try {
    const response = await fetch("/api/shop/artists/me", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { profile: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { profile?: ArtistProfile };
    return { profile: data.profile ?? null };
  } catch {
    return { profile: null, error: "Network error" };
  }
};

export const createMyArtistTrack = async (payload: {
  title: string;
  releaseType?: ArtistTrack["releaseType"];
  subtitle?: string;
  description?: string;
  coverImage?: string;
  audioFileId: string;
  previewUrl?: string;
  durationSec?: number;
  genre?: string;
  tags?: string[];
  priceStarsCents: number;
  formats?: ArtistTrack["formats"];
  releaseTracklist?: ArtistTrack["releaseTracklist"];
}): Promise<{ track: ArtistTrack | null; error?: string }> => {
  try {
    const response = await fetch("/api/shop/artists/me/tracks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { track: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { track?: ArtistTrack };
    return { track: data.track ?? null };
  } catch {
    return { track: null, error: "Network error" };
  }
};

export const fetchAdminArtists = async (): Promise<{
  profiles: ArtistProfile[];
  tracks: ArtistTrack[];
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/artists", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { profiles: [], tracks: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { profiles?: ArtistProfile[]; tracks?: ArtistTrack[] };
    return { profiles: payload.profiles ?? [], tracks: payload.tracks ?? [] };
  } catch {
    return { profiles: [], tracks: [], error: "Network error" };
  }
};

export const patchAdminArtistModeration = async (payload: {
  telegramUserId: number;
  status: ArtistProfile["status"];
  moderationNote?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artists", {
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

export const patchAdminTrackModeration = async (payload: {
  trackId: string;
  status: ArtistTrack["status"];
  moderationNote?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artists", {
      method: "PUT",
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

export const fetchAdminShowcaseCollections = async (): Promise<{
  collections: ShowcaseCollection[];
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/showcase", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { collections: [], error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { collections?: ShowcaseCollection[] };
    return { collections: payload.collections ?? [] };
  } catch {
    return { collections: [], error: "Network error" };
  }
};

export const upsertAdminShowcaseCollection = async (payload: {
  collection: Partial<ShowcaseCollection>;
}): Promise<{ collections: ShowcaseCollection[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/showcase", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { collections: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { collections?: ShowcaseCollection[] };
    return { collections: data.collections ?? [] };
  } catch {
    return { collections: [], error: "Network error" };
  }
};

export const deleteAdminShowcaseCollection = async (id: string): Promise<{ collections: ShowcaseCollection[]; error?: string }> => {
  try {
    const response = await fetch("/api/admin/showcase", {
      method: "DELETE",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify({ id }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { collections: [], error: await parseApiError(response) };
    }

    const data = (await response.json()) as { collections?: ShowcaseCollection[] };
    return { collections: data.collections ?? [] };
  } catch {
    return { collections: [], error: "Network error" };
  }
};

export const fetchAdminOrders = async (params?: {
  status?: ShopOrderStatus | "all";
  query?: string;
  sort?: AdminOrdersSort;
  limit?: number;
  cursor?: string | null;
}): Promise<{
  orders: ShopOrder[];
  pageInfo: AdminOrdersPageInfo;
  totalFiltered: number;
  statusCounters: Record<string, number>;
  error?: string;
}> => {
  const search = new URLSearchParams();

  if (params?.status && params.status !== "all") {
    search.set("status", params.status);
  }

  if (params?.query?.trim()) {
    search.set("query", params.query.trim());
  }

  if (params?.sort) {
    search.set("sort", params.sort);
  }

  if (typeof params?.limit === "number" && Number.isFinite(params.limit)) {
    search.set("limit", String(Math.round(params.limit)));
  }

  if (params?.cursor) {
    search.set("cursor", params.cursor);
  }

  try {
    const response = await fetch(`/api/shop/admin/orders${search.toString() ? `?${search.toString()}` : ""}`, {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        orders: [],
        pageInfo: { limit: 30, hasMore: false, nextCursor: null, sort: params?.sort ?? "updated_desc" },
        totalFiltered: 0,
        statusCounters: {},
        error: await parseApiError(response),
      };
    }

    const payload = (await response.json()) as {
      orders?: ShopOrder[];
      pageInfo?: Partial<AdminOrdersPageInfo>;
      totalFiltered?: number;
      statusCounters?: Record<string, number>;
    };

    return {
      orders: payload.orders ?? [],
      pageInfo: {
        limit: Math.max(1, Math.round(Number(payload.pageInfo?.limit ?? 30))),
        hasMore: Boolean(payload.pageInfo?.hasMore),
        nextCursor: typeof payload.pageInfo?.nextCursor === "string" ? payload.pageInfo.nextCursor : null,
        sort: (payload.pageInfo?.sort as AdminOrdersSort) ?? "updated_desc",
      },
      totalFiltered: Math.max(0, Math.round(Number(payload.totalFiltered ?? 0))),
      statusCounters: payload.statusCounters ?? {},
    };
  } catch {
    return {
      orders: [],
      pageInfo: { limit: 30, hasMore: false, nextCursor: null, sort: params?.sort ?? "updated_desc" },
      totalFiltered: 0,
      statusCounters: {},
      error: "Network error",
    };
  }
};
