"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LayoutGroup, motion } from "motion/react";

import { PostCard } from "@/components/post-card";
import { PostPreviewModal } from "@/components/post-preview-modal";
import { posts } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./page.module.scss";

const PAGE_SIZE = 10;

interface ActivePostPreview {
  slug: string;
  layout: "large" | "small";
  reverse: boolean;
}

export default function Home() {
  const [activePreview, setActivePreview] = useState<ActivePostPreview | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const latestPost = posts[0];
  const activePost = posts.find((post) => post.slug === activePreview?.slug) ?? null;
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
    setActivePreview({
      slug: latestPost.slug,
      layout: "large",
      reverse: false,
    });
  }, [latestPost.slug]);

  const openPostPreview = useCallback((slug: string, layout: "large" | "small", reverse: boolean) => {
    setActivePreview({ slug, layout, reverse });
  }, []);

  const closePostPreview = useCallback(() => {
    setActivePreview(null);
  }, []);

  return (
    <div className={styles.page}>
      <motion.main className={styles.container} layoutScroll>
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
                  isHidden={activePreview?.slug === post.slug}
                  onOpen={() => openPostPreview(post.slug, isLarge ? "large" : "small", reverse)}
                />
              );
            })}
          </section>

          <PostPreviewModal
            post={activePost}
            sourceLayout={activePreview?.layout ?? "large"}
            sourceReverse={activePreview?.reverse ?? false}
            open={Boolean(activePost)}
            onClose={closePostPreview}
          />
        </LayoutGroup>

        {hasMore ? (
          <div ref={sentinelRef} className={styles.loadMoreHint}>
            Загрузка следующих статей...
          </div>
        ) : null}
      </motion.main>

    </div>
  );
}
