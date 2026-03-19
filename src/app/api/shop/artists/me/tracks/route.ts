import { NextResponse } from "next/server";

import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { readArtistCatalogSnapshot, hydrateArtistCatalogStateInConfig, upsertArtistTracks } from "@/lib/server/artist-catalog-store";
import { syncStorageAssetsForArtistTrack } from "@/lib/server/storage-asset-sync";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistTrack } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateTrackBody {
  title?: string;
  releaseType?: ArtistTrack["releaseType"];
  subtitle?: string;
  description?: string;
  coverImage?: string;
  audioFileId?: string;
  previewUrl?: string;
  durationSec?: number;
  genre?: string;
  tags?: string[];
  priceStarsCents?: number;
  formats?: ArtistTrack["formats"];
  releaseTracklist?: ArtistTrack["releaseTracklist"];
  isMintable?: boolean;
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

const normalizeReleaseType = (value: unknown): ArtistTrack["releaseType"] => {
  return value === "ep" || value === "album" ? value : "single";
};

const normalizeFormat = (value: unknown): ArtistTrack["formats"][number]["format"] => {
  return value === "aac" || value === "flac" || value === "wav" || value === "alac" || value === "ogg" ? value : "mp3";
};

const normalizeFormats = (
  value: unknown,
  fallbackAudioFileId: string,
  fallbackPriceStarsCents: number,
): ArtistTrack["formats"] => {
  const fromArray = Array.isArray(value)
    ? value
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const source = entry as Partial<ArtistTrack["formats"][number]>;
          const audioFileId = normalizeText(source.audioFileId, 1024);
          if (!audioFileId) {
            return null;
          }

          return {
            format: normalizeFormat(source.format),
            audioFileId,
            priceStarsCents: clampNumber(source.priceStarsCents, 1, 200000),
            label: normalizeOptionalText(source.label, 64),
            isDefault: Boolean(source.isDefault),
          } satisfies ArtistTrack["formats"][number];
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .slice(0, 8)
    : [];

  const uniqueByFormat = new Map<string, ArtistTrack["formats"][number]>();
  for (const item of fromArray) {
    uniqueByFormat.set(item.format, item);
  }

  const normalized = Array.from(uniqueByFormat.values());
  if (normalized.length === 0) {
    return [
      {
        format: "mp3",
        audioFileId: fallbackAudioFileId,
        priceStarsCents: fallbackPriceStarsCents,
        label: "MP3",
        isDefault: true,
      },
    ];
  }

  if (!normalized.some((item) => item.isDefault)) {
    normalized[0] = { ...normalized[0], isDefault: true };
  }

  return normalized;
};

const normalizeReleaseTracklist = (value: unknown, fallbackTitle: string): ArtistTrack["releaseTracklist"] => {
  const fromArray = Array.isArray(value)
    ? value
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const source = entry as Partial<ArtistTrack["releaseTracklist"][number]>;
          const title = normalizeText(source.title, 180);
          if (!title) {
            return null;
          }

          const id = normalizeSafeId(source.id ?? `track-${index + 1}`, 80) || `track-${index + 1}`;
          return {
            id,
            title,
            durationSec:
              typeof source.durationSec === "number" && Number.isFinite(source.durationSec)
                ? clampNumber(source.durationSec, 0, 60 * 60 * 12)
                : undefined,
            previewUrl: normalizeOptionalText(source.previewUrl, 3000),
            priceStarsCents:
              typeof source.priceStarsCents === "number" && Number.isFinite(source.priceStarsCents)
                ? clampNumber(source.priceStarsCents, 1, 200000)
                : undefined,
            position:
              typeof source.position === "number" && Number.isFinite(source.position)
                ? clampNumber(source.position, 1, 999)
                : index + 1,
          } satisfies ArtistTrack["releaseTracklist"][number];
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .slice(0, 50)
    : [];

  if (fromArray.length > 0) {
    return fromArray
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "ru-RU"))
      .map((entry, index) => ({ ...entry, position: index + 1 }));
  }

  return [
    {
      id: "track-1",
      title: fallbackTitle,
      position: 1,
    },
  ];
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
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    artistTelegramUserId: auth.telegramUserId,
  });
  const tracks = artistCatalog.tracks;

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
  const releaseType = normalizeReleaseType(payload.releaseType);
  const fallbackPrice = clampNumber(payload.priceStarsCents, 1, 200000);
  const formats = normalizeFormats(payload.formats, audioFileId, fallbackPrice);
  const defaultFormat = formats.find((item) => item.isDefault) ?? formats[0];
  const releaseTracklist = normalizeReleaseTracklist(payload.releaseTracklist, title);

  const config = await readShopAdminConfig();
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    artistTelegramUserId: auth.telegramUserId,
    profileLimit: 1,
    trackLimit: 1,
  });
  const fallbackProfile = artistCatalog.profiles[0] ?? null;
  const updated = await mutateShopAdminConfig((current) => {
    const hydratedCurrent = hydrateArtistCatalogStateInConfig(current, {
      profiles: fallbackProfile ? [fallbackProfile] : [],
    });
    const artistProfile = hydratedCurrent.artistProfiles[String(auth.telegramUserId)] ?? fallbackProfile;

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
      releaseType,
      subtitle: normalizeText(payload.subtitle, 220) || "Сингл",
      description: normalizeText(payload.description, 5000),
      coverImage: normalizeText(payload.coverImage, 3000) || "/posts/cover-pattern.svg",
      formats,
      releaseTracklist,
      audioFileId: defaultFormat.audioFileId,
      previewUrl: normalizeOptionalText(payload.previewUrl, 3000),
      durationSec: clampNumber(payload.durationSec, 0, 60 * 60 * 12),
      genre: normalizeOptionalText(payload.genre, 64),
      tags: normalizeTags(payload.tags),
      priceStarsCents: defaultFormat.priceStarsCents,
      isMintable: payload.isMintable !== false,
      status: "pending_moderation",
      moderationNote: undefined,
      playsCount: 0,
      salesCount: 0,
      createdAt: now,
      updatedAt: now,
      publishedAt: undefined,
    };

    return {
      ...hydratedCurrent,
      artistTracks: {
        ...hydratedCurrent.artistTracks,
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
  if (created) {
    await upsertArtistTracks([created]).catch(() => undefined);
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

  if (created) {
    try {
      const summary = await syncStorageAssetsForArtistTrack(created);
      storageSync = { ok: true, summary };
    } catch (error) {
      storageSync = {
        ok: false,
        error: error instanceof Error ? error.message : "storage_sync_failed",
      };
    }
  }

  return NextResponse.json({ track: created ?? null, storageSync });
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
  const config = await readShopAdminConfig();
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    trackId,
    profileLimit: 1,
    trackLimit: 1,
  });
  const fallbackTrack =
    artistCatalog.tracks.find((entry) => entry.id === trackId && entry.artistTelegramUserId === auth.telegramUserId) ?? null;

  const updated = await mutateShopAdminConfig((current) => {
    const hydratedCurrent = hydrateArtistCatalogStateInConfig(current, {
      profiles: artistCatalog.profiles,
      tracks: fallbackTrack ? [fallbackTrack] : [],
    });
    const existing = hydratedCurrent.artistTracks[trackId] ?? fallbackTrack;

    if (!existing || existing.artistTelegramUserId !== auth.telegramUserId) {
      throw new Error("track_not_found");
    }

    const next: ArtistTrack = {
      ...existing,
      title: payload.title !== undefined ? normalizeText(payload.title, 160) || existing.title : existing.title,
      releaseType: payload.releaseType !== undefined ? normalizeReleaseType(payload.releaseType) : existing.releaseType,
      subtitle: payload.subtitle !== undefined ? normalizeText(payload.subtitle, 220) || existing.subtitle : existing.subtitle,
      description: payload.description !== undefined ? normalizeText(payload.description, 5000) : existing.description,
      coverImage: payload.coverImage !== undefined ? normalizeText(payload.coverImage, 3000) || existing.coverImage : existing.coverImage,
      audioFileId: payload.audioFileId !== undefined ? normalizeText(payload.audioFileId, 1024) || existing.audioFileId : existing.audioFileId,
      previewUrl: payload.previewUrl !== undefined ? normalizeOptionalText(payload.previewUrl, 3000) : existing.previewUrl,
      durationSec: payload.durationSec !== undefined ? clampNumber(payload.durationSec, 0, 60 * 60 * 12) : existing.durationSec,
      genre: payload.genre !== undefined ? normalizeOptionalText(payload.genre, 64) : existing.genre,
      tags: payload.tags !== undefined ? normalizeTags(payload.tags) : existing.tags,
      isMintable: payload.isMintable !== undefined ? payload.isMintable !== false : existing.isMintable,
      status: existing.status === "published" ? "pending_moderation" : existing.status,
      moderationNote: undefined,
      updatedAt: now,
      publishedAt: existing.status === "published" ? undefined : existing.publishedAt,
    };

    const fallbackPrice = payload.priceStarsCents !== undefined
      ? clampNumber(payload.priceStarsCents, 1, 200000)
      : next.priceStarsCents;
    const fallbackAudio = next.audioFileId;
    const nextFormats = payload.formats !== undefined
      ? normalizeFormats(payload.formats, fallbackAudio, fallbackPrice)
      : existing.formats;
    const defaultFormat = nextFormats.find((item) => item.isDefault) ?? nextFormats[0];

    next.formats = nextFormats;
    next.audioFileId = defaultFormat.audioFileId;
    next.priceStarsCents = defaultFormat.priceStarsCents;
    next.releaseTracklist = payload.releaseTracklist !== undefined
      ? normalizeReleaseTracklist(payload.releaseTracklist, next.title)
      : existing.releaseTracklist;

    return {
      ...hydratedCurrent,
      artistTracks: {
        ...hydratedCurrent.artistTracks,
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

  return NextResponse.json({ track: nextTrack, storageSync });
}
