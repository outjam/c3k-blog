import { runArtistApplicationBackfill } from "@/lib/server/artist-application-backfill";
import { runArtistCatalogBackfill } from "@/lib/server/artist-catalog-backfill";
import { runArtistFinanceBackfill } from "@/lib/server/artist-finance-backfill";
import { readAdminMigrationStatus } from "@/lib/server/migration-status";
import { runSocialEntitlementBackfill } from "@/lib/server/social-entitlement-backfill";
import { runArtistSupportBackfill } from "@/lib/server/artist-support-backfill";

const normalizePositiveInt = (value: unknown, fallback: number, max: number): number => {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.min(parsed, max);
};

const normalizeTelegramUserIds = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const next = Array.from(
    new Set(
      value
        .map((entry) => Math.round(Number(entry ?? 0)))
        .filter((entry) => Number.isFinite(entry) && entry > 0),
    ),
  );

  return next.length > 0 ? next : undefined;
};

export interface MigrationBackfillSuiteResult {
  ok: true;
  dryRun: boolean;
  limit: number;
  domainsCompleted: number;
  domainsReady: number;
  overallState: "legacy_only" | "dual_write" | "ready";
  entitlements: Awaited<ReturnType<typeof runSocialEntitlementBackfill>> extends infer T
    ? T extends { ok: true }
      ? T
      : never
    : never;
  artistApplications: Awaited<ReturnType<typeof runArtistApplicationBackfill>> extends infer T
    ? T extends { ok: true }
      ? T
      : never
    : never;
  artistCatalog: Awaited<ReturnType<typeof runArtistCatalogBackfill>> extends infer T
    ? T extends { ok: true }
      ? T
      : never
    : never;
  artistFinance: Awaited<ReturnType<typeof runArtistFinanceBackfill>> extends infer T
    ? T extends { ok: true }
      ? T
      : never
    : never;
  artistSupport: Awaited<ReturnType<typeof runArtistSupportBackfill>> extends infer T
    ? T extends { ok: true }
      ? T
      : never
    : never;
  migrationStatus: Awaited<ReturnType<typeof readAdminMigrationStatus>>;
}

export const runMigrationBackfillSuite = async (input?: {
  dryRun?: unknown;
  limit?: unknown;
  telegramUserIds?: unknown;
}): Promise<MigrationBackfillSuiteResult | { ok: false; message: string }> => {
  const dryRun = input?.dryRun === true;
  const limit = normalizePositiveInt(input?.limit, 1000, 10000);
  const telegramUserIds = normalizeTelegramUserIds(input?.telegramUserIds);

  const entitlementResult = await runSocialEntitlementBackfill({
    dryRun,
    limit,
    telegramUserIds,
  });
  if (!entitlementResult.ok) {
    return { ok: false, message: entitlementResult.message };
  }

  const applicationResult = await runArtistApplicationBackfill({
    dryRun,
    limit,
    telegramUserIds,
  });
  if (!applicationResult.ok) {
    return { ok: false, message: applicationResult.message };
  }

  const catalogResult = await runArtistCatalogBackfill({
    dryRun,
    limit,
    telegramUserIds,
  });
  if (!catalogResult.ok) {
    return { ok: false, message: catalogResult.message };
  }

  const financeResult = await runArtistFinanceBackfill({
    dryRun,
    limit,
    telegramUserIds,
  });
  if (!financeResult.ok) {
    return { ok: false, message: financeResult.message };
  }

  const supportResult = await runArtistSupportBackfill({
    dryRun,
    limit,
    telegramUserIds,
  });
  if (!supportResult.ok) {
    return { ok: false, message: supportResult.message };
  }

  const migrationStatus = await readAdminMigrationStatus();

  return {
    ok: true,
    dryRun,
    limit,
    domainsCompleted: migrationStatus.domains.length,
    domainsReady: migrationStatus.readyDomains,
    overallState: migrationStatus.overallState,
    entitlements: entitlementResult,
    artistApplications: applicationResult,
    artistCatalog: catalogResult,
    artistFinance: financeResult,
    artistSupport: supportResult,
    migrationStatus,
  };
};
