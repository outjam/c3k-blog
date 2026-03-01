"use client";

import { useCallback, useState } from "react";

import { PostCard } from "@/components/post-card";
import { PostPreviewModal } from "@/components/post-preview-modal";
import { posts } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./page.module.scss";

export default function Home() {
  const [activePostSlug, setActivePostSlug] = useState<string | null>(null);

  const latestPost = posts[0];
  const activePost = posts.find((post) => post.slug === activePostSlug) ?? null;

  const openLatestPost = useCallback(() => {
    hapticImpact("medium");
    setActivePostSlug(latestPost.slug);
  }, [latestPost.slug]);

  const openPostPreview = useCallback((slug: string) => {
    setActivePostSlug(slug);
  }, []);

  const closePostPreview = useCallback(() => {
    setActivePostSlug(null);
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <h1>C3K Blog</h1>
          <p className={styles.subtitle}>
            Блог с насыщенными постами внутри Telegram: цитаты, фото, галереи-слайдеры, списки и
            нативные цвета темы Telegram.
          </p>
          <button className={styles.fallbackButton} type="button" onClick={openLatestPost}>
            Открыть свежий пост
          </button>
        </section>

        <section className={styles.feed}>
          {posts.map((post) => (
            <PostCard key={post.slug} post={post} onOpen={() => openPostPreview(post.slug)} />
          ))}
        </section>
      </main>

      <PostPreviewModal post={activePost} open={Boolean(activePost)} onClose={closePostPreview} />
    </div>
  );
}
