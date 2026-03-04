import { NextResponse } from "next/server";

import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistProfile } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpsertArtistProfileBody {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
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

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const config = await readShopAdminConfig();
  const profile = config.artistProfiles[String(auth.telegramUserId)] ?? null;
  const tracks = sortTracks(
    Object.values(config.artistTracks).filter((track) => track.artistTelegramUserId === auth.telegramUserId),
  );
  const donations = config.artistDonations.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId).length;
  const subscriptions = config.artistSubscriptions.filter(
    (entry) => entry.artistTelegramUserId === auth.telegramUserId && entry.status === "active",
  ).length;

  return NextResponse.json({
    profile,
    tracks,
    donations,
    subscriptions,
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
  });

  return NextResponse.json({
    profile: updated.artistProfiles[String(auth.telegramUserId)] ?? null,
  });
}
