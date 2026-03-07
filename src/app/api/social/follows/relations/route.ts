import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { getFollowRelationsBySlug } from "@/lib/server/social-follow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "social_follow_relations",
    identifier: auth.telegramUserId,
    limit: 120,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const url = new URL(request.url);
  const slug = normalizeSlug(url.searchParams.get("slug"));
  if (!slug) {
    return NextResponse.json({ error: "slug is required" }, { status: 400 });
  }

  const limit = Math.max(1, Math.min(300, Math.round(Number(url.searchParams.get("limit") || "120"))));
  const relations = await getFollowRelationsBySlug({ slug, limit });
  return NextResponse.json(relations);
}

