import { NextResponse } from "next/server";

import { syncStorageAssetsForArtistTracks } from "@/lib/server/storage-asset-sync";
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
  const config = await readShopAdminConfig();
  const tracks = Object.values(config.artistTracks)
    .filter((track) => (trackId ? track.id === trackId : true))
    .sort((left, right) => left.title.localeCompare(right.title, "ru-RU"));

  if (trackId && tracks.length === 0) {
    return NextResponse.json({ error: "Track not found" }, { status: 404 });
  }

  const summaries = await syncStorageAssetsForArtistTracks(tracks);

  return NextResponse.json({
    ok: true,
    syncedTracks: summaries.length,
    summaries,
  });
}
