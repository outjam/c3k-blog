"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  type PanInfo,
} from "motion/react";

import { SegmentedTabs } from "@/components/segmented-tabs";
import { buildUnifiedFeed, readFollowingSlugs } from "@/lib/social-hub";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { UnifiedFeedItem } from "@/types/social";
import type { BlogPost } from "@/types/blog";
import type { ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

const PAGE_SIZE = 12;
const TAB_PAGE_GAP = 18;

type NewsTab = "following" | "market";

const tabTrackSpring = {
  type: "spring" as const,
  stiffness: 420,
  damping: 38,
  mass: 0.78,
};

const shouldIgnoreSwipe = (target: EventTarget | null): boolean => {
  return (
    target instanceof HTMLElement &&
    Boolean(
      target.closest(
        "a, button, input, textarea, select, label, [contenteditable='true'], [data-tab-swipe-lock='true']",
      ),
    )
  );
};

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

function HeartIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20.4 4.84 13.6a4.8 4.8 0 0 1 6.8-6.8L12 7.16l.36-.36a4.8 4.8 0 1 1 6.8 6.8L12 20.4Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M7 18.2 3.8 20l.75-3.3A7.3 7.3 0 1 1 19.3 14H19a7.25 7.25 0 0 1-12 4.2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FeedCard({
  item,
  engagement,
}: {
  item: UnifiedFeedItem;
  engagement?: { reactionsCount: number; commentsCount: number };
}) {
  const reactionsCount = engagement?.reactionsCount ?? item.reactionsCount;
  const commentsCount = engagement?.commentsCount ?? item.commentsCount;

  return (
    <article
      className={`${styles.feedCard} ${item.kind === "release" ? styles.feedCardRelease : styles.feedCardBlog}`}
    >
      <Link href={item.href} className={styles.coverWrap}>
        <Image
          src={item.coverUrl}
          alt={item.title}
          fill
          sizes="(max-width: 760px) 100vw, 240px"
          className={styles.coverImage}
        />
        <span className={styles.kindBadge}>
          {item.kind === "release" ? "Релиз" : "Пост"}
        </span>
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

        <div className={styles.engagementRow}>
          <span className={styles.statChip}>
            <HeartIcon />
            {reactionsCount}
          </span>
          <span className={styles.statChip}>
            <CommentIcon />
            {commentsCount}
          </span>
        </div>
      </div>
    </article>
  );
}

function FeedSkeleton() {
  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.tabShell}>
          <div className={styles.stickyTabs}>
            <div className={styles.tabsSkeleton} />
          </div>

          <div className={styles.feed}>
            {Array.from({ length: 5 }).map((_, index) => (
              <article key={index} className={styles.skeletonCard}>
                <div className={styles.skeletonCover} />
                <div className={styles.skeletonBody}>
                  <span className={styles.skeletonLineShort} />
                  <span className={styles.skeletonLine} />
                  <span className={styles.skeletonLine} />
                  <span className={styles.skeletonLineMuted} />
                  <div className={styles.skeletonStats}>
                    <span className={styles.skeletonPill} />
                    <span className={styles.skeletonPill} />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function Home() {
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [followingSlugs, setFollowingSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<NewsTab>("following");
  const [visibleCounts, setVisibleCounts] = useState<Record<NewsTab, number>>({
    following: PAGE_SIZE,
    market: PAGE_SIZE,
  });
  const [feedEngagement, setFeedEngagement] = useState<
    Record<string, { reactionsCount: number; commentsCount: number }>
  >({});
  const tabViewportRef = useRef<HTMLDivElement | null>(null);
  const tabPageRefs = useRef(new Map<NewsTab, HTMLElement>());
  const [tabViewportWidth, setTabViewportWidth] = useState(0);
  const [tabPageHeights, setTabPageHeights] = useState<
    Partial<Record<NewsTab, number>>
  >({});
  const [isTabDragging, setIsTabDragging] = useState(false);
  const tabTrackX = useMotionValue(0);
  const tabViewportHeight = useMotionValue(0);
  const tabDragControls = useDragControls();

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
      setVisibleCounts({ following: PAGE_SIZE, market: PAGE_SIZE });
      setLoading(false);
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
          blog?: Record<
            string,
            { reactionsTotal?: number; commentsCount?: number }
          >;
          releases?: Record<
            string,
            { reactionsTotal?: number; commentsCount?: number }
          >;
        };
      })
      .then((payload) => {
        if (!mounted || !payload) {
          return;
        }

        const next: Record<
          string,
          { reactionsCount: number; commentsCount: number }
        > = {};

        Object.entries(payload.blog ?? {}).forEach(([slug, stats]) => {
          next[`blog:${slug}`] = {
            reactionsCount: Math.max(
              0,
              Math.round(Number(stats?.reactionsTotal ?? 0)),
            ),
            commentsCount: Math.max(
              0,
              Math.round(Number(stats?.commentsCount ?? 0)),
            ),
          };
        });

        Object.entries(payload.releases ?? {}).forEach(([slug, stats]) => {
          next[`release:${slug}`] = {
            reactionsCount: Math.max(
              0,
              Math.round(Number(stats?.reactionsTotal ?? 0)),
            ),
            commentsCount: Math.max(
              0,
              Math.round(Number(stats?.commentsCount ?? 0)),
            ),
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

  const followingFeed = useMemo(
    () => feed.filter((item) => item.isFollowedSource),
    [feed],
  );

  const tabPages = useMemo(
    () =>
      [
        {
          id: "following" as const,
          label: "Подписки",
          items: followingFeed,
          emptyTitle: "Подписки пока пусты",
          emptyText:
            "Подпишитесь на артистов и блоги или переключитесь на общий поток.",
        },
        {
          id: "market" as const,
          label: "Все",
          items: feed,
          emptyTitle: "Новостей пока нет",
          emptyText:
            "Откройте релизы и возвращайтесь сюда за свежими обновлениями.",
        },
      ] satisfies Array<{
        id: NewsTab;
        label: string;
        items: UnifiedFeedItem[];
        emptyTitle: string;
        emptyText: string;
      }>,
    [feed, followingFeed],
  );

  const tabItems = useMemo(
    () =>
      tabPages.map((tab) => ({
        id: tab.id,
        label: tab.label,
        badge: tab.items.length,
      })),
    [tabPages],
  );

  const activeTabIndex = activeTab === "market" ? 1 : 0;
  const activeTabHeight = tabPageHeights[activeTab] ?? 0;
  const tabPageStride = tabViewportWidth + TAB_PAGE_GAP;
  const maxTabTrackOffset =
    tabPageStride * Math.max(tabPages.length - 1, 0);

  const resolveTabHeightByIndex = useCallback(
    (index: number): number => {
      const safeIndex = Math.max(0, Math.min(index, tabPages.length - 1));
      const targetTab = tabPages[safeIndex];

      if (!targetTab) {
        return 0;
      }

      return tabPageHeights[targetTab.id] ?? 0;
    },
    [tabPages, tabPageHeights],
  );

  const resolveTabViewportHeight = useCallback(
    (offsetX: number): number => {
      if (!tabPageStride) {
        return resolveTabHeightByIndex(activeTabIndex);
      }

      const safeOffset = Math.max(-maxTabTrackOffset, Math.min(0, offsetX));
      const rawIndex = Math.abs(safeOffset) / tabPageStride;
      const leftIndex = Math.max(
        0,
        Math.min(Math.floor(rawIndex), tabPages.length - 1),
      );
      const rightIndex = Math.max(
        0,
        Math.min(Math.ceil(rawIndex), tabPages.length - 1),
      );
      const leftHeight = resolveTabHeightByIndex(leftIndex);
      const rightHeight = resolveTabHeightByIndex(rightIndex);

      if (leftIndex === rightIndex) {
        return leftHeight;
      }

      const progress = rawIndex - leftIndex;
      return leftHeight + (rightHeight - leftHeight) * progress;
    },
    [
      activeTabIndex,
      maxTabTrackOffset,
      resolveTabHeightByIndex,
      tabPageStride,
      tabPages.length,
    ],
  );

  useLayoutEffect(() => {
    if (loading) {
      return;
    }

    const viewportNode = tabViewportRef.current;

    if (!viewportNode) {
      return;
    }

    const syncViewportMetrics = () => {
      const nextWidth = Math.round(viewportNode.getBoundingClientRect().width);
      setTabViewportWidth((currentWidth) =>
        currentWidth === nextWidth ? currentWidth : nextWidth,
      );

      setTabPageHeights((currentHeights) => {
        let changed = false;
        const nextHeights = { ...currentHeights };

        tabPages.forEach((tab) => {
          const node = tabPageRefs.current.get(tab.id);

          if (!node) {
            return;
          }

          const nextHeight = Math.round(node.getBoundingClientRect().height);

          if (nextHeights[tab.id] !== nextHeight) {
            nextHeights[tab.id] = nextHeight;
            changed = true;
          }
        });

        return changed ? nextHeights : currentHeights;
      });
    };

    syncViewportMetrics();

    const observer = new ResizeObserver(() => {
      syncViewportMetrics();
    });

    observer.observe(viewportNode);

    tabPages.forEach((tab) => {
      const node = tabPageRefs.current.get(tab.id);

      if (node) {
        observer.observe(node);
      }
    });

    return () => observer.disconnect();
  }, [loading, tabPages]);

  useEffect(() => {
    if (loading || !tabPageStride || isTabDragging) {
      return;
    }

    const controls = animate(
      tabTrackX,
      -activeTabIndex * tabPageStride,
      tabTrackSpring,
    );

    return () => controls.stop();
  }, [activeTabIndex, isTabDragging, loading, tabPageStride, tabTrackX]);

  useEffect(() => {
    tabViewportHeight.set(resolveTabViewportHeight(tabTrackX.get()));
  }, [resolveTabViewportHeight, tabTrackX, tabViewportHeight]);

  useEffect(() => {
    const unsubscribe = tabTrackX.on("change", (latest) => {
      tabViewportHeight.set(resolveTabViewportHeight(latest));
    });

    return unsubscribe;
  }, [resolveTabViewportHeight, tabTrackX, tabViewportHeight]);

  const setCurrentTabByIndex = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, tabPages.length - 1));
    const nextTab = tabPages[safeIndex]?.id;

    if (nextTab) {
      setActiveTab(nextTab);
    }
  };

  const handleTabTrackPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (
      loading ||
      !tabPageStride ||
      shouldIgnoreSwipe(event.target) ||
      (event.pointerType === "mouse" && event.button !== 0)
    ) {
      return;
    }

    tabDragControls.start(event);
  };

  const handleTabTrackDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo,
  ) => {
    if (!tabPageStride) {
      setIsTabDragging(false);
      return;
    }

    const liveIndex = Math.max(
      0,
      Math.min(
        Math.round(Math.abs(tabTrackX.get()) / tabPageStride),
        tabPages.length - 1,
      ),
    );
    const fastSwipe = Math.abs(info.velocity.x) > 360;
    const longSwipe = Math.abs(info.offset.x) > tabPageStride * 0.18;
    const swipeStep = info.velocity.x < 0 || info.offset.x < 0 ? 1 : -1;
    const nextIndex = Math.max(
      0,
      Math.min(
        fastSwipe || longSwipe ? activeTabIndex + swipeStep : liveIndex,
        tabPages.length - 1,
      ),
    );

    setIsTabDragging(false);

    if (nextIndex === activeTabIndex) {
      void animate(
        tabTrackX,
        -activeTabIndex * tabPageStride,
        tabTrackSpring,
      );
      return;
    }

    setCurrentTabByIndex(nextIndex);
  };

  const handleLoadMore = (tab: NewsTab) => {
    setVisibleCounts((current) => ({
      ...current,
      [tab]: current[tab] + PAGE_SIZE,
    }));
  };

  if (loading) {
    return <FeedSkeleton />;
  }

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.tabShell}>
          <div className={styles.stickyTabs}>
            <SegmentedTabs
              activeIndex={activeTabIndex}
              items={tabItems}
              onChange={setCurrentTabByIndex}
              ariaLabel="Разделы новостей"
            />
          </div>

          <motion.div
            ref={tabViewportRef}
            className={`${styles.tabViewport} ${isTabDragging ? styles.tabViewportDragging : ""}`}
            style={activeTabHeight > 0 ? { height: tabViewportHeight } : undefined}
          >
            <motion.div
              className={styles.tabTrack}
              style={{ x: tabTrackX, gap: TAB_PAGE_GAP }}
              drag="x"
              dragControls={tabDragControls}
              dragListener={false}
              dragConstraints={{
                left: -maxTabTrackOffset,
                right: 0,
              }}
              dragElastic={0.08}
              dragMomentum={false}
              dragTransition={{ bounceStiffness: 800, bounceDamping: 90 }}
              onPointerDown={handleTabTrackPointerDown}
              onDragStart={() => setIsTabDragging(true)}
              onDragEnd={handleTabTrackDragEnd}
            >
              {tabPages.map((tab) => {
                const visibleItems = tab.items.slice(0, visibleCounts[tab.id]);
                const hasMore = visibleCounts[tab.id] < tab.items.length;

                return (
                  <section
                    key={tab.id}
                    ref={(node) => {
                      if (node) {
                        tabPageRefs.current.set(tab.id, node);
                      } else {
                        tabPageRefs.current.delete(tab.id);
                      }
                    }}
                    className={styles.feedPage}
                    style={{
                      width: tabViewportWidth > 0 ? tabViewportWidth : "100%",
                    }}
                  >
                    <div className={styles.feed}>
                      {visibleItems.length > 0 ? (
                        visibleItems.map((item) => (
                          <FeedCard
                            key={item.id}
                            item={item}
                            engagement={feedEngagement[item.id]}
                          />
                        ))
                      ) : (
                        <article className={styles.emptyState}>
                          <h3>{tab.emptyTitle}</h3>
                          <p>{tab.emptyText}</p>
                          <Link href="/shop">Перейти в релизы</Link>
                        </article>
                      )}

                      {hasMore ? (
                        <button
                          type="button"
                          className={styles.loadMoreButton}
                          onClick={() => handleLoadMore(tab.id)}
                        >
                          Показать ещё
                        </button>
                      ) : null}
                    </div>
                  </section>
                );
              })}
            </motion.div>
          </motion.div>
        </section>
      </main>
    </div>
  );
}
