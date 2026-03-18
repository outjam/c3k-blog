import { NextResponse } from "next/server";

import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { buildArtistPayoutSummary, buildArtistStudioStats } from "@/lib/server/shop-artist-studio";
import { listReleaseSocialFeedSummaries } from "@/lib/server/release-social-store";
import type { ArtistApplication, ArtistProfile } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpsertArtistProfileBody {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  tonWalletAddress?: string;
  donationEnabled?: boolean;
  subscriptionEnabled?: boolean;
  subscriptionPriceStarsCents?: number;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const clampMoney = (value: unknown): number => {
  const normalized = Math.round(Number(value ?? 0));
  if (!Number.isFinite(normalized)) {
    return 1;
  }

  return Math.max(1, normalized);
};

const sortTracks = <T extends { updatedAt?: string; createdAt?: string }>(tracks: T[]): T[] => {
  return [...tracks].sort((a, b) => {
    const left = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
    const right = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
    return right - left;
  });
};

const buildLegacyApplication = (profile: ArtistProfile | null): ArtistApplication | null => {
  if (!profile || profile.status === "approved") {
    return null;
  }

  return {
    id: `artist-application-${profile.telegramUserId}`,
    telegramUserId: profile.telegramUserId,
    displayName: profile.displayName,
    bio: profile.bio,
    avatarUrl: profile.avatarUrl,
    coverUrl: profile.coverUrl,
    tonWalletAddress: profile.tonWalletAddress,
    referenceLinks: [],
    note: undefined,
    status: profile.status === "rejected" ? "rejected" : "pending",
    moderationNote: profile.moderationNote,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    reviewedAt: profile.updatedAt,
  };
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const config = await readShopAdminConfig();
  const profile = config.artistProfiles[String(auth.telegramUserId)] ?? null;
  const application =
    config.artistApplications[String(auth.telegramUserId)] ?? buildLegacyApplication(profile);
  const tracks = sortTracks(
    Object.values(config.artistTracks).filter((track) => track.artistTelegramUserId === auth.telegramUserId),
  );
  const donations = config.artistDonations.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId).length;
  const subscriptions = config.artistSubscriptions.filter(
    (entry) => entry.artistTelegramUserId === auth.telegramUserId && entry.status === "active",
  ).length;
  const socialBySlug = await listReleaseSocialFeedSummaries(tracks.map((track) => track.slug));
  const studioStats = buildArtistStudioStats({
    tracks,
    donationsCount: donations,
    activeSubscriptionsCount: subscriptions,
    socialBySlug,
  });
  const payoutRequests = config.artistPayoutRequests.filter(
    (entry) => entry.artistTelegramUserId === auth.telegramUserId,
  );
  const payoutSummary = buildArtistPayoutSummary({
    profile,
    earnings: config.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId),
    requests: payoutRequests,
  });

  return NextResponse.json({
    application,
    profile,
    tracks,
    donations,
    subscriptions,
    studioStats,
    payoutSummary,
    payoutRequests,
  });
}

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: UpsertArtistProfileBody;

  try {
    payload = (await request.json()) as UpsertArtistProfileBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const displayName = normalizeText(payload.displayName || auth.firstName || auth.username || "", 120);
  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const existing = current.artistProfiles[String(auth.telegramUserId)];
    if (!existing) {
      throw new Error("artist_application_required");
    }
    const nextStatus: ArtistProfile["status"] =
      existing?.status === "approved" || existing?.status === "suspended" ? existing.status : "pending";
    const slugBase = normalizeSlug(`${displayName}-${auth.telegramUserId}`) || `artist-${auth.telegramUserId}`;

    const profile: ArtistProfile = {
      telegramUserId: auth.telegramUserId,
      slug: existing?.slug || slugBase,
      displayName,
      bio: normalizeText(payload.bio ?? existing?.bio, 1200),
      avatarUrl: normalizeOptionalText(payload.avatarUrl ?? existing?.avatarUrl, 3000),
      coverUrl: normalizeOptionalText(payload.coverUrl ?? existing?.coverUrl, 3000),
      tonWalletAddress: normalizeOptionalText(payload.tonWalletAddress ?? existing?.tonWalletAddress, 128),
      status: nextStatus,
      moderationNote: existing?.moderationNote,
      donationEnabled:
        typeof payload.donationEnabled === "boolean" ? payload.donationEnabled : (existing?.donationEnabled ?? true),
      subscriptionEnabled:
        typeof payload.subscriptionEnabled === "boolean"
          ? payload.subscriptionEnabled
          : (existing?.subscriptionEnabled ?? false),
      subscriptionPriceStarsCents:
        payload.subscriptionPriceStarsCents !== undefined
          ? clampMoney(payload.subscriptionPriceStarsCents)
          : (existing?.subscriptionPriceStarsCents ?? 100),
      balanceStarsCents: existing?.balanceStarsCents ?? 0,
      lifetimeEarningsStarsCents: existing?.lifetimeEarningsStarsCents ?? 0,
      followersCount: existing?.followersCount ?? 0,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    return {
      ...current,
      artistProfiles: {
        ...current.artistProfiles,
        [String(auth.telegramUserId)]: profile,
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "artist_application_required") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    return NextResponse.json({ error: "Сначала подайте и подтвердите заявку артиста." }, { status: 409 });
  }

  return NextResponse.json({
    profile: updated.artistProfiles[String(auth.telegramUserId)] ?? null,
  });
}
