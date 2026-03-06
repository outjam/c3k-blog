import { NextResponse } from "next/server";

import { BLOG_REACTION_OPTIONS } from "@/types/blog-social";
import { getBlogPostSocialSnapshot } from "@/lib/server/blog-social-store";
import { listReleaseSocialFeedSummaries } from "@/lib/server/release-social-store";
import { getShopApiAccess, hasAdminPermission } from "@/lib/server/shop-api-auth";

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
    .slice(0, 120);
};

const parseSlugs = (raw: string | null): string[] => {
  return Array.from(
    new Set(
      String(raw ?? "")
        .split(",")
        .map((entry) => normalizeSlug(entry))
        .filter(Boolean),
    ),
  ).slice(0, 80);
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const postSlugs = parseSlugs(url.searchParams.get("posts"));
  const releaseSlugs = parseSlugs(url.searchParams.get("releases"));
  const access = await getShopApiAccess(request);

  const blog = await Promise.all(
    postSlugs.map(async (slug) => {
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

      const reactionsTotal = snapshot
        ? BLOG_REACTION_OPTIONS.reduce((acc, option) => acc + (snapshot.reactions[option.key] ?? 0), 0)
        : 0;
      const commentsCount = snapshot?.comments.length ?? 0;

      return [slug, { reactionsTotal, commentsCount }] as const;
    }),
  );

  const releaseSummaries = await listReleaseSocialFeedSummaries(releaseSlugs);

  return NextResponse.json({
    blog: Object.fromEntries(blog),
    releases: releaseSummaries,
  });
}
