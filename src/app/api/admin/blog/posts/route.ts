import { NextResponse } from "next/server";

import { posts as staticPosts } from "@/data/posts";
import type { BlogPost } from "@/data/posts";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { getBlogPostsSnapshot } from "@/lib/server/blog-posts-store";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BlogUpsertBody {
  post?: BlogPost;
}

interface BlogDeleteBody {
  slug?: string;
}

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const staticSlugSet = new Set(staticPosts.map((post) => post.slug));

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "blog:view")) {
    return forbiddenResponse();
  }

  const [posts, config] = await Promise.all([getBlogPostsSnapshot(), readShopAdminConfig()]);
  return NextResponse.json({
    posts,
    hiddenPostSlugs: config.hiddenPostSlugs,
    customSlugs: Object.keys(config.blogPostRecords),
  });
}

export async function PUT(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "blog:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: BlogUpsertBody;

  try {
    payload = (await request.json()) as BlogUpsertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!payload.post || typeof payload.post !== "object") {
    return NextResponse.json({ error: "Invalid post payload" }, { status: 400 });
  }

  const post = payload.post;
  const slug = normalizeSlug(post.slug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await mutateShopAdminConfig((current) => ({
    ...current,
    blogPostRecords: {
      ...current.blogPostRecords,
      [slug]: {
        ...post,
        slug,
        publishedAt: post.publishedAt || now.slice(0, 10),
      },
    },
    hiddenPostSlugs: current.hiddenPostSlugs.filter((item) => item !== slug),
    updatedAt: now,
  }));

  const posts = await getBlogPostsSnapshot();
  return NextResponse.json({ posts });
}

export async function DELETE(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "blog:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: BlogDeleteBody;

  try {
    payload = (await request.json()) as BlogDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const slug = normalizeSlug(payload.slug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const now = new Date().toISOString();
  await mutateShopAdminConfig((current) => {
    const blogPostRecords = { ...current.blogPostRecords };
    delete blogPostRecords[slug];

    const hiddenPostSlugs = staticSlugSet.has(slug)
      ? Array.from(new Set([...current.hiddenPostSlugs, slug]))
      : current.hiddenPostSlugs.filter((item) => item !== slug);

    return {
      ...current,
      blogPostRecords,
      hiddenPostSlugs,
      updatedAt: now,
    };
  });

  const posts = await getBlogPostsSnapshot();
  return NextResponse.json({ posts });
}
