import { NextResponse } from "next/server";

import { getBlogPostsSnapshot } from "@/lib/server/blog-posts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const posts = await getBlogPostsSnapshot();
  return NextResponse.json({ posts });
}

