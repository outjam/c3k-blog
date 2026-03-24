import { NextResponse } from "next/server";

import { buildStorageAssetLiveReadiness } from "@/lib/server/storage-live-readiness";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:manage")) {
    return forbiddenResponse();
  }

  let body: {
    assetId?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const assetId = String(body.assetId ?? "").trim();

  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const summary = await buildStorageAssetLiveReadiness({ assetId });
  return NextResponse.json({ ok: true, summary });
}
