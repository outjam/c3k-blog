import { NextResponse } from "next/server";

import { getStorageDeliveryRequest } from "@/lib/server/storage-delivery-store";
import { retryStorageDeliveryRequest } from "@/lib/server/storage-delivery";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const entry = await getStorageDeliveryRequest(id);

  if (!entry) {
    return NextResponse.json({ error: "Delivery request not found" }, { status: 404 });
  }

  const canView =
    entry.telegramUserId === auth.telegramUserId ||
    (auth.isAdmin && hasAdminPermission(auth, "storage:view"));

  if (!canView) {
    return forbiddenResponse();
  }

  return NextResponse.json({ request: entry });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const { id } = await context.params;
  const entry = await getStorageDeliveryRequest(id);

  if (!entry) {
    return NextResponse.json({ error: "Delivery request not found" }, { status: 404 });
  }

  const canRetry =
    entry.telegramUserId === auth.telegramUserId ||
    (auth.isAdmin && hasAdminPermission(auth, "storage:view"));

  if (!canRetry) {
    return forbiddenResponse();
  }

  const publicBaseUrl = new URL(request.url).origin;
  const result = await retryStorageDeliveryRequest({
    telegramUserId: entry.telegramUserId,
    requestId: entry.id,
    publicBaseUrl,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        request: result.request ?? entry,
        reason: result.reason,
        message: result.message,
        error: result.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    request: result.request,
    message: result.message,
  });
}
