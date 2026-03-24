import { NextResponse } from "next/server";

import { runTonStorageRuntimePreflight } from "@/lib/server/storage-ton-runtime-preflight";
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

  const preflight = await runTonStorageRuntimePreflight();
  return NextResponse.json({ ok: true, preflight });
}
