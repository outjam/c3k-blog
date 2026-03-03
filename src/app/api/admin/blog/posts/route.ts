import { NextResponse } from "next/server";

import type { BlogPost } from "@/data/posts";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import {
  getAdminBlogPostsSnapshot,
  hideBlogPostBySlug,
  upsertBlogPost,
} from "@/lib/server/blog-posts-store";

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

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "blog:view")) {
    return forbiddenResponse();
  }

  try {
    return NextResponse.json(await getAdminBlogPostsSnapshot());
  } catch {
    return NextResponse.json({ error: "Failed to load blog posts" }, { status: 502 });
  }
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

  const slug = normalizeSlug(payload.post.slug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  try {
    const saved = await upsertBlogPost({
      ...payload.post,
      slug,
      publishedAt: payload.post.publishedAt || new Date().toISOString().slice(0, 10),
    });

    if (!saved) {
      return NextResponse.json({ error: "Failed to save post" }, { status: 502 });
    }

    return NextResponse.json(await getAdminBlogPostsSnapshot());
  } catch {
    return NextResponse.json({ error: "Failed to save post" }, { status: 502 });
  }
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

  try {
    const hidden = await hideBlogPostBySlug(slug);

    if (!hidden) {
      return NextResponse.json({ error: "Failed to delete post" }, { status: 502 });
    }

    return NextResponse.json(await getAdminBlogPostsSnapshot());
  } catch {
    return NextResponse.json({ error: "Failed to delete post" }, { status: 502 });
  }
}
