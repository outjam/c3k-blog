import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import {
  upsertArtistEarningLedgerEntries,
  upsertArtistPayoutAuditEntries,
  upsertArtistPayoutRequestRecord,
} from "@/lib/server/artist-finance-store";
import type { ArtistEarningLedgerEntry, ArtistPayoutAuditEntry, ArtistPayoutRequest } from "@/types/shop";

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

export const runArtistFinanceBackfill = async (input?: {
  telegramUserIds?: unknown;
  limit?: unknown;
  dryRun?: unknown;
}): Promise<
  | {
      ok: true;
      dryRun: boolean;
      selectedArtists: number;
      earnings: number;
      payoutRequests: number;
      payoutAuditEntries: number;
      sourceUpdatedAt: string;
    }
  | {
      ok: false;
      message: string;
    }
> => {
  const dryRun = input?.dryRun === true;
  const limit = normalizePositiveInt(input?.limit, 500, 10000);
  const telegramUserIds = new Set(normalizeTelegramUserIds(input?.telegramUserIds));

  const config = await readShopAdminConfig();

  const earnings = config.artistEarningsLedger
    .filter((entry) => telegramUserIds.size === 0 || telegramUserIds.has(entry.artistTelegramUserId))
    .sort((a, b) => new Date(b.earnedAt).getTime() - new Date(a.earnedAt).getTime())
    .slice(0, limit);

  const payoutRequests = config.artistPayoutRequests
    .filter((entry) => telegramUserIds.size === 0 || telegramUserIds.has(entry.artistTelegramUserId))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, limit);

  const payoutRequestIds = new Set(payoutRequests.map((entry) => entry.id));
  const payoutAuditEntries = config.artistPayoutAuditLog
    .filter(
      (entry) =>
        (telegramUserIds.size === 0 || telegramUserIds.has(entry.artistTelegramUserId)) &&
        payoutRequestIds.has(entry.payoutRequestId),
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit * 4);

  const selectedArtists = new Set<number>([
    ...earnings.map((entry) => entry.artistTelegramUserId),
    ...payoutRequests.map((entry) => entry.artistTelegramUserId),
    ...payoutAuditEntries.map((entry) => entry.artistTelegramUserId),
  ]);

  if (!dryRun) {
    const [earningsOk, payoutsOk, payoutAuditOk] = await Promise.all([
      runChunkedUpsert<ArtistEarningLedgerEntry>(earnings, upsertArtistEarningLedgerEntries),
      runChunkedUpsert<ArtistPayoutRequest>(payoutRequests, async (items) => {
        for (const item of items) {
          const ok = await upsertArtistPayoutRequestRecord(item);
          if (!ok) {
            return false;
          }
        }
        return true;
      }),
      runChunkedUpsert<ArtistPayoutAuditEntry>(payoutAuditEntries, upsertArtistPayoutAuditEntries),
    ]);

    if (!earningsOk || !payoutsOk || !payoutAuditOk) {
      return {
        ok: false,
        message: "Failed to write normalized finance state",
      };
    }
  }

  return {
    ok: true,
    dryRun,
    selectedArtists: selectedArtists.size,
    earnings: earnings.length,
    payoutRequests: payoutRequests.length,
    payoutAuditEntries: payoutAuditEntries.length,
    sourceUpdatedAt: config.updatedAt,
  };
};
