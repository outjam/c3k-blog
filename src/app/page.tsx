"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { PostCard } from "@/components/post-card";
import type { BlogPost } from "@/types/blog";
import { readBookmarkedPostSlugs, toggleBookmarkedPost } from "@/lib/post-bookmarks";

import styles from "./page.module.scss";

const PAGE_SIZE = 10;

export default function Home() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<string[]>([]);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const postsCount = posts.length;

  const latestPost = posts[0] ?? null;
  const visiblePosts = useMemo(() => posts.slice(0, visibleCount), [posts, visibleCount]);
  const hasMore = visibleCount < posts.length;

  useEffect(() => {
    let mounted = true;

    const loadPosts = async () => {
      setPostsLoading(true);

      try {
        const response = await fetch("/api/blog/posts", { cache: "no-store" });
        const payload = (await response.json()) as { posts?: BlogPost[] };

        if (!mounted) {
          return;
        }

        setPosts(Array.isArray(payload.posts) ? payload.posts : []);
      } catch {
        if (!mounted) {
          return;
        }

        setPosts([]);
      } finally {
        if (mounted) {
          setPostsLoading(false);
          setVisibleCount(PAGE_SIZE);
        }
      }
    };

    void loadPosts();

    return () => {
      mounted = false;
    };
  }, []);

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

        setVisibleCount((prev) => Math.min(prev + PAGE_SIZE, postsCount));
      },
      { rootMargin: "240px 0px 300px 0px" },
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasMore, postsCount]);

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
          {latestPost ? (
            <Link className={styles.fallbackButton} href={`/post/${latestPost.slug}`}>
              Открыть свежий пост
            </Link>
          ) : null}
        </section>

        <section className={styles.feed}>
          {visiblePosts.length > 0
            ? visiblePosts.map((post, index) => {
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
              })
            : !postsLoading && <p className={styles.loadMoreHint}>Посты пока недоступны.</p>}
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
