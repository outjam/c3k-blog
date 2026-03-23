"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type {
  AdminIncidentStatusSnapshot,
  AdminTonEnvironmentStatus,
  AdminWorkerRunRecord,
  AdminWorkerRunSnapshot,
  AdminWorkerRunWorkerId,
} from "@/types/admin";
import type { AdminDeploymentReadinessSnapshot } from "@/types/admin";
import type {
  ArtistApplication,
  ArtistPayoutAuditEntry,
  ArtistPayoutRequest,
  ArtistPayoutSummary,
  ArtistProfile,
  ArtistStudioStats,
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
import type {
  StorageAsset,
  StorageBag,
  StorageDeliveryRequest,
  StorageHealthEvent,
  StorageIngestJob,
  StorageNode,
  StorageProgramMembership,
  StorageProgramSnapshot,
} from "@/types/storage";

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

export interface AdminMigrationMetric {
  id: string;
  label: string;
  legacyCount: number;
  normalizedCount: number;
}

export interface AdminMigrationDomainStatus {
  id: "entitlements" | "artist_applications" | "artist_catalog" | "artist_finance" | "artist_support";
  label: string;
  source: "postgres" | "legacy";
  cutoverState: "legacy_only" | "dual_write" | "ready";
  coveragePercent: number;
  legacyTotal: number;
  normalizedTotal: number;
  metrics: AdminMigrationMetric[];
  notes: string[];
  updatedAt: string;
}

export interface AdminMigrationStatusSnapshot {
  updatedAt: string;
  postgresEnabled: boolean;
  overallState: "legacy_only" | "dual_write" | "ready";
  readyDomains: number;
  inProgressDomains: number;
  legacyDomains: number;
  domains: AdminMigrationDomainStatus[];
}

export type { AdminIncidentStatusSnapshot } from "@/types/admin";
export type { AdminDeploymentReadinessSnapshot } from "@/types/admin";
export type { AdminTonEnvironmentStatus } from "@/types/admin";
export type { AdminWorkerRunSnapshot } from "@/types/admin";
export type { AdminWorkerRunWorkerId } from "@/types/admin";

export interface AdminSocialEntitlementBackfillResult {
  ok: true;
  dryRun: boolean;
  selectedUsers: number;
  processedUsers: number;
  releaseEntitlements: number;
  trackEntitlements: number;
  nftMints: number;
  sourceUpdatedAt: string;
}

export interface AdminArtistCatalogBackfillResult {
  ok: true;
  dryRun: boolean;
  selectedArtists: number;
  processedArtists: number;
  profiles: number;
  tracks: number;
  sourceUpdatedAt: string;
}

export interface AdminArtistFinanceBackfillResult {
  ok: true;
  dryRun: boolean;
  selectedArtists: number;
  earnings: number;
  payoutRequests: number;
  payoutAuditEntries: number;
  syncedProfiles: number;
  sourceUpdatedAt: string;
}

export interface AdminArtistSupportBackfillResult {
  ok: true;
  dryRun: boolean;
  selectedArtists: number;
  donations: number;
  subscriptions: number;
  sourceUpdatedAt: string;
}

export interface AdminArtistApplicationBackfillResult {
  ok: true;
  dryRun: boolean;
  selectedUsers: number;
  applications: number;
  sourceUpdatedAt: string;
}

export interface AdminMigrationBackfillSuiteResult {
  ok: true;
  dryRun: boolean;
  limit: number;
  domainsCompleted: number;
  domainsReady: number;
  overallState: AdminMigrationStatusSnapshot["overallState"];
  entitlements: AdminSocialEntitlementBackfillResult;
  artistApplications: AdminArtistApplicationBackfillResult;
  artistCatalog: AdminArtistCatalogBackfillResult;
  artistFinance: AdminArtistFinanceBackfillResult;
  artistSupport: AdminArtistSupportBackfillResult;
  migrationStatus: AdminMigrationStatusSnapshot;
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

export interface AdminStorageSnapshot {
  assets: StorageAsset[];
  bags: StorageBag[];
  nodes: StorageNode[];
  memberships: StorageProgramMembership[];
  deliveryRequests: StorageDeliveryRequest[];
  ingestJobs: StorageIngestJob[];
  healthEvents: StorageHealthEvent[];
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

export const fetchAdminMigrationStatus = async (): Promise<{
  status: AdminMigrationStatusSnapshot | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/migrations/status", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: null, error: await parseApiError(response) };
    }

    return { status: (await response.json()) as AdminMigrationStatusSnapshot };
  } catch {
    return { status: null, error: "Network error" };
  }
};

export const fetchAdminIncidentStatus = async (): Promise<{
  status: AdminIncidentStatusSnapshot | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/incidents", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: null, error: await parseApiError(response) };
    }

    return { status: (await response.json()) as AdminIncidentStatusSnapshot };
  } catch {
    return { status: null, error: "Network error" };
  }
};

export const fetchAdminWorkerRuns = async (): Promise<{
  snapshot: AdminWorkerRunSnapshot | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/workers/runs?limit=12", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as AdminWorkerRunSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const runAdminWorker = async (input: {
  workerId: AdminWorkerRunWorkerId;
  limit?: number;
}): Promise<{
  run: AdminWorkerRunRecord | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/workers/runs", {
      method: "POST",
      headers: {
        ...adminHeaders(),
        "content-type": "application/json",
      },
      body: JSON.stringify({
        workerId: input.workerId,
        limit: input.limit,
      }),
    });

    if (!response.ok) {
      return { run: null, error: await parseApiError(response) };
    }

    const payload = (await response.json()) as { run?: AdminWorkerRunRecord | null };
    return { run: payload.run ?? null };
  } catch {
    return { run: null, error: "Network error" };
  }
};

export const fetchAdminTonEnvironmentStatus = async (): Promise<{
  status: AdminTonEnvironmentStatus | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/ton/status", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: null, error: await parseApiError(response) };
    }

    return { status: (await response.json()) as AdminTonEnvironmentStatus };
  } catch {
    return { status: null, error: "Network error" };
  }
};

export const fetchAdminDeploymentReadiness = async (): Promise<{
  status: AdminDeploymentReadinessSnapshot | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/deployment/readiness", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { status: null, error: await parseApiError(response) };
    }

    return { status: (await response.json()) as AdminDeploymentReadinessSnapshot };
  } catch {
    return { status: null, error: "Network error" };
  }
};

export const runAdminSocialEntitlementBackfill = async (payload: {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}): Promise<{ result: AdminSocialEntitlementBackfillResult | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/social/entitlements/backfill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { result: null, error: await parseApiError(response) };
    }

    return { result: (await response.json()) as AdminSocialEntitlementBackfillResult };
  } catch {
    return { result: null, error: "Network error" };
  }
};

export const runAdminArtistCatalogBackfill = async (payload: {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}): Promise<{ result: AdminArtistCatalogBackfillResult | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artists/backfill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { result: null, error: await parseApiError(response) };
    }

    return { result: (await response.json()) as AdminArtistCatalogBackfillResult };
  } catch {
    return { result: null, error: "Network error" };
  }
};

export const runAdminArtistFinanceBackfill = async (payload: {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}): Promise<{ result: AdminArtistFinanceBackfillResult | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artists/finance-backfill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { result: null, error: await parseApiError(response) };
    }

    return { result: (await response.json()) as AdminArtistFinanceBackfillResult };
  } catch {
    return { result: null, error: "Network error" };
  }
};

export const runAdminArtistApplicationBackfill = async (payload: {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}): Promise<{ result: AdminArtistApplicationBackfillResult | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artist-applications/backfill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { result: null, error: await parseApiError(response) };
    }

    return { result: (await response.json()) as AdminArtistApplicationBackfillResult };
  } catch {
    return { result: null, error: "Network error" };
  }
};

export const runAdminArtistSupportBackfill = async (payload: {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}): Promise<{ result: AdminArtistSupportBackfillResult | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artists/support-backfill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { result: null, error: await parseApiError(response) };
    }

    return { result: (await response.json()) as AdminArtistSupportBackfillResult };
  } catch {
    return { result: null, error: "Network error" };
  }
};

export const runAdminMigrationBackfillSuite = async (payload: {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}): Promise<{ result: AdminMigrationBackfillSuiteResult | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/migrations/backfill", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { result: null, error: await parseApiError(response) };
    }

    return { result: (await response.json()) as AdminMigrationBackfillSuiteResult };
  } catch {
    return { result: null, error: "Network error" };
  }
};

export const fetchStorageProgramSnapshot = async (): Promise<{
  snapshot: StorageProgramSnapshot | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/storage/program/me", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as StorageProgramSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const joinMyStorageProgram = async (payload: {
  walletAddress?: string;
  note?: string;
}): Promise<{ membership: StorageProgramMembership | null; error?: string }> => {
  try {
    const response = await fetch("/api/storage/program/join", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { membership: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { membership?: StorageProgramMembership | null };
    return { membership: data.membership ?? null };
  } catch {
    return { membership: null, error: "Network error" };
  }
};

export const fetchAdminStorage = async (): Promise<{ data: AdminStorageSnapshot | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/storage", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { data: null, error: await parseApiError(response) };
    }

    return { data: (await response.json()) as AdminStorageSnapshot };
  } catch {
    return { data: null, error: "Network error" };
  }
};

export const createAdminStorageAsset = async (payload: {
  id?: string;
  releaseSlug?: string;
  trackId?: string;
  artistTelegramUserId?: number;
  resourceKey?: string;
  audioFileId?: string;
  assetType: StorageAsset["assetType"];
  format: StorageAsset["format"];
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksumSha256?: string;
}): Promise<{ asset: StorageAsset | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/storage/assets", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { asset: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { asset?: StorageAsset | null };
    return { asset: data.asset ?? null };
  } catch {
    return { asset: null, error: "Network error" };
  }
};

export const createAdminStorageBag = async (payload: {
  id?: string;
  assetId: string;
  bagId?: string;
  description?: string;
  tonstorageUri?: string;
  metaFileUrl?: string;
  status?: StorageBag["status"];
  replicasTarget?: number;
  replicasActual?: number;
}): Promise<{ bag: StorageBag | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/storage/bags", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { bag: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { bag?: StorageBag | null };
    return { bag: data.bag ?? null };
  } catch {
    return { bag: null, error: "Network error" };
  }
};

export const syncAdminStorageArtistTracks = async (payload?: {
  trackId?: string;
  cursorTrackId?: string;
  limit?: number;
}): Promise<{
  ok: boolean;
  processedTracks: number;
  syncedTracks: number;
  failedTracks: number;
  totalCandidateTracks: number;
  remainingTracks: number;
  nextCursorTrackId: string | null;
  summaries: Array<{
    trackId: string;
    releaseSlug: string;
    upsertedAssetIds: string[];
    deletedAssetIds: string[];
    skippedDeleteAssetIds: string[];
    desiredAssetCount: number;
    error?: string;
  }>;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/storage/sync-tracks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ok: false,
        processedTracks: 0,
        syncedTracks: 0,
        failedTracks: 0,
        totalCandidateTracks: 0,
        remainingTracks: 0,
        nextCursorTrackId: null,
        summaries: [],
        error: await parseApiError(response),
      };
    }

    const data = (await response.json()) as {
      ok?: boolean;
      processedTracks?: number;
      syncedTracks?: number;
      failedTracks?: number;
      totalCandidateTracks?: number;
      remainingTracks?: number;
      nextCursorTrackId?: string | null;
      summaries?: Array<{
        trackId: string;
        releaseSlug: string;
        upsertedAssetIds: string[];
        deletedAssetIds: string[];
        skippedDeleteAssetIds: string[];
        desiredAssetCount: number;
        error?: string;
      }>;
    };

    return {
      ok: Boolean(data.ok),
      processedTracks: Math.max(0, Math.round(Number(data.processedTracks ?? 0))),
      syncedTracks: Math.max(0, Math.round(Number(data.syncedTracks ?? 0))),
      failedTracks: Math.max(0, Math.round(Number(data.failedTracks ?? 0))),
      totalCandidateTracks: Math.max(0, Math.round(Number(data.totalCandidateTracks ?? 0))),
      remainingTracks: Math.max(0, Math.round(Number(data.remainingTracks ?? 0))),
      nextCursorTrackId:
        typeof data.nextCursorTrackId === "string" && data.nextCursorTrackId.trim()
          ? data.nextCursorTrackId.trim()
          : null,
      summaries: Array.isArray(data.summaries) ? data.summaries : [],
    };
  } catch {
    return {
      ok: false,
      processedTracks: 0,
      syncedTracks: 0,
      failedTracks: 0,
      totalCandidateTracks: 0,
      remainingTracks: 0,
      nextCursorTrackId: null,
      summaries: [],
      error: "Network error",
    };
  }
};

export const runAdminStorageIngest = async (payload?: {
  assetIds?: string[];
  onlyMissingBags?: boolean;
  limit?: number;
}): Promise<
  | {
      ok: true;
      queuedJobs: number;
      processedJobs: number;
      preparedJobs: number;
      failedJobs: number;
      reusedBags: number;
      createdBags: number;
      warningJobs: number;
      selectedAssets: number;
      skippedAssets: number;
    }
  | { ok: false; error: string }
> => {
  try {
    const response = await fetch("/api/admin/storage/ingest", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload ?? {}),
      cache: "no-store",
    });

    if (!response.ok) {
      return { ok: false, error: await parseApiError(response) };
    }

    return {
      ok: true,
      ...((await response.json()) as {
        queuedJobs: number;
        processedJobs: number;
        preparedJobs: number;
        failedJobs: number;
        reusedBags: number;
        createdBags: number;
        warningJobs: number;
        selectedAssets: number;
        skippedAssets: number;
      }),
    };
  } catch {
    return { ok: false, error: "Network error" };
  }
};

export const patchAdminStorageMembership = async (payload: {
  telegramUserId: number;
  status?: StorageProgramMembership["status"];
  tier?: StorageProgramMembership["tier"];
  moderationNote?: string | null;
  walletAddress?: string | null;
}): Promise<{ membership: StorageProgramMembership | null; error?: string }> => {
  try {
    const response = await fetch("/api/admin/storage/memberships", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { membership: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { membership?: StorageProgramMembership | null };
    return { membership: data.membership ?? null };
  } catch {
    return { membership: null, error: "Network error" };
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
  application: ArtistApplication | null;
  profile: ArtistProfile | null;
  tracks: ArtistTrack[];
  donations: number;
  subscriptions: number;
  studioStats: ArtistStudioStats | null;
  payoutSummary: ArtistPayoutSummary | null;
  payoutRequests: ArtistPayoutRequest[];
  payoutAuditEntries: ArtistPayoutAuditEntry[];
  artistSource: "postgres" | "legacy";
  financeSource: "postgres" | "legacy";
  supportSource: "postgres" | "legacy";
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
        application: null,
        profile: null,
        tracks: [],
        donations: 0,
        subscriptions: 0,
        studioStats: null,
        payoutSummary: null,
        payoutRequests: [],
        payoutAuditEntries: [],
        artistSource: "legacy",
        financeSource: "legacy",
        supportSource: "legacy",
        error: await parseApiError(response),
      };
    }

    const payload = (await response.json()) as {
      application?: ArtistApplication | null;
      profile?: ArtistProfile | null;
      tracks?: ArtistTrack[];
      donations?: number;
      subscriptions?: number;
      studioStats?: ArtistStudioStats | null;
      payoutSummary?: ArtistPayoutSummary | null;
      payoutRequests?: ArtistPayoutRequest[];
      payoutAuditEntries?: ArtistPayoutAuditEntry[];
      artistSource?: "postgres" | "legacy";
      financeSource?: "postgres" | "legacy";
      supportSource?: "postgres" | "legacy";
    };

    return {
      application: payload.application ?? null,
      profile: payload.profile ?? null,
      tracks: payload.tracks ?? [],
      donations: Math.max(0, Math.round(Number(payload.donations ?? 0))),
      subscriptions: Math.max(0, Math.round(Number(payload.subscriptions ?? 0))),
      studioStats: payload.studioStats ?? null,
      payoutSummary: payload.payoutSummary ?? null,
      payoutRequests: payload.payoutRequests ?? [],
      payoutAuditEntries: payload.payoutAuditEntries ?? [],
      artistSource: payload.artistSource ?? "legacy",
      financeSource: payload.financeSource ?? "legacy",
      supportSource: payload.supportSource ?? "legacy",
    };
  } catch {
    return {
      application: null,
      profile: null,
      tracks: [],
      donations: 0,
      subscriptions: 0,
      studioStats: null,
      payoutSummary: null,
      payoutRequests: [],
      payoutAuditEntries: [],
      artistSource: "legacy",
      financeSource: "legacy",
      supportSource: "legacy",
      error: "Network error",
    };
  }
};

export const submitMyArtistApplication = async (payload: {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  tonWalletAddress: string;
  referenceLinks?: string[];
  note?: string;
}): Promise<{ application: ArtistApplication | null; error?: string }> => {
  try {
    const response = await fetch("/api/shop/artists/me/application", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { application: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { application?: ArtistApplication | null };
    return { application: data.application ?? null };
  } catch {
    return { application: null, error: "Network error" };
  }
};

export const requestMyArtistPayout = async (payload: {
  amountStarsCents: number;
  note?: string;
}): Promise<{ payoutRequest: ArtistPayoutRequest | null; error?: string }> => {
  try {
    const response = await fetch("/api/shop/artists/me/payouts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...adminHeaders(),
      },
      body: JSON.stringify(payload),
      cache: "no-store",
    });

    if (!response.ok) {
      return { payoutRequest: null, error: await parseApiError(response) };
    }

    const data = (await response.json()) as { payoutRequest?: ArtistPayoutRequest | null };
    return { payoutRequest: data.payoutRequest ?? null };
  } catch {
    return { payoutRequest: null, error: "Network error" };
  }
};

export const upsertMyArtistProfile = async (payload: {
  displayName: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  tonWalletAddress?: string;
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
  isMintable?: boolean;
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
  source: "postgres" | "legacy";
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/artists", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { profiles: [], tracks: [], source: "legacy", error: await parseApiError(response) };
    }

    const payload = (await response.json()) as {
      profiles?: ArtistProfile[];
      tracks?: ArtistTrack[];
      source?: "postgres" | "legacy";
    };
    return { profiles: payload.profiles ?? [], tracks: payload.tracks ?? [], source: payload.source ?? "legacy" };
  } catch {
    return { profiles: [], tracks: [], source: "legacy", error: "Network error" };
  }
};

export const fetchAdminArtistApplications = async (): Promise<{
  applications: ArtistApplication[];
  source: "postgres" | "legacy";
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/artist-applications", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { applications: [], source: "legacy", error: await parseApiError(response) };
    }

    const payload = (await response.json()) as {
      applications?: ArtistApplication[];
      source?: "postgres" | "legacy";
    };
    return { applications: payload.applications ?? [], source: payload.source ?? "legacy" };
  } catch {
    return { applications: [], source: "legacy", error: "Network error" };
  }
};

export const patchAdminArtistApplication = async (payload: {
  telegramUserId: number;
  status: ArtistApplication["status"];
  moderationNote?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artist-applications", {
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

export const fetchAdminArtistPayouts = async (): Promise<{
  payoutRequests: ArtistPayoutRequest[];
  payoutAuditEntries: ArtistPayoutAuditEntry[];
  source: "postgres" | "legacy";
  error?: string;
}> => {
  try {
    const response = await fetch("/api/admin/artist-payouts", {
      method: "GET",
      headers: adminHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { payoutRequests: [], payoutAuditEntries: [], source: "legacy", error: await parseApiError(response) };
    }

    const payload = (await response.json()) as {
      payoutRequests?: ArtistPayoutRequest[];
      payoutAuditEntries?: ArtistPayoutAuditEntry[];
      source?: "postgres" | "legacy";
    };
    return {
      payoutRequests: payload.payoutRequests ?? [],
      payoutAuditEntries: payload.payoutAuditEntries ?? [],
      source: payload.source ?? "legacy",
    };
  } catch {
    return { payoutRequests: [], payoutAuditEntries: [], source: "legacy", error: "Network error" };
  }
};

export const patchAdminArtistPayout = async (payload: {
  id: string;
  status: ArtistPayoutRequest["status"];
  adminNote?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch("/api/admin/artist-payouts", {
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
