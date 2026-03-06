"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import {
  buildPublicProfiles,
  buildTelegramShareUrl,
  readFollowingSlugs,
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

export function PublicProfilePageClient({ slug }: { slug: string }) {
  const { user } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
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
  const [mode, setMode] = useState<ProfileMode>("listener");
  const [purchasesVisible, setPurchasesVisible] = useState(true);
  const [purchasedReleaseSlugs, setPurchasedReleaseSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setLoading(true);

      const [catalog, following, savedMode, visibility, purchases] = await Promise.all([
        fetchPublicCatalog(),
        readFollowingSlugs(),
        readProfileMode(viewerKey),
        readPurchasesVisibility(viewerKey),
        readPurchasedReleaseSlugs(viewerKey),
      ]);

      if (!mounted) {
        return;
      }

      setProducts(catalog.products);
      setArtists(catalog.artists);
      setFollowingSlugs(following);
      setMode(savedMode);
      setPurchasesVisible(visibility);
      setPurchasedReleaseSlugs(purchases);
      setLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, [viewerKey]);

  const profiles = useMemo(() => {
    return buildPublicProfiles({
      artists,
      products,
      followingSlugs,
      currentViewer: user,
      currentMode: mode,
      currentPurchasesVisible: purchasesVisible,
      currentPurchasedReleaseSlugs: purchasedReleaseSlugs,
    });
  }, [artists, followingSlugs, mode, products, purchasedReleaseSlugs, purchasesVisible, user]);

  const profile = useMemo(() => {
    return profiles.find((entry) => entry.slug === targetSlug) ?? null;
  }, [profiles, targetSlug]);

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

  const peers = useMemo(() => {
    return profiles.filter((entry) => entry.slug !== targetSlug).slice(0, 12);
  }, [profiles, targetSlug]);

  const shareLink = useMemo(() => {
    if (!profile || !appOrigin) {
      return "";
    }

    return buildTelegramShareUrl(`${appOrigin}/profile/${profile.slug}`, `Профиль ${profile.displayName} в Culture3k`);
  }, [appOrigin, profile]);

  const handleToggleFollow = async () => {
    if (!profile) {
      return;
    }

    const next = await toggleFollowingSlug(profile.slug);
    setFollowingSlugs(next);
  };

  if (loading) {
    return <div className={styles.page}>Загрузка профиля...</div>;
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
              <img className={styles.avatarImage} src={profile.avatarUrl} alt={profile.displayName} />
            ) : (
              <div className={styles.avatarFallback}>{profile.displayName.slice(0, 2).toUpperCase()}</div>
            )}

            <div>
              <p className={styles.kicker}>{profile.mode === "artist" ? "Artist Profile" : "Community Profile"}</p>
              <h1>{profile.displayName}</h1>
              <p>@{profile.slug}</p>
            </div>
          </div>

          <div className={styles.heroStats}>
            <article>
              <span>Подписчики</span>
              <strong>{profile.followersCount}</strong>
            </article>
            <article>
              <span>Подписки</span>
              <strong>{profile.followingCount}</strong>
            </article>
            <article>
              <span>Награды</span>
              <strong>{profile.awards.length}</strong>
            </article>
            <article>
              <span>Релизы в витрине</span>
              <strong>{releases.length}</strong>
            </article>
          </div>

          <p className={styles.bio}>{profile.bio}</p>

          <div className={styles.heroActions}>
            <button type="button" onClick={() => void handleToggleFollow()}>
              {isFollowing ? "Отписаться" : "Подписаться"}
            </button>
            {shareLink ? (
              <a href={shareLink} target="_blank" rel="noreferrer">
                Поделиться профилем
              </a>
            ) : null}
            <Link href="/search">Назад в поиск</Link>
          </div>
        </section>

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

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>{profile.mode === "artist" ? "Релизы артиста" : "Купленные релизы"}</h2>
            <p>{releases.length}</p>
          </div>

          {profile.mode === "listener" && !profile.purchasesVisible ? (
            <p className={styles.empty}>Пользователь скрыл список покупок.</p>
          ) : releases.length > 0 ? (
            <div className={styles.releaseGrid}>
              {releases.map((release) => (
                <Link key={release.slug} href={`/shop/${release.slug}`} className={styles.releaseCard}>
                  <img src={release.image} alt={release.title} loading="lazy" />
                  <div>
                    <strong>{release.title}</strong>
                    <p>{release.artistName || release.subtitle}</p>
                    <span>{formatStarsFromCents(release.priceStarsCents)} ⭐</span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Релизы пока не опубликованы.</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Люди рядом</h2>
            <p>{peers.length}</p>
          </div>

          <div className={styles.peopleGrid}>
            {peers.map((entry) => (
              <Link key={entry.slug} href={`/profile/${entry.slug}`} className={styles.personCard}>
                <strong>{entry.displayName}</strong>
                <span>@{entry.slug}</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
