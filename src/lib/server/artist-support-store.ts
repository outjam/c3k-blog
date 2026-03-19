import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import type { ArtistDonation, ArtistSubscription, ShopAdminConfig } from "@/types/shop";

interface ArtistDonationRow {
  id?: unknown;
  artist_telegram_user_id?: unknown;
  from_telegram_user_id?: unknown;
  amount_stars_cents?: unknown;
  message?: unknown;
  created_at?: unknown;
}

interface ArtistSubscriptionRow {
  id?: unknown;
  artist_telegram_user_id?: unknown;
  subscriber_telegram_user_id?: unknown;
  amount_stars_cents?: unknown;
  status?: unknown;
  started_at?: unknown;
  updated_at?: unknown;
}

const isConfigured = (): boolean => Boolean(getPostgresHttpConfig());

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

const normalizeSubscriptionStatus = (value: unknown): ArtistSubscription["status"] => {
  return value === "paused" || value === "cancelled" ? value : "active";
};

const toArtistDonation = (row: ArtistDonationRow): ArtistDonation | null => {
  const id = normalizeText(row.id, 120);
  const artistTelegramUserId = normalizeTelegramUserId(row.artist_telegram_user_id);
  const fromTelegramUserId = normalizeTelegramUserId(row.from_telegram_user_id);
  const createdAt = normalizeIso(row.created_at, new Date().toISOString());

  if (!id || !artistTelegramUserId || !fromTelegramUserId) {
    return null;
  }

  return {
    id,
    artistTelegramUserId,
    fromTelegramUserId,
    amountStarsCents: normalizeMoney(row.amount_stars_cents),
    message: normalizeOptionalText(row.message, 280),
    createdAt,
  };
};

const toArtistSubscription = (row: ArtistSubscriptionRow): ArtistSubscription | null => {
  const id = normalizeText(row.id, 120);
  const artistTelegramUserId = normalizeTelegramUserId(row.artist_telegram_user_id);
  const subscriberTelegramUserId = normalizeTelegramUserId(row.subscriber_telegram_user_id);
  const startedAt = normalizeIso(row.started_at, new Date().toISOString());

  if (!id || !artistTelegramUserId || !subscriberTelegramUserId) {
    return null;
  }

  return {
    id,
    artistTelegramUserId,
    subscriberTelegramUserId,
    amountStarsCents: normalizeMoney(row.amount_stars_cents),
    status: normalizeSubscriptionStatus(row.status),
    startedAt,
    updatedAt: normalizeIso(row.updated_at, startedAt),
  };
};

const sortDonations = (entries: ArtistDonation[]): ArtistDonation[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return right - left || b.id.localeCompare(a.id);
  });
};

const sortSubscriptions = (entries: ArtistSubscription[]): ArtistSubscription[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.updatedAt || a.startedAt).getTime();
    const right = new Date(b.updatedAt || b.startedAt).getTime();
    return right - left || b.id.localeCompare(a.id);
  });
};

const filterLegacyDonations = (config: ShopAdminConfig, artistTelegramUserId?: number): ArtistDonation[] => {
  return sortDonations(
    typeof artistTelegramUserId === "number"
      ? config.artistDonations.filter((entry) => entry.artistTelegramUserId === artistTelegramUserId)
      : config.artistDonations,
  );
};

const filterLegacySubscriptions = (
  config: ShopAdminConfig,
  options: {
    artistTelegramUserId?: number;
    subscriberTelegramUserId?: number;
    activeOnly?: boolean;
  },
): ArtistSubscription[] => {
  return sortSubscriptions(
    config.artistSubscriptions.filter((entry) => {
      if (typeof options.artistTelegramUserId === "number" && entry.artistTelegramUserId !== options.artistTelegramUserId) {
        return false;
      }
      if (
        typeof options.subscriberTelegramUserId === "number" &&
        entry.subscriberTelegramUserId !== options.subscriberTelegramUserId
      ) {
        return false;
      }
      if (options.activeOnly && entry.status !== "active") {
        return false;
      }
      return true;
    }),
  );
};

const mergeDonations = (primary: ArtistDonation[], fallback: ArtistDonation[]): ArtistDonation[] => {
  const entries = new Map<string, ArtistDonation>();

  [...primary, ...fallback].forEach((entry) => {
    if (!entries.has(entry.id)) {
      entries.set(entry.id, entry);
    }
  });

  return sortDonations(Array.from(entries.values()));
};

const mergeSubscriptions = (primary: ArtistSubscription[], fallback: ArtistSubscription[]): ArtistSubscription[] => {
  const entries = new Map<string, ArtistSubscription>();

  [...primary, ...fallback].forEach((entry) => {
    if (!entries.has(entry.id)) {
      entries.set(entry.id, entry);
    }
  });

  return sortSubscriptions(Array.from(entries.values()));
};

export const readArtistSupportSnapshot = async (options: {
  config: ShopAdminConfig;
  artistTelegramUserId?: number;
  subscriberTelegramUserId?: number;
  activeSubscriptionsOnly?: boolean;
  donationsLimit?: number;
  subscriptionsLimit?: number;
}): Promise<{
  donations: ArtistDonation[];
  subscriptions: ArtistSubscription[];
  source: "postgres" | "legacy";
}> => {
  if (!isConfigured()) {
    return {
      donations: filterLegacyDonations(options.config, options.artistTelegramUserId),
      subscriptions: filterLegacySubscriptions(options.config, {
        artistTelegramUserId: options.artistTelegramUserId,
        subscriberTelegramUserId: options.subscriberTelegramUserId,
        activeOnly: options.activeSubscriptionsOnly,
      }),
      source: "legacy",
    };
  }

  const donationsQuery = new URLSearchParams();
  donationsQuery.set("select", "id,artist_telegram_user_id,from_telegram_user_id,amount_stars_cents,message,created_at");
  donationsQuery.set("order", "created_at.desc");
  donationsQuery.set("limit", String(Math.max(1, Math.min(options.donationsLimit ?? 5000, 20000))));
  if (typeof options.artistTelegramUserId === "number") {
    donationsQuery.set("artist_telegram_user_id", `eq.${options.artistTelegramUserId}`);
  }

  const subscriptionsQuery = new URLSearchParams();
  subscriptionsQuery.set(
    "select",
    "id,artist_telegram_user_id,subscriber_telegram_user_id,amount_stars_cents,status,started_at,updated_at",
  );
  subscriptionsQuery.set("order", "updated_at.desc");
  subscriptionsQuery.set("limit", String(Math.max(1, Math.min(options.subscriptionsLimit ?? 5000, 20000))));
  if (typeof options.artistTelegramUserId === "number") {
    subscriptionsQuery.set("artist_telegram_user_id", `eq.${options.artistTelegramUserId}`);
  }
  if (typeof options.subscriberTelegramUserId === "number") {
    subscriptionsQuery.set("subscriber_telegram_user_id", `eq.${options.subscriberTelegramUserId}`);
  }
  if (options.activeSubscriptionsOnly) {
    subscriptionsQuery.set("status", "eq.active");
  }

  const [donationRows, subscriptionRows] = await Promise.all([
    postgresTableRequest<ArtistDonationRow[]>({
      method: "GET",
      path: "/artist_donations",
      query: donationsQuery,
    }),
    postgresTableRequest<ArtistSubscriptionRow[]>({
      method: "GET",
      path: "/artist_subscriptions",
      query: subscriptionsQuery,
    }),
  ]);

  if (!donationRows || !subscriptionRows) {
    return {
      donations: filterLegacyDonations(options.config, options.artistTelegramUserId),
      subscriptions: filterLegacySubscriptions(options.config, {
        artistTelegramUserId: options.artistTelegramUserId,
        subscriberTelegramUserId: options.subscriberTelegramUserId,
        activeOnly: options.activeSubscriptionsOnly,
      }),
      source: "legacy",
    };
  }

  return {
    donations: mergeDonations(
      donationRows.map((row) => toArtistDonation(row)).filter((entry): entry is ArtistDonation => Boolean(entry)),
      filterLegacyDonations(options.config, options.artistTelegramUserId),
    ),
    subscriptions: mergeSubscriptions(
      subscriptionRows
        .map((row) => toArtistSubscription(row))
        .filter((entry): entry is ArtistSubscription => Boolean(entry)),
      filterLegacySubscriptions(options.config, {
        artistTelegramUserId: options.artistTelegramUserId,
        subscriberTelegramUserId: options.subscriberTelegramUserId,
        activeOnly: options.activeSubscriptionsOnly,
      }),
    ),
    source: "postgres",
  };
};

export const upsertArtistDonations = async (entries: ArtistDonation[]): Promise<boolean> => {
  if (!isConfigured() || entries.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = entries.map((entry) => ({
    id: normalizeText(entry.id, 120),
    artist_telegram_user_id: normalizeTelegramUserId(entry.artistTelegramUserId),
    from_telegram_user_id: normalizeTelegramUserId(entry.fromTelegramUserId),
    amount_stars_cents: normalizeMoney(entry.amountStarsCents),
    message: normalizeOptionalText(entry.message, 280) ?? null,
    created_at: normalizeIso(entry.createdAt, new Date().toISOString()),
  }));

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_donations",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};

export const upsertArtistSubscriptions = async (entries: ArtistSubscription[]): Promise<boolean> => {
  if (!isConfigured() || entries.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = entries.map((entry) => ({
    id: normalizeText(entry.id, 120),
    artist_telegram_user_id: normalizeTelegramUserId(entry.artistTelegramUserId),
    subscriber_telegram_user_id: normalizeTelegramUserId(entry.subscriberTelegramUserId),
    amount_stars_cents: normalizeMoney(entry.amountStarsCents),
    status: normalizeSubscriptionStatus(entry.status),
    started_at: normalizeIso(entry.startedAt, new Date().toISOString()),
    updated_at: normalizeIso(entry.updatedAt, entry.startedAt),
  }));

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_subscriptions",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};
