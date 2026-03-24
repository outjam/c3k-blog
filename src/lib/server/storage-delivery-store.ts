import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import type {
  StorageDeliveryChannel,
  StorageDeliveryRequest,
  StorageDeliveryRequestStatus,
  StorageDeliveryState,
  StorageDeliveryTargetType,
} from "@/types/storage";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const STORAGE_DELIVERY_KEY = "storage_delivery_v1";

interface PostgresAppStateRow {
  payload?: unknown;
  row_version?: number;
}

interface PostgresPutStateResult {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeSafeSlug = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeIsoDateTime = (value: unknown, fallbackIso: string): string => {
  const normalized = normalizeText(value, 120);
  const timestamp = Date.parse(normalized);

  if (normalized && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return fallbackIso;
};

const isStaleTimestamp = (value: string | undefined, staleAfterMs: number, nowMs: number): boolean => {
  const timestamp = Date.parse(String(value ?? ""));

  if (!Number.isFinite(timestamp)) {
    return true;
  }

  return nowMs - timestamp >= staleAfterMs;
};

const normalizeChannel = (value: unknown): StorageDeliveryChannel => {
  return value === "telegram_bot" || value === "desktop_download"
    ? value
    : "web_download";
};

const normalizeTargetType = (value: unknown): StorageDeliveryTargetType => {
  return value === "track" ? "track" : "release";
};

const normalizeStatus = (value: unknown): StorageDeliveryRequestStatus => {
  return value === "processing" ||
    value === "pending_asset_mapping" ||
    value === "ready" ||
    value === "delivered" ||
    value === "failed"
    ? value
    : "requested";
};

const emptyState = (now = new Date().toISOString()): StorageDeliveryState => ({
  requests: {},
  updatedAt: now,
});

const normalizeRequest = (
  id: string,
  value: unknown,
  now: string,
): StorageDeliveryRequest | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const telegramUserId = normalizeNonNegativeInt(source.telegramUserId);
  const releaseSlug = normalizeSafeSlug(source.releaseSlug, 120);
  const targetType = normalizeTargetType(source.targetType);
  const trackId = normalizeSafeSlug(source.trackId, 120);

  if (!telegramUserId || !releaseSlug || (targetType === "track" && !trackId)) {
    return null;
  }

  return {
    id,
    telegramUserId,
    channel: normalizeChannel(source.channel),
    targetType,
    releaseSlug,
    trackId: targetType === "track" ? trackId : undefined,
    requestedFormat: normalizeOptionalText(source.requestedFormat, 32),
    resolvedFormat: normalizeOptionalText(source.resolvedFormat, 32),
    status: normalizeStatus(source.status),
    resolvedAssetId: normalizeOptionalText(source.resolvedAssetId, 120),
    resolvedBagId: normalizeOptionalText(source.resolvedBagId, 120),
    resolvedSourceUrl: normalizeOptionalText(source.resolvedSourceUrl, 3000),
    storagePointer: normalizeOptionalText(source.storagePointer, 500),
    deliveryUrl: normalizeOptionalText(source.deliveryUrl, 3000),
    fileName: normalizeOptionalText(source.fileName, 255),
    mimeType: normalizeOptionalText(source.mimeType, 180),
    telegramChatId: normalizeNonNegativeInt(source.telegramChatId) || undefined,
    workerLockId: normalizeOptionalText(source.workerLockId, 120),
    workerLockedAt: source.workerLockedAt ? normalizeIsoDateTime(source.workerLockedAt, now) : undefined,
    workerAttemptCount: normalizeNonNegativeInt(source.workerAttemptCount),
    failureCode: normalizeOptionalText(source.failureCode, 120),
    failureMessage: normalizeOptionalText(source.failureMessage, 500),
    lastDeliveredVia:
      source.lastDeliveredVia === "delivery_url" ||
      source.lastDeliveredVia === "resolved_source" ||
      source.lastDeliveredVia === "bag_meta" ||
      source.lastDeliveredVia === "asset_source" ||
      source.lastDeliveredVia === "bag_http_pointer" ||
      source.lastDeliveredVia === "tonstorage_gateway"
        ? source.lastDeliveredVia
        : undefined,
    lastDeliveredSourceUrl: normalizeOptionalText(source.lastDeliveredSourceUrl, 3000),
    createdAt: normalizeIsoDateTime(source.createdAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
    deliveredAt: source.deliveredAt ? normalizeIsoDateTime(source.deliveredAt, now) : undefined,
  };
};

const sanitizeState = (payload: unknown): StorageDeliveryState => {
  const now = new Date().toISOString();

  if (!payload || typeof payload !== "object") {
    return emptyState(now);
  }

  const source = payload as Record<string, unknown>;
  const requestsSource =
    source.requests && typeof source.requests === "object"
      ? (source.requests as Record<string, unknown>)
      : {};

  return {
    requests: Object.fromEntries(
      Object.entries(requestsSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeRequest(id, entry, now) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const ensureDbEnabled = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const throwStrictError = (message: string): never => {
  throw new Error(message);
};

const readStateWithVersion = async (): Promise<{ state: StorageDeliveryState; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: STORAGE_DELIVERY_KEY,
  });

  if (!rows) {
    return null;
  }

  const first = rows[0];

  if (!first) {
    return {
      state: emptyState(),
      rowVersion: 0,
    };
  }

  return {
    state: sanitizeState(first.payload),
    rowVersion: typeof first.row_version === "number" ? first.row_version : 1,
  };
};

const writeState = async (
  state: StorageDeliveryState,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: STORAGE_DELIVERY_KEY,
    p_payload: state,
    p_expected_row_version: expectedRowVersion,
  });

  if (!rows || !rows[0]) {
    return { ok: false, conflict: false };
  }

  const first = rows[0];

  if (Boolean(first.ok)) {
    return { ok: true };
  }

  return { ok: false, conflict: String(first.error ?? "") === "version_conflict" };
};

const mutateState = async (
  mutate: (state: StorageDeliveryState) => StorageDeliveryState,
): Promise<StorageDeliveryState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for storage delivery");
    }

    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStateWithVersion();

    if (!current) {
      break;
    }

    const next = sanitizeState(mutate(current.state));
    next.updatedAt = new Date().toISOString();
    const saved = await writeState(next, current.rowVersion);

    if (saved.ok) {
      return next;
    }

    if (!saved.conflict) {
      break;
    }
  }

  if (POSTGRES_STRICT) {
    throwStrictError("Failed to mutate storage delivery state in Postgres");
  }

  return null;
};

export const getStorageDeliveryState = async (): Promise<StorageDeliveryState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for storage delivery");
    }

    return null;
  }

  const current = await readStateWithVersion();

  if (!current) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read storage delivery state from Postgres");
    }

    return null;
  }

  if (current.rowVersion > 0) {
    return current.state;
  }

  const bootstrapped = await writeState(current.state, 0);

  if (bootstrapped.ok) {
    return current.state;
  }

  if (!bootstrapped.conflict) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to bootstrap storage delivery state in Postgres");
    }

    return null;
  }

  const replay = await readStateWithVersion();

  if (!replay) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read bootstrapped storage delivery state from Postgres");
    }

    return null;
  }

  return replay.state;
};

export const listStorageDeliveryRequests = async (options?: {
  telegramUserId?: number;
  channel?: StorageDeliveryChannel;
  statuses?: StorageDeliveryRequestStatus[];
  limit?: number;
}): Promise<StorageDeliveryRequest[]> => {
  const snapshot = await getStorageDeliveryState();

  if (!snapshot) {
    return [];
  }

  const telegramUserId = normalizeNonNegativeInt(options?.telegramUserId);
  const channel = options?.channel ? normalizeChannel(options.channel) : undefined;
  const statuses =
    Array.isArray(options?.statuses) && options?.statuses.length > 0
      ? options.statuses.map((entry) => normalizeStatus(entry))
      : [];
  const limit = Math.max(1, Math.min(200, normalizeNonNegativeInt(options?.limit ?? 50) || 50));

  return Object.values(snapshot.requests)
    .filter((request) =>
      telegramUserId > 0 ? request.telegramUserId === telegramUserId : true,
    )
    .filter((request) => (channel ? request.channel === channel : true))
    .filter((request) => (statuses.length > 0 ? statuses.includes(request.status) : true))
    .sort((left, right) => {
      const leftTime = new Date(left.createdAt).getTime();
      const rightTime = new Date(right.createdAt).getTime();
      return rightTime - leftTime;
    })
    .slice(0, limit);
};

export const getStorageDeliveryRequest = async (
  id: string,
): Promise<StorageDeliveryRequest | null> => {
  const normalizedId = normalizeSafeId(id, 120);

  if (!normalizedId) {
    return null;
  }

  const snapshot = await getStorageDeliveryState();

  if (!snapshot) {
    return null;
  }

  return snapshot.requests[normalizedId] ?? null;
};

export const createStorageDeliveryRequest = async (
  input: Omit<
    StorageDeliveryRequest,
    "id" | "createdAt" | "updatedAt" | "workerLockId" | "workerLockedAt" | "workerAttemptCount"
  > & {
    id?: string;
    workerLockId?: string;
    workerLockedAt?: string;
    workerAttemptCount?: number;
  },
): Promise<StorageDeliveryRequest | null> => {
  const telegramUserId = normalizeNonNegativeInt(input.telegramUserId);
  const releaseSlug = normalizeSafeSlug(input.releaseSlug, 120);
  const targetType = normalizeTargetType(input.targetType);
  const trackId = normalizeSafeSlug(input.trackId, 120);

  if (!telegramUserId || !releaseSlug || (targetType === "track" && !trackId)) {
    return null;
  }

  const now = new Date().toISOString();
  const id = normalizeSafeId(input.id ?? `delivery-${Date.now()}`, 120) || `delivery-${Date.now()}`;

  const next = await mutateState((current) => {
    const request: StorageDeliveryRequest = {
      id,
      telegramUserId,
      channel: normalizeChannel(input.channel),
      targetType,
      releaseSlug,
      trackId: targetType === "track" ? trackId : undefined,
      requestedFormat: normalizeOptionalText(input.requestedFormat, 32),
      resolvedFormat: normalizeOptionalText(input.resolvedFormat, 32),
      status: normalizeStatus(input.status),
      resolvedAssetId: normalizeOptionalText(input.resolvedAssetId, 120),
      resolvedBagId: normalizeOptionalText(input.resolvedBagId, 120),
      resolvedSourceUrl: normalizeOptionalText(input.resolvedSourceUrl, 3000),
      storagePointer: normalizeOptionalText(input.storagePointer, 500),
      deliveryUrl: normalizeOptionalText(input.deliveryUrl, 3000),
      fileName: normalizeOptionalText(input.fileName, 255),
      mimeType: normalizeOptionalText(input.mimeType, 180),
      telegramChatId: normalizeNonNegativeInt(input.telegramChatId) || undefined,
      workerLockId: normalizeOptionalText(input.workerLockId, 120),
      workerLockedAt: input.workerLockedAt ? normalizeIsoDateTime(input.workerLockedAt, now) : undefined,
      workerAttemptCount: normalizeNonNegativeInt(input.workerAttemptCount),
      failureCode: normalizeOptionalText(input.failureCode, 120),
      failureMessage: normalizeOptionalText(input.failureMessage, 500),
      lastDeliveredVia:
        input.lastDeliveredVia === "delivery_url" ||
        input.lastDeliveredVia === "resolved_source" ||
        input.lastDeliveredVia === "bag_meta" ||
        input.lastDeliveredVia === "asset_source" ||
        input.lastDeliveredVia === "bag_http_pointer" ||
        input.lastDeliveredVia === "tonstorage_gateway"
          ? input.lastDeliveredVia
          : undefined,
      lastDeliveredSourceUrl: normalizeOptionalText(input.lastDeliveredSourceUrl, 3000),
      createdAt: now,
      updatedAt: now,
      deliveredAt: input.deliveredAt ? normalizeIsoDateTime(input.deliveredAt, now) : undefined,
    };

    return {
      ...current,
      requests: {
        ...current.requests,
        [id]: request,
      },
    };
  });

  return next?.requests[id] ?? null;
};

export const updateStorageDeliveryRequest = async (
  id: string,
  patch: Partial<
    Omit<
      StorageDeliveryRequest,
      | "id"
      | "telegramUserId"
      | "targetType"
      | "releaseSlug"
      | "trackId"
      | "createdAt"
      | "requestedFormat"
      | "resolvedFormat"
      | "resolvedAssetId"
      | "resolvedBagId"
      | "resolvedSourceUrl"
      | "storagePointer"
      | "deliveryUrl"
      | "fileName"
      | "mimeType"
      | "telegramChatId"
      | "workerLockId"
      | "workerLockedAt"
      | "workerAttemptCount"
      | "failureCode"
      | "failureMessage"
      | "lastDeliveredVia"
      | "lastDeliveredSourceUrl"
      | "deliveredAt"
    >
  > & {
    requestedFormat?: string | null;
    resolvedFormat?: string | null;
    resolvedAssetId?: string | null;
    resolvedBagId?: string | null;
    resolvedSourceUrl?: string | null;
    storagePointer?: string | null;
    deliveryUrl?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    telegramChatId?: number | null;
    workerLockId?: string | null;
    workerLockedAt?: string | null;
    workerAttemptCount?: number;
    failureCode?: string | null;
    failureMessage?: string | null;
    lastDeliveredVia?: StorageDeliveryRequest["lastDeliveredVia"] | null;
    lastDeliveredSourceUrl?: string | null;
    deliveredAt?: string | null;
  },
): Promise<StorageDeliveryRequest | null> => {
  const normalizedId = normalizeSafeId(id, 120);

  if (!normalizedId) {
    return null;
  }

  const next = await mutateState((current) => {
    const existing = current.requests[normalizedId];

    if (!existing) {
      return current;
    }

    const now = new Date().toISOString();
    const deliveredAt =
      patch.deliveredAt !== undefined
        ? patch.deliveredAt === null
          ? undefined
          : patch.deliveredAt
          ? normalizeIsoDateTime(patch.deliveredAt, now)
          : undefined
        : existing.deliveredAt;

    return {
      ...current,
      requests: {
        ...current.requests,
        [normalizedId]: {
          ...existing,
          channel: patch.channel ? normalizeChannel(patch.channel) : existing.channel,
          requestedFormat:
            patch.requestedFormat !== undefined
              ? patch.requestedFormat === null
                ? undefined
                : normalizeOptionalText(patch.requestedFormat, 32)
              : existing.requestedFormat,
          resolvedFormat:
            patch.resolvedFormat !== undefined
              ? patch.resolvedFormat === null
                ? undefined
                : normalizeOptionalText(patch.resolvedFormat, 32)
              : existing.resolvedFormat,
          status: patch.status ? normalizeStatus(patch.status) : existing.status,
          resolvedAssetId:
            patch.resolvedAssetId !== undefined
              ? patch.resolvedAssetId === null
                ? undefined
                : normalizeOptionalText(patch.resolvedAssetId, 120)
              : existing.resolvedAssetId,
          resolvedBagId:
            patch.resolvedBagId !== undefined
              ? patch.resolvedBagId === null
                ? undefined
                : normalizeOptionalText(patch.resolvedBagId, 120)
              : existing.resolvedBagId,
          resolvedSourceUrl:
            patch.resolvedSourceUrl !== undefined
              ? patch.resolvedSourceUrl === null
                ? undefined
                : normalizeOptionalText(patch.resolvedSourceUrl, 3000)
              : existing.resolvedSourceUrl,
          storagePointer:
            patch.storagePointer !== undefined
              ? patch.storagePointer === null
                ? undefined
                : normalizeOptionalText(patch.storagePointer, 500)
              : existing.storagePointer,
          deliveryUrl:
            patch.deliveryUrl !== undefined
              ? patch.deliveryUrl === null
                ? undefined
                : normalizeOptionalText(patch.deliveryUrl, 3000)
              : existing.deliveryUrl,
          fileName:
            patch.fileName !== undefined
              ? patch.fileName === null
                ? undefined
                : normalizeOptionalText(patch.fileName, 255)
              : existing.fileName,
          mimeType:
            patch.mimeType !== undefined
              ? patch.mimeType === null
                ? undefined
                : normalizeOptionalText(patch.mimeType, 180)
              : existing.mimeType,
          telegramChatId:
            patch.telegramChatId !== undefined
              ? patch.telegramChatId === null
                ? undefined
                : normalizeNonNegativeInt(patch.telegramChatId) || undefined
              : existing.telegramChatId,
          workerLockId:
            patch.workerLockId !== undefined
              ? patch.workerLockId === null
                ? undefined
                : normalizeOptionalText(patch.workerLockId, 120)
              : existing.workerLockId,
          workerLockedAt:
            patch.workerLockedAt !== undefined
              ? patch.workerLockedAt === null
                ? undefined
                : patch.workerLockedAt
                  ? normalizeIsoDateTime(patch.workerLockedAt, now)
                  : undefined
              : existing.workerLockedAt,
          workerAttemptCount:
            patch.workerAttemptCount !== undefined
              ? normalizeNonNegativeInt(patch.workerAttemptCount)
              : existing.workerAttemptCount,
          failureCode:
            patch.failureCode !== undefined
              ? patch.failureCode === null
                ? undefined
                : normalizeOptionalText(patch.failureCode, 120)
              : existing.failureCode,
          failureMessage:
            patch.failureMessage !== undefined
              ? patch.failureMessage === null
                ? undefined
                : normalizeOptionalText(patch.failureMessage, 500)
              : existing.failureMessage,
          lastDeliveredVia:
            patch.lastDeliveredVia !== undefined
              ? patch.lastDeliveredVia === null
                ? undefined
                : patch.lastDeliveredVia
              : existing.lastDeliveredVia,
          lastDeliveredSourceUrl:
            patch.lastDeliveredSourceUrl !== undefined
              ? patch.lastDeliveredSourceUrl === null
                ? undefined
                : normalizeOptionalText(patch.lastDeliveredSourceUrl, 3000)
              : existing.lastDeliveredSourceUrl,
          deliveredAt,
          updatedAt: now,
        },
      },
    };
  });

  return next?.requests[normalizedId] ?? null;
};

export const claimStorageDeliveryRequestForWorker = async (input: {
  id: string;
  workerLockId: string;
  staleAfterMs?: number;
}): Promise<StorageDeliveryRequest | null> => {
  const normalizedId = normalizeSafeId(input.id, 120);
  const workerLockId = normalizeSafeId(input.workerLockId, 120);
  const staleAfterMs = Math.max(60_000, normalizeNonNegativeInt(input.staleAfterMs ?? 15 * 60 * 1000));

  if (!normalizedId || !workerLockId) {
    return null;
  }

  const next = await mutateState((current) => {
    const existing = current.requests[normalizedId];

    if (!existing || existing.status !== "processing") {
      return current;
    }

    const now = new Date().toISOString();
    const nowMs = Date.parse(now);
    const lockIsActive =
      existing.workerLockId &&
      !isStaleTimestamp(existing.workerLockedAt, staleAfterMs, nowMs);

    if (lockIsActive) {
      return current;
    }

    return {
      ...current,
      requests: {
        ...current.requests,
        [normalizedId]: {
          ...existing,
          workerLockId,
          workerLockedAt: now,
          workerAttemptCount: Math.max(0, existing.workerAttemptCount) + 1,
          updatedAt: now,
        },
      },
    };
  });

  if (!next) {
    return null;
  }

  const claimed = next.requests[normalizedId];
  return claimed?.workerLockId === workerLockId ? claimed : null;
};
