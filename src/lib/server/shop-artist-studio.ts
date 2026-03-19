import type {
  ArtistEarningLedgerEntry,
  ArtistPayoutAuditEntry,
  ArtistPayoutRequest,
  ArtistPayoutSummary,
  ArtistProfile,
  ArtistStudioStats,
  ArtistTrack,
  ShopAdminConfig,
} from "@/types/shop";

export const ARTIST_PAYOUT_HOLD_DAYS = 21;
export const ARTIST_PAYOUT_MIN_STARS_CENTS = 1000 * 100;

const clampMoney = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

const parseTimestamp = (value: string | undefined): number => {
  const timestamp = new Date(value ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const addArtistPayoutHold = (earnedAt: string): string => {
  const timestamp = parseTimestamp(earnedAt);
  if (!timestamp) {
    return new Date().toISOString();
  }

  return new Date(timestamp + ARTIST_PAYOUT_HOLD_DAYS * 24 * 60 * 60 * 1000).toISOString();
};

export const buildArtistStudioStats = (input: {
  tracks: ArtistTrack[];
  donationsCount: number;
  activeSubscriptionsCount: number;
  socialBySlug?: Record<string, { reactionsTotal?: number; commentsCount?: number }>;
}): ArtistStudioStats => {
  const socialBySlug = input.socialBySlug ?? {};

  const reactionsCount = input.tracks.reduce((acc, track) => {
    return acc + clampMoney(Number(socialBySlug[track.slug]?.reactionsTotal ?? 0));
  }, 0);

  const commentsCount = input.tracks.reduce((acc, track) => {
    return acc + clampMoney(Number(socialBySlug[track.slug]?.commentsCount ?? 0));
  }, 0);

  return {
    releasesCount: input.tracks.length,
    publishedReleasesCount: input.tracks.filter((track) => track.status === "published").length,
    pendingReleasesCount: input.tracks.filter((track) => track.status === "pending_moderation").length,
    draftReleasesCount: input.tracks.filter((track) => track.status === "draft").length,
    salesCount: input.tracks.reduce((acc, track) => acc + clampMoney(track.salesCount), 0),
    playsCount: input.tracks.reduce((acc, track) => acc + clampMoney(track.playsCount), 0),
    reactionsCount,
    commentsCount,
    donationsCount: clampMoney(input.donationsCount),
    activeSubscriptionsCount: clampMoney(input.activeSubscriptionsCount),
  };
};

export const buildArtistPayoutSummary = (input: {
  profile: ArtistProfile | null;
  earnings: ArtistEarningLedgerEntry[];
  requests: ArtistPayoutRequest[];
  now?: Date;
}): ArtistPayoutSummary => {
  const nowMs = (input.now ?? new Date()).getTime();
  const maturedEntries = input.earnings.filter((entry) => parseTimestamp(entry.holdUntil) <= nowMs);
  const pendingEntries = input.earnings.filter((entry) => parseTimestamp(entry.holdUntil) > nowMs);

  const maturedStarsCents = maturedEntries.reduce((acc, entry) => acc + clampMoney(entry.amountStarsCents), 0);
  const pendingHoldStarsCents = pendingEntries.reduce((acc, entry) => acc + clampMoney(entry.amountStarsCents), 0);
  const totalEarnedStarsCents = maturedStarsCents + pendingHoldStarsCents;
  const requestedStarsCents = input.requests
    .filter((entry) => entry.status === "pending_review" || entry.status === "approved")
    .reduce((acc, entry) => acc + clampMoney(entry.amountStarsCents), 0);
  const paidOutStarsCents = input.requests
    .filter((entry) => entry.status === "paid")
    .reduce((acc, entry) => acc + clampMoney(entry.amountStarsCents), 0);

  const availableStarsCents = Math.max(0, maturedStarsCents - requestedStarsCents - paidOutStarsCents);
  const currentBalanceStarsCents = Math.max(0, totalEarnedStarsCents - paidOutStarsCents);
  const nextHoldReleaseAt = pendingEntries
    .map((entry) => entry.holdUntil)
    .sort((left, right) => parseTimestamp(left) - parseTimestamp(right))[0];

  return {
    totalEarnedStarsCents,
    maturedStarsCents,
    currentBalanceStarsCents,
    availableStarsCents,
    pendingHoldStarsCents,
    requestedStarsCents,
    paidOutStarsCents,
    minimumRequestStarsCents: ARTIST_PAYOUT_MIN_STARS_CENTS,
    canRequest: Boolean(input.profile?.tonWalletAddress) && availableStarsCents >= ARTIST_PAYOUT_MIN_STARS_CENTS,
    nextHoldReleaseAt: nextHoldReleaseAt || undefined,
  };
};

export const applyArtistFinanceOverlay = (input: {
  profile: ArtistProfile | null;
  earnings: ArtistEarningLedgerEntry[];
  requests: ArtistPayoutRequest[];
  now?: Date;
}): ArtistProfile | null => {
  if (!input.profile) {
    return null;
  }

  const payoutSummary = buildArtistPayoutSummary(input);

  return {
    ...input.profile,
    balanceStarsCents: payoutSummary.currentBalanceStarsCents,
    lifetimeEarningsStarsCents: payoutSummary.totalEarnedStarsCents,
  };
};

export const syncArtistFinanceCountersInConfig = (
  config: ShopAdminConfig,
  artistTelegramUserIds?: Iterable<number>,
): ShopAdminConfig => {
  const targetIds =
    artistTelegramUserIds
      ? new Set(
          Array.from(artistTelegramUserIds)
            .map((entry) => Math.round(Number(entry ?? 0)))
            .filter((entry) => Number.isFinite(entry) && entry > 0),
        )
      : null;

  const nextProfiles = { ...config.artistProfiles };
  let changed = false;

  Object.entries(config.artistProfiles).forEach(([key, profile]) => {
    if (targetIds && !targetIds.has(profile.telegramUserId)) {
      return;
    }

    const nextProfile = applyArtistFinanceOverlay({
      profile,
      earnings: config.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === profile.telegramUserId),
      requests: config.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === profile.telegramUserId),
    });

    if (!nextProfile) {
      return;
    }

    if (
      nextProfile.balanceStarsCents !== profile.balanceStarsCents ||
      nextProfile.lifetimeEarningsStarsCents !== profile.lifetimeEarningsStarsCents
    ) {
      nextProfiles[key] = nextProfile;
      changed = true;
    }
  });

  return changed
    ? {
        ...config,
        artistProfiles: nextProfiles,
      }
    : config;
};

const mergeById = <T extends { id: string }>(
  primary: T[],
  fallback: T[],
  shouldReplace?: (current: T, incoming: T) => boolean,
): T[] => {
  const entries = new Map<string, T>();

  [...primary, ...fallback].forEach((entry) => {
    const existing = entries.get(entry.id);
    if (!existing || shouldReplace?.(existing, entry)) {
      entries.set(entry.id, entry);
    }
  });

  return Array.from(entries.values());
};

const getMutableTimestamp = (value: { updatedAt?: string; createdAt?: string }): number => {
  const timestamp = new Date(value.updatedAt || value.createdAt || "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const hydrateArtistFinanceStateInConfig = (
  config: ShopAdminConfig,
  input: {
    earnings?: ArtistEarningLedgerEntry[];
    requests?: ArtistPayoutRequest[];
    auditEntries?: ArtistPayoutAuditEntry[];
  },
): ShopAdminConfig => {
  const nextEarnings = input.earnings ? mergeById(config.artistEarningsLedger, input.earnings) : config.artistEarningsLedger;
  const nextRequests = input.requests
    ? mergeById(
        config.artistPayoutRequests,
        input.requests,
        (current, incoming) => getMutableTimestamp(incoming) > getMutableTimestamp(current),
      )
    : config.artistPayoutRequests;
  const nextAuditEntries = input.auditEntries ? mergeById(config.artistPayoutAuditLog, input.auditEntries) : config.artistPayoutAuditLog;

  if (
    nextEarnings.length === config.artistEarningsLedger.length &&
    nextRequests.length === config.artistPayoutRequests.length &&
    nextAuditEntries.length === config.artistPayoutAuditLog.length
  ) {
    return config;
  }

  return {
    ...config,
    artistEarningsLedger: nextEarnings,
    artistPayoutRequests: nextRequests,
    artistPayoutAuditLog: nextAuditEntries,
  };
};
