import {
  readLegacySocialUserBackfillEntries,
  type LegacySocialUserBackfillEntry,
} from "@/lib/server/social-user-state-store";
import {
  upsertUserReleaseEntitlements,
  upsertUserReleaseNftMints,
  upsertUserTrackEntitlements,
  type UserReleaseEntitlementRecord,
  type UserReleaseNftMintRecord,
  type UserTrackEntitlementRecord,
} from "@/lib/server/social-entitlement-store";

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

const toReleaseRecords = (entry: LegacySocialUserBackfillEntry): UserReleaseEntitlementRecord[] => {
  const records = new Map<string, UserReleaseEntitlementRecord>();
  const acquiredAt = new Date().toISOString();

  entry.snapshot.purchasedReleaseSlugs.forEach((releaseSlug) => {
    const id = `release:${entry.telegramUserId}:${releaseSlug}:full`;
    if (!records.has(id)) {
      records.set(id, {
        id,
        telegramUserId: entry.telegramUserId,
        releaseSlug,
        acquiredAt,
      });
    }
  });

  entry.snapshot.purchasedReleaseFormatKeys.forEach((formatKey) => {
    const [releaseSlug = "", format = ""] = formatKey.split("::", 2);
    if (!releaseSlug || !format) {
      return;
    }

    const id = `release:${entry.telegramUserId}:${releaseSlug}:${format}`;
    if (!records.has(id)) {
      records.set(id, {
        id,
        telegramUserId: entry.telegramUserId,
        releaseSlug,
        formatKey: format,
        acquiredAt,
      });
    }
  });

  return Array.from(records.values());
};

const toTrackRecords = (entry: LegacySocialUserBackfillEntry): UserTrackEntitlementRecord[] => {
  const records = new Map<string, UserTrackEntitlementRecord>();
  const acquiredAt = new Date().toISOString();

  entry.snapshot.purchasedTrackKeys.forEach((trackKey) => {
    const [releaseSlug = "", trackId = ""] = trackKey.split("::", 2);
    if (!releaseSlug || !trackId) {
      return;
    }

    const id = `track:${entry.telegramUserId}:${releaseSlug}:${trackId}`;
    if (!records.has(id)) {
      records.set(id, {
        id,
        telegramUserId: entry.telegramUserId,
        releaseSlug,
        trackId,
        acquiredAt,
      });
    }
  });

  return Array.from(records.values());
};

const toMintRecords = (entry: LegacySocialUserBackfillEntry): UserReleaseNftMintRecord[] => {
  return entry.snapshot.mintedReleaseNfts.map((mint) => ({
    id: mint.id,
    telegramUserId: entry.telegramUserId,
    releaseSlug: mint.releaseSlug,
    ownerAddress: mint.ownerAddress,
    collectionAddress: mint.collectionAddress,
    itemAddress: mint.itemAddress,
    itemIndex: mint.itemIndex,
    txHash: mint.txHash,
    mintedAt: mint.mintedAt,
    status: mint.status,
  }));
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

export const runSocialEntitlementBackfill = async (input?: {
  telegramUserIds?: unknown;
  limit?: unknown;
  dryRun?: unknown;
}): Promise<
  | {
      ok: true;
      dryRun: boolean;
      selectedUsers: number;
      processedUsers: number;
      releaseEntitlements: number;
      trackEntitlements: number;
      nftMints: number;
      sourceUpdatedAt: string;
    }
  | {
      ok: false;
      message: string;
    }
> => {
  const dryRun = input?.dryRun === true;
  const limit = normalizePositiveInt(input?.limit, 200, 5000);
  const telegramUserIds = normalizeTelegramUserIds(input?.telegramUserIds);

  const legacy = await readLegacySocialUserBackfillEntries({
    telegramUserIds,
    limit,
  });

  if (!legacy) {
    return {
      ok: false,
      message: "Failed to read legacy social state for backfill",
    };
  }

  const releaseEntitlements = legacy.entries.flatMap((entry) => toReleaseRecords(entry));
  const trackEntitlements = legacy.entries.flatMap((entry) => toTrackRecords(entry));
  const nftMints = legacy.entries.flatMap((entry) => toMintRecords(entry));

  if (!dryRun) {
    const [releaseOk, trackOk, mintOk] = await Promise.all([
      runChunkedUpsert(releaseEntitlements, upsertUserReleaseEntitlements),
      runChunkedUpsert(trackEntitlements, upsertUserTrackEntitlements),
      runChunkedUpsert(nftMints, upsertUserReleaseNftMints),
    ]);

    if (!releaseOk || !trackOk || !mintOk) {
      return {
        ok: false,
        message: "Failed to write normalized entitlements or mint records",
      };
    }
  }

  return {
    ok: true,
    dryRun,
    selectedUsers: legacy.entries.length,
    processedUsers: legacy.entries.length,
    releaseEntitlements: releaseEntitlements.length,
    trackEntitlements: trackEntitlements.length,
    nftMints: nftMints.length,
    sourceUpdatedAt: legacy.updatedAt,
  };
};
