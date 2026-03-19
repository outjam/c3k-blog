import { upsertArtistDonations, upsertArtistSubscriptions } from "@/lib/server/artist-support-store";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistDonation, ArtistSubscription } from "@/types/shop";

const normalizePositiveInt = (value: unknown, fallback: number, max: number): number => {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
};

const normalizeTelegramUserIds = (value: unknown): number[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((entry) => Math.round(Number(entry ?? 0)))
        .filter((entry) => Number.isFinite(entry) && entry > 0),
    ),
  );
};

const chunk = <T,>(items: T[], size: number): T[][] => {
  if (items.length === 0) {
    return [];
  }

  const next: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    next.push(items.slice(index, index + size));
  }
  return next;
};

const runChunkedUpsert = async <T,>(
  records: T[],
  fn: (items: T[]) => Promise<boolean>,
): Promise<boolean> => {
  const groups = chunk(records, 250);
  for (const group of groups) {
    if (group.length === 0) {
      continue;
    }

    const ok = await fn(group);
    if (!ok) {
      return false;
    }
  }

  return true;
};

export const runArtistSupportBackfill = async (input?: {
  telegramUserIds?: unknown;
  limit?: unknown;
  dryRun?: unknown;
}): Promise<
  | {
      ok: true;
      dryRun: boolean;
      selectedArtists: number;
      donations: number;
      subscriptions: number;
      sourceUpdatedAt: string;
    }
  | {
      ok: false;
      message: string;
    }
> => {
  const dryRun = input?.dryRun === true;
  const limit = normalizePositiveInt(input?.limit, 1000, 20000);
  const telegramUserIds = new Set(normalizeTelegramUserIds(input?.telegramUserIds));

  const config = await readShopAdminConfig();

  const donations = config.artistDonations
    .filter((entry) => telegramUserIds.size === 0 || telegramUserIds.has(entry.artistTelegramUserId))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);

  const subscriptions = config.artistSubscriptions
    .filter((entry) => telegramUserIds.size === 0 || telegramUserIds.has(entry.artistTelegramUserId))
    .sort((a, b) => new Date(b.updatedAt || b.startedAt).getTime() - new Date(a.updatedAt || a.startedAt).getTime())
    .slice(0, limit);

  const selectedArtists = new Set<number>([
    ...donations.map((entry) => entry.artistTelegramUserId),
    ...subscriptions.map((entry) => entry.artistTelegramUserId),
  ]);

  if (!dryRun) {
    const [donationsOk, subscriptionsOk] = await Promise.all([
      runChunkedUpsert<ArtistDonation>(donations, upsertArtistDonations),
      runChunkedUpsert<ArtistSubscription>(subscriptions, upsertArtistSubscriptions),
    ]);

    if (!donationsOk || !subscriptionsOk) {
      return {
        ok: false,
        message: "Failed to write normalized artist support state",
      };
    }
  }

  return {
    ok: true,
    dryRun,
    selectedArtists: selectedArtists.size,
    donations: donations.length,
    subscriptions: subscriptions.length,
    sourceUpdatedAt: config.updatedAt,
  };
};
