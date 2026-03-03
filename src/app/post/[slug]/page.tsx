import { notFound } from "next/navigation";

import { getBlogPostBySlug } from "@/lib/server/blog-posts-store";

import { PostPageClient } from "./post-page-client";

export const dynamic = "force-dynamic";

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getBlogPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return <PostPageClient post={post} />;
}
