import { NextResponse } from "next/server";

import { reverifyPointerReadyStorageBags } from "@/lib/server/storage-ton-runtime-verification";
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
    limit?: number;
    onlyUnverified?: boolean;
  } = {};

  try {
    body = (await request.json()) as typeof body;
  } catch {
    body = {};
  }

  const summary = await reverifyPointerReadyStorageBags({
    limit: body.limit,
    onlyUnverified: body.onlyUnverified,
  });

  return NextResponse.json({ ok: true, summary });
}
