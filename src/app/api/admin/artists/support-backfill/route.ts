import { NextResponse } from "next/server";

import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { runArtistSupportBackfill } from "@/lib/server/artist-support-backfill";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ArtistSupportBackfillBody {
  dryRun?: boolean;
  limit?: number;
  telegramUserIds?: number[];
}

export async function POST(request: Request) {
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

  let payload: ArtistSupportBackfillBody;

  try {
    payload = (await request.json()) as ArtistSupportBackfillBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await runArtistSupportBackfill(payload);

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 503 });
  }

  return NextResponse.json(result);
}
