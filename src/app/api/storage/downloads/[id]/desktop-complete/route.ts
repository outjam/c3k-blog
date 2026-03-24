import { NextResponse } from "next/server";

import { getStorageDeliveryRequest, updateStorageDeliveryRequest } from "@/lib/server/storage-delivery-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

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

  const canPatch =
    entry.telegramUserId === auth.telegramUserId ||
    (auth.isAdmin && hasAdminPermission(auth, "storage:view"));

  if (!canPatch) {
    return forbiddenResponse();
  }

  const payload = (await request.json().catch(() => ({}))) as {
    sourceUrl?: unknown;
  };

  const updated = await updateStorageDeliveryRequest(entry.id, {
    status: "delivered",
    deliveredAt: new Date().toISOString(),
    failureCode: "",
    failureMessage: "",
    lastDeliveredVia: "bag_http_pointer",
    lastDeliveredSourceUrl: normalizeText(payload.sourceUrl, 3000) || undefined,
  });

  return NextResponse.json({
    ok: true,
    request: updated ?? entry,
  });
}
