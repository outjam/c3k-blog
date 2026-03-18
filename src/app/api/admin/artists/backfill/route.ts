import { NextResponse } from "next/server";

import { runArtistCatalogBackfill } from "@/lib/server/artist-catalog-backfill";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BackfillBody {
  dryRun?: unknown;
  limit?: unknown;
  telegramUserIds?: unknown;
}

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "settings:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: BackfillBody;

  try {
    payload = (await request.json()) as BackfillBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await runArtistCatalogBackfill({
    dryRun: payload.dryRun,
    limit: payload.limit,
    telegramUserIds: payload.telegramUserIds,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 502 });
  }

  return NextResponse.json(result);
}
