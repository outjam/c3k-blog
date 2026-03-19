import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { applyArtistFinanceOverlay } from "@/lib/server/shop-artist-studio";
import { upsertArtistProfiles, upsertArtistTracks } from "@/lib/server/artist-catalog-store";
import type { ArtistProfile, ArtistTrack } from "@/types/shop";

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

export const runArtistCatalogBackfill = async (input?: {
  telegramUserIds?: unknown;
  limit?: unknown;
  dryRun?: unknown;
}): Promise<
  | {
      ok: true;
      dryRun: boolean;
      selectedArtists: number;
      processedArtists: number;
      profiles: number;
      tracks: number;
      sourceUpdatedAt: string;
    }
  | {
      ok: false;
      message: string;
    }
> => {
  const dryRun = input?.dryRun === true;
  const limit = normalizePositiveInt(input?.limit, 200, 5000);
  const telegramUserIds = new Set(normalizeTelegramUserIds(input?.telegramUserIds));

  const config = await readShopAdminConfig();
  const selectedProfiles = Object.values(config.artistProfiles)
    .filter((profile) => telegramUserIds.size === 0 || telegramUserIds.has(profile.telegramUserId))
    .map(
      (profile) =>
        applyArtistFinanceOverlay({
          profile,
          earnings: config.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === profile.telegramUserId),
          requests: config.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === profile.telegramUserId),
        }) ?? profile,
    )
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, limit);

  const selectedArtistIds = new Set(selectedProfiles.map((profile) => profile.telegramUserId));
  const selectedTracks = Object.values(config.artistTracks)
    .filter((track) => selectedArtistIds.has(track.artistTelegramUserId))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());

  if (!dryRun) {
    const [profilesOk, tracksOk] = await Promise.all([
      runChunkedUpsert<ArtistProfile>(selectedProfiles, upsertArtistProfiles),
      runChunkedUpsert<ArtistTrack>(selectedTracks, upsertArtistTracks),
    ]);

    if (!profilesOk || !tracksOk) {
      return {
        ok: false,
        message: "Failed to write normalized artist profiles or tracks",
      };
    }
  }

  return {
    ok: true,
    dryRun,
    selectedArtists: selectedArtistIds.size,
    processedArtists: selectedProfiles.length,
    profiles: selectedProfiles.length,
    tracks: selectedTracks.length,
    sourceUpdatedAt: config.updatedAt,
  };
};
