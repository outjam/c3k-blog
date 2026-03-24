import { NextResponse } from "next/server";

import { reverifyStorageBagRuntimePointer } from "@/lib/server/storage-ton-runtime-verification";
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

  let body: { bagId?: string } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const bagId = String(body.bagId ?? "").trim();

  if (!bagId) {
    return NextResponse.json({ error: "bagId is required" }, { status: 400 });
  }

  const summary = await reverifyStorageBagRuntimePointer({ bagId });
  return NextResponse.json({ ok: true, summary });
}
