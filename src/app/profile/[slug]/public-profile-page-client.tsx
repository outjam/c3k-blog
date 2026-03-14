"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import {
  buildPublicProfiles,
  buildTelegramShareUrl,
  fetchFollowRelations,
  profileSlugFromIdentity,
  readFollowOverview,
  readPublicPurchasesBySlug,
  readProfileMode,
  readPurchasedReleaseSlugs,
  readPurchasesVisibility,
  resolveViewerKey,
  toggleFollowingSlug,
} from "@/lib/social-hub";
import { formatStarsFromCents } from "@/lib/stars-format";
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

export function PublicProfilePageClient({ slug }: { slug: string }) {
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
  const [followStatsBySlug, setFollowStatsBySlug] = useState<Record<string, { followersCount: number; followingCount: number }>>({});
  const [followProfilesBySlug, setFollowProfilesBySlug] = useState<
    Record<string, { slug: string; displayName: string; username?: string; avatarUrl?: string; coverUrl?: string; bio?: string }>
  >({});
  const [mode, setMode] = useState<ProfileMode>("listener");
  const [viewerPurchasesVisible, setViewerPurchasesVisible] = useState(true);
  const [viewerPurchasedReleaseSlugs, setViewerPurchasedReleaseSlugs] = useState<string[]>([]);
  const [targetPurchasesVisible, setTargetPurchasesVisible] = useState(false);
  const [targetPurchasedReleaseSlugs, setTargetPurchasedReleaseSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [socialOverlay, setSocialOverlay] = useState<"followers" | "following" | null>(null);
  const [socialLoading, setSocialLoading] = useState(false);
  const [socialFollowers, setSocialFollowers] = useState<string[]>([]);
  const [socialFollowing, setSocialFollowing] = useState<string[]>([]);
  const [socialProfilesBySlug, setSocialProfilesBySlug] = useState<
    Record<string, { displayName: string; username?: string; avatarUrl?: string }>
  >({});

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);

      const [catalog, followOverview, savedMode, visibility, purchases, targetPublicPurchases] = await Promise.all([
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
      setTargetPurchasedReleaseSlugs(targetPublicPurchases.purchasedReleaseSlugs);
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
  }, [artists, followingSlugs, followProfilesBySlug, followStatsBySlug, mode, products, user, viewerPurchasedReleaseSlugs, viewerPurchasesVisible]);

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

  const releases = useMemo(() => {
    if (!profile) {
      return [];
    }

    if (profile.mode === "artist") {
      return products.filter((item) => item.kind === "digital_track" && normalizeSlug(item.artistSlug ?? "") === profile.slug);
    }

    return products.filter((item) => profile.purchasedReleaseSlugs.includes(item.slug));
  }, [products, profile]);

  const shareLink = useMemo(() => {
    if (!profile || !appOrigin) {
      return "";
    }

    return buildTelegramShareUrl(`${appOrigin}/profile/${profile.slug}`, `Профиль ${profile.displayName} в Culture3k`);
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

    const [overview, relations] = await Promise.all([readFollowOverview([targetSlug, profile.slug, ...next]), fetchFollowRelations(targetSlug)]);

    setFollowingSlugs(overview.followingSlugs);
    setFollowStatsBySlug(overview.statsBySlug);
    setFollowProfilesBySlug(overview.profilesBySlug);

    if (relations.snapshot) {
      setSocialFollowers(relations.snapshot.followersSlugs);
      setSocialFollowing(relations.snapshot.followingSlugs);
      setSocialProfilesBySlug(
        Object.fromEntries(
          Object.entries(relations.snapshot.profilesBySlug).map(([entrySlug, entry]) => [
            entrySlug,
            {
              displayName: entry.displayName,
              username: entry.username,
              avatarUrl: entry.avatarUrl,
            },
          ]),
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

    const [overview, relations] = await Promise.all([readFollowOverview([targetSlug, entry.slug, ...next]), fetchFollowRelations(targetSlug)]);

    setFollowingSlugs(overview.followingSlugs);
    setFollowStatsBySlug(overview.statsBySlug);
    setFollowProfilesBySlug(overview.profilesBySlug);

    if (relations.snapshot) {
      setSocialFollowers(relations.snapshot.followersSlugs);
      setSocialFollowing(relations.snapshot.followingSlugs);
      setSocialProfilesBySlug(
        Object.fromEntries(
          Object.entries(relations.snapshot.profilesBySlug).map(([entrySlug, relationProfile]) => [
            entrySlug,
            {
              displayName: relationProfile.displayName,
              username: relationProfile.username,
              avatarUrl: relationProfile.avatarUrl,
            },
          ]),
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
        Object.entries(result.snapshot.profilesBySlug).map(([entrySlug, entry]) => [
          entrySlug,
          {
            displayName: entry.displayName,
            username: entry.username,
            avatarUrl: entry.avatarUrl,
          },
        ]),
      ),
    );
  };

  const socialList: SocialListEntry[] = useMemo(() => {
    const source = socialOverlay === "following" ? socialFollowing : socialFollowers;
    return source.map((entrySlug) => ({
      slug: entrySlug,
      displayName: socialProfilesBySlug[entrySlug]?.displayName || followProfilesBySlug[entrySlug]?.displayName || entrySlug,
      username: socialProfilesBySlug[entrySlug]?.username || followProfilesBySlug[entrySlug]?.username,
      avatarUrl: socialProfilesBySlug[entrySlug]?.avatarUrl || followProfilesBySlug[entrySlug]?.avatarUrl,
    }));
  }, [followProfilesBySlug, socialFollowers, socialFollowing, socialOverlay, socialProfilesBySlug]);

  const profileBio = String(profile?.bio ?? "").trim();
  const isOwnProfile = viewerSlug === targetSlug;

  if (loading) {
    return <div className={styles.page}>Загружаем профиль...</div>;
  }

  if (!profile) {
    return (
      <div className={styles.page}>
        <div className={styles.missing}>
          <h1>Профиль не найден</h1>
          <p>Проверьте ссылку или попробуйте найти пользователя через глобальный поиск.</p>
          <Link href="/search">Перейти в поиск</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroIdentity}>
            {profile.avatarUrl ? (
              <Image className={styles.avatarImage} src={profile.avatarUrl} alt={profile.displayName} width={53} height={53} />
            ) : (
              <div className={styles.avatarFallback}>{profile.displayName.slice(0, 2).toUpperCase()}</div>
            )}

            <div>
              <h1>{profile.displayName}</h1>
              <p>@{profile.slug}</p>
              <span className={styles.kicker}>{profile.mode === "artist" ? "Артист" : "Покупатель"}</span>

              <div className={styles.heroStats}>
                <article>
                  <span>Подписчики</span>
                  <button type="button" className={styles.statButton} onClick={() => void openSocialOverlay("followers")}>
                    {profile.followersCount}
                  </button>
                </article>
                <article>
                  <span>Подписки</span>
                  <button type="button" className={styles.statButton} onClick={() => void openSocialOverlay("following")}>
                    {profile.followingCount}
                  </button>
                </article>
                <article>
                  <span>Награды</span>
                  <strong>{profile.awards.length}</strong>
                </article>
                <article>
                  <span>{profile.mode === "artist" ? "Релизов" : "В коллекции"}</span>
                  <strong>{releases.length}</strong>
                </article>
              </div>
            </div>
          </div>

          {profileBio ? <p className={styles.bio}>{profileBio}</p> : null}

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
                Поделиться профилем
              </a>
            ) : null}
            <Link href="/search">Поиск</Link>
          </div>
        </section>

        {profile.awards.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Награды</h2>
              <p>{profile.awards.length}</p>
            </div>

            <div className={styles.awardsGrid}>
              {profile.awards.map((award) => (
                <article key={award.id} className={styles.awardCard}>
                  <p>{award.icon}</p>
                  <h3>{award.title}</h3>
                  <span>{award.description}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>{profile.mode === "artist" ? "Релизы" : "Коллекция"}</h2>
            <p>{releases.length}</p>
          </div>

          {profile.mode === "listener" && !profile.purchasesVisible ? (
            <p className={styles.empty}>Коллекция скрыта владельцем профиля.</p>
          ) : releases.length > 0 ? (
            <div className={styles.releaseGrid}>
              {releases.map((release) => (
                <Link key={release.slug} href={`/shop/${release.slug}`} className={styles.releaseCard}>
                  <Image src={release.image} alt={release.title} width={360} height={125} />
                  <div>
                    <strong>{release.title}</strong>
                    <p>{release.artistName || release.subtitle}</p>
                    <span>{formatStarsFromCents(release.priceStarsCents)} ⭐</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>{profile.mode === "artist" ? "Релизов пока нет." : "Покупок пока нет."}</p>
          )}
        </section>
      </main>

      {socialOverlay ? (
        <div className={styles.socialOverlayBackdrop} onClick={() => setSocialOverlay(null)}>
          <div className={styles.socialOverlayCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sectionHeader}>
              <h2>{socialOverlay === "following" ? "Подписки" : "Подписчики"}</h2>
              <button type="button" className={styles.overlayCloseButton} onClick={() => setSocialOverlay(null)}>
                Закрыть
              </button>
            </div>

            {socialLoading ? <p className={styles.empty}>Загрузка...</p> : null}

            {!socialLoading ? (
              <div className={styles.socialOverlayList}>
                {socialList.length > 0 ? (
                  socialList.map((entry) => (
                    <article key={entry.slug} className={styles.personRow}>
                      <Link href={`/profile/${entry.slug}`} className={styles.personIdentity} onClick={() => setSocialOverlay(null)}>
                        {entry.avatarUrl ? (
                          <Image src={entry.avatarUrl} alt={entry.displayName} width={34} height={34} />
                        ) : (
                          <div className={styles.personIdentityFallback}>{entry.displayName.slice(0, 2).toUpperCase()}</div>
                        )}
                        <span>
                          <strong>{entry.displayName}</strong>
                          <small>@{entry.username || entry.slug}</small>
                        </span>
                      </Link>

                      {entry.slug !== viewerSlug ? (
                        <button type="button" onClick={() => void handleToggleSocialListFollow(entry)}>
                          {followingSlugs.includes(entry.slug) ? "Отписаться" : "Подписаться"}
                        </button>
                      ) : (
                        <span className={styles.selfBadge}>Вы</span>
                      )}
                    </article>
                  ))
                ) : (
                  <p className={styles.empty}>Список пуст.</p>
                )}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
