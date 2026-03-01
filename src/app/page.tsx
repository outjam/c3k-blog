"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup } from "motion/react";

import { PostCard } from "@/components/post-card";
import { PostPreviewModal } from "@/components/post-preview-modal";
import { posts } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./page.module.scss";

const PAGE_SIZE = 10;

export default function Home() {
  const [activePostSlug, setActivePostSlug] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const latestPost = posts[0];
  const activePost = posts.find((post) => post.slug === activePostSlug) ?? null;
  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [visibleCount]);
  const hasMore = visibleCount < posts.length;

  useEffect(() => {
    const node = sentinelRef.current;

    if (!node || !hasMore) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (!entry?.isIntersecting) {
          return;
        }

        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, posts.length));
      },
      { rootMargin: "240px 0px 300px 0px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMore]);

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
            Telegram WebApp журнал с мобильными паттернами, rich-медиа и длинными статьями про продуктовую разработку.
          </p>
          <button className={styles.fallbackButton} type="button" onClick={openLatestPost}>
            Открыть свежий пост
          </button>
        </section>

        <LayoutGroup id="post-feed-modal">
          <section className={styles.feed}>
            {visiblePosts.map((post, index) => {
              const absoluteIndex = index;
              const isLarge = absoluteIndex % 5 === 2 || absoluteIndex % 7 === 0;
              const reverse = absoluteIndex % 2 === 1;

              return (
                <PostCard
                  key={post.slug}
                  post={post}
                  layout={isLarge ? "large" : "small"}
                  reverse={reverse}
                  isHidden={activePostSlug === post.slug}
                  onOpen={() => openPostPreview(post.slug)}
                />
              );
            })}
          </section>

          <PostPreviewModal post={activePost} open={Boolean(activePost)} onClose={closePostPreview} />
        </LayoutGroup>

        {hasMore ? (
          <div ref={sentinelRef} className={styles.loadMoreHint}>
            Загрузка следующих статей...
          </div>
        ) : null}
      </main>

    </div>
  );
}
