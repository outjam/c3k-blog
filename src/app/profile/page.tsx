"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ShopAdminOrdersPanel } from "@/components/shop/shop-admin-orders-panel";
import type { BlogPost } from "@/types/blog";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { createMyArtistTrack, fetchAdminSession, fetchMyArtistProfile, fetchPublicCatalog, upsertMyArtistProfile } from "@/lib/admin-api";
import { applyAppTheme, readThemePreference, resolveAutoTheme, saveThemePreference, type AppTheme } from "@/lib/app-theme";
import { readBookmarkedPostSlugs } from "@/lib/post-bookmarks";
import { readFavoriteProductIds } from "@/lib/product-favorites";
import { isShopAdminUserClient } from "@/lib/shop-admin-client";
import { FINAL_ORDER_STATUSES, SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { fetchMyShopOrders } from "@/lib/shop-orders-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ArtistProfile, ArtistTrack, ShopOrder, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

export default function ProfilePage() {
  const webApp = useTelegramWebApp();
  const user = webApp?.initDataUnsafe?.user;
  const formatBool = (value: boolean | undefined): string => (value ? "да" : "нет");
  const [theme, setTheme] = useState<AppTheme | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<string[]>([]);
  const [blogPosts, setBlogPosts] = useState<BlogPost[]>([]);
  const [blogPostsLoading, setBlogPostsLoading] = useState(true);
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ShopProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [focusOrdersSection, setFocusOrdersSection] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const [isAdmin, setIsAdmin] = useState(isShopAdminUserClient(user?.id));
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
    description: "",
    coverImage: "",
    audioFileId: "",
    previewUrl: "",
    genre: "",
    priceStarsCents: "100",
  });

  const fullName = useMemo(() => {
    if (!user) {
      return "Гость";
    }

    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  }, [user]);

  const bookmarkedPosts = useMemo(() => {
    const set = new Set(bookmarkedSlugs);
    return blogPosts.filter((post) => set.has(post.slug));
  }, [blogPosts, bookmarkedSlugs]);

  const favoriteProducts = useMemo(() => {
    const set = new Set(favoriteProductIds);
    return catalogProducts.filter((product) => set.has(product.id));
  }, [catalogProducts, favoriteProductIds]);

  const activeOrders = useMemo(() => {
    return orders.filter((order) => !FINAL_ORDER_STATUSES.has(order.status));
  }, [orders]);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      const currentTheme = document.documentElement.getAttribute("data-app-theme");
      setTheme(currentTheme === "light" || currentTheme === "dark" ? currentTheme : resolveAutoTheme());
    });

    void readThemePreference().then((savedTheme) => {
      if (savedTheme) {
        setTheme(savedTheme);
      }
    });

    void (async () => {
      const fromApi = await fetchMyShopOrders();
      setOrders(fromApi.orders);
      setOrdersError(fromApi.error ?? "");
    })();

    void readBookmarkedPostSlugs().then((slugs) => setBookmarkedSlugs(slugs));
    void readFavoriteProductIds().then((ids) => setFavoriteProductIds(ids));

    void (async () => {
      setBlogPostsLoading(true);

      try {
        const response = await fetch("/api/blog/posts", { cache: "no-store" });
        const payload = (await response.json()) as { posts?: BlogPost[] };
        setBlogPosts(Array.isArray(payload.posts) ? payload.posts : []);
      } catch {
        setBlogPosts([]);
      } finally {
        setBlogPostsLoading(false);
      }
    })();

    void (async () => {
      setProductsLoading(true);

      const snapshot = await fetchPublicCatalog();

      if (!snapshot.error) {
        setCatalogProducts(snapshot.products);
      } else {
        setCatalogProducts([]);
      }

      setProductsLoading(false);
    })();

    void fetchAdminSession().then((response) => {
      if (!response.error && response.session) {
        setIsAdmin(Boolean(response.session.isAdmin));
      }
    });

    void fetchMyArtistProfile().then((response) => {
      if (response.error) {
        setArtistError(response.error);
        return;
      }

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

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [fullName, user?.id]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setFocusOrdersSection(params.get("section") === "orders");
  }, []);

  useEffect(() => {
    if (focusOrdersSection && activeOrders.length > 0) {
      setSelectedOrder(activeOrders[0] ?? null);
    }
  }, [activeOrders, focusOrdersSection]);

  const handleThemeChange = async (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    applyAppTheme(nextTheme);
    await saveThemePreference(nextTheme);
  };

  const submitArtistProfile = async () => {
    setArtistSaving(true);
    setArtistError("");

    const profileResponse = await upsertMyArtistProfile({
      displayName: artistDraft.displayName,
      bio: artistDraft.bio,
      avatarUrl: artistDraft.avatarUrl,
      coverUrl: artistDraft.coverUrl,
      donationEnabled: artistDraft.donationEnabled,
      subscriptionEnabled: artistDraft.subscriptionEnabled,
      subscriptionPriceStarsCents: Math.max(1, Math.round(Number(artistDraft.subscriptionPriceStarsCents || "1"))),
    });

    setArtistSaving(false);

    if (profileResponse.error || !profileResponse.profile) {
      setArtistError(profileResponse.error ?? "Не удалось сохранить профиль артиста.");
      return;
    }

    setArtistProfile(profileResponse.profile);
    setArtistDraft({
      displayName: profileResponse.profile.displayName,
      bio: profileResponse.profile.bio,
      avatarUrl: profileResponse.profile.avatarUrl ?? "",
      coverUrl: profileResponse.profile.coverUrl ?? "",
      donationEnabled: profileResponse.profile.donationEnabled,
      subscriptionEnabled: profileResponse.profile.subscriptionEnabled,
      subscriptionPriceStarsCents: String(profileResponse.profile.subscriptionPriceStarsCents),
    });
  };

  const submitTrack = async () => {
    if (!artistProfile) {
      setArtistError("Сначала создайте профиль артиста.");
      return;
    }

    setTrackSaving(true);
    setArtistError("");

    const trackResponse = await createMyArtistTrack({
      title: trackDraft.title,
      subtitle: trackDraft.subtitle,
      description: trackDraft.description,
      coverImage: trackDraft.coverImage,
      audioFileId: trackDraft.audioFileId,
      previewUrl: trackDraft.previewUrl,
      genre: trackDraft.genre,
      priceStarsCents: Math.max(1, Math.round(Number(trackDraft.priceStarsCents || "1"))),
    });

    setTrackSaving(false);

    if (trackResponse.error || !trackResponse.track) {
      setArtistError(trackResponse.error ?? "Не удалось отправить трек на модерацию.");
      return;
    }

    const createdTrack = trackResponse.track;
    setArtistTracks((prev) => [createdTrack, ...prev]);
    setTrackDraft({
      title: "",
      subtitle: "",
      description: "",
      coverImage: "",
      audioFileId: "",
      previewUrl: "",
      genre: "",
      priceStarsCents: "100",
    });
  };

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Профиль</h1>
        <p className={styles.subtitle}>Данные пользователя, активные заказы и избранные публикации.</p>

        {user?.photo_url ? (
          <img className={styles.photo} src={user.photo_url} alt={fullName} />
        ) : (
          <div className={styles.avatar} aria-hidden>
            {fullName.slice(0, 2).toUpperCase()}
          </div>
        )}

        {isAdmin ? (
          <Link href="/admin" className={styles.adminEntryButton}>
            Перейти в админку
          </Link>
        ) : null}

        <div className={styles.themeBox}>
          <p className={styles.themeTitle}>Тема приложения</p>
          <div className={styles.themeActions}>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "light" ? styles.themeButtonActive : ""}`}
              onClick={() => void handleThemeChange("light")}
            >
              Светлая
            </button>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "dark" ? styles.themeButtonActive : ""}`}
              onClick={() => void handleThemeChange("dark")}
            >
              Тёмная
            </button>
          </div>
        </div>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Активные заказы</h2>
            <p>{activeOrders.length} шт.</p>
          </div>

          {ordersError ? <p className={styles.warning}>Сервер заказов недоступен: {ordersError}</p> : null}

          {activeOrders.length === 0 ? (
            <p className={styles.emptyState}>Активных заказов пока нет.</p>
          ) : (
            <div className={styles.ordersScroller}>
              {activeOrders.map((order) => (
                <article key={order.id} className={styles.orderCard}>
                  <p className={styles.orderId}>#{order.id}</p>
                  <p className={styles.orderStatus}>{SHOP_ORDER_STATUS_LABELS[order.status]}</p>
                  <p className={styles.orderMeta}>{new Date(order.createdAt).toLocaleString("ru-RU")}</p>
                  <p className={styles.orderMeta}>Итого: {formatStarsFromCents(order.totalStarsCents)} ⭐</p>
                  <p className={styles.orderMeta}>Доставка: {order.delivery === "yandex_go" ? "Яндекс Go" : "CDEK"}</p>
                  <button type="button" className={styles.inlineButton} onClick={() => setSelectedOrder(order)}>
                    Открыть детали
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <ShopAdminOrdersPanel enabled={isAdmin} />

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Кабинет артиста</h2>
            <p>{artistProfile ? artistProfile.status : "не активирован"}</p>
          </div>

          <p className={styles.emptyState}>
            {artistProfile
              ? "Профиль артиста активен. Добавляйте релизы, управляйте донатами и подпиской."
              : "Станьте артистом, чтобы публиковать треки в витрине после модерации."}
          </p>

          <div className={styles.artistDraftGrid}>
            <label>
              Имя артиста
              <input
                value={artistDraft.displayName}
                onChange={(event) => setArtistDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                placeholder="Stage name"
              />
            </label>
            <label>
              Био
              <textarea
                value={artistDraft.bio}
                onChange={(event) => setArtistDraft((prev) => ({ ...prev, bio: event.target.value }))}
                placeholder="Коротко о вас"
              />
            </label>
            <label>
              Avatar URL
              <input
                value={artistDraft.avatarUrl}
                onChange={(event) => setArtistDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Cover URL
              <input
                value={artistDraft.coverUrl}
                onChange={(event) => setArtistDraft((prev) => ({ ...prev, coverUrl: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Цена подписки (cents)
              <input
                type="number"
                min={1}
                value={artistDraft.subscriptionPriceStarsCents}
                onChange={(event) =>
                  setArtistDraft((prev) => ({ ...prev, subscriptionPriceStarsCents: event.target.value }))
                }
              />
            </label>
            <label className={styles.checkboxInline}>
              <input
                type="checkbox"
                checked={artistDraft.donationEnabled}
                onChange={(event) => setArtistDraft((prev) => ({ ...prev, donationEnabled: event.target.checked }))}
              />
              Донаты включены
            </label>
            <label className={styles.checkboxInline}>
              <input
                type="checkbox"
                checked={artistDraft.subscriptionEnabled}
                onChange={(event) => setArtistDraft((prev) => ({ ...prev, subscriptionEnabled: event.target.checked }))}
              />
              Подписка включена
            </label>
          </div>

          <button type="button" className={styles.inlineButton} onClick={() => void submitArtistProfile()} disabled={artistSaving}>
            {artistSaving ? "Сохраняем..." : artistProfile ? "Обновить профиль артиста" : "Стать артистом"}
          </button>

          {artistProfile ? (
            <div className={styles.artistStats}>
              <p>Баланс: {formatStarsFromCents(artistProfile.balanceStarsCents)} ⭐</p>
              <p>Заработано: {formatStarsFromCents(artistProfile.lifetimeEarningsStarsCents)} ⭐</p>
              <p>Донатов: {artistDonationsCount}</p>
              <p>Подписок: {artistSubscriptionsCount}</p>
            </div>
          ) : null}

          <div className={styles.artistDraftGrid}>
            <label>
              Название трека
              <input
                value={trackDraft.title}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, title: event.target.value }))}
                placeholder="My new track"
              />
            </label>
            <label>
              Подзаголовок
              <input
                value={trackDraft.subtitle}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                placeholder="Single"
              />
            </label>
            <label>
              Описание
              <textarea
                value={trackDraft.description}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, description: event.target.value }))}
              />
            </label>
            <label>
              Cover URL
              <input
                value={trackDraft.coverImage}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, coverImage: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Telegram `audio_file_id`
              <input
                value={trackDraft.audioFileId}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, audioFileId: event.target.value }))}
                placeholder="BQACAgIAAxkBAA..."
              />
            </label>
            <label>
              Preview URL
              <input
                value={trackDraft.previewUrl}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, previewUrl: event.target.value }))}
                placeholder="https://..."
              />
            </label>
            <label>
              Жанр
              <input
                value={trackDraft.genre}
                onChange={(event) => setTrackDraft((prev) => ({ ...prev, genre: event.target.value }))}
                placeholder="Ambient"
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

          <button type="button" className={styles.inlineButton} onClick={() => void submitTrack()} disabled={trackSaving}>
            {trackSaving ? "Отправка..." : "Отправить трек на модерацию"}
          </button>

          {artistTracks.length > 0 ? (
            <div className={styles.artistTracksList}>
              {artistTracks.map((track) => (
                <article key={track.id} className={styles.artistTrackCard}>
                  <strong>{track.title}</strong>
                  <p>{track.subtitle}</p>
                  <p>
                    Статус: {track.status} · {formatStarsFromCents(track.priceStarsCents)} ⭐
                  </p>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>У вас пока нет треков.</p>
          )}

          {artistError ? <p className={styles.warning}>{artistError}</p> : null}
        </section>

        {isAdmin ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Администрирование</h2>
              <p>доступ</p>
            </div>
            <Link href="/admin" className={styles.inlineButton}>
              Открыть полную админку
            </Link>
          </section>
        ) : null}

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Избранные посты</h2>
            <p>{bookmarkedPosts.length} шт.</p>
          </div>

          {bookmarkedPosts.length === 0 ? (
            <p className={styles.emptyState}>
              {blogPostsLoading ? "Загружаем избранные посты..." : "Добавьте статьи в избранное из ленты или страницы записи."}
            </p>
          ) : (
            <div className={styles.bookmarksList}>
              {bookmarkedPosts.map((post) => (
                <Link key={post.slug} href={`/post/${post.slug}`} className={styles.bookmarkPost}>
                  <img src={post.cover.src} alt={post.cover.alt} loading="lazy" />
                  <div>
                    <h3>{post.title}</h3>
                    <p>{post.readTime}</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Избранные товары</h2>
            <p>{favoriteProducts.length} шт.</p>
          </div>

          {favoriteProducts.length === 0 ? (
            <p className={styles.emptyState}>
              {productsLoading ? "Загружаем избранные товары..." : "Добавьте товары в избранное из каталога или карточки товара."}
            </p>
          ) : (
            <div className={styles.favoritesList}>
              {favoriteProducts.map((product) => (
                <Link key={product.id} href={`/shop/${product.slug}`} className={styles.favoriteProduct}>
                  <img src={product.image} alt={product.title} loading="lazy" />
                  <div>
                    <h3>{product.title}</h3>
                    <p>{formatStarsFromCents(product.priceStarsCents)} ⭐</p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>Имя (полное)</dt>
            <dd>{fullName}</dd>
          </div>
          <div className={styles.row}>
            <dt>Username</dt>
            <dd>{user?.username ? `@${user.username}` : "не указан"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Telegram ID</dt>
            <dd>{user?.id ?? "недоступен"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Premium</dt>
            <dd>{formatBool(user?.is_premium)}</dd>
          </div>
          <div className={styles.row}>
            <dt>Платформа</dt>
            <dd>{webApp?.platform ?? "недоступно"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Версия WebApp</dt>
            <dd>{webApp?.version ?? "недоступно"}</dd>
          </div>
        </dl>

        {!user ? <p className={styles.warning}>Открой Mini App внутри Telegram, чтобы получить данные пользователя.</p> : null}
      </section>

      {selectedOrder ? (
        <div className={styles.orderModalRoot}>
          <button type="button" className={styles.orderModalBackdrop} onClick={() => setSelectedOrder(null)} aria-label="Закрыть" />
          <section className={styles.orderModal}>
            <header className={styles.orderModalHead}>
              <h3>Заказ #{selectedOrder.id}</h3>
              <button type="button" onClick={() => setSelectedOrder(null)}>
                Закрыть
              </button>
            </header>
            <p className={styles.orderMeta}>Статус: {SHOP_ORDER_STATUS_LABELS[selectedOrder.status]}</p>
            <p className={styles.orderMeta}>Адрес: {selectedOrder.address}</p>
            <p className={styles.orderMeta}>Обновлён: {new Date(selectedOrder.updatedAt).toLocaleString("ru-RU")}</p>

            <div className={styles.orderItemsScroll}>
              <table>
                <thead>
                  <tr>
                    <th>Товар</th>
                    <th>Кол-во</th>
                    <th>Цена</th>
                    <th>Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedOrder.items.map((item) => (
                    <tr key={`${item.productId}-${item.title}`}>
                      <td>{item.title}</td>
                      <td>{item.quantity}</td>
                      <td>{formatStarsFromCents(item.priceStarsCents)} ⭐</td>
                      <td>{formatStarsFromCents(item.priceStarsCents * item.quantity)} ⭐</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedOrder.history.length > 0 ? (
              <div className={styles.orderHistory}>
                <h4>История статусов</h4>
                <ul>
                  {selectedOrder.history.slice(0, 12).map((entry) => (
                    <li key={entry.id}>
                      {new Date(entry.at).toLocaleString("ru-RU")} ·{" "}
                      {entry.fromStatus ? `${SHOP_ORDER_STATUS_LABELS[entry.fromStatus]} → ` : ""}
                      {SHOP_ORDER_STATUS_LABELS[entry.toStatus]}
                      {entry.note ? ` · ${entry.note}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
