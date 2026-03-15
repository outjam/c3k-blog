"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import {
  buildPublicProfiles,
  buildTelegramShareUrl,
  fetchFollowRelations,
  profileSlugFromIdentity,
  readFollowOverview,
  readProfileMode,
  readPublicPurchasesBySlug,
  readPurchasedReleaseSlugs,
  readPurchasesVisibility,
  resolveViewerKey,
  toggleFollowingSlug,
} from "@/lib/social-hub";
import { hapticNotification, hapticSelection } from "@/lib/telegram";
import type { ProfileMode } from "@/types/social";
import type { ShopCatalogArtist, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

const normalizeSlug = (value: string): string => {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

interface SocialListEntry {
  slug: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

type PublicProfileTab = "collection" | "awards";

export function PublicProfilePageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const { user } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const viewerSlug = useMemo(
    () =>
      profileSlugFromIdentity({
        username: user?.username,
        telegramUserId: user?.id,
        fallback: "me",
      }),
    [user?.id, user?.username],
  );
  const targetSlug = useMemo(() => normalizeSlug(slug), [slug]);
  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return process.env.NEXT_PUBLIC_APP_URL ?? "";
    }

    return window.location.origin;
  }, []);

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [artists, setArtists] = useState<ShopCatalogArtist[]>([]);
  const [followingSlugs, setFollowingSlugs] = useState<string[]>([]);
  const [followStatsBySlug, setFollowStatsBySlug] = useState<
    Record<string, { followersCount: number; followingCount: number }>
  >({});
  const [followProfilesBySlug, setFollowProfilesBySlug] = useState<
    Record<
      string,
      {
        slug: string;
        displayName: string;
        username?: string;
        avatarUrl?: string;
        coverUrl?: string;
        bio?: string;
      }
    >
  >({});
  const [mode, setMode] = useState<ProfileMode>("listener");
  const [viewerPurchasesVisible, setViewerPurchasesVisible] = useState(true);
  const [viewerPurchasedReleaseSlugs, setViewerPurchasedReleaseSlugs] =
    useState<string[]>([]);
  const [targetPurchasesVisible, setTargetPurchasesVisible] = useState(false);
  const [targetPurchasedReleaseSlugs, setTargetPurchasedReleaseSlugs] =
    useState<string[]>([]);
  const [targetPurchasedTrackKeys, setTargetPurchasedTrackKeys] = useState<
    string[]
  >([]);
  const [loading, setLoading] = useState(true);

  const [socialOverlay, setSocialOverlay] = useState<
    "followers" | "following" | null
  >(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialFollowers, setSocialFollowers] = useState<string[]>([]);
  const [socialFollowing, setSocialFollowing] = useState<string[]>([]);
  const [socialProfilesBySlug, setSocialProfilesBySlug] = useState<
    Record<string, { displayName: string; username?: string; avatarUrl?: string }>
  >({});
  const [currentTab, setCurrentTab] = useState<PublicProfileTab>("collection");
  const [copyToast, setCopyToast] = useState("");

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);

      const [
        catalog,
        followOverview,
        savedMode,
        visibility,
        purchases,
        targetPublicPurchases,
      ] = await Promise.all([
        fetchPublicCatalog(),
        readFollowOverview([targetSlug]),
        readProfileMode(viewerKey),
        readPurchasesVisibility(viewerKey),
        readPurchasedReleaseSlugs(viewerKey),
        readPublicPurchasesBySlug(targetSlug),
      ]);

      if (!mounted) {
        return;
      }

      setProducts(catalog.products);
      setArtists(catalog.artists);
      setFollowingSlugs(followOverview.followingSlugs);
      setFollowStatsBySlug(followOverview.statsBySlug);
      setFollowProfilesBySlug(followOverview.profilesBySlug);
      setMode(savedMode);
      setViewerPurchasesVisible(visibility);
      setViewerPurchasedReleaseSlugs(purchases);
      setTargetPurchasesVisible(targetPublicPurchases.purchasesVisible);
      setTargetPurchasedReleaseSlugs(
        targetPublicPurchases.purchasedReleaseSlugs,
      );
      setTargetPurchasedTrackKeys(targetPublicPurchases.purchasedTrackKeys);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [targetSlug, viewerKey]);

  const profiles = useMemo(() => {
    return buildPublicProfiles({
      artists,
      products,
      followingSlugs,
      currentViewer: user,
      currentMode: mode,
      currentPurchasesVisible: viewerPurchasesVisible,
      currentPurchasedReleaseSlugs: viewerPurchasedReleaseSlugs,
      followStatsBySlug,
      followProfilesBySlug,
    });
  }, [
    artists,
    followingSlugs,
    followProfilesBySlug,
    followStatsBySlug,
    mode,
    products,
    user,
    viewerPurchasedReleaseSlugs,
    viewerPurchasesVisible,
  ]);

  const profile = useMemo(() => {
    const resolved = profiles.find((entry) => entry.slug === targetSlug) ?? null;

    if (!resolved || resolved.mode !== "listener") {
      return resolved;
    }

    return {
      ...resolved,
      purchasesVisible: targetPurchasesVisible,
      purchasedReleaseSlugs: targetPurchasedReleaseSlugs,
    };
  }, [profiles, targetPurchasedReleaseSlugs, targetPurchasesVisible, targetSlug]);

  const isFollowing = useMemo(() => {
    return followingSlugs.includes(targetSlug);
  }, [followingSlugs, targetSlug]);

  const listenerCollectionEntries = useMemo(() => {
    if (!profile) {
      return [];
    }

    if (profile.mode !== "listener") {
      return [];
    }

    const trackIdsByRelease = new Map<string, string[]>();

    targetPurchasedTrackKeys.forEach((entry) => {
      const [releaseSlug = "", trackId = ""] = entry.split("::", 2);

      if (!releaseSlug || !trackId) {
        return;
      }

      const next = trackIdsByRelease.get(releaseSlug) ?? [];
      if (!next.includes(trackId)) {
        next.push(trackId);
      }
      trackIdsByRelease.set(releaseSlug, next);
    });

    const orderedSlugs = Array.from(
      new Set([...profile.purchasedReleaseSlugs, ...trackIdsByRelease.keys()]),
    );

    return orderedSlugs
      .map((entrySlug) => {
        const release =
          products.find((item) => item.slug === entrySlug && item.kind === "digital_track") ??
          null;

        if (!release) {
          return null;
        }

        const totalTracksCount =
          Array.isArray(release.releaseTracklist) &&
          release.releaseTracklist.length > 0
            ? release.releaseTracklist.length
            : 1;
        const isFullRelease = profile.purchasedReleaseSlugs.includes(entrySlug);
        const ownedTracksCount = isFullRelease
          ? totalTracksCount
          : (trackIdsByRelease.get(entrySlug) ?? []).length;

        return {
          release,
          isFullRelease,
          ownedTracksCount,
          totalTracksCount,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  }, [products, profile, targetPurchasedTrackKeys]);

  const releases = useMemo(() => {
    if (!profile) {
      return [];
    }

    if (profile.mode === "artist") {
      return products.filter(
        (item) =>
          item.kind === "digital_track" &&
          normalizeSlug(item.artistSlug ?? "") === profile.slug,
      );
    }

    return listenerCollectionEntries.map((entry) => entry.release);
  }, [listenerCollectionEntries, products, profile]);

  const shareLink = useMemo(() => {
    if (!profile || !appOrigin) {
      return "";
    }

    return buildTelegramShareUrl(
      `${appOrigin}/profile/${profile.slug}`,
      `Профиль ${profile.displayName} в Culture3k`,
    );
  }, [appOrigin, profile]);

  const handleToggleFollow = async () => {
    if (!profile || viewerSlug === targetSlug) {
      return;
    }

    const next = await toggleFollowingSlug(profile.slug, {
      displayName: profile.displayName,
      username: profile.username,
      avatarUrl: profile.avatarUrl,
    });
    setFollowingSlugs(next);

    const [overview, relations] = await Promise.all([
      readFollowOverview([targetSlug, profile.slug, ...next]),
      fetchFollowRelations(targetSlug),
    ]);

    setFollowingSlugs(overview.followingSlugs);
    setFollowStatsBySlug(overview.statsBySlug);
    setFollowProfilesBySlug(overview.profilesBySlug);

    if (relations.snapshot) {
      setSocialFollowers(relations.snapshot.followersSlugs);
      setSocialFollowing(relations.snapshot.followingSlugs);
      setSocialProfilesBySlug(
        Object.fromEntries(
          Object.entries(relations.snapshot.profilesBySlug).map(
            ([entrySlug, entry]) => [
              entrySlug,
              {
                displayName: entry.displayName,
                username: entry.username,
                avatarUrl: entry.avatarUrl,
              },
            ],
          ),
        ),
      );
    }
  };

  const handleToggleSocialListFollow = async (entry: SocialListEntry) => {
    const next = await toggleFollowingSlug(entry.slug, {
      displayName: entry.displayName,
      username: entry.username,
      avatarUrl: entry.avatarUrl,
    });
    setFollowingSlugs(next);

    const [overview, relations] = await Promise.all([
      readFollowOverview([targetSlug, entry.slug, ...next]),
      fetchFollowRelations(targetSlug),
    ]);

    setFollowingSlugs(overview.followingSlugs);
    setFollowStatsBySlug(overview.statsBySlug);
    setFollowProfilesBySlug(overview.profilesBySlug);

    if (relations.snapshot) {
      setSocialFollowers(relations.snapshot.followersSlugs);
      setSocialFollowing(relations.snapshot.followingSlugs);
      setSocialProfilesBySlug(
        Object.fromEntries(
          Object.entries(relations.snapshot.profilesBySlug).map(
            ([entrySlug, relationProfile]) => [
              entrySlug,
              {
                displayName: relationProfile.displayName,
                username: relationProfile.username,
                avatarUrl: relationProfile.avatarUrl,
              },
            ],
          ),
        ),
      );
    }
  };

  const openSocialOverlay = async (mode: "followers" | "following") => {
    setSocialOverlay(mode);
    setSocialLoading(true);
    const result = await fetchFollowRelations(targetSlug);
    setSocialLoading(false);

    if (!result.snapshot) {
      setSocialFollowers([]);
      setSocialFollowing([]);
      setSocialProfilesBySlug({});
      return;
    }

    setSocialFollowers(result.snapshot.followersSlugs);
    setSocialFollowing(result.snapshot.followingSlugs);
    setSocialProfilesBySlug(
      Object.fromEntries(
        Object.entries(result.snapshot.profilesBySlug).map(
          ([entrySlug, entry]) => [
            entrySlug,
            {
              displayName: entry.displayName,
              username: entry.username,
              avatarUrl: entry.avatarUrl,
            },
          ],
        ),
      ),
    );
  };

  const socialList: SocialListEntry[] = useMemo(() => {
    const source = socialOverlay === "following" ? socialFollowing : socialFollowers;
    return source.map((entrySlug) => ({
      slug: entrySlug,
      displayName:
        socialProfilesBySlug[entrySlug]?.displayName ||
        followProfilesBySlug[entrySlug]?.displayName ||
        entrySlug,
      username:
        socialProfilesBySlug[entrySlug]?.username ||
        followProfilesBySlug[entrySlug]?.username,
      avatarUrl:
        socialProfilesBySlug[entrySlug]?.avatarUrl ||
        followProfilesBySlug[entrySlug]?.avatarUrl,
    }));
  }, [
    followProfilesBySlug,
    socialFollowers,
    socialFollowing,
    socialOverlay,
    socialProfilesBySlug,
  ]);

  const profileBio = String(profile?.bio ?? "").trim();
  const isOwnProfile = viewerSlug === targetSlug;
  const roleLabel = profile?.mode === "artist" ? "Артист" : null;
  const hasAwards = (profile?.awards.length ?? 0) > 0;
  const collectionLabel = profile?.mode === "artist" ? "Релизы" : "Коллекция";
  const visibleTab: PublicProfileTab = hasAwards ? currentTab : "collection";
  const profileTabItems = hasAwards
    ? [
        {
          id: "collection",
          label: collectionLabel,
          badge: releases.length,
        },
        {
          id: "awards",
          label: "Награды",
          badge: profile?.awards.length ?? 0,
        },
      ]
    : [
        {
          id: "collection",
          label: collectionLabel,
          badge: releases.length,
        },
      ];
  const activeTabIndex = visibleTab === "awards" ? 1 : 0;

  useEffect(() => {
    if (!copyToast) {
      return;
    }

    const timer = window.setTimeout(() => setCopyToast(""), 1800);
    return () => window.clearTimeout(timer);
  }, [copyToast]);

  const handleCopyUsername = async () => {
    const value = `@${profile?.slug ?? targetSlug}`;

    hapticSelection();

    try {
      await navigator.clipboard.writeText(value);
      hapticNotification("success");
      setCopyToast("Username скопирован");
    } catch {
      hapticNotification("warning");
      setCopyToast("Не удалось скопировать username");
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <BackButtonController onBack={() => router.back()} visible />
        Загружаем профиль...
      </div>
    );
  }

  if (!profile) {
    return (
      <div className={styles.page}>
        <BackButtonController onBack={() => router.back()} visible />
        <div className={styles.missing}>
          <h1>Профиль не найден</h1>
          <p>Проверьте ссылку или откройте каталог релизов.</p>
          <Link href="/shop">Перейти в релизы</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <BackButtonController onBack={() => router.back()} visible />
      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.identityRow}>
            <div className={styles.identityMeta}>
              <div className={styles.identityHeading}>
                <h1>{profile.displayName}</h1>
                {roleLabel ? <span className={styles.kicker}>{roleLabel}</span> : null}
              </div>
              <button
                type="button"
                className={styles.usernameButton}
                onClick={handleCopyUsername}
              >
                @{profile.slug}
              </button>
            </div>

            {profile.avatarUrl ? (
              <Image
                className={styles.avatarImage}
                src={profile.avatarUrl}
                alt={profile.displayName}
                width={55}
                height={55}
              />
            ) : (
              <div className={styles.avatarFallback}>
                {profile.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          {profileBio ? <p className={styles.heroBio}>{profileBio}</p> : null}

          <div className={styles.heroStats}>
            <article>
              <span>Подписчики</span>
              <button
                type="button"
                className={styles.statButton}
                onClick={() => void openSocialOverlay("followers")}
              >
                {profile.followersCount}
              </button>
            </article>
            <article>
              <span>Подписки</span>
              <button
                type="button"
                className={styles.statButton}
                onClick={() => void openSocialOverlay("following")}
              >
                {profile.followingCount}
              </button>
            </article>
            <article>
              <span>{collectionLabel}</span>
              <strong>{releases.length}</strong>
            </article>
          </div>

          <div className={styles.heroActions}>
            {isOwnProfile ? (
              <Link href="/profile">Открыть свой профиль</Link>
            ) : (
              <button type="button" onClick={() => void handleToggleFollow()}>
                {isFollowing ? "Отписаться" : "Подписаться"}
              </button>
            )}
            {shareLink ? (
              <a href={shareLink} target="_blank" rel="noreferrer">
                Поделиться
              </a>
            ) : null}
          </div>
        </section>

        <div className={styles.tabShell}>
          {hasAwards ? (
            <div className={styles.stickyTabs}>
              <SegmentedTabs
                activeIndex={activeTabIndex}
                items={profileTabItems}
                onChange={(index) =>
                  setCurrentTab(index === 1 ? "awards" : "collection")
                }
                ariaLabel="Разделы профиля"
              />
            </div>
          ) : null}

          <div className={styles.tabContent}>
            {visibleTab === "collection" ? (
              <section className={styles.section}>
                {profile.mode === "listener" && !profile.purchasesVisible ? (
                  <p className={styles.emptyState}>
                    Коллекция скрыта владельцем профиля.
                  </p>
                ) : releases.length > 0 ? (
                  <div className={styles.collectionGrid}>
                    {(profile.mode === "artist"
                      ? releases.map((release) => ({
                          release,
                          isFullRelease: true,
                          ownedTracksCount:
                            Array.isArray(release.releaseTracklist) &&
                            release.releaseTracklist.length > 0
                              ? release.releaseTracklist.length
                              : 1,
                          totalTracksCount:
                            Array.isArray(release.releaseTracklist) &&
                            release.releaseTracklist.length > 0
                              ? release.releaseTracklist.length
                              : 1,
                        }))
                      : listenerCollectionEntries
                    ).map(({ release, isFullRelease, ownedTracksCount, totalTracksCount }) => (
                      <article key={release.slug} className={styles.collectionCard}>
                        <Link
                          href={`/shop/${release.slug}`}
                          className={styles.collectionLink}
                        >
                          <div className={styles.collectionVisual}>
                            <Image
                              src={release.image}
                              alt={release.title}
                              width={240}
                              height={240}
                              className={styles.collectionMedia}
                            />
                          </div>

                          <div className={styles.collectionMeta}>
                            <strong>{release.title}</strong>
                            <span>{release.artistName || release.subtitle}</span>
                            <span className={styles.releasePrice}>
                              {profile.mode === "artist"
                                ? `${totalTracksCount} треков`
                                : isFullRelease
                                  ? `Полный релиз · ${totalTracksCount} треков`
                                  : `${ownedTracksCount} из ${totalTracksCount} треков`}
                            </span>
                          </div>
                        </Link>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className={styles.emptyState}>
                    {profile.mode === "artist"
                      ? "Релизов пока нет."
                      : "Покупок пока нет."}
                  </p>
                )}
              </section>
            ) : null}

            {visibleTab === "awards" && hasAwards ? (
              <section className={styles.section}>
                <div className={styles.awardsGrid}>
                  {profile.awards.map((award) => (
                    <article
                      key={award.id}
                      className={`${styles.awardCard} ${styles[`awardTier${award.tier}`]}`}
                    >
                      <div className={styles.awardCardTop}>
                        <span className={styles.awardIconWrap}>{award.icon}</span>
                        <span className={styles.awardTierPill}>
                          {award.tier === "diamond"
                            ? "Diamond"
                            : award.tier === "gold"
                              ? "Gold"
                              : award.tier === "silver"
                                ? "Silver"
                                : "Bronze"}
                        </span>
                      </div>

                      <div className={styles.awardMeta}>
                        <h3>{award.title}</h3>
                        <span>{award.description}</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}
          </div>
        </div>
      </main>

      {socialOverlay ? (
        <div
          className={styles.socialOverlayBackdrop}
          onClick={() => setSocialOverlay(null)}
        >
          <div
            className={styles.socialOverlayCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.sectionHeader}>
              <h2>{socialOverlay === "following" ? "Подписки" : "Подписчики"}</h2>
              <button
                type="button"
                className={styles.overlayCloseButton}
                onClick={() => setSocialOverlay(null)}
              >
                Закрыть
              </button>
            </div>

            {socialLoading ? <p className={styles.emptyState}>Загрузка...</p> : null}

            {!socialLoading ? (
              <div className={styles.socialOverlayList}>
                {socialList.length > 0 ? (
                  socialList.map((entry) => (
                    <article key={entry.slug} className={styles.personRow}>
                      <Link
                        href={`/profile/${entry.slug}`}
                        className={styles.personIdentity}
                        onClick={() => setSocialOverlay(null)}
                      >
                        {entry.avatarUrl ? (
                          <Image
                            src={entry.avatarUrl}
                            alt={entry.displayName}
                            width={34}
                            height={34}
                          />
                        ) : (
                          <div className={styles.personIdentityFallback}>
                            {entry.displayName.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span>
                          <strong>{entry.displayName}</strong>
                          <small>@{entry.username || entry.slug}</small>
                        </span>
                      </Link>

                      {entry.slug !== viewerSlug ? (
                        <button
                          type="button"
                          onClick={() => void handleToggleSocialListFollow(entry)}
                        >
                          {followingSlugs.includes(entry.slug)
                            ? "Отписаться"
                            : "Подписаться"}
                        </button>
                      ) : (
                        <span className={styles.selfBadge}>Вы</span>
                      )}
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>Список пуст.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {copyToast ? <div className={styles.copyToast}>{copyToast}</div> : null}
    </div>
  );
}
