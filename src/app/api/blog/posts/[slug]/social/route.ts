import { NextResponse } from "next/server";

import { getBlogPostSocialSnapshot } from "@/lib/server/blog-social-store";
import { getShopApiAccess, hasAdminPermission } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const access = await getShopApiAccess(request);

  const snapshot = await getBlogPostSocialSnapshot({
    slug,
    viewer: access
      ? {
          telegramUserId: access.telegramUserId,
          username: access.username,
          firstName: access.firstName,
          lastName: access.lastName,
          isAdmin: hasAdminPermission(access, "blog:manage"),
        }
      : undefined,
  });

  if (!snapshot) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json(snapshot);
}
