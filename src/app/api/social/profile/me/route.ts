import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { getFollowProfileBySlug, upsertUserFollowProfile } from "@/lib/server/social-follow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  displayName?: string;
  username?: string;
  avatarUrl?: string;
  coverUrl?: string;
  bio?: string;
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

const toSelfSlug = (username: string | null, telegramUserId: number): string => {
  return normalizeSlug(username) || `user-${telegramUserId}`;
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "social_profile_me_get",
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

  const slug = toSelfSlug(auth.username, auth.telegramUserId);
  const profile = await getFollowProfileBySlug(slug);

  return NextResponse.json({
    slug,
    profile: {
      displayName:
        profile?.displayName ||
        [auth.firstName, auth.lastName].filter(Boolean).join(" ").trim() ||
        `@${auth.username || slug}`,
      username: profile?.username || auth.username || undefined,
      avatarUrl: profile?.avatarUrl || auth.photoUrl || undefined,
      coverUrl: profile?.coverUrl,
      bio: profile?.bio,
    },
  });
}

export async function PATCH(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const rate = await checkRateLimit({
    scope: "social_profile_me_patch",
    identifier: auth.telegramUserId,
    limit: 30,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: PatchBody;
  try {
    payload = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = toSelfSlug(auth.username, auth.telegramUserId);
  const displayName = normalizeText(payload.displayName, 120);
  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  const updated = await upsertUserFollowProfile({
    telegramUserId: auth.telegramUserId,
    slug,
    profile: {
      slug,
      displayName,
      username: normalizeSlug(payload.username) || auth.username || undefined,
      avatarUrl: normalizeText(payload.avatarUrl, 3000) || auth.photoUrl || undefined,
      coverUrl: normalizeText(payload.coverUrl, 3000) || undefined,
      bio: normalizeText(payload.bio, 500) || undefined,
    },
  });

  if (!updated) {
    return NextResponse.json({ error: "Failed to update profile" }, { status: 502 });
  }

  return NextResponse.json({
    slug,
    profile: {
      displayName: updated.displayName,
      username: updated.username,
      avatarUrl: updated.avatarUrl,
      coverUrl: updated.coverUrl,
      bio: updated.bio,
    },
  });
}

