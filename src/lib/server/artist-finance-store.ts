import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import type {
  ArtistEarningLedgerEntry,
  ArtistPayoutRequest,
  ShopAdminConfig,
} from "@/types/shop";

interface ArtistEarningLedgerRow {
  id?: unknown;
  artist_telegram_user_id?: unknown;
  source?: unknown;
  source_id?: unknown;
  order_id?: unknown;
  buyer_telegram_user_id?: unknown;
  amount_stars_cents?: unknown;
  earned_at?: unknown;
  hold_until?: unknown;
}

interface ArtistPayoutRequestRow {
  id?: unknown;
  artist_telegram_user_id?: unknown;
  ton_wallet_address?: unknown;
  amount_stars_cents?: unknown;
  note?: unknown;
  status?: unknown;
  admin_note?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  reviewed_at?: unknown;
  reviewed_by_telegram_user_id?: unknown;
  paid_at?: unknown;
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

const normalizeMoney = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeIso = (value: unknown, fallback: string): string => {
  const date = new Date(String(value ?? "").trim());
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
};

const normalizeEarningSource = (value: unknown): ArtistEarningLedgerEntry["source"] => {
  return value === "donation" || value === "subscription" ? value : "release_sale";
};

const normalizePayoutStatus = (value: unknown): ArtistPayoutRequest["status"] => {
  return value === "approved" || value === "rejected" || value === "paid"
    ? value
    : "pending_review";
};

const toArtistEarningLedgerEntry = (
  row: ArtistEarningLedgerRow,
): ArtistEarningLedgerEntry | null => {
  const id = normalizeText(row.id, 120);
  const artistTelegramUserId = normalizeTelegramUserId(row.artist_telegram_user_id);
  const sourceId = normalizeText(row.source_id, 160);
  const now = new Date().toISOString();

  if (!id || !artistTelegramUserId || !sourceId) {
    return null;
  }

  return {
    id,
    artistTelegramUserId,
    source: normalizeEarningSource(row.source),
    sourceId,
    orderId: normalizeOptionalText(row.order_id, 120),
    buyerTelegramUserId: normalizeTelegramUserId(row.buyer_telegram_user_id) || undefined,
    amountStarsCents: normalizeMoney(row.amount_stars_cents),
    earnedAt: normalizeIso(row.earned_at, now),
    holdUntil: normalizeIso(row.hold_until, now),
  };
};

const toArtistPayoutRequest = (
  row: ArtistPayoutRequestRow,
): ArtistPayoutRequest | null => {
  const id = normalizeText(row.id, 120);
  const artistTelegramUserId = normalizeTelegramUserId(row.artist_telegram_user_id);
  const tonWalletAddress = normalizeText(row.ton_wallet_address, 128);
  const createdAt = normalizeIso(row.created_at, new Date().toISOString());

  if (!id || !artistTelegramUserId || !tonWalletAddress) {
    return null;
  }

  return {
    id,
    artistTelegramUserId,
    tonWalletAddress,
    amountStarsCents: normalizeMoney(row.amount_stars_cents),
    note: normalizeOptionalText(row.note, 1200),
    status: normalizePayoutStatus(row.status),
    adminNote: normalizeOptionalText(row.admin_note, 240),
    createdAt,
    updatedAt: normalizeIso(row.updated_at, createdAt),
    reviewedAt: normalizeOptionalText(row.reviewed_at, 64),
    reviewedByTelegramUserId: normalizeTelegramUserId(row.reviewed_by_telegram_user_id) || undefined,
    paidAt: normalizeOptionalText(row.paid_at, 64),
  };
};

const sortEarnings = (entries: ArtistEarningLedgerEntry[]): ArtistEarningLedgerEntry[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.earnedAt).getTime();
    const right = new Date(b.earnedAt).getTime();
    return right - left || b.id.localeCompare(a.id);
  });
};

const sortPayoutRequests = (entries: ArtistPayoutRequest[]): ArtistPayoutRequest[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left || b.id.localeCompare(a.id);
  });
};

const legacyEarningsForArtist = (
  config: ShopAdminConfig,
  artistTelegramUserId?: number,
): ArtistEarningLedgerEntry[] => {
  const entries =
    typeof artistTelegramUserId === "number"
      ? config.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === artistTelegramUserId)
      : config.artistEarningsLedger;

  return sortEarnings(entries);
};

const legacyPayoutRequestsForArtist = (
  config: ShopAdminConfig,
  artistTelegramUserId?: number,
): ArtistPayoutRequest[] => {
  const entries =
    typeof artistTelegramUserId === "number"
      ? config.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === artistTelegramUserId)
      : config.artistPayoutRequests;

  return sortPayoutRequests(entries);
};

const mergeEarnings = (
  primary: ArtistEarningLedgerEntry[],
  fallback: ArtistEarningLedgerEntry[],
): ArtistEarningLedgerEntry[] => {
  const entries = new Map<string, ArtistEarningLedgerEntry>();

  [...primary, ...fallback].forEach((entry) => {
    if (!entries.has(entry.id)) {
      entries.set(entry.id, entry);
    }
  });

  return sortEarnings(Array.from(entries.values()));
};

const mergePayoutRequests = (
  primary: ArtistPayoutRequest[],
  fallback: ArtistPayoutRequest[],
): ArtistPayoutRequest[] => {
  const entries = new Map<string, ArtistPayoutRequest>();

  [...primary, ...fallback].forEach((entry) => {
    if (!entries.has(entry.id)) {
      entries.set(entry.id, entry);
    }
  });

  return sortPayoutRequests(Array.from(entries.values()));
};

const isConfigured = (): boolean => Boolean(getPostgresHttpConfig());

export const readArtistFinanceSnapshot = async (options: {
  config: ShopAdminConfig;
  artistTelegramUserId?: number;
  earningsLimit?: number;
  payoutRequestsLimit?: number;
}): Promise<{
  earnings: ArtistEarningLedgerEntry[];
  payoutRequests: ArtistPayoutRequest[];
  source: "postgres" | "legacy";
}> => {
  if (!isConfigured()) {
    return {
      earnings: legacyEarningsForArtist(options.config, options.artistTelegramUserId),
      payoutRequests: legacyPayoutRequestsForArtist(options.config, options.artistTelegramUserId),
      source: "legacy",
    };
  }

  const earningsQuery = new URLSearchParams();
  earningsQuery.set(
    "select",
    "id,artist_telegram_user_id,source,source_id,order_id,buyer_telegram_user_id,amount_stars_cents,earned_at,hold_until",
  );
  earningsQuery.set("order", "earned_at.desc");
  earningsQuery.set("limit", String(Math.max(1, Math.min(options.earningsLimit ?? 1000, 5000))));
  if (typeof options.artistTelegramUserId === "number") {
    earningsQuery.set("artist_telegram_user_id", `eq.${options.artistTelegramUserId}`);
  }

  const payoutsQuery = new URLSearchParams();
  payoutsQuery.set(
    "select",
    "id,artist_telegram_user_id,ton_wallet_address,amount_stars_cents,note,status,admin_note,created_at,updated_at,reviewed_at,reviewed_by_telegram_user_id,paid_at",
  );
  payoutsQuery.set("order", "updated_at.desc");
  payoutsQuery.set(
    "limit",
    String(Math.max(1, Math.min(options.payoutRequestsLimit ?? 1000, 5000))),
  );
  if (typeof options.artistTelegramUserId === "number") {
    payoutsQuery.set("artist_telegram_user_id", `eq.${options.artistTelegramUserId}`);
  }

  const [earningsRows, payoutRows] = await Promise.all([
    postgresTableRequest<ArtistEarningLedgerRow[]>({
      method: "GET",
      path: "/artist_earnings_ledger",
      query: earningsQuery,
    }),
    postgresTableRequest<ArtistPayoutRequestRow[]>({
      method: "GET",
      path: "/artist_payout_requests",
      query: payoutsQuery,
    }),
  ]);

  if (!earningsRows || !payoutRows) {
    return {
      earnings: legacyEarningsForArtist(options.config, options.artistTelegramUserId),
      payoutRequests: legacyPayoutRequestsForArtist(options.config, options.artistTelegramUserId),
      source: "legacy",
    };
  }

  return {
    earnings: mergeEarnings(
      earningsRows
        .map((row) => toArtistEarningLedgerEntry(row))
        .filter((entry): entry is ArtistEarningLedgerEntry => Boolean(entry)),
      legacyEarningsForArtist(options.config, options.artistTelegramUserId),
    ),
    payoutRequests: mergePayoutRequests(
      payoutRows
        .map((row) => toArtistPayoutRequest(row))
        .filter((entry): entry is ArtistPayoutRequest => Boolean(entry)),
      legacyPayoutRequestsForArtist(options.config, options.artistTelegramUserId),
    ),
    source: "postgres",
  };
};

export const upsertArtistEarningLedgerEntries = async (
  entries: ArtistEarningLedgerEntry[],
): Promise<boolean> => {
  if (!isConfigured() || entries.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = entries.map((entry) => ({
    id: normalizeText(entry.id, 120),
    artist_telegram_user_id: normalizeTelegramUserId(entry.artistTelegramUserId),
    source: normalizeEarningSource(entry.source),
    source_id: normalizeText(entry.sourceId, 160),
    order_id: normalizeOptionalText(entry.orderId, 120) ?? null,
    buyer_telegram_user_id: normalizeTelegramUserId(entry.buyerTelegramUserId) || null,
    amount_stars_cents: normalizeMoney(entry.amountStarsCents),
    earned_at: normalizeIso(entry.earnedAt, new Date().toISOString()),
    hold_until: normalizeIso(entry.holdUntil, new Date().toISOString()),
  }));

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_earnings_ledger",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};

export const upsertArtistPayoutRequestRecord = async (
  request: ArtistPayoutRequest,
): Promise<boolean> => {
  if (!isConfigured()) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_payout_requests",
    query,
    body: {
      id: normalizeText(request.id, 120),
      artist_telegram_user_id: normalizeTelegramUserId(request.artistTelegramUserId),
      ton_wallet_address: normalizeText(request.tonWalletAddress, 128),
      amount_stars_cents: normalizeMoney(request.amountStarsCents),
      note: normalizeOptionalText(request.note, 1200) ?? null,
      status: normalizePayoutStatus(request.status),
      admin_note: normalizeOptionalText(request.adminNote, 240) ?? null,
      created_at: normalizeIso(request.createdAt, new Date().toISOString()),
      updated_at: normalizeIso(request.updatedAt, request.createdAt),
      reviewed_at: normalizeOptionalText(request.reviewedAt, 64) ?? null,
      reviewed_by_telegram_user_id: normalizeTelegramUserId(request.reviewedByTelegramUserId) || null,
      paid_at: normalizeOptionalText(request.paidAt, 64) ?? null,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};
