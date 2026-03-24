import { NextResponse } from "next/server";

import { probeStorageRuntime } from "@/lib/server/storage-runtime-probe";
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

  if (!hasAdminPermission(auth, "storage:view")) {
    return forbiddenResponse();
  }

  let body: {
    assetId?: string;
    bagId?: string;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const probe = await probeStorageRuntime({
    assetId: String(body.assetId ?? "").trim() || undefined,
    bagId: String(body.bagId ?? "").trim() || undefined,
  });

  return NextResponse.json({ probe });
}
