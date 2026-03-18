import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";

export interface UserReleaseEntitlementRecord {
  id?: string;
  telegramUserId: number;
  releaseSlug: string;
  formatKey?: string;
  acquiredAt?: string;
}

export interface UserTrackEntitlementRecord {
  id?: string;
  telegramUserId: number;
  releaseSlug: string;
  trackId: string;
  acquiredAt?: string;
}

export interface UserReleaseNftMintRecord {
  id?: string;
  telegramUserId: number;
  releaseSlug: string;
  ownerAddress: string;
  collectionAddress?: string;
  itemAddress?: string;
  itemIndex?: string;
  txHash?: string;
  mintedAt?: string;
  status?: "minted";
}

interface UserReleaseEntitlementRow {
  id?: unknown;
  telegram_user_id?: unknown;
  release_slug?: unknown;
  format_key?: unknown;
  acquired_at?: unknown;
}

interface UserTrackEntitlementRow {
  id?: unknown;
  telegram_user_id?: unknown;
  release_slug?: unknown;
  track_id?: unknown;
  acquired_at?: unknown;
}

interface UserReleaseNftMintRow {
  id?: unknown;
  telegram_user_id?: unknown;
  release_slug?: unknown;
  owner_address?: unknown;
  collection_address?: unknown;
  item_address?: unknown;
  item_index?: unknown;
  tx_hash?: unknown;
  minted_at?: unknown;
  status?: unknown;
}

const normalizeTelegramUserId = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
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

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
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

const normalizeIso = (value: unknown, fallback: string): string => {
  const date = new Date(String(value ?? "").trim());
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
};

const normalizeMintStatus = (value: unknown): "minted" => {
  return value === "minted" ? "minted" : "minted";
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

const normalizeMintedReleaseNft = (
  source: Partial<UserReleaseNftMintRecord>,
): UserReleaseNftMintRecord | null => {
  const releaseSlug = normalizeSlug(source.releaseSlug);
  const ownerAddress = normalizeTonAddress(source.ownerAddress);
  const mintedAt = normalizeIso(source.mintedAt, new Date().toISOString());
  const fallbackId = `nft:${releaseSlug}:${mintedAt}`;

  if (!releaseSlug || !ownerAddress) {
    return null;
  }

  return {
    id: normalizeMintedNftId(source.id, fallbackId),
    telegramUserId: normalizeTelegramUserId(source.telegramUserId),
    releaseSlug,
    ownerAddress,
    collectionAddress: normalizeOptionalText(normalizeTonAddress(source.collectionAddress), 160),
    itemAddress: normalizeOptionalText(normalizeTonAddress(source.itemAddress), 160),
    itemIndex: normalizeOptionalBigIntString(source.itemIndex),
    txHash: normalizeOptionalText(source.txHash, 256),
    mintedAt,
    status: normalizeMintStatus(source.status),
  };
};

const normalizeMintedReleaseNftList = (
  value: unknown,
): UserReleaseNftMintRecord[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized = value
    .map((entry) =>
      normalizeMintedReleaseNft(
        entry && typeof entry === "object" ? (entry as Partial<UserReleaseNftMintRecord>) : {},
      ),
    )
    .filter((entry): entry is UserReleaseNftMintRecord => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry.id ?? "")) {
        return false;
      }

      seen.add(entry.id ?? "");
      return true;
    });

  return normalized.sort((a, b) => {
    const left = new Date(a.mintedAt ?? 0).getTime();
    const right = new Date(b.mintedAt ?? 0).getTime();
    return right - left || String(b.id ?? "").localeCompare(String(a.id ?? ""));
  });
};

const mergeStringLists = (primary: string[], fallback: string[]): string[] => {
  const seen = new Set<string>();
  const next: string[] = [];

  [...primary, ...fallback].forEach((entry) => {
    if (!entry || seen.has(entry)) {
      return;
    }

    seen.add(entry);
    next.push(entry);
  });

  return next;
};

const buildReleaseEntitlementId = (telegramUserId: number, releaseSlug: string, formatKey?: string): string => {
  return `release:${telegramUserId}:${releaseSlug}:${formatKey || "full"}`;
};

const buildTrackEntitlementId = (telegramUserId: number, releaseSlug: string, trackId: string): string => {
  return `track:${telegramUserId}:${releaseSlug}:${trackId}`;
};

const toUserReleaseEntitlementRecord = (
  row: UserReleaseEntitlementRow,
): UserReleaseEntitlementRecord | null => {
  const telegramUserId = normalizeTelegramUserId(row.telegram_user_id);
  const releaseSlug = normalizeSlug(row.release_slug);
  const formatKey = normalizeReleaseFormat(row.format_key);
  const acquiredAt = normalizeIso(row.acquired_at, new Date().toISOString());

  if (!telegramUserId || !releaseSlug) {
    return null;
  }

  return {
    id: normalizeText(row.id, 120) || buildReleaseEntitlementId(telegramUserId, releaseSlug, formatKey),
    telegramUserId,
    releaseSlug,
    formatKey: formatKey || undefined,
    acquiredAt,
  };
};

const toUserTrackEntitlementRecord = (
  row: UserTrackEntitlementRow,
): UserTrackEntitlementRecord | null => {
  const telegramUserId = normalizeTelegramUserId(row.telegram_user_id);
  const releaseSlug = normalizeSlug(row.release_slug);
  const trackId = normalizeTrackId(row.track_id);
  const acquiredAt = normalizeIso(row.acquired_at, new Date().toISOString());

  if (!telegramUserId || !releaseSlug || !trackId) {
    return null;
  }

  return {
    id: normalizeText(row.id, 120) || buildTrackEntitlementId(telegramUserId, releaseSlug, trackId),
    telegramUserId,
    releaseSlug,
    trackId,
    acquiredAt,
  };
};

const toUserReleaseNftMintRecord = (
  row: UserReleaseNftMintRow,
): UserReleaseNftMintRecord | null => {
  return normalizeMintedReleaseNft({
    id: normalizeText(row.id, 120),
    telegramUserId: normalizeTelegramUserId(row.telegram_user_id),
    releaseSlug: normalizeSlug(row.release_slug),
    ownerAddress: normalizeTonAddress(row.owner_address),
    collectionAddress: normalizeOptionalText(normalizeTonAddress(row.collection_address), 160),
    itemAddress: normalizeOptionalText(normalizeTonAddress(row.item_address), 160),
    itemIndex: normalizeOptionalBigIntString(row.item_index),
    txHash: normalizeOptionalText(row.tx_hash, 256),
    mintedAt: normalizeIso(row.minted_at, new Date().toISOString()),
    status: normalizeMintStatus(row.status),
  });
};

const isConfigured = (): boolean => Boolean(getPostgresHttpConfig());

export const readSocialEntitlementSnapshot = async (options: {
  telegramUserId: number;
  fallback: {
    purchasedReleaseSlugs: string[];
    purchasedReleaseFormatKeys: string[];
    purchasedTrackKeys: string[];
    mintedReleaseNfts: UserReleaseNftMintRecord[];
  };
  releaseLimit?: number;
  trackLimit?: number;
  mintLimit?: number;
}): Promise<{
  purchasedReleaseSlugs: string[];
  purchasedReleaseFormatKeys: string[];
  purchasedTrackKeys: string[];
  mintedReleaseNfts: UserReleaseNftMintRecord[];
  source: "postgres" | "legacy";
}> => {
  const fallbackReleaseSlugs = normalizeStringList(options.fallback.purchasedReleaseSlugs);
  const fallbackReleaseFormatKeys = normalizeReleaseFormatPurchaseKeyList(options.fallback.purchasedReleaseFormatKeys);
  const fallbackTrackKeys = normalizeTrackPurchaseKeyList(options.fallback.purchasedTrackKeys);
  const fallbackMintedReleaseNfts = normalizeMintedReleaseNftList(options.fallback.mintedReleaseNfts);

  if (!isConfigured()) {
    return {
      purchasedReleaseSlugs: fallbackReleaseSlugs,
      purchasedReleaseFormatKeys: fallbackReleaseFormatKeys,
      purchasedTrackKeys: fallbackTrackKeys,
      mintedReleaseNfts: fallbackMintedReleaseNfts,
      source: "legacy",
    };
  }

  const releaseQuery = new URLSearchParams();
  releaseQuery.set("select", "id,telegram_user_id,release_slug,format_key,acquired_at");
  releaseQuery.set("telegram_user_id", `eq.${options.telegramUserId}`);
  releaseQuery.set("order", "acquired_at.desc");
  releaseQuery.set("limit", String(Math.max(1, Math.min(options.releaseLimit ?? 2000, 5000))));

  const trackQuery = new URLSearchParams();
  trackQuery.set("select", "id,telegram_user_id,release_slug,track_id,acquired_at");
  trackQuery.set("telegram_user_id", `eq.${options.telegramUserId}`);
  trackQuery.set("order", "acquired_at.desc");
  trackQuery.set("limit", String(Math.max(1, Math.min(options.trackLimit ?? 5000, 10000))));

  const mintQuery = new URLSearchParams();
  mintQuery.set(
    "select",
    "id,telegram_user_id,release_slug,owner_address,collection_address,item_address,item_index,tx_hash,minted_at,status",
  );
  mintQuery.set("telegram_user_id", `eq.${options.telegramUserId}`);
  mintQuery.set("order", "minted_at.desc");
  mintQuery.set("limit", String(Math.max(1, Math.min(options.mintLimit ?? 1000, 5000))));

  const [releaseRows, trackRows, mintRows] = await Promise.all([
    postgresTableRequest<UserReleaseEntitlementRow[]>({
      method: "GET",
      path: "/user_release_entitlements",
      query: releaseQuery,
    }),
    postgresTableRequest<UserTrackEntitlementRow[]>({
      method: "GET",
      path: "/user_track_entitlements",
      query: trackQuery,
    }),
    postgresTableRequest<UserReleaseNftMintRow[]>({
      method: "GET",
      path: "/user_release_nft_mints",
      query: mintQuery,
    }),
  ]);

  if (!releaseRows || !trackRows || !mintRows) {
    return {
      purchasedReleaseSlugs: fallbackReleaseSlugs,
      purchasedReleaseFormatKeys: fallbackReleaseFormatKeys,
      purchasedTrackKeys: fallbackTrackKeys,
      mintedReleaseNfts: fallbackMintedReleaseNfts,
      source: "legacy",
    };
  }

  const primaryReleaseEntries = releaseRows
    .map((row) => toUserReleaseEntitlementRecord(row))
    .filter((entry): entry is UserReleaseEntitlementRecord => Boolean(entry));
  const primaryTrackEntries = trackRows
    .map((row) => toUserTrackEntitlementRecord(row))
    .filter((entry): entry is UserTrackEntitlementRecord => Boolean(entry));
  const primaryMints = normalizeMintedReleaseNftList(
    mintRows
      .map((row) => toUserReleaseNftMintRecord(row))
      .filter((entry): entry is UserReleaseNftMintRecord => Boolean(entry)),
  );

  const primaryReleaseSlugs = Array.from(
    new Set(primaryReleaseEntries.map((entry) => entry.releaseSlug)),
  );
  const primaryReleaseFormatKeys = primaryReleaseEntries
    .map((entry) => toReleaseFormatPurchaseKey(entry.releaseSlug, entry.formatKey))
    .filter(Boolean);
  const primaryTrackKeys = primaryTrackEntries
    .map((entry) => toTrackPurchaseKey(entry.releaseSlug, entry.trackId))
    .filter(Boolean);

  return {
    purchasedReleaseSlugs: mergeStringLists(primaryReleaseSlugs, [
      ...fallbackReleaseSlugs,
      ...fallbackReleaseFormatKeys.map((entry) => entry.split("::", 1)[0] ?? "").filter(Boolean),
    ]),
    purchasedReleaseFormatKeys: mergeStringLists(primaryReleaseFormatKeys, fallbackReleaseFormatKeys),
    purchasedTrackKeys: mergeStringLists(primaryTrackKeys, fallbackTrackKeys),
    mintedReleaseNfts: normalizeMintedReleaseNftList([...primaryMints, ...fallbackMintedReleaseNfts]),
    source: "postgres",
  };
};

export const upsertUserReleaseEntitlements = async (
  records: UserReleaseEntitlementRecord[],
): Promise<boolean> => {
  if (!isConfigured() || records.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = records.flatMap((entry) => {
    const telegramUserId = normalizeTelegramUserId(entry.telegramUserId);
    const releaseSlug = normalizeSlug(entry.releaseSlug);
    const formatKey = normalizeReleaseFormat(entry.formatKey);
    const acquiredAt = normalizeIso(entry.acquiredAt, new Date().toISOString());

    if (!telegramUserId || !releaseSlug) {
      return [];
    }

    return [
      {
        id:
          normalizeText(entry.id, 120) ||
          buildReleaseEntitlementId(telegramUserId, releaseSlug, formatKey || undefined),
        telegram_user_id: telegramUserId,
        release_slug: releaseSlug,
        format_key: formatKey || null,
        acquired_at: acquiredAt,
      },
    ];
  });

  if (body.length === 0) {
    return false;
  }

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/user_release_entitlements",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};

export const upsertUserTrackEntitlements = async (
  records: UserTrackEntitlementRecord[],
): Promise<boolean> => {
  if (!isConfigured() || records.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = records.flatMap((entry) => {
    const telegramUserId = normalizeTelegramUserId(entry.telegramUserId);
    const releaseSlug = normalizeSlug(entry.releaseSlug);
    const trackId = normalizeTrackId(entry.trackId);
    const acquiredAt = normalizeIso(entry.acquiredAt, new Date().toISOString());

    if (!telegramUserId || !releaseSlug || !trackId) {
      return [];
    }

    return [
      {
        id: normalizeText(entry.id, 120) || buildTrackEntitlementId(telegramUserId, releaseSlug, trackId),
        telegram_user_id: telegramUserId,
        release_slug: releaseSlug,
        track_id: trackId,
        acquired_at: acquiredAt,
      },
    ];
  });

  if (body.length === 0) {
    return false;
  }

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/user_track_entitlements",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};

export const upsertUserReleaseNftMints = async (
  records: UserReleaseNftMintRecord[],
): Promise<boolean> => {
  if (!isConfigured() || records.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = records.flatMap((entry) => {
    const normalized = normalizeMintedReleaseNft(entry);

    if (!normalized?.id || !normalized.telegramUserId) {
      return [];
    }

    return [
      {
        id: normalized.id,
        telegram_user_id: normalized.telegramUserId,
        release_slug: normalized.releaseSlug,
        owner_address: normalized.ownerAddress,
        collection_address: normalized.collectionAddress ?? null,
        item_address: normalized.itemAddress ?? null,
        item_index: normalized.itemIndex ?? null,
        tx_hash: normalized.txHash ?? null,
        minted_at: normalized.mintedAt,
        status: normalized.status,
      },
    ];
  });

  if (body.length === 0) {
    return false;
  }

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/user_release_nft_mints",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};
