import { posts as staticPosts } from "@/data/posts";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { BlogPost } from "@/data/posts";

const toTimestamp = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

export const getBlogPostsSnapshot = async (): Promise<BlogPost[]> => {
  const config = await readShopAdminConfig();
  const hiddenSet = new Set(config.hiddenPostSlugs);
  const map = new Map<string, BlogPost>();

  for (const post of staticPosts) {
    if (!hiddenSet.has(post.slug)) {
      map.set(post.slug, post);
    }
  }

  for (const [slug, post] of Object.entries(config.blogPostRecords)) {
    if (hiddenSet.has(slug)) {
      continue;
    }

    map.set(slug, post);
  }

  return Array.from(map.values()).sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));
};

export const getBlogPostBySlug = async (slug: string): Promise<BlogPost | null> => {
  const posts = await getBlogPostsSnapshot();
  return posts.find((post) => post.slug === slug) ?? null;
};

