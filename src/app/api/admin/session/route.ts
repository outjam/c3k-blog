import { NextResponse } from "next/server";

import { getShopApiAccess, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  return NextResponse.json({
    telegramUserId: auth.telegramUserId,
    isAdmin: auth.isAdmin,
    role: auth.adminRole,
    permissions: auth.adminPermissions,
  });
}

