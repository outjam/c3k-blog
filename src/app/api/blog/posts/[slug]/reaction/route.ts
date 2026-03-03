import { NextResponse } from "next/server";

import { clearBlogReaction, setBlogReaction } from "@/lib/server/blog-social-store";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAccess, hasAdminPermission, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SetReactionBody {
  reactionType?: string;
}

export async function PUT(
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
    scope: "blog_reaction_set",
    identifier: access.telegramUserId,
    limit: 40,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: SetReactionBody;

  try {
    payload = (await request.json()) as SetReactionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { slug } = await params;

  const result = await setBlogReaction({
    slug,
    actor: {
      telegramUserId: access.telegramUserId,
      username: access.username,
      firstName: access.firstName,
      lastName: access.lastName,
      isAdmin: hasAdminPermission(access, "blog:manage"),
    },
    reactionType: payload.reactionType,
  });

  if (result.error === "post_not_found") {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (result.error === "invalid_reaction") {
    return NextResponse.json({ error: "Invalid reactionType" }, { status: 400 });
  }

  if (result.error || !result.snapshot) {
    return NextResponse.json({ error: "Failed to set reaction" }, { status: 502 });
  }

  return NextResponse.json(result.snapshot);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const access = await getShopApiAccess(request);

  if (!access) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "blog_reaction_clear",
    identifier: access.telegramUserId,
    limit: 40,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const { slug } = await params;

  const result = await clearBlogReaction({
    slug,
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

  if (result.error || !result.snapshot) {
    return NextResponse.json({ error: "Failed to clear reaction" }, { status: 502 });
  }

  return NextResponse.json(result.snapshot);
}
