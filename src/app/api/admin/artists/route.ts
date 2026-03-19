import { NextResponse } from "next/server";

import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { readArtistCatalogSnapshot, upsertArtistProfiles, upsertArtistTracks } from "@/lib/server/artist-catalog-store";
import { readArtistFinanceSnapshot } from "@/lib/server/artist-finance-store";
import { applyArtistFinanceOverlay } from "@/lib/server/shop-artist-studio";
import { syncStorageAssetsForArtistTrack } from "@/lib/server/storage-asset-sync";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistProfile, ArtistTrack } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ProfileModerationBody {
  telegramUserId?: number;
  status?: ArtistProfile["status"];
  moderationNote?: string;
}

interface TrackModerationBody {
  trackId?: string;
  status?: ArtistTrack["status"];
  moderationNote?: string;
}

const normalizeTelegramUserId = (value: unknown): number => {
  const normalized = Math.round(Number(value ?? 0));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
};

const normalizeTrackId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const normalizeModerationNote = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim().slice(0, 240);
  return normalized || undefined;
};

const normalizeProfileStatus = (value: unknown): ArtistProfile["status"] | null => {
  if (value === "pending" || value === "approved" || value === "rejected" || value === "suspended") {
    return value;
  }

  return null;
};

const normalizeTrackStatus = (value: unknown): ArtistTrack["status"] | null => {
  if (value === "draft" || value === "pending_moderation" || value === "published" || value === "rejected") {
    return value;
  }

  return null;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "artists:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();
  const [artistCatalog, finance] = await Promise.all([
    readArtistCatalogSnapshot({ config }),
    readArtistFinanceSnapshot({
      config,
      earningsLimit: 20000,
      payoutRequestsLimit: 5000,
      payoutAuditEntriesLimit: 20000,
    }),
  ]);
  const profiles = artistCatalog.profiles.map((profile) =>
    applyArtistFinanceOverlay({
      profile,
      earnings: finance.earnings.filter((entry) => entry.artistTelegramUserId === profile.telegramUserId),
      requests: finance.payoutRequests.filter((entry) => entry.artistTelegramUserId === profile.telegramUserId),
    }) ?? profile,
  );
  const tracks = artistCatalog.tracks;

  return NextResponse.json({ profiles, tracks, source: artistCatalog.source });
}

export async function PATCH(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "artists:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: ProfileModerationBody;

  try {
    payload = (await request.json()) as ProfileModerationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = normalizeTelegramUserId(payload.telegramUserId);
  const status = normalizeProfileStatus(payload.status);
  const moderationNote = normalizeModerationNote(payload.moderationNote);

  if (!telegramUserId || !status) {
    return NextResponse.json({ error: "telegramUserId and valid status are required" }, { status: 400 });
  }

  const config = await readShopAdminConfig();
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    artistTelegramUserId: telegramUserId,
    profileLimit: 1,
    trackLimit: 1,
  });
  const fallbackProfile = artistCatalog.profiles[0] ?? null;
  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const currentProfile = current.artistProfiles[String(telegramUserId)] ?? fallbackProfile;

    if (!currentProfile) {
      throw new Error("profile_not_found");
    }

    const profile: ArtistProfile = {
      ...currentProfile,
      status,
      moderationNote,
      updatedAt: now,
    };

    return {
      ...current,
      artistProfiles: {
        ...current.artistProfiles,
        [String(telegramUserId)]: profile,
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "profile_not_found") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    if (updated === "profile_not_found") {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }

  const nextProfile = updated.artistProfiles[String(telegramUserId)] ?? fallbackProfile;
  const normalizedProfile = nextProfile
    ? applyArtistFinanceOverlay({
        profile: nextProfile,
        earnings: updated.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === telegramUserId),
        requests: updated.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === telegramUserId),
      }) ?? nextProfile
    : null;
  if (normalizedProfile) {
    await upsertArtistProfiles([normalizedProfile]).catch(() => undefined);
  }

  return NextResponse.json({
    profile: normalizedProfile,
  });
}

export async function PUT(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "artists:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: TrackModerationBody;

  try {
    payload = (await request.json()) as TrackModerationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trackId = normalizeTrackId(payload.trackId);
  const status = normalizeTrackStatus(payload.status);
  const moderationNote = normalizeModerationNote(payload.moderationNote);

  if (!trackId || !status) {
    return NextResponse.json({ error: "trackId and valid status are required" }, { status: 400 });
  }

  const config = await readShopAdminConfig();
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    trackId,
    profileLimit: 1,
    trackLimit: 1,
  });
  const fallbackTrack = artistCatalog.tracks[0] ?? null;
  const fallbackProfile = artistCatalog.profiles[0] ?? null;
  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const track = current.artistTracks[trackId] ?? fallbackTrack;

    if (!track) {
      throw new Error("track_not_found");
    }

    const profile = current.artistProfiles[String(track.artistTelegramUserId)] ?? fallbackProfile;

    if (!profile) {
      throw new Error("profile_not_found");
    }

    if (status === "published" && profile.status !== "approved") {
      throw new Error("profile_not_approved");
    }

    const nextTrack: ArtistTrack = {
      ...track,
      status,
      moderationNote,
      updatedAt: now,
      publishedAt: status === "published" ? now : undefined,
    };

    return {
      ...current,
      artistTracks: {
        ...current.artistTracks,
        [trackId]: nextTrack,
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";

    if (
      message === "track_not_found" ||
      message === "profile_not_found" ||
      message === "profile_not_approved"
    ) {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    if (updated === "track_not_found") {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    if (updated === "profile_not_found") {
      return NextResponse.json({ error: "Artist profile not found" }, { status: 404 });
    }

    if (updated === "profile_not_approved") {
      return NextResponse.json({ error: "Artist profile must be approved before publish" }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to update track" }, { status: 500 });
  }

  const nextTrack = updated.artistTracks[trackId] ?? null;
  if (nextTrack) {
    await upsertArtistTracks([nextTrack]).catch(() => undefined);
  }

  let storageSync:
    | {
        ok: true;
        summary: Awaited<ReturnType<typeof syncStorageAssetsForArtistTrack>>;
      }
    | {
        ok: false;
        error: string;
      }
    | null = null;

  if (nextTrack) {
    try {
      const summary = await syncStorageAssetsForArtistTrack(nextTrack);
      storageSync = { ok: true, summary };
    } catch (error) {
      storageSync = {
        ok: false,
        error: error instanceof Error ? error.message : "storage_sync_failed",
      };
    }
  }

  return NextResponse.json({
    track: nextTrack,
    storageSync,
  });
}
