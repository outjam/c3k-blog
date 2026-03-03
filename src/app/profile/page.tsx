"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ShopAdminOrdersPanel } from "@/components/shop/shop-admin-orders-panel";
import { posts } from "@/data/posts";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { applyAppTheme, readThemePreference, resolveAutoTheme, saveThemePreference, type AppTheme } from "@/lib/app-theme";
import { readBookmarkedPostSlugs } from "@/lib/post-bookmarks";
import { isShopAdminUserClient } from "@/lib/shop-admin-client";
import { FINAL_ORDER_STATUSES, SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { fetchMyShopOrders } from "@/lib/shop-orders-api";
import { readShopOrders } from "@/lib/shop-orders";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ShopOrder } from "@/types/shop";

import styles from "./page.module.scss";

export default function ProfilePage() {
  const webApp = useTelegramWebApp();
  const user = webApp?.initDataUnsafe?.user;
  const formatBool = (value: boolean | undefined): string => (value ? "да" : "нет");
  const [theme, setTheme] = useState<AppTheme | null>(null);
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<ShopOrder | null>(null);
  const [bookmarkedSlugs, setBookmarkedSlugs] = useState<string[]>([]);
  const [focusOrdersSection, setFocusOrdersSection] = useState(false);
  const [ordersError, setOrdersError] = useState("");
  const isAdmin = isShopAdminUserClient(user?.id);

  const fullName = useMemo(() => {
    if (!user) {
      return "Гость";
    }

    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  }, [user]);

  const bookmarkedPosts = useMemo(() => {
    const set = new Set(bookmarkedSlugs);
    return posts.filter((post) => set.has(post.slug));
  }, [bookmarkedSlugs]);

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

      if (fromApi.orders.length > 0 || !fromApi.error) {
        setOrders(fromApi.orders);
        setOrdersError(fromApi.error ?? "");
        return;
      }

      const localOrders = await readShopOrders();
      setOrders(localOrders);
      setOrdersError(fromApi.error ?? "");
    })();

    void readBookmarkedPostSlugs().then((slugs) => setBookmarkedSlugs(slugs));

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [user?.id]);

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
            <p className={styles.emptyState}>Добавьте статьи в избранное из ленты или страницы записи.</p>
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
