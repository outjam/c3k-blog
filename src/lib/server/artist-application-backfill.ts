import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { upsertArtistApplications } from "@/lib/server/artist-application-store";
import type { ArtistApplication } from "@/types/shop";

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

export const runArtistApplicationBackfill = async (input?: {
  telegramUserIds?: unknown;
  limit?: unknown;
  dryRun?: unknown;
}): Promise<
  | {
      ok: true;
      dryRun: boolean;
      selectedUsers: number;
      applications: number;
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
  const applications = Object.values(config.artistApplications)
    .filter((entry) => telegramUserIds.size === 0 || telegramUserIds.has(entry.telegramUserId))
    .sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime())
    .slice(0, limit);

  if (!dryRun) {
    const applicationsOk = await runChunkedUpsert<ArtistApplication>(applications, upsertArtistApplications);

    if (!applicationsOk) {
      return {
        ok: false,
        message: "Failed to write normalized artist applications",
      };
    }
  }

  return {
    ok: true,
    dryRun,
    selectedUsers: new Set(applications.map((entry) => entry.telegramUserId)).size,
    applications: applications.length,
    sourceUpdatedAt: config.updatedAt,
  };
};
