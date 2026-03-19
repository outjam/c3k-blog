import { getPostgresHttpConfig, postgresTableCount } from "@/lib/server/postgres-http";
import { readArtistApplicationSnapshot } from "@/lib/server/artist-application-store";
import { readArtistCatalogSnapshot } from "@/lib/server/artist-catalog-store";
import { readArtistFinanceSnapshot } from "@/lib/server/artist-finance-store";
import { readArtistSupportSnapshot } from "@/lib/server/artist-support-store";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { readLegacySocialUserBackfillEntries } from "@/lib/server/social-user-state-store";

type MigrationSource = "postgres" | "legacy";
type MigrationCutoverState = "legacy_only" | "dual_write" | "ready";

interface MigrationMetric {
  id: string;
  label: string;
  legacyCount: number;
  normalizedCount: number;
}

export interface AdminMigrationDomainStatus {
  id: "entitlements" | "artist_applications" | "artist_catalog" | "artist_finance" | "artist_support";
  label: string;
  source: MigrationSource;
  cutoverState: MigrationCutoverState;
  coveragePercent: number;
  legacyTotal: number;
  normalizedTotal: number;
  metrics: MigrationMetric[];
  notes: string[];
  updatedAt: string;
}

export interface AdminMigrationStatusSnapshot {
  updatedAt: string;
  postgresEnabled: boolean;
  overallState: MigrationCutoverState;
  readyDomains: number;
  inProgressDomains: number;
  legacyDomains: number;
  domains: AdminMigrationDomainStatus[];
}

const toCoveragePercent = (legacyTotal: number, normalizedTotal: number): number => {
  if (legacyTotal <= 0) {
    return 100;
  }

  const percent = Math.round((Math.min(normalizedTotal, legacyTotal) / legacyTotal) * 100);
  return Math.max(0, Math.min(100, percent));
};

const toCutoverState = (options: {
  postgresEnabled: boolean;
  source: MigrationSource;
  legacyTotal: number;
  normalizedTotal: number;
}): MigrationCutoverState => {
  if (
    options.postgresEnabled &&
    options.source === "postgres" &&
    (options.legacyTotal === 0 || options.normalizedTotal >= options.legacyTotal)
  ) {
    return "ready";
  }

  if (options.postgresEnabled && (options.source === "postgres" || options.normalizedTotal > 0)) {
    return "dual_write";
  }

  return "legacy_only";
};

const buildDomainStatus = (input: {
  id: AdminMigrationDomainStatus["id"];
  label: string;
  source: MigrationSource;
  postgresEnabled: boolean;
  metrics: MigrationMetric[];
  notes: string[];
  updatedAt: string;
}): AdminMigrationDomainStatus => {
  const legacyTotal = input.metrics.reduce((acc, metric) => acc + metric.legacyCount, 0);
  const normalizedTotal = input.metrics.reduce((acc, metric) => acc + metric.normalizedCount, 0);

  return {
    id: input.id,
    label: input.label,
    source: input.source,
    cutoverState: toCutoverState({
      postgresEnabled: input.postgresEnabled,
      source: input.source,
      legacyTotal,
      normalizedTotal,
    }),
    coveragePercent: toCoveragePercent(legacyTotal, normalizedTotal),
    legacyTotal,
    normalizedTotal,
    metrics: input.metrics,
    notes: input.notes,
    updatedAt: input.updatedAt,
  };
};

const buildNotes = (metrics: MigrationMetric[], source: MigrationSource): string[] => {
  const notes: string[] = [];

  if (source === "legacy") {
    notes.push("Read path еще зависит от legacy state.");
  } else {
    notes.push("Read path уже использует merge-store поверх Postgres.");
  }

  const laggingMetrics = metrics.filter((metric) => metric.normalizedCount < metric.legacyCount);
  if (laggingMetrics.length > 0) {
    notes.push(
      `Нужно догнать backfill: ${laggingMetrics
        .map((metric) => `${metric.label.toLowerCase()} ${metric.normalizedCount}/${metric.legacyCount}`)
        .join(" · ")}`,
    );
  } else {
    notes.push("Backfill по текущим счетчикам не отстает от legacy слоя.");
  }

  return notes;
};

const countTable = async (path: string): Promise<number | null> => {
  const count = await postgresTableCount({ path });
  return typeof count === "number" && Number.isFinite(count) && count >= 0 ? count : null;
};

export const readAdminMigrationStatus = async (): Promise<AdminMigrationStatusSnapshot> => {
  const postgresEnabled = Boolean(getPostgresHttpConfig());
  const config = await readShopAdminConfig();
  const updatedAt = config.updatedAt || new Date().toISOString();

  const [applicationsSnapshot, artistCatalogSnapshot, financeSnapshot, supportSnapshot, legacyEntitlements, releaseEntitlementsCount, trackEntitlementsCount, nftMintsCount, artistApplicationsCount, artistProfilesCount, artistTracksCount, artistEarningsCount, artistPayoutRequestsCount, artistPayoutAuditCount, artistDonationsCount, artistSubscriptionsCount] =
    await Promise.all([
      readArtistApplicationSnapshot({ config, limit: 5000 }),
      readArtistCatalogSnapshot({ config, profileLimit: 5000, trackLimit: 10000 }),
      readArtistFinanceSnapshot({
        config,
        earningsLimit: 20000,
        payoutRequestsLimit: 5000,
        payoutAuditEntriesLimit: 20000,
      }),
      readArtistSupportSnapshot({
        config,
        donationsLimit: 20000,
        subscriptionsLimit: 20000,
      }),
      readLegacySocialUserBackfillEntries({ limit: 5000 }),
      postgresEnabled ? countTable("/user_release_entitlements") : Promise.resolve(0),
      postgresEnabled ? countTable("/user_track_entitlements") : Promise.resolve(0),
      postgresEnabled ? countTable("/user_release_nft_mints") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_applications") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_profiles") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_tracks") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_earnings_ledger") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_payout_requests") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_payout_audit_log") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_donations") : Promise.resolve(0),
      postgresEnabled ? countTable("/artist_subscriptions") : Promise.resolve(0),
    ]);

  const legacyEntries = legacyEntitlements?.entries ?? [];
  const entitlementsSource: MigrationSource =
    postgresEnabled &&
    releaseEntitlementsCount !== null &&
    trackEntitlementsCount !== null &&
    nftMintsCount !== null
      ? "postgres"
      : "legacy";
  const legacyEntitlementMetrics: MigrationMetric[] = [
    {
      id: "release_entitlements",
      label: "Release entitlements",
      legacyCount: legacyEntries.reduce(
        (acc, entry) => acc + entry.snapshot.purchasedReleaseSlugs.length + entry.snapshot.purchasedReleaseFormatKeys.length,
        0,
      ),
      normalizedCount: releaseEntitlementsCount ?? 0,
    },
    {
      id: "track_entitlements",
      label: "Track entitlements",
      legacyCount: legacyEntries.reduce((acc, entry) => acc + entry.snapshot.purchasedTrackKeys.length, 0),
      normalizedCount: trackEntitlementsCount ?? 0,
    },
    {
      id: "nft_mints",
      label: "NFT mints",
      legacyCount: legacyEntries.reduce((acc, entry) => acc + entry.snapshot.mintedReleaseNfts.length, 0),
      normalizedCount: nftMintsCount ?? 0,
    },
  ];

  const domains: AdminMigrationDomainStatus[] = [
    buildDomainStatus({
      id: "entitlements",
      label: "User entitlements and NFT mint state",
      source: entitlementsSource,
      postgresEnabled,
      metrics: legacyEntitlementMetrics,
      notes: buildNotes(legacyEntitlementMetrics, entitlementsSource),
      updatedAt: legacyEntitlements?.updatedAt ?? updatedAt,
    }),
    buildDomainStatus({
      id: "artist_applications",
      label: "Artist applications",
      source: applicationsSnapshot.source,
      postgresEnabled,
      metrics: [
        {
          id: "applications",
          label: "Applications",
          legacyCount: Object.keys(config.artistApplications).length,
          normalizedCount: artistApplicationsCount ?? 0,
        },
      ],
      notes: buildNotes(
        [
          {
            id: "applications",
            label: "Applications",
            legacyCount: Object.keys(config.artistApplications).length,
            normalizedCount: artistApplicationsCount ?? 0,
          },
        ],
        applicationsSnapshot.source,
      ),
      updatedAt,
    }),
    buildDomainStatus({
      id: "artist_catalog",
      label: "Artist profiles and releases",
      source: artistCatalogSnapshot.source,
      postgresEnabled,
      metrics: [
        {
          id: "artist_profiles",
          label: "Artist profiles",
          legacyCount: Object.keys(config.artistProfiles).length,
          normalizedCount: artistProfilesCount ?? 0,
        },
        {
          id: "artist_tracks",
          label: "Artist releases",
          legacyCount: Object.keys(config.artistTracks).length,
          normalizedCount: artistTracksCount ?? 0,
        },
      ],
      notes: buildNotes(
        [
          {
            id: "artist_profiles",
            label: "Artist profiles",
            legacyCount: Object.keys(config.artistProfiles).length,
            normalizedCount: artistProfilesCount ?? 0,
          },
          {
            id: "artist_tracks",
            label: "Artist releases",
            legacyCount: Object.keys(config.artistTracks).length,
            normalizedCount: artistTracksCount ?? 0,
          },
        ],
        artistCatalogSnapshot.source,
      ),
      updatedAt,
    }),
    buildDomainStatus({
      id: "artist_finance",
      label: "Artist finance and payouts",
      source: financeSnapshot.source,
      postgresEnabled,
      metrics: [
        {
          id: "artist_earnings",
          label: "Earnings ledger",
          legacyCount: config.artistEarningsLedger.length,
          normalizedCount: artistEarningsCount ?? 0,
        },
        {
          id: "artist_payout_requests",
          label: "Payout requests",
          legacyCount: config.artistPayoutRequests.length,
          normalizedCount: artistPayoutRequestsCount ?? 0,
        },
        {
          id: "artist_payout_audit",
          label: "Payout audit",
          legacyCount: config.artistPayoutAuditLog.length,
          normalizedCount: artistPayoutAuditCount ?? 0,
        },
      ],
      notes: buildNotes(
        [
          {
            id: "artist_earnings",
            label: "Earnings ledger",
            legacyCount: config.artistEarningsLedger.length,
            normalizedCount: artistEarningsCount ?? 0,
          },
          {
            id: "artist_payout_requests",
            label: "Payout requests",
            legacyCount: config.artistPayoutRequests.length,
            normalizedCount: artistPayoutRequestsCount ?? 0,
          },
          {
            id: "artist_payout_audit",
            label: "Payout audit",
            legacyCount: config.artistPayoutAuditLog.length,
            normalizedCount: artistPayoutAuditCount ?? 0,
          },
        ],
        financeSnapshot.source,
      ),
      updatedAt,
    }),
    buildDomainStatus({
      id: "artist_support",
      label: "Artist donations and subscriptions",
      source: supportSnapshot.source,
      postgresEnabled,
      metrics: [
        {
          id: "artist_donations",
          label: "Donations",
          legacyCount: config.artistDonations.length,
          normalizedCount: artistDonationsCount ?? 0,
        },
        {
          id: "artist_subscriptions",
          label: "Subscriptions",
          legacyCount: config.artistSubscriptions.length,
          normalizedCount: artistSubscriptionsCount ?? 0,
        },
      ],
      notes: buildNotes(
        [
          {
            id: "artist_donations",
            label: "Donations",
            legacyCount: config.artistDonations.length,
            normalizedCount: artistDonationsCount ?? 0,
          },
          {
            id: "artist_subscriptions",
            label: "Subscriptions",
            legacyCount: config.artistSubscriptions.length,
            normalizedCount: artistSubscriptionsCount ?? 0,
          },
        ],
        supportSnapshot.source,
      ),
      updatedAt,
    }),
  ];

  const readyDomains = domains.filter((domain) => domain.cutoverState === "ready").length;
  const inProgressDomains = domains.filter((domain) => domain.cutoverState === "dual_write").length;
  const legacyDomains = domains.filter((domain) => domain.cutoverState === "legacy_only").length;
  const overallState: MigrationCutoverState =
    readyDomains === domains.length ? "ready" : inProgressDomains > 0 || readyDomains > 0 ? "dual_write" : "legacy_only";

  return {
    updatedAt,
    postgresEnabled,
    overallState,
    readyDomains,
    inProgressDomains,
    legacyDomains,
    domains,
  };
};
