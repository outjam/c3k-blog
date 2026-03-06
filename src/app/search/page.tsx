"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { fetchPublicCatalog } from "@/lib/admin-api";
import {
  buildPublicProfiles,
  buildSearchBundle,
  readFollowingSlugs,
  readProfileMode,
  readPurchasedReleaseSlugs,
  readPurchasesVisibility,
  resolveViewerKey,
} from "@/lib/social-hub";
import { formatStarsFromCents } from "@/lib/stars-format";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import type { BlogPost } from "@/types/blog";
import type { ProfileMode, PublicProfile } from "@/types/social";
import type { ShopCatalogArtist, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

export default function SearchPage() {
  const { user } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);

  const [query, setQuery] = useState("");
  const [posts, setPosts] = useState<BlogPost[]>([]);
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

      const [postsSnapshot, catalog, following, savedMode, visibility, purchases] = await Promise.all([
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
        readProfileMode(viewerKey),
        readPurchasesVisibility(viewerKey),
        readPurchasedReleaseSlugs(viewerKey),
      ]);

      if (!mounted) {
        return;
      }

      setPosts(postsSnapshot);
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

  const profiles = useMemo<PublicProfile[]>(() => {
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

  const bundle = useMemo(() => {
    return buildSearchBundle({
      query,
      products,
      profiles,
      posts,
    });
  }, [posts, products, profiles, query]);

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Global Search</p>
          <h1>Поиск по релизам, артистам, пользователям и блогу</h1>
          <label className={styles.searchBox}>
            <span aria-hidden>⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Например: ambient, @vinylfox, nocturne"
            />
          </label>
          <p className={styles.searchHint}>
            Результаты обновляются мгновенно: сначала показываются релизы и артисты, затем пользователи и записи блога.
          </p>
        </section>

        {loading ? <p className={styles.loading}>Индексация контента...</p> : null}

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Релизы</h2>
            <p>{bundle.releases.length}</p>
          </header>

          {bundle.releases.length > 0 ? (
            <div className={styles.releaseGrid}>
              {bundle.releases.map((release) => (
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
            <p className={styles.empty}>Релизы не найдены.</p>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Артисты</h2>
            <p>{bundle.artists.length}</p>
          </header>

          {bundle.artists.length > 0 ? (
            <div className={styles.profileGrid}>
              {bundle.artists.map((artist) => (
                <Link key={artist.slug} href={`/profile/${artist.slug}`} className={styles.profileCard}>
                  {artist.avatarUrl ? <img src={artist.avatarUrl} alt={artist.displayName} loading="lazy" /> : <div>{artist.displayName.slice(0, 2).toUpperCase()}</div>}
                  <article>
                    <strong>{artist.displayName}</strong>
                    <p>{artist.bio}</p>
                    <span>{artist.followersCount} подписчиков</span>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Артисты не найдены.</p>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Пользователи</h2>
            <p>{bundle.users.length}</p>
          </header>

          {bundle.users.length > 0 ? (
            <div className={styles.profileGrid}>
              {bundle.users.map((profile) => (
                <Link key={profile.slug} href={`/profile/${profile.slug}`} className={styles.profileCard}>
                  {profile.avatarUrl ? <img src={profile.avatarUrl} alt={profile.displayName} loading="lazy" /> : <div>{profile.displayName.slice(0, 2).toUpperCase()}</div>}
                  <article>
                    <strong>{profile.displayName}</strong>
                    <p>{profile.bio}</p>
                    <span>{profile.followersCount} подписчиков</span>
                  </article>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Пользователи не найдены.</p>
          )}
        </section>

        <section className={styles.section}>
          <header className={styles.sectionHeader}>
            <h2>Блог</h2>
            <p>{bundle.blogPosts.length}</p>
          </header>

          {bundle.blogPosts.length > 0 ? (
            <div className={styles.blogList}>
              {bundle.blogPosts.map((post) => (
                <Link key={post.slug} href={`/post/${post.slug}`} className={styles.blogItem}>
                  <img src={post.cover} alt={post.title} loading="lazy" />
                  <div>
                    <strong>{post.title}</strong>
                    <p>{post.excerpt}</p>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className={styles.empty}>Посты не найдены.</p>
          )}
        </section>
      </main>
    </div>
  );
}
