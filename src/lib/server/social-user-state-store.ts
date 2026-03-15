import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const SOCIAL_USER_STATE_KEY = "social_user_state_v1";
const SOCIAL_FOLLOW_STATE_KEY = "social_follow_graph_v1";

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
  purchasedReleaseFormatKeysByUserId: Record<string, string[]>;
  purchasedTrackKeysByUserId: Record<string, string[]>;
  redeemedTopupPromoCodesByUserId: Record<string, string[]>;
  tonWalletAddressByUserId: Record<string, string>;
  mintedReleaseNftsByUserId: Record<string, SocialMintedReleaseNft[]>;
  updatedAt: string;
}

export interface SocialMintedReleaseNft {
  id: string;
  releaseSlug: string;
  ownerAddress: string;
  collectionAddress?: string;
  itemAddress?: string;
  itemIndex?: string;
  txHash?: string;
  mintedAt: string;
  status: "minted";
}

export interface SocialUserSnapshot {
  walletCents: number;
  purchasesVisible: boolean;
  purchasedReleaseSlugs: string[];
  purchasedReleaseFormatKeys: string[];
  purchasedTrackKeys: string[];
  redeemedTopupPromoCodes: string[];
  tonWalletAddress?: string;
  mintedReleaseNfts: SocialMintedReleaseNft[];
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeUserId = (value: unknown): string => {
  const rounded = Math.round(Number(value ?? 0));
  return Number.isFinite(rounded) && rounded > 0 ? String(rounded) : "";
};

const userIdFromSlug = (slug: string): string => {
  const match = /^user-(\d+)$/.exec(normalizeSlug(slug));
  return match ? normalizeUserId(match[1]) : "";
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

const normalizeReleaseFormat = (value: unknown): string => {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "aac":
    case "alac":
    case "flac":
    case "mp3":
    case "ogg":
    case "wav":
      return String(value).trim().toLowerCase();
    default:
      return "";
  }
};

const normalizePromoCode = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const toTrackPurchaseKey = (releaseSlug: unknown, trackId: unknown): string => {
  const release = normalizeSlug(releaseSlug);
  const track = normalizeTrackId(trackId);

  if (!release || !track) {
    return "";
  }

  return `${release}::${track}`;
};

const toReleaseFormatPurchaseKey = (releaseSlug: unknown, format: unknown): string => {
  const release = normalizeSlug(releaseSlug);
  const normalizedFormat = normalizeReleaseFormat(format);

  if (!release || !normalizedFormat) {
    return "";
  }

  return `${release}::${normalizedFormat}`;
};

const normalizeTrackPurchaseKey = (value: unknown): string => {
  const [releaseSlug = "", trackId = ""] = String(value ?? "").split("::", 2);
  return toTrackPurchaseKey(releaseSlug, trackId);
};

const normalizeReleaseFormatPurchaseKey = (value: unknown): string => {
  const [releaseSlug = "", format = ""] = String(value ?? "").split("::", 2);
  return toReleaseFormatPurchaseKey(releaseSlug, format);
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

const normalizeReleaseFormatPurchaseKeyList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeReleaseFormatPurchaseKey(entry))
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

const normalizeMintedNftId = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || fallback;
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeOptionalBigIntString = (value: unknown): string | undefined => {
  const normalized = normalizeText(value, 40);

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = BigInt(normalized);
    return parsed >= BigInt(0) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

const normalizeIsoDateTime = (value: unknown, fallbackIso: string): string => {
  const normalized = normalizeText(value, 120);
  const timestamp = Date.parse(normalized);

  if (normalized && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return fallbackIso;
};

const normalizeMintedReleaseNft = (value: unknown): SocialMintedReleaseNft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const releaseSlug = normalizeSlug(source.releaseSlug);
  const ownerAddress = normalizeTonAddress(source.ownerAddress);

  if (!releaseSlug || !ownerAddress) {
    return null;
  }

  const mintedAt = normalizeIsoDateTime(source.mintedAt, new Date().toISOString());
  const fallbackId = `nft:${releaseSlug}:${mintedAt}`;
  const id = normalizeMintedNftId(source.id, fallbackId);

  return {
    id,
    releaseSlug,
    ownerAddress,
    collectionAddress: normalizeOptionalText(normalizeTonAddress(source.collectionAddress), 160),
    itemAddress: normalizeOptionalText(normalizeTonAddress(source.itemAddress), 160),
    itemIndex: normalizeOptionalBigIntString(source.itemIndex),
    txHash: normalizeOptionalText(source.txHash, 256),
    mintedAt,
    status: "minted",
  };
};

const normalizeMintedReleaseNftList = (value: unknown): SocialMintedReleaseNft[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seenByRelease = new Set<string>();
  const normalized = value
    .map((entry) => normalizeMintedReleaseNft(entry))
    .filter((entry): entry is SocialMintedReleaseNft => Boolean(entry))
    .filter((entry) => {
      if (seenByRelease.has(entry.releaseSlug)) {
        return false;
      }

      seenByRelease.add(entry.releaseSlug);
      return true;
    });

  return normalized.sort((a, b) => Date.parse(b.mintedAt) - Date.parse(a.mintedAt));
};

const sanitizeState = (value: unknown): SocialUserState => {
  const now = new Date().toISOString();

  if (!value || typeof value !== "object") {
    return {
      walletCentsByUserId: {},
      purchasesVisibleByUserId: {},
      purchasedReleaseSlugsByUserId: {},
      purchasedReleaseFormatKeysByUserId: {},
      purchasedTrackKeysByUserId: {},
      redeemedTopupPromoCodesByUserId: {},
      tonWalletAddressByUserId: {},
      mintedReleaseNftsByUserId: {},
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

  const purchasedReleaseFormatKeysByUserId =
    source.purchasedReleaseFormatKeysByUserId && typeof source.purchasedReleaseFormatKeysByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasedReleaseFormatKeysByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, normalizeReleaseFormatPurchaseKeyList(rawValue)]] : [];
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

  const tonWalletAddressByUserId =
    source.tonWalletAddressByUserId && typeof source.tonWalletAddressByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.tonWalletAddressByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            const address = normalizeTonAddress(rawValue);
            return userId && address ? [[userId, address]] : [];
          }),
        )
      : {};

  const mintedReleaseNftsByUserId =
    source.mintedReleaseNftsByUserId && typeof source.mintedReleaseNftsByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.mintedReleaseNftsByUserId as Record<string, unknown>).flatMap(([rawUserId, rawValue]) => {
            const userId = normalizeUserId(rawUserId);
            return userId ? [[userId, normalizeMintedReleaseNftList(rawValue)]] : [];
          }),
        )
      : {};

  return {
    walletCentsByUserId,
    purchasesVisibleByUserId,
    purchasedReleaseSlugsByUserId,
    purchasedReleaseFormatKeysByUserId,
    purchasedTrackKeysByUserId,
    redeemedTopupPromoCodesByUserId,
    tonWalletAddressByUserId,
    mintedReleaseNftsByUserId,
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

const resolveUserKeyByProfileSlug = async (slug: string): Promise<string> => {
  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    return "";
  }

  const directUserId = userIdFromSlug(normalizedSlug);
  if (directUserId) {
    return directUserId;
  }

  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: SOCIAL_FOLLOW_STATE_KEY,
  });

  const payload = rows?.[0]?.payload;
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const slugByUserId = (payload as Record<string, unknown>).slugByUserId;
  if (!slugByUserId || typeof slugByUserId !== "object") {
    return "";
  }

  for (const [rawUserId, rawSlug] of Object.entries(slugByUserId as Record<string, unknown>)) {
    const userId = normalizeUserId(rawUserId);
    if (!userId) {
      continue;
    }

    if (normalizeSlug(rawSlug) === normalizedSlug) {
      return userId;
    }
  }

  return "";
};

const buildSnapshot = (state: SocialUserState, userKey: string): SocialUserSnapshot => {
  const tonWalletAddress = normalizeTonAddress(state.tonWalletAddressByUserId[userKey]);
  const purchasedReleaseFormatKeys = normalizeReleaseFormatPurchaseKeyList(
    state.purchasedReleaseFormatKeysByUserId[userKey],
  );
  const purchasedReleaseSlugs = Array.from(
    new Set([
      ...normalizeStringList(state.purchasedReleaseSlugsByUserId[userKey]),
      ...purchasedReleaseFormatKeys
        .map((entry) => entry.split("::", 1)[0] ?? "")
        .filter(Boolean),
    ]),
  );

  return {
    walletCents: normalizeNonNegativeInt(state.walletCentsByUserId[userKey]),
    purchasesVisible:
      typeof state.purchasesVisibleByUserId[userKey] === "boolean" ? state.purchasesVisibleByUserId[userKey] : true,
    purchasedReleaseSlugs,
    purchasedReleaseFormatKeys,
    purchasedTrackKeys: normalizeTrackPurchaseKeyList(state.purchasedTrackKeysByUserId[userKey]),
    redeemedTopupPromoCodes: normalizePromoCodeList(state.redeemedTopupPromoCodesByUserId[userKey]),
    tonWalletAddress: tonWalletAddress || undefined,
    mintedReleaseNfts: normalizeMintedReleaseNftList(state.mintedReleaseNftsByUserId[userKey]),
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

export const getSocialUserPublicPurchasesBySlug = async (
  slug: string,
): Promise<{ slug: string; purchasesVisible: boolean; purchasedReleaseSlugs: string[] } | null> => {
  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  const state = await readCurrentState();
  if (!state) {
    return null;
  }

  const userKey = await resolveUserKeyByProfileSlug(normalizedSlug);
  if (!userKey) {
    return {
      slug: normalizedSlug,
      purchasesVisible: false,
      purchasedReleaseSlugs: [],
    };
  }

  const snapshot = buildSnapshot(state, userKey);

  return {
    slug: normalizedSlug,
    purchasesVisible: snapshot.purchasesVisible,
    purchasedReleaseSlugs: snapshot.purchasesVisible ? snapshot.purchasedReleaseSlugs : [],
  };
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

export const setSocialTonWalletAddress = async (telegramUserId: number, address: string): Promise<string | null> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedAddress = normalizeTonAddress(address);

  if (!userKey || !normalizedAddress) {
    return null;
  }

  const next = await mutateState((current) => ({
    ...current,
    tonWalletAddressByUserId: {
      ...current.tonWalletAddressByUserId,
      [userKey]: normalizedAddress,
    },
  }));

  if (!next) {
    return null;
  }

  return buildSnapshot(next, userKey).tonWalletAddress ?? null;
};

export const clearSocialTonWalletAddress = async (telegramUserId: number): Promise<boolean | null> => {
  const userKey = resolveUserKey(telegramUserId);

  if (!userKey) {
    return null;
  }

  const next = await mutateState((current) => {
    const cloned = { ...current.tonWalletAddressByUserId };
    delete cloned[userKey];

    return {
      ...current,
      tonWalletAddressByUserId: cloned,
    };
  });

  return Boolean(next);
};

export const topUpSocialWalletBalanceFromTonCents = async (
  telegramUserId: number,
  amountCents: number,
): Promise<{ walletCents: number; creditedCents: number } | null> => {
  const creditedCents = Math.max(1, normalizeNonNegativeInt(amountCents));
  const walletCents = await topUpSocialWalletBalanceCents(telegramUserId, creditedCents);

  if (walletCents === null) {
    return null;
  }

  return {
    walletCents,
    creditedCents,
  };
};

export const purchaseSocialReleaseWithWallet = async (
  telegramUserId: number,
  releaseSlug: string,
  trackIds: string[],
  amountCents: number,
  format: string,
): Promise<
  | {
      ok: true;
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
  | {
      ok: false;
      reason: "already_owned" | "insufficient_funds";
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
  | null
> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedReleaseSlug = normalizeSlug(releaseSlug);
  const normalizedFormat = normalizeReleaseFormat(format);
  const normalizedReleaseFormatKey = toReleaseFormatPurchaseKey(releaseSlug, format);
  const normalizedTrackKeys = trackIds
    .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
    .filter(Boolean);
  const amount = Math.max(1, normalizeNonNegativeInt(amountCents));

  if (!userKey || !normalizedReleaseSlug || !normalizedFormat || !normalizedReleaseFormatKey || amount < 1) {
    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStateWithVersion();

    if (!current) {
      break;
    }

    const snapshot = buildSnapshot(current.state, userKey);
    const alreadyOwned = snapshot.purchasedReleaseFormatKeys.includes(normalizedReleaseFormatKey);

    if (alreadyOwned) {
      return {
        ok: false,
        reason: "already_owned",
        balanceCents: snapshot.walletCents,
        releaseSlugs: snapshot.purchasedReleaseSlugs,
        releaseFormatKeys: snapshot.purchasedReleaseFormatKeys,
        trackKeys: snapshot.purchasedTrackKeys,
      };
    }

    if (snapshot.walletCents < amount) {
      return {
        ok: false,
        reason: "insufficient_funds",
        balanceCents: snapshot.walletCents,
        releaseSlugs: snapshot.purchasedReleaseSlugs,
        releaseFormatKeys: snapshot.purchasedReleaseFormatKeys,
        trackKeys: snapshot.purchasedTrackKeys,
      };
    }

    const nextReleaseSlugs = snapshot.purchasedReleaseSlugs.includes(normalizedReleaseSlug)
      ? snapshot.purchasedReleaseSlugs
      : [normalizedReleaseSlug, ...snapshot.purchasedReleaseSlugs];
    const nextReleaseFormatKeys = prependUniqueValues(snapshot.purchasedReleaseFormatKeys, [normalizedReleaseFormatKey]);
    const nextTrackKeys = prependUniqueValues(snapshot.purchasedTrackKeys, normalizedTrackKeys);
    const nextBalance = snapshot.walletCents - amount;

    const next = sanitizeState({
      ...current.state,
      walletCentsByUserId: {
        ...current.state.walletCentsByUserId,
        [userKey]: nextBalance,
      },
      purchasedReleaseSlugsByUserId: {
        ...current.state.purchasedReleaseSlugsByUserId,
        [userKey]: nextReleaseSlugs,
      },
      purchasedReleaseFormatKeysByUserId: {
        ...current.state.purchasedReleaseFormatKeysByUserId,
        [userKey]: nextReleaseFormatKeys,
      },
      purchasedTrackKeysByUserId: {
        ...current.state.purchasedTrackKeysByUserId,
        [userKey]: nextTrackKeys,
      },
      updatedAt: new Date().toISOString(),
    });

    const saved = await writeState(next, current.rowVersion);

    if (saved.ok) {
      return {
        ok: true,
        balanceCents: nextBalance,
        releaseSlugs: nextReleaseSlugs,
        releaseFormatKeys: nextReleaseFormatKeys,
        trackKeys: nextTrackKeys,
      };
    }

    if (!saved.conflict) {
      break;
    }
  }

  if (POSTGRES_STRICT) {
    throwStrictError("Failed to purchase release with wallet in Postgres");
  }

  return null;
};

export const purchaseSocialTrackWithWallet = async (
  telegramUserId: number,
  releaseSlug: string,
  trackId: string,
  amountCents: number,
): Promise<
  | {
      ok: true;
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
  | {
      ok: false;
      reason: "already_owned" | "insufficient_funds";
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
  | null
> => {
  const userKey = resolveUserKey(telegramUserId);
  const normalizedReleaseSlug = normalizeSlug(releaseSlug);
  const normalizedTrackKey = toTrackPurchaseKey(releaseSlug, trackId);
  const amount = Math.max(1, normalizeNonNegativeInt(amountCents));

  if (!userKey || !normalizedReleaseSlug || !normalizedTrackKey || amount < 1) {
    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStateWithVersion();

    if (!current) {
      break;
    }

    const snapshot = buildSnapshot(current.state, userKey);
    const alreadyOwned = snapshot.purchasedTrackKeys.includes(normalizedTrackKey);

    if (alreadyOwned) {
      return {
        ok: false,
        reason: "already_owned",
        balanceCents: snapshot.walletCents,
        releaseSlugs: snapshot.purchasedReleaseSlugs,
        releaseFormatKeys: snapshot.purchasedReleaseFormatKeys,
        trackKeys: snapshot.purchasedTrackKeys,
      };
    }

    if (snapshot.walletCents < amount) {
      return {
        ok: false,
        reason: "insufficient_funds",
        balanceCents: snapshot.walletCents,
        releaseSlugs: snapshot.purchasedReleaseSlugs,
        releaseFormatKeys: snapshot.purchasedReleaseFormatKeys,
        trackKeys: snapshot.purchasedTrackKeys,
      };
    }

    const nextBalance = snapshot.walletCents - amount;
    const nextTrackKeys = prependUniqueValues(snapshot.purchasedTrackKeys, [normalizedTrackKey]);
    const next = sanitizeState({
      ...current.state,
      walletCentsByUserId: {
        ...current.state.walletCentsByUserId,
        [userKey]: nextBalance,
      },
      purchasedTrackKeysByUserId: {
        ...current.state.purchasedTrackKeysByUserId,
        [userKey]: nextTrackKeys,
      },
      updatedAt: new Date().toISOString(),
    });

    const saved = await writeState(next, current.rowVersion);

    if (saved.ok) {
      return {
        ok: true,
        balanceCents: nextBalance,
        releaseSlugs: snapshot.purchasedReleaseSlugs,
        releaseFormatKeys: snapshot.purchasedReleaseFormatKeys,
        trackKeys: nextTrackKeys,
      };
    }

    if (!saved.conflict) {
      break;
    }
  }

  if (POSTGRES_STRICT) {
    throwStrictError("Failed to purchase track with wallet in Postgres");
  }

  return null;
};

export const mintSocialPurchasedReleaseNft = async (
  telegramUserId: number,
  input: {
    releaseSlug: string;
    ownerAddress?: string;
    txHash?: string;
    collectionAddress?: string;
    itemAddress?: string;
    itemIndex?: string;
  },
): Promise<
  | {
      ok: true;
      alreadyMinted: boolean;
      nft: SocialMintedReleaseNft;
      mintedReleaseNfts: SocialMintedReleaseNft[];
    }
  | {
      ok: false;
      reason: "not_purchased" | "wallet_required";
      mintedReleaseNfts: SocialMintedReleaseNft[];
    }
  | null
> => {
  const userKey = resolveUserKey(telegramUserId);
  const releaseSlug = normalizeSlug(input.releaseSlug);

  if (!userKey || !releaseSlug) {
    return null;
  }

  const stateBefore = await readCurrentState();
  if (!stateBefore) {
    return null;
  }

  const snapshotBefore = buildSnapshot(stateBefore, userKey);
  if (!snapshotBefore.purchasedReleaseSlugs.includes(releaseSlug)) {
    return {
      ok: false,
      reason: "not_purchased",
      mintedReleaseNfts: snapshotBefore.mintedReleaseNfts,
    };
  }

  const ownerAddressCandidate = normalizeTonAddress(input.ownerAddress);
  const ownerAddress = ownerAddressCandidate || snapshotBefore.tonWalletAddress || "";
  if (!ownerAddress) {
    return {
      ok: false,
      reason: "wallet_required",
      mintedReleaseNfts: snapshotBefore.mintedReleaseNfts,
    };
  }

  const existingBefore = snapshotBefore.mintedReleaseNfts.find((entry) => entry.releaseSlug === releaseSlug);
  if (existingBefore) {
    return {
      ok: true,
      alreadyMinted: true,
      nft: existingBefore,
      mintedReleaseNfts: snapshotBefore.mintedReleaseNfts,
    };
  }

  const txHash = normalizeOptionalText(input.txHash, 256);
  const collectionAddress = normalizeOptionalText(normalizeTonAddress(input.collectionAddress), 160);
  const itemAddress = normalizeOptionalText(normalizeTonAddress(input.itemAddress), 160);
  const itemIndex = normalizeOptionalBigIntString(input.itemIndex);
  const createdAt = new Date().toISOString();
  const nftIdSeed = `nft:${releaseSlug}:${createdAt}`;
  const createdNft: SocialMintedReleaseNft = {
    id: normalizeMintedNftId(nftIdSeed, nftIdSeed),
    releaseSlug,
    ownerAddress,
    collectionAddress,
    itemAddress,
    itemIndex,
    txHash,
    mintedAt: createdAt,
    status: "minted",
  };

  const next = await mutateState((current) => {
    const snapshot = buildSnapshot(current, userKey);
    const alreadyMintedNft = snapshot.mintedReleaseNfts.find((entry) => entry.releaseSlug === releaseSlug);

    if (alreadyMintedNft || !snapshot.purchasedReleaseSlugs.includes(releaseSlug)) {
      return current;
    }

    const nextMinted = normalizeMintedReleaseNftList([createdNft, ...snapshot.mintedReleaseNfts]);

    return {
      ...current,
      tonWalletAddressByUserId: {
        ...current.tonWalletAddressByUserId,
        [userKey]: ownerAddress,
      },
      mintedReleaseNftsByUserId: {
        ...current.mintedReleaseNftsByUserId,
        [userKey]: nextMinted,
      },
    };
  });

  if (!next) {
    return null;
  }

  const snapshot = buildSnapshot(next, userKey);
  const existingNft = snapshot.mintedReleaseNfts.find((entry) => entry.releaseSlug === releaseSlug) ?? null;

  if (!existingNft) {
    return {
      ok: false,
      reason: "wallet_required",
      mintedReleaseNfts: snapshot.mintedReleaseNfts,
    };
  }

  return {
    ok: true,
    alreadyMinted: false,
    nft: existingNft,
    mintedReleaseNfts: snapshot.mintedReleaseNfts,
  };
};
