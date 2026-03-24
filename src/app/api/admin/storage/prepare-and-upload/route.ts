import { NextResponse } from "next/server";

import { runPrepareAndUploadStorageAssetCycle } from "@/lib/server/storage-upload-worker";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
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

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let body: {
    assetId?: string;
    mode?: string;
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

  const mode = body.mode === "test_prepare" ? "test_prepare" : "tonstorage_testnet";
  const result = await runPrepareAndUploadStorageAssetCycle({
    assetId,
    mode,
    requestedByTelegramUserId: auth.telegramUserId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, summary: result.summary });
}
