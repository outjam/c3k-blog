"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";

import { MainActionButton } from "@/components/main-action-button";
import { PostCard } from "@/components/post-card";
import { posts } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./page.module.scss";

export default function Home() {
  const router = useRouter();

  const latestPost = posts[0];

  const openLatestPost = useCallback(() => {
    hapticImpact("medium");
    router.push(`/post/${latestPost.slug}`);
  }, [latestPost.slug, router]);

  return (
    <div className={styles.page}>
      <MainActionButton text="Открыть свежий пост" onClick={openLatestPost} visible />

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
            <PostCard key={post.slug} post={post} />
          ))}
        </section>
      </main>
    </div>
  );
}
