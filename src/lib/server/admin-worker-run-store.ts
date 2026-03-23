import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import type {
  AdminWorkerRunRecord,
  AdminWorkerRunSnapshot,
  AdminWorkerRunStatus,
  AdminWorkerRunTrigger,
  AdminWorkerRunWorkerId,
} from "@/types/admin";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const WORKER_RUNS_KEY = "admin_worker_runs_v1";
const MAX_RUNS = 200;

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

const normalizeWorkerId = (value: unknown): AdminWorkerRunWorkerId => {
  return value === "telegram_notifications" ? "telegram_notifications" : "storage_delivery_telegram";
};

const normalizeStatus = (value: unknown): AdminWorkerRunStatus => {
  return value === "failed" || value === "partial" ? value : "completed";
};

const normalizeTrigger = (value: unknown): AdminWorkerRunTrigger => {
  return value === "admin_manual" ? "admin_manual" : "worker_route";
};

const emptyState = (now = new Date().toISOString()): AdminWorkerRunSnapshot => ({
  runs: [],
  updatedAt: now,
});

const normalizeRun = (value: unknown, fallbackId: string, now: string): AdminWorkerRunRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = normalizeSafeId(source.id ?? fallbackId, 120);

  if (!id) {
    return null;
  }

  return {
    id,
    workerId: normalizeWorkerId(source.workerId),
    status: normalizeStatus(source.status),
    trigger: normalizeTrigger(source.trigger),
    triggeredByTelegramUserId: normalizeNonNegativeInt(source.triggeredByTelegramUserId) || undefined,
    startedAt: normalizeIsoDateTime(source.startedAt, now),
    completedAt: normalizeIsoDateTime(source.completedAt, now),
    limit: normalizeNonNegativeInt(source.limit),
    queueSizeBefore: normalizeNonNegativeInt(source.queueSizeBefore) || undefined,
    queueSizeAfter: normalizeNonNegativeInt(source.queueSizeAfter) || undefined,
    processed: normalizeNonNegativeInt(source.processed),
    delivered: normalizeNonNegativeInt(source.delivered),
    failed: normalizeNonNegativeInt(source.failed),
    retried: normalizeNonNegativeInt(source.retried) || undefined,
    skipped: normalizeNonNegativeInt(source.skipped) || undefined,
    claimed: normalizeNonNegativeInt(source.claimed) || undefined,
    remaining: normalizeNonNegativeInt(source.remaining) || undefined,
    errorMessage: normalizeOptionalText(source.errorMessage, 500),
  };
};

const sanitizeState = (payload: unknown): AdminWorkerRunSnapshot => {
  const now = new Date().toISOString();

  if (!payload || typeof payload !== "object") {
    return emptyState(now);
  }

  const source = payload as Record<string, unknown>;
  const runsSource = Array.isArray(source.runs) ? source.runs : [];

  return {
    runs: runsSource
      .map((entry, index) => normalizeRun(entry, `worker-run-${index + 1}`, now))
      .filter((entry): entry is AdminWorkerRunRecord => Boolean(entry))
      .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
      .slice(0, MAX_RUNS),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const ensureDbEnabled = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const throwStrictError = (message: string): never => {
  throw new Error(message);
};

const readStateWithVersion = async (): Promise<{ state: AdminWorkerRunSnapshot; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: WORKER_RUNS_KEY,
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
  state: AdminWorkerRunSnapshot,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: WORKER_RUNS_KEY,
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
  mutate: (state: AdminWorkerRunSnapshot) => AdminWorkerRunSnapshot,
): Promise<AdminWorkerRunSnapshot | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for admin worker runs");
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
    throwStrictError("Failed to mutate admin worker runs state in Postgres");
  }

  return null;
};

export const getAdminWorkerRunSnapshot = async (): Promise<AdminWorkerRunSnapshot | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for admin worker runs");
    }

    return null;
  }

  const current = await readStateWithVersion();

  if (!current) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read admin worker runs state from Postgres");
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
      throwStrictError("Failed to bootstrap admin worker runs state in Postgres");
    }

    return null;
  }

  const replay = await readStateWithVersion();
  return replay?.state ?? emptyState();
};

export const listAdminWorkerRuns = async (options?: {
  limit?: number;
  workerId?: AdminWorkerRunWorkerId;
}): Promise<AdminWorkerRunRecord[]> => {
  const snapshot = await getAdminWorkerRunSnapshot();

  if (!snapshot) {
    return [];
  }

  const limit = Math.max(1, Math.min(100, normalizeNonNegativeInt(options?.limit ?? 20) || 20));
  const workerId = options?.workerId ? normalizeWorkerId(options.workerId) : undefined;

  return snapshot.runs
    .filter((run) => (workerId ? run.workerId === workerId : true))
    .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
    .slice(0, limit);
};

export const recordAdminWorkerRun = async (
  input: Omit<AdminWorkerRunRecord, "id"> & { id?: string },
): Promise<AdminWorkerRunRecord | null> => {
  const now = new Date().toISOString();
  const run: AdminWorkerRunRecord = {
    id: normalizeSafeId(input.id ?? `worker-run-${Date.now()}`, 120) || `worker-run-${Date.now()}`,
    workerId: normalizeWorkerId(input.workerId),
    status: normalizeStatus(input.status),
    trigger: normalizeTrigger(input.trigger),
    triggeredByTelegramUserId: normalizeNonNegativeInt(input.triggeredByTelegramUserId) || undefined,
    startedAt: normalizeIsoDateTime(input.startedAt, now),
    completedAt: normalizeIsoDateTime(input.completedAt, now),
    limit: normalizeNonNegativeInt(input.limit),
    queueSizeBefore: normalizeNonNegativeInt(input.queueSizeBefore) || undefined,
    queueSizeAfter: normalizeNonNegativeInt(input.queueSizeAfter) || undefined,
    processed: normalizeNonNegativeInt(input.processed),
    delivered: normalizeNonNegativeInt(input.delivered),
    failed: normalizeNonNegativeInt(input.failed),
    retried: normalizeNonNegativeInt(input.retried) || undefined,
    skipped: normalizeNonNegativeInt(input.skipped) || undefined,
    claimed: normalizeNonNegativeInt(input.claimed) || undefined,
    remaining: normalizeNonNegativeInt(input.remaining) || undefined,
    errorMessage: normalizeOptionalText(input.errorMessage, 500),
  };

  const next = await mutateState((current) => ({
    ...current,
    runs: [run, ...current.runs]
      .sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt))
      .slice(0, MAX_RUNS),
  }));

  return next?.runs.find((entry) => entry.id === run.id) ?? null;
};
