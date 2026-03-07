import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { getUserFollowOverview, setUserFollowing } from "@/lib/server/social-follow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface FollowPatchBody {
  targetSlug?: string;
  targetDisplayName?: string;
  targetUsername?: string;
  targetAvatarUrl?: string;
  active?: boolean;
}

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

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const parseSlugs = (raw: string | null): string[] => {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((entry) => normalizeSlug(entry))
        .filter(Boolean),
    ),
  ).slice(0, 120);
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "social_follow_list",
    identifier: auth.telegramUserId,
    limit: 180,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const url = new URL(request.url);
  const subjectSlugs = parseSlugs(url.searchParams.get("slugs"));
  const selfSlug = normalizeSlug(auth.username) || `user-${auth.telegramUserId}`;
  const overview = await getUserFollowOverview({
    telegramUserId: auth.telegramUserId,
    selfSlug,
    subjectSlugs,
  });

  return NextResponse.json(overview);
}

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const rate = await checkRateLimit({
    scope: "social_follow_toggle",
    identifier: auth.telegramUserId,
    limit: 180,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: FollowPatchBody;

  try {
    payload = (await request.json()) as FollowPatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const targetSlug = normalizeSlug(payload.targetSlug);
  if (!targetSlug) {
    return NextResponse.json({ error: "targetSlug is required" }, { status: 400 });
  }

  const selfSlug = normalizeSlug(auth.username) || `user-${auth.telegramUserId}`;
  if (targetSlug === selfSlug) {
    return NextResponse.json({ error: "Cannot follow yourself" }, { status: 409 });
  }

  const result = await setUserFollowing({
    telegramUserId: auth.telegramUserId,
    targetSlug,
    active: typeof payload.active === "boolean" ? payload.active : undefined,
    actorProfile: {
      slug: selfSlug,
      displayName: [auth.firstName, auth.lastName].filter(Boolean).join(" ").trim() || `@${auth.username || selfSlug}`,
      username: auth.username || undefined,
      avatarUrl: auth.photoUrl,
    },
    targetProfile: {
      slug: targetSlug,
      displayName: normalizeText(payload.targetDisplayName, 120) || targetSlug,
      username: normalizeSlug(payload.targetUsername) || undefined,
      avatarUrl: normalizeText(payload.targetAvatarUrl, 3000) || undefined,
    },
  });

  return NextResponse.json(result);
}
