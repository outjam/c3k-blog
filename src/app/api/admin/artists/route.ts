import { NextResponse } from "next/server";

import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
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
  const profiles = Object.values(config.artistProfiles).sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
  const tracks = Object.values(config.artistTracks).sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });

  return NextResponse.json({ profiles, tracks });
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

  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const currentProfile = current.artistProfiles[String(telegramUserId)];

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

  return NextResponse.json({
    profile: updated.artistProfiles[String(telegramUserId)] ?? null,
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

  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const track = current.artistTracks[trackId];

    if (!track) {
      throw new Error("track_not_found");
    }

    const profile = current.artistProfiles[String(track.artistTelegramUserId)];

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
