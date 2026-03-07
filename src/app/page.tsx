"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchPublicCatalog } from "@/lib/admin-api";
import { buildTelegramShareUrl, buildUnifiedFeed, readFollowingSlugs } from "@/lib/social-hub";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { BlogPost } from "@/types/blog";
import type { ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

const PAGE_SIZE = 12;

const feedDate = (value: string): string => {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "сегодня";
  }

  return new Date(timestamp).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
};

export default function Home() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [followingSlugs, setFollowingSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [feedOnlyFollowing, setFeedOnlyFollowing] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [feedEngagement, setFeedEngagement] = useState<
    Record<string, { reactionsCount: number; commentsCount: number }>
  >({});

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);

      const [postsResponse, catalogSnapshot, following] = await Promise.all([
        fetch("/api/blog/posts", { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) {
              return [] as BlogPost[];
            }

            const payload = (await response.json()) as { posts?: BlogPost[] };
            return Array.isArray(payload.posts) ? payload.posts : [];
          })
          .catch(() => [] as BlogPost[]),
        fetchPublicCatalog(),
        readFollowingSlugs(),
      ]);

      if (!mounted) {
        return;
      }

      setPosts(postsResponse);
      setProducts(catalogSnapshot.products);
      setFollowingSlugs(following);
      setLoading(false);
      setVisibleCount(PAGE_SIZE);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const feed = useMemo(() => {
    return buildUnifiedFeed({ posts, products, followingSlugs });
  }, [followingSlugs, posts, products]);

  useEffect(() => {
    let mounted = true;

    const postSlugs = feed
      .filter((item) => item.kind === "blog")
      .map((item) => item.id.replace(/^blog:/, ""))
      .filter(Boolean);
    const releaseSlugs = feed
      .filter((item) => item.kind === "release")
      .map((item) => item.id.replace(/^release:/, ""))
      .filter(Boolean);

    if (postSlugs.length === 0 && releaseSlugs.length === 0) {
      const timer = window.setTimeout(() => {
        if (mounted) {
          setFeedEngagement({});
        }
      }, 0);

      return () => {
        mounted = false;
        window.clearTimeout(timer);
      };
    }

    const query = new URLSearchParams();
    if (postSlugs.length > 0) {
      query.set("posts", postSlugs.join(","));
    }
    if (releaseSlugs.length > 0) {
      query.set("releases", releaseSlugs.join(","));
    }

    void fetch(`/api/feed/social?${query.toString()}`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return null;
        }

        return (await response.json()) as {
          blog?: Record<string, { reactionsTotal?: number; commentsCount?: number }>;
          releases?: Record<string, { reactionsTotal?: number; commentsCount?: number }>;
        };
      })
      .then((payload) => {
        if (!mounted || !payload) {
          return;
        }

        const next: Record<string, { reactionsCount: number; commentsCount: number }> = {};

        Object.entries(payload.blog ?? {}).forEach(([slug, stats]) => {
          next[`blog:${slug}`] = {
            reactionsCount: Math.max(0, Math.round(Number(stats?.reactionsTotal ?? 0))),
            commentsCount: Math.max(0, Math.round(Number(stats?.commentsCount ?? 0))),
          };
        });

        Object.entries(payload.releases ?? {}).forEach(([slug, stats]) => {
          next[`release:${slug}`] = {
            reactionsCount: Math.max(0, Math.round(Number(stats?.reactionsTotal ?? 0))),
            commentsCount: Math.max(0, Math.round(Number(stats?.commentsCount ?? 0))),
          };
        });

        setFeedEngagement(next);
      })
      .catch(() => {
        if (mounted) {
          setFeedEngagement({});
        }
      });

    return () => {
      mounted = false;
    };
  }, [feed]);

  const filteredFeed = useMemo(() => {
    if (!feedOnlyFollowing || followingSlugs.length === 0) {
      return feed;
    }

    const followedOnly = feed.filter((item) => item.isFollowedSource);
    return followedOnly.length > 0 ? followedOnly : feed;
  }, [feed, feedOnlyFollowing, followingSlugs.length]);

  const visibleFeed = useMemo(() => filteredFeed.slice(0, visibleCount), [filteredFeed, visibleCount]);
  const hasMore = visibleCount < filteredFeed.length;
  const releasesCount = useMemo(() => products.filter((item) => item.kind === "digital_track").length, [products]);
  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return process.env.NEXT_PUBLIC_APP_URL ?? "";
    }

    return window.location.origin;
  }, []);

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <div>
            <p className={styles.kicker}>C3K Social Feed</p>
            <h1>Лента подписок: релизы артистов + блог</h1>
            <p>
              Здесь собираются свежие релизы и посты каналов/артистов, на которых вы подписаны. Покупки можно сразу
              шарить в Telegram.
            </p>
          </div>

          <div className={styles.heroStats}>
            <article>
              <span>Релизов в ленте</span>
              <strong>{releasesCount}</strong>
            </article>
            <article>
              <span>Постов блога</span>
              <strong>{posts.length}</strong>
            </article>
            <article>
              <span>Подписок</span>
              <strong>{followingSlugs.length}</strong>
            </article>
          </div>

          <div className={styles.heroActions}>
            <button
              type="button"
              className={`${styles.toggleButton} ${feedOnlyFollowing ? styles.toggleButtonActive : ""}`}
              onClick={() => setFeedOnlyFollowing(true)}
            >
              Только подписки
            </button>
            <button
              type="button"
              className={`${styles.toggleButton} ${!feedOnlyFollowing ? styles.toggleButtonActive : ""}`}
              onClick={() => setFeedOnlyFollowing(false)}
            >
              Весь рынок
            </button>
            <Link href="/search" className={styles.searchButton}>
              Глобальный поиск
            </Link>
          </div>

          {followingSlugs.length > 0 ? (
            <div className={styles.followingRow}>
              {followingSlugs.slice(0, 7).map((slug) => (
                <Link key={slug} href={`/profile/${slug}`} className={styles.followingChip}>
                  @{slug}
                </Link>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.feed}>
          {visibleFeed.length > 0 ? (
            visibleFeed.map((item) => {
              const engagement = feedEngagement[item.id];
              const absoluteUrl = appOrigin ? `${appOrigin}${item.href}` : item.href;
              const shareHref = buildTelegramShareUrl(
                absoluteUrl,
                item.kind === "release"
                  ? `Слушаю ${item.title} в Culture3k`
                  : `Читаю: ${item.title} в блоге Culture3k`,
              );

              return (
                <article key={item.id} className={`${styles.feedCard} ${item.kind === "release" ? styles.feedCardRelease : styles.feedCardBlog}`}>
                  <Link href={item.href} className={styles.coverWrap}>
                    <Image src={item.coverUrl} alt={item.title} fill sizes="(max-width: 880px) 100vw, 240px" className={styles.coverImage} />
                    <span className={styles.kindBadge}>{item.kind === "release" ? "REL" : "BLOG"}</span>
                  </Link>

                  <div className={styles.cardBody}>
                    <div className={styles.cardMetaTop}>
                      <Link href={`/profile/${item.authorSlug}`}>{item.authorName}</Link>
                      <span>{feedDate(item.publishedAt)}</span>
                    </div>

                    <Link href={item.href} className={styles.titleLink}>
                      <h2>{item.title}</h2>
                    </Link>

                    <p className={styles.description}>{item.description}</p>

                    <div className={styles.badgesRow}>
                      {item.tags.slice(0, 3).map((tag) => (
                        <span key={`${item.id}-${tag}`}>#{tag}</span>
                      ))}
                    </div>

                    <div className={styles.engagementRow}>
                      <p>{engagement?.reactionsCount ?? item.reactionsCount} реакций</p>
                      <p>{engagement?.commentsCount ?? item.commentsCount} комментариев</p>
                      {item.kind === "release" && typeof item.priceStarsCents === "number" ? (
                        <strong>{formatStarsFromCents(item.priceStarsCents)} ⭐</strong>
                      ) : null}
                    </div>

                    <div className={styles.actionsRow}>
                      <Link href={item.href} className={styles.primaryAction}>
                        {item.kind === "release" ? "Открыть релиз" : "Открыть пост"}
                      </Link>
                      <a href={shareHref} target="_blank" rel="noreferrer" className={styles.secondaryAction}>
                        Поделиться
                      </a>
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <article className={styles.emptyState}>
              <h3>Лента пока пустая</h3>
              <p>Подпишитесь на артистов и блоги, чтобы собирать персональный поток релизов.</p>
              <Link href="/shop">Перейти в релизы</Link>
            </article>
          )}

          {loading ? <p className={styles.loading}>Загружаем социальную ленту...</p> : null}
          {!loading && hasMore ? (
            <button type="button" className={styles.loadMoreButton} onClick={() => setVisibleCount((prev) => prev + PAGE_SIZE)}>
              Показать ещё
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
}
