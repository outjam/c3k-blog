import { NextResponse } from "next/server";

import { listStorageDeliveryRequests } from "@/lib/server/storage-delivery-store";
import { getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeLimit = (value: string | null): number => {
  const parsed = Math.round(Number(value ?? "20"));
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }

  return Math.min(100, parsed);
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const url = new URL(request.url);
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const requests = await listStorageDeliveryRequests({
    telegramUserId: auth.telegramUserId,
    limit,
  });

  return NextResponse.json({ requests });
}
