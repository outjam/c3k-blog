import { NextResponse } from "next/server";

import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistTrack } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateTrackBody {
  title?: string;
  subtitle?: string;
  description?: string;
  coverImage?: string;
  audioFileId?: string;
  previewUrl?: string;
  durationSec?: number;
  genre?: string;
  tags?: string[];
  priceStarsCents?: number;
}

interface PatchTrackBody extends CreateTrackBody {
  trackId?: string;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
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

const clampNumber = (value: unknown, min: number, max: number): number => {
  const normalized = Math.round(Number(value ?? min));
  if (!Number.isFinite(normalized)) {
    return min;
  }

  return Math.max(min, Math.min(max, normalized));
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => normalizeText(item, 32))
    .filter(Boolean)
    .slice(0, 20);
};

const createTrackId = (): string => {
  return `trk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const config = await readShopAdminConfig();
  const tracks = Object.values(config.artistTracks)
    .filter((track) => track.artistTelegramUserId === auth.telegramUserId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

  return NextResponse.json({ tracks });
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

  let payload: CreateTrackBody;

  try {
    payload = (await request.json()) as CreateTrackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = normalizeText(payload.title, 160);
  const audioFileId = normalizeText(payload.audioFileId, 1024);

  if (!title || !audioFileId) {
    return NextResponse.json({ error: "title and audioFileId are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const createdTrackId = createTrackId();

  const updated = await mutateShopAdminConfig((current) => {
    const artistProfile = current.artistProfiles[String(auth.telegramUserId)];

    if (!artistProfile) {
      throw new Error("artist_profile_required");
    }

    const trackId = normalizeSafeId(createdTrackId, 80) || createdTrackId;
    const slug = normalizeSlug(`${title}-${trackId}`) || trackId;

    const track: ArtistTrack = {
      id: trackId,
      slug,
      artistTelegramUserId: auth.telegramUserId,
      title,
      subtitle: normalizeText(payload.subtitle, 220) || "Сингл",
      description: normalizeText(payload.description, 5000),
      coverImage: normalizeText(payload.coverImage, 3000) || "/posts/cover-pattern.svg",
      audioFileId,
      previewUrl: normalizeOptionalText(payload.previewUrl, 3000),
      durationSec: clampNumber(payload.durationSec, 0, 60 * 60 * 12),
      genre: normalizeOptionalText(payload.genre, 64),
      tags: normalizeTags(payload.tags),
      priceStarsCents: clampNumber(payload.priceStarsCents, 1, 200000),
      status: "pending_moderation",
      moderationNote: undefined,
      playsCount: 0,
      salesCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    };

    return {
      ...current,
      artistTracks: {
        ...current.artistTracks,
        [trackId]: track,
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "artist_profile_required") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    if (updated === "artist_profile_required") {
      return NextResponse.json({ error: "Create artist profile first" }, { status: 409 });
    }

    return NextResponse.json({ error: "Failed to create track" }, { status: 500 });
  }

  const created = Object.values(updated.artistTracks)
    .filter((track) => track.artistTelegramUserId === auth.telegramUserId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return NextResponse.json({ track: created ?? null });
}

export async function PATCH(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: PatchTrackBody;

  try {
    payload = (await request.json()) as PatchTrackBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trackId = normalizeSafeId(payload.trackId, 80);
  if (!trackId) {
    return NextResponse.json({ error: "trackId is required" }, { status: 400 });
  }

  const now = new Date().toISOString();

  const updated = await mutateShopAdminConfig((current) => {
    const existing = current.artistTracks[trackId];

    if (!existing || existing.artistTelegramUserId !== auth.telegramUserId) {
      throw new Error("track_not_found");
    }

    const next: ArtistTrack = {
      ...existing,
      title: payload.title !== undefined ? normalizeText(payload.title, 160) || existing.title : existing.title,
      subtitle: payload.subtitle !== undefined ? normalizeText(payload.subtitle, 220) || existing.subtitle : existing.subtitle,
      description: payload.description !== undefined ? normalizeText(payload.description, 5000) : existing.description,
      coverImage: payload.coverImage !== undefined ? normalizeText(payload.coverImage, 3000) || existing.coverImage : existing.coverImage,
      audioFileId: payload.audioFileId !== undefined ? normalizeText(payload.audioFileId, 1024) || existing.audioFileId : existing.audioFileId,
      previewUrl: payload.previewUrl !== undefined ? normalizeOptionalText(payload.previewUrl, 3000) : existing.previewUrl,
      durationSec: payload.durationSec !== undefined ? clampNumber(payload.durationSec, 0, 60 * 60 * 12) : existing.durationSec,
      genre: payload.genre !== undefined ? normalizeOptionalText(payload.genre, 64) : existing.genre,
      tags: payload.tags !== undefined ? normalizeTags(payload.tags) : existing.tags,
      priceStarsCents:
        payload.priceStarsCents !== undefined ? clampNumber(payload.priceStarsCents, 1, 200000) : existing.priceStarsCents,
      status: existing.status === "published" ? "pending_moderation" : existing.status,
      moderationNote: undefined,
      updatedAt: now,
      publishedAt: existing.status === "published" ? undefined : existing.publishedAt,
    };

    return {
      ...current,
      artistTracks: {
        ...current.artistTracks,
        [trackId]: next,
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "track_not_found") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    if (updated === "track_not_found") {
      return NextResponse.json({ error: "Track not found" }, { status: 404 });
    }

    return NextResponse.json({ error: "Failed to update track" }, { status: 500 });
  }

  return NextResponse.json({ track: updated.artistTracks[trackId] ?? null });
}
