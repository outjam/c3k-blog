"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  createMyArtistTrack,
  fetchMyArtistProfile,
  fetchPublicCatalog,
  upsertMyArtistProfile,
} from "@/lib/admin-api";
import {
  appendPurchasedReleaseSlug,
  buildPublicProfiles,
  buildTelegramShareUrl,
  profileSlugFromIdentity,
  readFollowingSlugs,
  readProfileMode,
  readPurchasedReleaseSlugs,
  readPurchasesVisibility,
  readWalletBalanceCents,
  resolveViewerKey,
  resolveViewerName,
  toggleFollowingSlug,
  writeProfileMode,
  writePurchasesVisibility,
} from "@/lib/social-hub";
import { FINAL_ORDER_STATUSES } from "@/lib/shop-order-status";
import { fetchMyShopOrders } from "@/lib/shop-orders-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { BlogPost } from "@/types/blog";
import type { ProfileMode } from "@/types/social";
import type { ArtistProfile, ArtistTrack, ShopCatalogArtist, ShopOrder, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

export default function ProfilePage() {
  const { user, source, isSessionLoading, refreshSession } = useAppAuthUser();
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
  const fullName = useMemo(() => resolveViewerName(user), [user]);
  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return process.env.NEXT_PUBLIC_APP_URL ?? "";
    }

    return window.location.origin;
  }, []);

  const [mode, setMode] = useState<ProfileMode>("listener");
  const [walletCents, setWalletCents] = useState(0);
  const [authHint, setAuthHint] = useState("");
  const [purchasesVisible, setPurchasesVisible] = useState(true);
  const [followingSlugs, setFollowingSlugs] = useState<string[]>([]);
  const [purchasedReleaseSlugs, setPurchasedReleaseSlugs] = useState<string[]>([]);

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [artists, setArtists] = useState<ShopCatalogArtist[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [ordersError, setOrdersError] = useState("");

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [artistTracks, setArtistTracks] = useState<ArtistTrack[]>([]);
  const [artistDonationsCount, setArtistDonationsCount] = useState(0);
  const [artistSubscriptionsCount, setArtistSubscriptionsCount] = useState(0);
  const [artistSaving, setArtistSaving] = useState(false);
  const [trackSaving, setTrackSaving] = useState(false);
  const [artistError, setArtistError] = useState("");

  const [artistDraft, setArtistDraft] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    coverUrl: "",
    donationEnabled: true,
    subscriptionEnabled: false,
    subscriptionPriceStarsCents: "100",
  });
  const [trackDraft, setTrackDraft] = useState({
    title: "",
    subtitle: "",
    audioFileId: "",
    previewUrl: "",
    genre: "",
    priceStarsCents: "100",
  });

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setCatalogLoading(true);

      const [postsSnapshot, catalog] = await Promise.all([
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
      ]);

      if (!mounted) {
        return;
      }

      setPosts(postsSnapshot);
      setProducts(catalog.products);
      setArtists(catalog.artists);
      setCatalogLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const [savedMode, balance, visibility, following, purchases] = await Promise.all([
        readProfileMode(viewerKey),
        readWalletBalanceCents(viewerKey),
        readPurchasesVisibility(viewerKey),
        readFollowingSlugs(),
        readPurchasedReleaseSlugs(viewerKey),
      ]);

      if (!mounted) {
        return;
      }

      setMode(savedMode);
      setWalletCents(balance);
      setPurchasesVisible(visibility);
      setFollowingSlugs(following);
      setPurchasedReleaseSlugs(purchases);
    });

    return () => {
      mounted = false;
    };
  }, [viewerKey]);

  useEffect(() => {
    if (isSessionLoading || !user?.id) {
      const timer = window.setTimeout(() => {
        setOrders([]);
        setOrdersError("");
        setArtistProfile(null);
        setArtistTracks([]);
        setArtistDonationsCount(0);
        setArtistSubscriptionsCount(0);
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    void fetchMyShopOrders().then((response) => {
      setOrders(response.orders);
      setOrdersError(response.error ?? "");
    });

    void fetchMyArtistProfile().then((response) => {
      if (response.error) {
        setArtistError(response.error);
        return;
      }

      setArtistError("");
      setArtistProfile(response.profile);
      setArtistTracks(response.tracks);
      setArtistDonationsCount(response.donations);
      setArtistSubscriptionsCount(response.subscriptions);

      if (response.profile) {
        setArtistDraft({
          displayName: response.profile.displayName,
          bio: response.profile.bio,
          avatarUrl: response.profile.avatarUrl ?? "",
          coverUrl: response.profile.coverUrl ?? "",
          donationEnabled: response.profile.donationEnabled,
          subscriptionEnabled: response.profile.subscriptionEnabled,
          subscriptionPriceStarsCents: String(response.profile.subscriptionPriceStarsCents),
        });
      } else {
        setArtistDraft((prev) => ({
          ...prev,
          displayName: prev.displayName || fullName,
        }));
      }
    });
  }, [fullName, isSessionLoading, user?.id]);

  const productMapById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);

  const orderPurchasedReleaseSlugs = useMemo(() => {
    const fromOrders = orders
      .flatMap((order) => order.items)
      .map((item) => productMapById.get(item.productId)?.slug)
      .filter((slug): slug is string => Boolean(slug));

    return Array.from(new Set(fromOrders));
  }, [orders, productMapById]);

  const allPurchasedReleaseSlugs = useMemo(() => {
    return Array.from(new Set([...purchasedReleaseSlugs, ...orderPurchasedReleaseSlugs]));
  }, [orderPurchasedReleaseSlugs, purchasedReleaseSlugs]);

  const profiles = useMemo(() => {
    return buildPublicProfiles({
      artists,
      products,
      followingSlugs,
      currentViewer: user,
      currentMode: mode,
      currentPurchasesVisible: purchasesVisible,
      currentPurchasedReleaseSlugs: allPurchasedReleaseSlugs,
    });
  }, [allPurchasedReleaseSlugs, artists, followingSlugs, mode, products, purchasesVisible, user]);

  const currentProfile = useMemo(() => {
    return profiles.find((profile) => profile.slug === viewerSlug) ?? null;
  }, [profiles, viewerSlug]);

  const followingProfiles = useMemo(() => {
    const set = new Set(followingSlugs);

    return profiles.filter((profile) => set.has(profile.slug) && profile.slug !== viewerSlug).slice(0, 10);
  }, [followingSlugs, profiles, viewerSlug]);

  const followerProfiles = useMemo(() => {
    const set = new Set([...followingSlugs, viewerSlug]);

    return profiles.filter((profile) => !set.has(profile.slug)).slice(0, 10);
  }, [followingSlugs, profiles, viewerSlug]);

  const activeOrders = useMemo(() => {
    return orders.filter((order) => !FINAL_ORDER_STATUSES.has(order.status));
  }, [orders]);

  const purchasedReleases = useMemo(() => {
    const bySlug = new Map(products.map((item) => [item.slug, item]));
    return allPurchasedReleaseSlugs.map((slug) => bySlug.get(slug)).filter((item): item is ShopProduct => Boolean(item));
  }, [allPurchasedReleaseSlugs, products]);

  const highlightedPosts = useMemo(() => posts.slice(0, 4), [posts]);

  const handleModeChange = async (nextMode: ProfileMode) => {
    if (!user?.id) {
      setAuthHint("Для переключения режима войдите через Telegram Widget.");
      return;
    }

    if (nextMode === mode) {
      return;
    }

    const saved = await writeProfileMode(viewerKey, nextMode);
    setMode(saved);
  };

  const handleTogglePurchasesVisibility = async () => {
    if (!user?.id) {
      setAuthHint("Сначала войдите через Telegram Widget, чтобы управлять приватностью.");
      return;
    }

    const next = await writePurchasesVisibility(viewerKey, !purchasesVisible);
    setPurchasesVisible(next);
  };

  const handleToggleFollowing = async (slug: string) => {
    if (!user?.id) {
      setAuthHint("Чтобы подписываться на пользователей, войдите через Telegram Widget.");
      return;
    }

    const targetProfile = profiles.find((profile) => profile.slug === slug);
    const next = await toggleFollowingSlug(slug, {
      displayName: targetProfile?.displayName,
      username: targetProfile?.username,
      avatarUrl: targetProfile?.avatarUrl,
    });
    setFollowingSlugs(next);
  };

  const handleMockPurchase = async (slug: string) => {
    if (!user?.id) {
      setAuthHint("Покупки доступны только после входа через Telegram Widget.");
      return;
    }

    const next = await appendPurchasedReleaseSlug(viewerKey, slug);
    setPurchasedReleaseSlugs(next);
  };

  const handleShareProfile = () => {
    const profileUrl = `${appOrigin}/profile/${viewerSlug}`;
    window.open(buildTelegramShareUrl(profileUrl, `Смотрите мой профиль и награды в Culture3k`), "_blank", "noopener,noreferrer");
  };

  const submitArtistProfile = async () => {
    if (!user?.id) {
      setArtistError("Для активации режима артиста нужна авторизация Telegram.");
      return;
    }

    setArtistSaving(true);
    setArtistError("");

    const response = await upsertMyArtistProfile({
      displayName: artistDraft.displayName,
      bio: artistDraft.bio,
      avatarUrl: artistDraft.avatarUrl,
      coverUrl: artistDraft.coverUrl,
      donationEnabled: artistDraft.donationEnabled,
      subscriptionEnabled: artistDraft.subscriptionEnabled,
      subscriptionPriceStarsCents: Math.max(1, Math.round(Number(artistDraft.subscriptionPriceStarsCents || "1"))),
    });

    setArtistSaving(false);

    if (response.error || !response.profile) {
      setArtistError(response.error ?? "Не удалось сохранить профиль артиста.");
      return;
    }

    setArtistProfile(response.profile);
    setArtistDraft({
      displayName: response.profile.displayName,
      bio: response.profile.bio,
      avatarUrl: response.profile.avatarUrl ?? "",
      coverUrl: response.profile.coverUrl ?? "",
      donationEnabled: response.profile.donationEnabled,
      subscriptionEnabled: response.profile.subscriptionEnabled,
      subscriptionPriceStarsCents: String(response.profile.subscriptionPriceStarsCents),
    });
  };

  const submitTrack = async () => {
    if (!user?.id) {
      setArtistError("Требуется авторизация Telegram.");
      return;
    }

    if (!artistProfile) {
      setArtistError("Сначала создайте профиль артиста.");
      return;
    }

    setTrackSaving(true);
    setArtistError("");

    const response = await createMyArtistTrack({
      title: trackDraft.title,
      subtitle: trackDraft.subtitle,
      audioFileId: trackDraft.audioFileId,
      previewUrl: trackDraft.previewUrl,
      genre: trackDraft.genre,
      priceStarsCents: Math.max(1, Math.round(Number(trackDraft.priceStarsCents || "1"))),
    });

    setTrackSaving(false);

    if (response.error || !response.track) {
      setArtistError(response.error ?? "Не удалось отправить трек.");
      return;
    }

    setArtistTracks((prev) => [response.track as ArtistTrack, ...prev]);
    setTrackDraft({
      title: "",
      subtitle: "",
      audioFileId: "",
      previewUrl: "",
      genre: "",
      priceStarsCents: "100",
    });
  };

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.identityRow}>
            {user?.photo_url ? (
              <img className={styles.avatarImage} src={user.photo_url} alt={fullName} />
            ) : (
              <div className={styles.avatarFallback}>{fullName.slice(0, 2).toUpperCase()}</div>
            )}

            <div className={styles.identityMeta}>
              <p className={styles.kicker}>Social Profile</p>
              <h1>{currentProfile?.displayName || fullName}</h1>
              <p>
                @{viewerSlug} · {source === "telegram-webapp" ? "Telegram Mini App" : source === "browser-widget" ? "Telegram Widget" : "Гость"}
              </p>
            </div>

            <div className={styles.roleSwitch}>
              <button
                type="button"
                className={mode === "listener" ? styles.roleSwitchActive : ""}
                onClick={() => void handleModeChange("listener")}
              >
                Покупатель
              </button>
              <button
                type="button"
                className={mode === "artist" ? styles.roleSwitchActive : ""}
                onClick={() => void handleModeChange("artist")}
              >
                Артист
              </button>
            </div>
          </div>

          <div className={styles.heroStats}>
            <article>
              <span>Подписчики</span>
              <strong>{currentProfile?.followersCount ?? 0}</strong>
            </article>
            <article>
              <span>Подписки</span>
              <strong>{followingSlugs.length}</strong>
            </article>
            <article>
              <span>Награды</span>
              <strong>{currentProfile?.awards.length ?? 0}</strong>
            </article>
            <article>
              <span>Куплено релизов</span>
              <strong>{allPurchasedReleaseSlugs.length}</strong>
            </article>
          </div>

          <div className={styles.heroActions}>
            <button type="button" onClick={handleShareProfile}>
              Поделиться профилем
            </button>
            <Link href="/search">Искать людей и релизы</Link>
            <Link href="/shop">Открыть витрину</Link>
          </div>
        </section>

        <section className={styles.walletSection}>
          <div>
            <h2>Внутренний баланс</h2>
            <p>Баланс пополняется Telegram Stars, с него оплачиваются релизы и донаты внутри платформы.</p>
          </div>

          <div className={styles.walletValue}>{formatStarsFromCents(walletCents)} ⭐</div>

          <div className={styles.walletActions}>
            <Link href="/balance">Пополнить баланс</Link>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Награды профиля</h2>
            <p>{currentProfile?.awards.length ?? 0}</p>
          </div>

          <div className={styles.awardsGrid}>
            {(currentProfile?.awards ?? []).map((award) => (
              <article key={award.id} className={`${styles.awardCard} ${styles[`awardTier${award.tier}`]}`}>
                <p>{award.icon}</p>
                <h3>{award.title}</h3>
                <span>{award.description}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Подписки и подписчики</h2>
            <p>social graph</p>
          </div>

          <div className={styles.socialColumns}>
            <div>
              <h3>Вы подписаны</h3>
              <div className={styles.socialList}>
                {followingProfiles.length > 0 ? (
                  followingProfiles.map((profile) => (
                    <article key={profile.slug} className={styles.personCard}>
                      <Link href={`/profile/${profile.slug}`}>{profile.displayName}</Link>
                      <button type="button" onClick={() => void handleToggleFollowing(profile.slug)}>
                        Отписаться
                      </button>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>Подписок пока нет.</p>
                )}
              </div>
            </div>

            <div>
              <h3>Вас читают</h3>
              <div className={styles.socialList}>
                {followerProfiles.map((profile) => (
                  <article key={profile.slug} className={styles.personCard}>
                    <Link href={`/profile/${profile.slug}`}>{profile.displayName}</Link>
                    <button type="button" onClick={() => void handleToggleFollowing(profile.slug)}>
                      {followingSlugs.includes(profile.slug) ? "Подписан" : "Подписаться"}
                    </button>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Купленные релизы</h2>
            <p>{purchasedReleases.length}</p>
          </div>

          <label className={styles.visibilityToggle}>
            <input type="checkbox" checked={purchasesVisible} onChange={() => void handleTogglePurchasesVisibility()} />
            Показывать покупки подписчикам
          </label>

          {purchasesVisible ? (
            <div className={styles.releaseGrid}>
              {purchasedReleases.length > 0 ? (
                purchasedReleases.map((release) => (
                  <article key={release.slug} className={styles.releaseCard}>
                    <Link href={`/shop/${release.slug}`}>
                      <img src={release.image} alt={release.title} loading="lazy" />
                    </Link>
                    <div>
                      <Link href={`/shop/${release.slug}`}>{release.title}</Link>
                      <p>{formatStarsFromCents(release.priceStarsCents)} ⭐</p>
                      <button type="button" onClick={() => void handleMockPurchase(release.slug)}>
                        Поднять в витрину
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.emptyState}>
                  Пока пусто. Покупайте релизы и хвастайтесь коллекцией перед друзьями.
                </p>
              )}
            </div>
          ) : (
            <p className={styles.emptyState}>Витрина покупок скрыта. Откройте её, чтобы друзья видели вашу коллекцию.</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Лента из блога</h2>
            <p>{highlightedPosts.length}</p>
          </div>

          <div className={styles.blogList}>
            {highlightedPosts.map((post) => (
              <Link key={post.slug} href={`/post/${post.slug}`} className={styles.blogCard}>
                <img src={post.cover.src} alt={post.title} loading="lazy" />
                <div>
                  <strong>{post.title}</strong>
                  <p>{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Заказы</h2>
            <p>{activeOrders.length} активных</p>
          </div>

          {ordersError ? <p className={styles.warning}>Ошибка загрузки заказов: {ordersError}</p> : null}

          {activeOrders.length > 0 ? (
            <div className={styles.ordersRow}>
              {activeOrders.map((order) => (
                <article key={order.id} className={styles.orderCard}>
                  <p>#{order.id}</p>
                  <span>{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span>
                  <strong>{formatStarsFromCents(order.totalStarsCents)} ⭐</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>Активных заказов сейчас нет.</p>
          )}
        </section>

        {mode === "artist" ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Режим артиста</h2>
              <p>{artistProfile?.status ?? "не активирован"}</p>
            </div>

            <div className={styles.artistStats}>
              <span>Баланс артиста: {formatStarsFromCents(artistProfile?.balanceStarsCents ?? 0)} ⭐</span>
              <span>Заработано: {formatStarsFromCents(artistProfile?.lifetimeEarningsStarsCents ?? 0)} ⭐</span>
              <span>Донатов: {artistDonationsCount}</span>
              <span>Подписок: {artistSubscriptionsCount}</span>
            </div>

            <div className={styles.artistFormGrid}>
              <label>
                Имя артиста
                <input
                  value={artistDraft.displayName}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                />
              </label>
              <label>
                Bio
                <textarea
                  value={artistDraft.bio}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, bio: event.target.value }))}
                />
              </label>
              <label>
                Avatar URL
                <input
                  value={artistDraft.avatarUrl}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                />
              </label>
              <label>
                Cover URL
                <input
                  value={artistDraft.coverUrl}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, coverUrl: event.target.value }))}
                />
              </label>
              <label>
                Подписка (cents)
                <input
                  type="number"
                  min={1}
                  value={artistDraft.subscriptionPriceStarsCents}
                  onChange={(event) =>
                    setArtistDraft((prev) => ({ ...prev, subscriptionPriceStarsCents: event.target.value }))
                  }
                />
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={artistDraft.donationEnabled}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, donationEnabled: event.target.checked }))}
                />
                Донаты включены
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={artistDraft.subscriptionEnabled}
                  onChange={(event) =>
                    setArtistDraft((prev) => ({ ...prev, subscriptionEnabled: event.target.checked }))
                  }
                />
                Подписка включена
              </label>
            </div>

            <button type="button" className={styles.primaryButton} onClick={() => void submitArtistProfile()} disabled={artistSaving}>
              {artistSaving ? "Сохраняем..." : artistProfile ? "Обновить профиль артиста" : "Активировать профиль артиста"}
            </button>

            <div className={styles.artistFormGrid}>
              <label>
                Название релиза
                <input
                  value={trackDraft.title}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label>
                Подзаголовок
                <input
                  value={trackDraft.subtitle}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                />
              </label>
              <label>
                Telegram audio_file_id
                <input
                  value={trackDraft.audioFileId}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, audioFileId: event.target.value }))}
                />
              </label>
              <label>
                Preview URL
                <input
                  value={trackDraft.previewUrl}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, previewUrl: event.target.value }))}
                />
              </label>
              <label>
                Жанр
                <input
                  value={trackDraft.genre}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, genre: event.target.value }))}
                />
              </label>
              <label>
                Цена (cents)
                <input
                  type="number"
                  min={1}
                  value={trackDraft.priceStarsCents}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, priceStarsCents: event.target.value }))}
                />
              </label>
            </div>

            <button type="button" className={styles.primaryButton} onClick={() => void submitTrack()} disabled={trackSaving}>
              {trackSaving ? "Отправка..." : "Добавить релиз"}
            </button>

            {artistTracks.length > 0 ? (
              <div className={styles.artistTrackList}>
                {artistTracks.slice(0, 8).map((track) => (
                  <article key={track.id} className={styles.artistTrackCard}>
                    <strong>{track.title}</strong>
                    <p>{track.subtitle || track.genre || "Single"}</p>
                    <span>{formatStarsFromCents(track.priceStarsCents)} ⭐</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>У вас пока нет опубликованных релизов.</p>
            )}

            {artistError ? <p className={styles.warning}>{artistError}</p> : null}
          </section>
        ) : null}

        {!user && !isSessionLoading ? (
          <section className={styles.section}>
            <h2>Вход через Telegram</h2>
            <TelegramLoginWidget
              onAuthorized={() => {
                setAuthHint("");
                void refreshSession();
              }}
            />
            <p className={styles.emptyState}>Без авторизации недоступны персональные покупки, баланс и публикация релизов.</p>
          </section>
        ) : null}

        {!user?.id && authHint ? <p className={styles.warning}>{authHint}</p> : null}

        {catalogLoading ? <p className={styles.loading}>Обновляем социальный профиль...</p> : null}
      </main>
    </div>
  );
}
