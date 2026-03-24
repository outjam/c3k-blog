import { NextResponse } from "next/server";

import { runSingleTonStorageUploadCycle } from "@/lib/server/storage-upload-worker";
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
    bagId?: string;
    jobId?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const summary = await runSingleTonStorageUploadCycle({
    assetId: String(body.assetId ?? "").trim() || undefined,
    bagId: String(body.bagId ?? "").trim() || undefined,
    jobId: String(body.jobId ?? "").trim() || undefined,
  });
  return NextResponse.json({ ok: true, summary });
}
