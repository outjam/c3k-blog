import { NextResponse } from "next/server";

import { getStorageDeliveryRequest } from "@/lib/server/storage-delivery-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
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
