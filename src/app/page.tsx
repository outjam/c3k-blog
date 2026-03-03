"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { PostCard } from "@/components/post-card";
import { posts } from "@/data/posts";
import { readBookmarkedPostSlugs, toggleBookmarkedPost } from "@/lib/post-bookmarks";

import styles from "./page.module.scss";

const PAGE_SIZE = 10;

export default function Home() {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const latestPost = posts[0];
  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [visibleCount]);
  const hasMore = visibleCount < posts.length;

  useEffect(() => {
    let mounted = true;

    void readBookmarkedPostSlugs().then((slugs) => {
      if (mounted) {
        setBookmarkedSlugs(slugs);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

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

  const handleToggleBookmark = (slug: string) => {
    void toggleBookmarkedPost(slug).then((next) => {
      setBookmarkedSlugs(next);
    });
  };

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <h1>C3K Blog</h1>
          <p className={styles.subtitle}>
            Telegram WebApp журнал с rich-медиа, длинными статьями и мобильным UX без модальных оверлеев.
          </p>
          <Link className={styles.fallbackButton} href={`/post/${latestPost.slug}`}>
            Открыть свежий пост
          </Link>
        </section>

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
                isBookmarked={bookmarkedSlugs.includes(post.slug)}
                onToggleBookmark={handleToggleBookmark}
              />
            );
          })}
        </section>

        {hasMore ? (
          <div ref={sentinelRef} className={styles.loadMoreHint}>
            Загрузка следующих статей...
          </div>
        ) : null}
      </main>
    </div>
  );
}

