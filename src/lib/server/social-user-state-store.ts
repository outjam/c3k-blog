import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const SOCIAL_USER_STATE_KEY = "social_user_state_v1";

interface PostgresAppStateRow {
  payload?: unknown;
  row_version?: number;
}

interface PostgresPutStateResult {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

interface SocialUserState {
  walletCentsByUserId: Record<string, number>;
  purchasesVisibleByUserId: Record<string, boolean>;
  purchasedReleaseSlugsByUserId: Record<string, string[]>;
  purchasedTrackKeysByUserId: Record<string, string[]>;
  redeemedTopupPromoCodesByUserId: Record<string, string[]>;
  updatedAt: string;
}

export interface SocialUserSnapshot {
  walletCents: number;
  purchasesVisible: boolean;
  purchasedReleaseSlugs: string[];
  purchasedTrackKeys: string[];
  redeemedTopupPromoCodes: string[];
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeUserId = (value: unknown): string => {
  const rounded = Math.round(Number(value ?? 0));
  return Number.isFinite(rounded) && rounded > 0 ? String(rounded) : "";
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

const normalizeTrackId = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const normalizePromoCode = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
};

const toTrackPurchaseKey = (releaseSlug: unknown, trackId: unknown): string => {
  const release = normalizeSlug(releaseSlug);
  const track = normalizeTrackId(trackId);

  if (!release || !track) {
    return "";
  }

  return `${release}::${track}`;
};

const normalizeTrackPurchaseKey = (value: unknown): string => {
  const [releaseSlug = "", trackId = ""] = String(value ?? "").split("::", 2);
  return toTrackPurchaseKey(releaseSlug, trackId);
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeSlug(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const normalizeTrackPurchaseKeyList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeTrackPurchaseKey(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const normalizePromoCodeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizePromoCode(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const sanitizeState = (value: unknown): SocialUserState => {
  const now = new Date().toISOString();

  if (!value || typeof value !== "object") {
    return {
      walletCentsByUserId: {},
      purchasesVisibleByUserId: {},
      purchasedReleaseSlugsByUserId: {},
      purchasedTrackKeysByUserId: {},
      redeemedTopupPromoCodesByUserId: {},
      updatedAt: now,
    };
  }

  const source = value as Record<string, unknown>;

  const walletCentsByUserId =
    source.walletCentsByUserId && typeof source.walletCentsByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.walletCentsByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, normalizeNonNegativeInt(rawValue)]] : [];
          }),
        )
      : {};

  const purchasesVisibleByUserId =
    source.purchasesVisibleByUserId && typeof source.purchasesVisibleByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasesVisibleByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, Boolean(rawValue)]] : [];
          }),
        )
      : {};

  const purchasedReleaseSlugsByUserId =
    source.purchasedReleaseSlugsByUserId && typeof source.purchasedReleaseSlugsByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasedReleaseSlugsByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, normalizeStringList(rawValue)]] : [];
          }),
        )
      : {};

  const purchasedTrackKeysByUserId =
    source.purchasedTrackKeysByUserId && typeof source.purchasedTrackKeysByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasedTrackKeysByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, normalizeTrackPurchaseKeyList(rawValue)]] : [];
          }),
        )
      : {};

  const redeemedTopupPromoCodesByUserId =
    source.redeemedTopupPromoCodesByUserId && typeof source.redeemedTopupPromoCodesByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.redeemedTopupPromoCodesByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, normalizePromoCodeList(rawValue)]] : [];
          }),
        )
      : {};

  return {
    walletCentsByUserId,
    purchasesVisibleByUserId,
    purchasedReleaseSlugsByUserId,
    purchasedTrackKeysByUserId,
    redeemedTopupPromoCodesByUserId,
    updatedAt: normalizeText(source.updatedAt, 120) || now,
  };
};

const ensureDbEnabled = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const throwStrictError = (message: string): never => {
  throw new Error(message);
};

const readStateWithVersion = async (): Promise<{ state: SocialUserState; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: SOCIAL_USER_STATE_KEY,
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
  state: SocialUserState,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: SOCIAL_USER_STATE_KEY,
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

const readCurrentState = async (): Promise<SocialUserState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for social user state");
    }

    return null;
  }

  const current = await readStateWithVersion();

  if (!current) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read social user state from Postgres");
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
      throwStrictError("Failed to bootstrap social user state in Postgres");
    }

    return null;
  }

  const replay = await readStateWithVersion();

  if (!replay) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read bootstrapped social user state from Postgres");
    }

    return null;
  }

  return replay.state;
};

const mutateState = async (mutate: (state: SocialUserState) => SocialUserState): Promise<SocialUserState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for social user state");
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
    throwStrictError("Failed to mutate social user state in Postgres");
  }

  return null;
};

const resolveUserKey = (telegramUserId: number): string => {
  return normalizeUserId(telegramUserId);
};

const buildSnapshot = (state: SocialUserState, userKey: string): SocialUserSnapshot => {
  return {
    walletCents: normalizeNonNegativeInt(state.walletCentsByUserId[userKey]),
    purchasesVisible:
      typeof state.purchasesVisibleByUserId[userKey] === "boolean" ? state.purchasesVisibleByUserId[userKey] : true,
    purchasedReleaseSlugs: normalizeStringList(state.purchasedReleaseSlugsByUserId[userKey]),
    purchasedTrackKeys: normalizeTrackPurchaseKeyList(state.purchasedTrackKeysByUserId[userKey]),
    redeemedTopupPromoCodes: normalizePromoCodeList(state.redeemedTopupPromoCodesByUserId[userKey]),
  };
};

const prependUniqueValues = (current: string[], values: string[]): string[] => {
  const next = [...current];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (!value || next.includes(value)) {
      continue;
    }

    next.unshift(value);
  }

  return next;
};

export const getSocialUserSnapshot = async (telegramUserId: number): Promise<SocialUserSnapshot | null> => {
  const userKey = resolveUserKey(telegramUserId);

  if (!userKey) {
    return null;
  }

  const state = await readCurrentState();

  if (!state) {
    return null;
  }

  return buildSnapshot(state, userKey);
};

export const topUpSocialWalletBalanceCents = async (telegramUserId: number, amountCents: number): Promise<number | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const amount = Math.max(1, normalizeNonNegativeInt(amountCents));

  if (!userKey) {
    return null;
  }

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);

    return {
      ...current,
      walletCentsByUserId: {
        ...current.walletCentsByUserId,
        [userKey]: snapshot.walletCents + amount,
      },
    };
  });

  if (!next) {
    return null;
  }

  return buildSnapshot(next, userKey).walletCents;
};

export const spendSocialWalletBalanceCents = async (
  telegramUserId: number,
  amountCents: number,
): Promise<{ ok: boolean; balanceCents: number } | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const amount = Math.max(1, normalizeNonNegativeInt(amountCents));

  if (!userKey) {
    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStateWithVersion();

    if (!current) {
      break;
    }

    const snapshot = buildSnapshot(current.state, userKey);

    if (snapshot.walletCents < amount) {
      return {
        ok: false,
        balanceCents: snapshot.walletCents,
      };
    }

    const nextBalance = snapshot.walletCents - amount;
    const next = sanitizeState({
      ...current.state,
      walletCentsByUserId: {
        ...current.state.walletCentsByUserId,
        [userKey]: nextBalance,
      },
      updatedAt: new Date().toISOString(),
    });
    const saved = await writeState(next, current.rowVersion);

    if (saved.ok) {
      return {
        ok: true,
        balanceCents: nextBalance,
      };
    }

    if (!saved.conflict) {
      break;
    }
  }

  if (POSTGRES_STRICT) {
    throwStrictError("Failed to spend social wallet balance in Postgres");
  }

  return null;
};

export const setSocialPurchasesVisibility = async (telegramUserId: number, isVisible: boolean): Promise<boolean | null> => {
  const userKey = resolveUserKey(telegramUserId);

  if (!userKey) {
    return null;
  }

  const next = await mutateState((current) => ({
    ...current,
    purchasesVisibleByUserId: {
      ...current.purchasesVisibleByUserId,
      [userKey]: Boolean(isVisible),
    },
  }));

  if (!next) {
    return null;
  }

  return buildSnapshot(next, userKey).purchasesVisible;
};

export const appendSocialPurchasedReleaseSlug = async (
  telegramUserId: number,
  releaseSlug: string,
): Promise<string[] | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedSlug = normalizeSlug(releaseSlug);

  if (!userKey || !normalizedSlug) {
    return null;
  }

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);
    const nextReleaseSlugs = snapshot.purchasedReleaseSlugs.includes(normalizedSlug)
      ? snapshot.purchasedReleaseSlugs
      : [normalizedSlug, ...snapshot.purchasedReleaseSlugs];

    return {
      ...current,
      purchasedReleaseSlugsByUserId: {
        ...current.purchasedReleaseSlugsByUserId,
        [userKey]: nextReleaseSlugs,
      },
    };
  });

  if (!next) {
    return null;
  }

  return buildSnapshot(next, userKey).purchasedReleaseSlugs;
};

export const appendSocialPurchasedTrackKey = async (
  telegramUserId: number,
  releaseSlug: string,
  trackId: string,
): Promise<string[] | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const key = toTrackPurchaseKey(releaseSlug, trackId);

  if (!userKey || !key) {
    return null;
  }

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);
    const nextTrackKeys = snapshot.purchasedTrackKeys.includes(key) ? snapshot.purchasedTrackKeys : [key, ...snapshot.purchasedTrackKeys];

    return {
      ...current,
      purchasedTrackKeysByUserId: {
        ...current.purchasedTrackKeysByUserId,
        [userKey]: nextTrackKeys,
      },
    };
  });

  if (!next) {
    return null;
  }

  return buildSnapshot(next, userKey).purchasedTrackKeys;
};

export const appendSocialPurchasedTrackKeys = async (
  telegramUserId: number,
  releaseSlug: string,
  trackIds: string[],
): Promise<string[] | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedKeys = trackIds
    .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
    .filter(Boolean);

  if (!userKey || normalizedKeys.length === 0) {
    return null;
  }

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);
    const nextTrackKeys = prependUniqueValues(snapshot.purchasedTrackKeys, normalizedKeys);

    return {
      ...current,
      purchasedTrackKeysByUserId: {
        ...current.purchasedTrackKeysByUserId,
        [userKey]: nextTrackKeys,
      },
    };
  });

  if (!next) {
    return null;
  }

  return buildSnapshot(next, userKey).purchasedTrackKeys;
};

export const appendSocialPurchasedReleaseWithTracks = async (
  telegramUserId: number,
  releaseSlug: string,
  trackIds: string[],
): Promise<{ releaseSlugs: string[]; trackKeys: string[] } | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedReleaseSlug = normalizeSlug(releaseSlug);
  const normalizedTrackKeys = trackIds
    .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
    .filter(Boolean);

  if (!userKey || (!normalizedReleaseSlug && normalizedTrackKeys.length === 0)) {
    return null;
  }

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);
    const nextReleaseSlugs =
      normalizedReleaseSlug && !snapshot.purchasedReleaseSlugs.includes(normalizedReleaseSlug)
        ? [normalizedReleaseSlug, ...snapshot.purchasedReleaseSlugs]
        : snapshot.purchasedReleaseSlugs;
    const nextTrackKeys = prependUniqueValues(snapshot.purchasedTrackKeys, normalizedTrackKeys);

    return {
      ...current,
      purchasedReleaseSlugsByUserId: {
        ...current.purchasedReleaseSlugsByUserId,
        [userKey]: nextReleaseSlugs,
      },
      purchasedTrackKeysByUserId: {
        ...current.purchasedTrackKeysByUserId,
        [userKey]: nextTrackKeys,
      },
    };
  });

  if (!next) {
    return null;
  }

  const snapshot = buildSnapshot(next, userKey);
  return {
    releaseSlugs: snapshot.purchasedReleaseSlugs,
    trackKeys: snapshot.purchasedTrackKeys,
  };
};

export const redeemSocialTopupPromoCode = async (
  telegramUserId: number,
  code: string,
): Promise<{ ok: boolean; normalizedCode: string; alreadyRedeemed: boolean; redeemedCodes: string[] } | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedCode = normalizePromoCode(code);

  if (!userKey || !normalizedCode) {
    return null;
  }

  const existing = await getSocialUserSnapshot(telegramUserId);

  if (existing?.redeemedTopupPromoCodes.includes(normalizedCode)) {
    return {
      ok: true,
      normalizedCode,
      alreadyRedeemed: true,
      redeemedCodes: existing.redeemedTopupPromoCodes,
    };
  }

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);

    return {
      ...current,
      redeemedTopupPromoCodesByUserId: {
        ...current.redeemedTopupPromoCodesByUserId,
        [userKey]: [normalizedCode, ...snapshot.redeemedTopupPromoCodes],
      },
    };
  });

  if (!next) {
    return null;
  }

  const redeemedCodes = buildSnapshot(next, userKey).redeemedTopupPromoCodes;

  return {
    ok: true,
    normalizedCode,
    alreadyRedeemed: false,
    redeemedCodes,
  };
};
