import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import type {
  StorageIngestJob,
  StorageIngestJobStatus,
  StorageIngestMode,
  StorageIngestState,
} from "@/types/storage";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const STORAGE_INGEST_KEY = "storage_ingest_v1";

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

const normalizeMode = (value: unknown): StorageIngestMode => {
  return value === "tonstorage_testnet" || value === "test_prepare" ? value : "test_prepare";
};

const normalizeStatus = (value: unknown): StorageIngestJobStatus => {
  return value === "processing" ||
    value === "prepared" ||
    value === "uploaded" ||
    value === "failed" ||
    value === "skipped"
    ? value
    : "queued";
};

const emptyState = (now = new Date().toISOString()): StorageIngestState => ({
  jobs: {},
  updatedAt: now,
});

const normalizeJob = (id: string, value: unknown, now: string): StorageIngestJob | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const assetId = normalizeSafeId(source.assetId, 120);

  if (!assetId) {
    return null;
  }

  return {
    id,
    assetId,
    bagId: normalizeOptionalText(source.bagId, 120),
    mode: normalizeMode(source.mode),
    status: normalizeStatus(source.status),
    requestedByTelegramUserId: normalizeNonNegativeInt(source.requestedByTelegramUserId) || undefined,
    storagePointer: normalizeOptionalText(source.storagePointer, 500),
    message: normalizeOptionalText(source.message, 500),
    attemptCount: normalizeNonNegativeInt(source.attemptCount),
    workerLockId: normalizeOptionalText(source.workerLockId, 160),
    workerLockedAt: source.workerLockedAt
      ? normalizeIsoDateTime(source.workerLockedAt, now)
      : undefined,
    failureCode: normalizeOptionalText(source.failureCode, 120),
    failureMessage: normalizeOptionalText(source.failureMessage, 500),
    createdAt: normalizeIsoDateTime(source.createdAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
    startedAt: source.startedAt ? normalizeIsoDateTime(source.startedAt, now) : undefined,
    completedAt: source.completedAt ? normalizeIsoDateTime(source.completedAt, now) : undefined,
  };
};

const sanitizeState = (payload: unknown): StorageIngestState => {
  const now = new Date().toISOString();

  if (!payload || typeof payload !== "object") {
    return emptyState(now);
  }

  const source = payload as Record<string, unknown>;
  const jobsSource =
    source.jobs && typeof source.jobs === "object" ? (source.jobs as Record<string, unknown>) : {};

  return {
    jobs: Object.fromEntries(
      Object.entries(jobsSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeJob(id, entry, now) : null;
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

const readStateWithVersion = async (): Promise<{ state: StorageIngestState; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: STORAGE_INGEST_KEY,
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
  state: StorageIngestState,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: STORAGE_INGEST_KEY,
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
  mutate: (state: StorageIngestState) => StorageIngestState,
): Promise<StorageIngestState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for storage ingest");
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
    throwStrictError("Failed to mutate storage ingest state in Postgres");
  }

  return null;
};

export const getStorageIngestState = async (): Promise<StorageIngestState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for storage ingest");
    }

    return null;
  }

  const snapshot = await readStateWithVersion();
  return snapshot?.state ?? emptyState();
};

export const listStorageIngestJobs = async (input?: {
  limit?: number;
  assetId?: string;
  statuses?: StorageIngestJobStatus[];
}): Promise<StorageIngestJob[]> => {
  const state = await getStorageIngestState();

  if (!state) {
    return [];
  }

  const assetId = normalizeSafeId(input?.assetId, 120);
  const statuses = input?.statuses ?? [];
  const limit = Math.max(0, Math.round(Number(input?.limit ?? 0)));

  const filtered = Object.values(state.jobs)
    .filter((job) => (assetId ? job.assetId === assetId : true))
    .filter((job) => (statuses.length > 0 ? statuses.includes(job.status) : true))
    .sort((left, right) => {
      const leftTime = new Date(left.updatedAt || left.createdAt).getTime();
      const rightTime = new Date(right.updatedAt || right.createdAt).getTime();
      return rightTime - leftTime;
    });

  return limit > 0 ? filtered.slice(0, limit) : filtered;
};

export const getStorageIngestJob = async (id: string): Promise<StorageIngestJob | null> => {
  const normalizedId = normalizeSafeId(id, 120);

  if (!normalizedId) {
    return null;
  }

  const state = await getStorageIngestState();
  return state?.jobs[normalizedId] ?? null;
};

export const createStorageIngestJob = async (input: {
  id?: string;
  assetId: string;
  bagId?: string;
  mode?: StorageIngestMode;
  status?: StorageIngestJobStatus;
  requestedByTelegramUserId?: number;
  storagePointer?: string;
  message?: string;
  attemptCount?: number;
  workerLockId?: string;
  workerLockedAt?: string;
  failureCode?: string;
  failureMessage?: string;
  startedAt?: string;
  completedAt?: string;
}): Promise<StorageIngestJob | null> => {
  const assetId = normalizeSafeId(input.assetId, 120);

  if (!assetId) {
    return null;
  }

  const id =
    normalizeSafeId(input.id ?? `ingest-${Date.now()}`, 120) ||
    `ingest-${Date.now()}`;

  const next = await mutateState((current) => {
    const now = new Date().toISOString();
    const existing = current.jobs[id];
    const job: StorageIngestJob = {
      id,
      assetId,
      bagId: normalizeOptionalText(input.bagId, 120) ?? existing?.bagId,
      mode: input.mode ?? existing?.mode ?? "test_prepare",
      status: input.status ?? existing?.status ?? "queued",
      requestedByTelegramUserId:
        normalizeNonNegativeInt(input.requestedByTelegramUserId) || existing?.requestedByTelegramUserId,
      storagePointer: normalizeOptionalText(input.storagePointer, 500) ?? existing?.storagePointer,
      message: normalizeOptionalText(input.message, 500) ?? existing?.message,
      attemptCount: normalizeNonNegativeInt(input.attemptCount ?? existing?.attemptCount ?? 0),
      workerLockId: normalizeOptionalText(input.workerLockId, 160) ?? existing?.workerLockId,
      workerLockedAt:
        input.workerLockedAt === null
          ? undefined
          : normalizeOptionalText(input.workerLockedAt, 120) ?? existing?.workerLockedAt,
      failureCode: normalizeOptionalText(input.failureCode, 120) ?? existing?.failureCode,
      failureMessage: normalizeOptionalText(input.failureMessage, 500) ?? existing?.failureMessage,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      startedAt:
        input.startedAt === null
          ? undefined
          : normalizeOptionalText(input.startedAt, 120) ?? existing?.startedAt,
      completedAt:
        input.completedAt === null
          ? undefined
          : normalizeOptionalText(input.completedAt, 120) ?? existing?.completedAt,
    };

    return {
      ...current,
      jobs: {
        ...current.jobs,
        [id]: job,
      },
    };
  });

  return next?.jobs[id] ?? null;
};

export const updateStorageIngestJob = async (
  id: string,
  patch: {
    bagId?: string | null;
    status?: StorageIngestJobStatus;
    storagePointer?: string | null;
    message?: string | null;
    attemptCount?: number;
    workerLockId?: string | null;
    workerLockedAt?: string | null;
    failureCode?: string | null;
    failureMessage?: string | null;
    startedAt?: string | null;
    completedAt?: string | null;
  },
): Promise<StorageIngestJob | null> => {
  const normalizedId = normalizeSafeId(id, 120);

  if (!normalizedId) {
    return null;
  }

  const next = await mutateState((current) => {
    const existing = current.jobs[normalizedId];

    if (!existing) {
      throw new Error("job_not_found");
    }

    const now = new Date().toISOString();
    const job: StorageIngestJob = {
      ...existing,
      bagId:
        patch.bagId === null
          ? undefined
          : normalizeOptionalText(patch.bagId, 120) ?? existing.bagId,
      status: patch.status ?? existing.status,
      storagePointer:
        patch.storagePointer === null
          ? undefined
          : normalizeOptionalText(patch.storagePointer, 500) ?? existing.storagePointer,
      message:
        patch.message === null
          ? undefined
          : normalizeOptionalText(patch.message, 500) ?? existing.message,
      attemptCount: normalizeNonNegativeInt(patch.attemptCount ?? existing.attemptCount),
      workerLockId:
        patch.workerLockId === null
          ? undefined
          : normalizeOptionalText(patch.workerLockId, 160) ?? existing.workerLockId,
      workerLockedAt:
        patch.workerLockedAt === null
          ? undefined
          : normalizeOptionalText(patch.workerLockedAt, 120) ?? existing.workerLockedAt,
      failureCode:
        patch.failureCode === null
          ? undefined
          : normalizeOptionalText(patch.failureCode, 120) ?? existing.failureCode,
      failureMessage:
        patch.failureMessage === null
          ? undefined
          : normalizeOptionalText(patch.failureMessage, 500) ?? existing.failureMessage,
      startedAt:
        patch.startedAt === null
          ? undefined
          : normalizeOptionalText(patch.startedAt, 120) ?? existing.startedAt,
      completedAt:
        patch.completedAt === null
          ? undefined
          : normalizeOptionalText(patch.completedAt, 120) ?? existing.completedAt,
      updatedAt: now,
    };

    return {
      ...current,
      jobs: {
        ...current.jobs,
        [normalizedId]: job,
      },
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "job_not_found") {
      return message;
    }

    throw error;
  });

  if (typeof next === "string") {
    return null;
  }

  return next?.jobs[normalizedId] ?? null;
};

export const claimStorageIngestJob = async (input: {
  mode: StorageIngestMode;
  staleAfterMs?: number;
  lockId?: string;
}): Promise<StorageIngestJob | null> => {
  const staleAfterMs = Math.max(60_000, normalizeNonNegativeInt(input.staleAfterMs ?? 15 * 60 * 1000));
  const lockId = normalizeOptionalText(input.lockId, 160) || `ingest-lock-${Date.now()}`;
  const next = await mutateState((current) => {
    const now = new Date();
    const nowIso = now.toISOString();
    const staleThreshold = now.getTime() - staleAfterMs;
    const jobs = Object.values(current.jobs)
      .filter((job) => job.mode === input.mode)
      .filter((job) => {
        if (job.status === "prepared") {
          return true;
        }

        if (job.status !== "processing") {
          return false;
        }

        const lockedAt = Date.parse(job.workerLockedAt ?? job.updatedAt);
        return Number.isFinite(lockedAt) && lockedAt <= staleThreshold;
      })
      .sort((left, right) => {
        const leftTime = Date.parse(left.updatedAt || left.createdAt);
        const rightTime = Date.parse(right.updatedAt || right.createdAt);
        return leftTime - rightTime;
      });

    const candidate = jobs[0];

    if (!candidate) {
      return current;
    }

    const updated: StorageIngestJob = {
      ...candidate,
      status: "processing",
      workerLockId: lockId,
      workerLockedAt: nowIso,
      startedAt: nowIso,
      completedAt: undefined,
      attemptCount: candidate.attemptCount + 1,
      failureCode: undefined,
      failureMessage: undefined,
      message: "Claimed by external storage upload worker.",
      updatedAt: nowIso,
    };

    return {
      ...current,
      jobs: {
        ...current.jobs,
        [candidate.id]: updated,
      },
    };
  });

  if (!next) {
    return null;
  }

  return (
    Object.values(next.jobs).find((job) => job.workerLockId === lockId && job.mode === input.mode) ?? null
  );
};
