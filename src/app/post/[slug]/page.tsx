import { notFound } from "next/navigation";

import { getPostBySlug, posts } from "@/data/posts";

import { PostPageClient } from "./post-page-client";

export function generateStaticParams() {
  return posts.map((post) => ({ slug: post.slug }));
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);

  if (!post) {
    notFound();
  }

  return <PostPageClient post={post} />;
}
