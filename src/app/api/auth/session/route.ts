import { NextResponse } from "next/server";

import { getShopApiAuth } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return NextResponse.json({ user: null });
  }

  return NextResponse.json({
    user: {
      id: auth.telegramUserId,
      first_name: auth.firstName,
      last_name: auth.lastName,
      username: auth.username,
      photo_url: auth.photoUrl ?? "",
    },
  });
}
