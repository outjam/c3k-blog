import { NextResponse } from "next/server";

import { buildStorageProgramSnapshot } from "@/lib/server/storage-registry-store";
import { getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const snapshot = await buildStorageProgramSnapshot(auth.telegramUserId);
  return NextResponse.json(snapshot);
}
