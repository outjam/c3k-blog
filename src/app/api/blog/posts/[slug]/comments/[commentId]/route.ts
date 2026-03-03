import { NextResponse } from "next/server";

import { deleteBlogComment } from "@/lib/server/blog-social-store";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string; commentId: string }> },
) {
  const access = await getShopApiAccess(request);

  if (!access) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "blog_comment_delete",
    identifier: access.telegramUserId,
    limit: 20,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const { slug, commentId } = await params;

  const result = await deleteBlogComment({
    slug,
    commentId,
    actor: {
      telegramUserId: access.telegramUserId,
      username: access.username,
      firstName: access.firstName,
      lastName: access.lastName,
      isAdmin: hasAdminPermission(access, "blog:manage"),
    },
  });

  if (result.error === "post_not_found") {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (result.error === "comment_not_found") {
    return NextResponse.json({ error: "Comment not found" }, { status: 404 });
  }

  if (result.error === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (result.error || !result.snapshot) {
    return NextResponse.json({ error: "Failed to delete comment" }, { status: 502 });
  }

  return NextResponse.json(result.snapshot);
}
