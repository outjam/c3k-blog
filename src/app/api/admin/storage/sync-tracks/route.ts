import { NextResponse } from "next/server";

import { readArtistCatalogSnapshot } from "@/lib/server/artist-catalog-store";
import { syncStorageAssetsForArtistTrack } from "@/lib/server/storage-asset-sync";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SyncTracksBody {
  trackId?: unknown;
  cursorTrackId?: unknown;
  limit?: unknown;
}

const normalizeTrackId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const normalizeLimit = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 40));

  if (!Number.isFinite(parsed)) {
    return 40;
  }

  return Math.max(1, Math.min(50, parsed));
};

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: SyncTracksBody;

  try {
    payload = (await request.json()) as SyncTracksBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const trackId = normalizeTrackId(payload.trackId);
  const cursorTrackId = normalizeTrackId(payload.cursorTrackId);
  const limit = trackId ? 1 : normalizeLimit(payload.limit);
  const config = await readShopAdminConfig();
  const snapshot = await readArtistCatalogSnapshot({
    config,
    trackId: trackId || undefined,
    trackLimit: trackId ? 1 : 10000,
    profileLimit: trackId ? 1 : 5000,
  });
  const tracks = snapshot.tracks.sort((left, right) => {
    return left.title.localeCompare(right.title, "ru-RU") || left.id.localeCompare(right.id, "ru-RU");
  });

  if (trackId && tracks.length === 0) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const totalCandidateTracks = tracks.length;
  const startIndex =
    !trackId && cursorTrackId
      ? Math.max(
          0,
          tracks.findIndex((entry) => entry.id === cursorTrackId) + 1,
        )
      : 0;
  const selectedTracks = trackId ? tracks : tracks.slice(startIndex, startIndex + limit);
  const summaries: Array<{
    trackId: string;
    releaseSlug: string;
    upsertedAssetIds: string[];
    deletedAssetIds: string[];
    skippedDeleteAssetIds: string[];
    desiredAssetCount: number;
    error?: string;
  }> = [];

  for (const track of selectedTracks) {
    try {
      const summary = await syncStorageAssetsForArtistTrack(track);
      summaries.push(summary);
    } catch (error) {
      summaries.push({
        trackId: track.id,
        releaseSlug: track.slug,
        upsertedAssetIds: [],
        deletedAssetIds: [],
        skippedDeleteAssetIds: [],
        desiredAssetCount: 0,
        error: error instanceof Error ? error.message : "storage_sync_failed",
      });
    }
  }

  const processedTracks = selectedTracks.length;
  const failedTracks = summaries.filter((entry) => Boolean(entry.error)).length;
  const nextCursorTrackId =
    !trackId && processedTracks > 0 ? selectedTracks[processedTracks - 1]?.id ?? null : null;
  const remainingTracks = Math.max(0, totalCandidateTracks - startIndex - processedTracks);

  return NextResponse.json({
    ok: failedTracks === 0,
    processedTracks,
    syncedTracks: summaries.filter((entry) => !entry.error).length,
    failedTracks,
    totalCandidateTracks,
    remainingTracks,
    nextCursorTrackId,
    summaries,
  });
}
