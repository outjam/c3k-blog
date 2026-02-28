"use client";

import { useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

import { BackButtonController } from "@/components/back-button-controller";
import { RichPostContent } from "@/components/rich-post-content";
import type { BlogPost } from "@/data/posts";
import { hapticImpact, hapticNotification } from "@/lib/telegram";

import styles from "./page.module.scss";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export function PostPageClient({ post }: { post: BlogPost }) {
  const router = useRouter();

  const handleBack = useCallback(() => {
    hapticImpact("light");
    router.back();
  }, [router]);

  const handleShare = useCallback(async () => {
    try {
      const origin = APP_URL || window.location.origin;
      const url = `${origin}/post/${post.slug}`;
      await navigator.clipboard.writeText(url);
      hapticNotification("success");
    } catch {
      hapticNotification("warning");
    }
  }, [post.slug]);

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <article className={styles.article}>
        <header className={styles.header}>
          <Image
            src={post.cover.src}
            alt={post.cover.alt}
            width={post.cover.width}
            height={post.cover.height}
            className={styles.cover}
            priority
          />
          <h1>{post.title}</h1>
          <div className={styles.meta}>
            <span>{post.publishedAt}</span>
            <span>{post.readTime}</span>
          </div>
          <p className={styles.excerpt}>{post.excerpt}</p>
          <div className={styles.actionRow}>
            <button type="button" className={styles.action} onClick={handleBack}>
              Назад
            </button>
            <button type="button" className={styles.action} onClick={handleShare}>
              Копировать ссылку
            </button>
          </div>
        </header>

        <section className={styles.content}>
          <RichPostContent blocks={post.content} />
        </section>
      </article>
    </div>
  );
}
