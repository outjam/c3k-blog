import type {
  ArtistEarningLedgerEntry,
  ArtistPayoutRequest,
  ArtistPayoutSummary,
  ArtistProfile,
  ArtistStudioStats,
  ArtistTrack,
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
  const requestedStarsCents = input.requests
    .filter((entry) => entry.status === "pending_review" || entry.status === "approved")
    .reduce((acc, entry) => acc + clampMoney(entry.amountStarsCents), 0);
  const paidOutStarsCents = input.requests
    .filter((entry) => entry.status === "paid")
    .reduce((acc, entry) => acc + clampMoney(entry.amountStarsCents), 0);

  const availableStarsCents = Math.max(0, maturedStarsCents - requestedStarsCents - paidOutStarsCents);
  const nextHoldReleaseAt = pendingEntries
    .map((entry) => entry.holdUntil)
    .sort((left, right) => parseTimestamp(left) - parseTimestamp(right))[0];

  return {
    availableStarsCents,
    pendingHoldStarsCents,
    requestedStarsCents,
    paidOutStarsCents,
    minimumRequestStarsCents: ARTIST_PAYOUT_MIN_STARS_CENTS,
    canRequest: Boolean(input.profile?.tonWalletAddress) && availableStarsCents >= ARTIST_PAYOUT_MIN_STARS_CENTS,
    nextHoldReleaseAt: nextHoldReleaseAt || undefined,
  };
};
