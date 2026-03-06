import { NextResponse } from "next/server";

import { getReleaseSocialSnapshot } from "@/lib/server/release-social-store";
import { getShopApiAccess, hasAdminPermission } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await getShopApiAccess(request);

  const snapshot = await getReleaseSocialSnapshot({
    slug,
    viewer: access
      ? {
          telegramUserId: access.telegramUserId,
          username: access.username,
          firstName: access.firstName,
          lastName: access.lastName,
          photoUrl: access.photoUrl,
          isAdmin: hasAdminPermission(access, "blog:manage"),
        }
      : undefined,
  });

  return NextResponse.json(snapshot);
}
