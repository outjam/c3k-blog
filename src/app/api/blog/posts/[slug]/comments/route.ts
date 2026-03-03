import { NextResponse } from "next/server";

import { createBlogComment } from "@/lib/server/blog-social-store";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAccess, hasAdminPermission, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateCommentBody {
  text?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await getShopApiAccess(request);

  if (!access) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const rate = await checkRateLimit({
    scope: "blog_comment_create",
    identifier: access.telegramUserId,
    limit: 8,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: CreateCommentBody;

  try {
    payload = (await request.json()) as CreateCommentBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug } = await params;

  const result = await createBlogComment({
    slug,
    actor: {
      telegramUserId: access.telegramUserId,
      username: access.username,
      firstName: access.firstName,
      lastName: access.lastName,
      isAdmin: hasAdminPermission(access, "blog:manage"),
    },
    text: payload.text,
  });

  if (result.error === "post_not_found") {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (result.error === "invalid_comment") {
    return NextResponse.json({ error: "Comment must be between 2 and 500 characters" }, { status: 400 });
  }

  if (result.error === "moderation_block") {
    return NextResponse.json({ error: "Comment blocked by moderation" }, { status: 400 });
  }

  if (result.error || !result.snapshot) {
    return NextResponse.json({ error: "Failed to create comment" }, { status: 502 });
  }

  return NextResponse.json(result.snapshot);
}
