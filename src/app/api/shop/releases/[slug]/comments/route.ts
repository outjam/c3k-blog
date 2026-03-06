import { NextResponse } from "next/server";

import { createReleaseComment } from "@/lib/server/release-social-store";
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
    scope: "release_comment_create",
    identifier: access.telegramUserId,
    limit: 10,
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

  const result = await createReleaseComment({
    slug,
    text: payload.text,
    actor: {
      telegramUserId: access.telegramUserId,
      username: access.username,
      firstName: access.firstName,
      lastName: access.lastName,
      photoUrl: access.photoUrl,
      isAdmin: hasAdminPermission(access, "blog:manage"),
    },
  });

  if (result.error === "invalid_comment") {
    return NextResponse.json({ error: "Comment must be between 2 and 600 characters" }, { status: 400 });
  }

  if (result.error === "moderation_block") {
    return NextResponse.json({ error: "Comment blocked by moderation" }, { status: 400 });
  }

  if (result.error || !result.snapshot) {
    return NextResponse.json({ error: "Failed to create comment" }, { status: 502 });
  }

  return NextResponse.json(result.snapshot);
}
