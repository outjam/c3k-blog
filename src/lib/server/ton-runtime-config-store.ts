import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const TON_RUNTIME_CONFIG_KEY = "ton_runtime_config_v1";
export type TonRuntimeNetwork = "mainnet" | "testnet";

interface PostgresAppStateRow {
  payload?: unknown;
  row_version?: number;
}

interface PostgresPutStateResult {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

export interface TonRuntimeConfig {
  network?: TonRuntimeNetwork;
  collectionAddress?: string;
  deployedAt?: string;
  updatedAt: string;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const normalizeTonNetwork = (value: unknown): TonRuntimeNetwork => {
  return String(value ?? "").trim().toLowerCase() === "mainnet" ? "mainnet" : "testnet";
};

const normalizeIsoDateTime = (value: unknown, fallbackIso: string): string => {
  const normalized = normalizeText(value, 120);
  const timestamp = Date.parse(normalized);

  if (normalized && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return fallbackIso;
};

const sanitizeState = (value: unknown): TonRuntimeConfig => {
  const now = new Date().toISOString();

  if (!value || typeof value !== "object") {
    return {
      collectionAddress: undefined,
      deployedAt: undefined,
      updatedAt: now,
    };
  }

  const source = value as Record<string, unknown>;

  return {
    network: source.network ? normalizeTonNetwork(source.network) : undefined,
    collectionAddress: normalizeTonAddress(source.collectionAddress) || undefined,
    deployedAt: source.deployedAt ? normalizeIsoDateTime(source.deployedAt, now) : undefined,
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

export const getCurrentTonRuntimeNetwork = (
  env: NodeJS.ProcessEnv = process.env,
): TonRuntimeNetwork => {
  return normalizeTonNetwork(env.NEXT_PUBLIC_TON_NETWORK);
};

export const isTonRuntimeConfigForActiveNetwork = (
  config: TonRuntimeConfig | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean => {
  if (!config?.collectionAddress) {
    return false;
  }

  if (!config.network) {
    return true;
  }

  return config.network === getCurrentTonRuntimeNetwork(env);
};

export const getActiveTonRuntimeCollectionAddress = (
  config: TonRuntimeConfig | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined => {
  if (!config?.collectionAddress) {
    return undefined;
  }

  return isTonRuntimeConfigForActiveNetwork(config, env) ? config.collectionAddress : undefined;
};

const ensureDbEnabled = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const throwStrictError = (message: string): never => {
  throw new Error(message);
};

const readStateWithVersion = async (): Promise<{ state: TonRuntimeConfig; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: TON_RUNTIME_CONFIG_KEY,
  });

  if (!rows) {
    return null;
  }

  const first = rows[0];

  if (!first) {
    return {
      state: sanitizeState({}),
      rowVersion: 0,
    };
  }

  return {
    state: sanitizeState(first.payload),
    rowVersion: typeof first.row_version === "number" ? first.row_version : 1,
  };
};

const writeState = async (
  state: TonRuntimeConfig,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: TON_RUNTIME_CONFIG_KEY,
    p_payload: state,
    p_expected_row_version: expectedRowVersion,
  });

  if (!rows || !rows[0]) {
    return { ok: false, conflict: false };
  }

  const first = rows[0];
  const ok = Boolean(first.ok);
  const conflict = String(first.error ?? "") === "version_conflict";

  if (ok) {
    return { ok: true };
  }

  return { ok: false, conflict };
};

const mutateState = async (mutate: (state: TonRuntimeConfig) => TonRuntimeConfig): Promise<TonRuntimeConfig | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for TON runtime config");
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
    throwStrictError("Failed to mutate TON runtime config in Postgres");
  }

  return null;
};

export const getTonRuntimeConfig = async (): Promise<TonRuntimeConfig | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for TON runtime config");
    }

    return null;
  }

  const current = await readStateWithVersion();

  if (!current) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read TON runtime config from Postgres");
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
      throwStrictError("Failed to bootstrap TON runtime config in Postgres");
    }

    return null;
  }

  const replay = await readStateWithVersion();

  if (!replay) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read bootstrapped TON runtime config from Postgres");
    }

    return null;
  }

  return replay.state;
};

export const setTonRuntimeCollectionAddress = async (
  collectionAddress: string,
  deployedAt?: string,
  network?: TonRuntimeNetwork,
): Promise<TonRuntimeConfig | null> => {
  const normalizedAddress = normalizeTonAddress(collectionAddress);

  if (!normalizedAddress) {
    return null;
  }

  return mutateState((current) => ({
    ...current,
    network: network ?? getCurrentTonRuntimeNetwork(),
    collectionAddress: normalizedAddress,
    deployedAt: normalizeIsoDateTime(deployedAt, new Date().toISOString()),
  }));
};
