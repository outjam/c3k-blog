"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { fetchShopOrderById } from "@/lib/shop-orders-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ShopOrder } from "@/types/shop";

import styles from "./page.module.scss";

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const rawId = params?.id ?? "";
  const orderId = decodeURIComponent(rawId).trim().toUpperCase();

  const [order, setOrder] = useState<ShopOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) {
      setOrder(null);
      setError("Неверный номер заказа");
      setLoading(false);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setLoading(true);
      const result = await fetchShopOrderById(orderId);

      if (cancelled) {
        return;
      }

      setOrder(result.order);
      setError(result.error ?? "");
      setLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [orderId]);

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <header className={styles.head}>
          <div>
            <h1>Заказ #{orderId || "—"}</h1>
            <p>Полная информация по заказу и история обновлений.</p>
          </div>

          <div className={styles.links}>
            <Link href="/profile?section=orders">Мои заказы</Link>
            <Link href="/shop">Магазин</Link>
          </div>
        </header>

        {loading ? <p className={styles.muted}>Загрузка заказа...</p> : null}
        {!loading && error ? <p className={styles.error}>{error}</p> : null}

        {!loading && !error && !order ? <p className={styles.muted}>Заказ не найден.</p> : null}

        {order ? (
          <div className={styles.content}>
            <section className={styles.info}>
              <div className={styles.row}>
                <dt>Статус</dt>
                <dd>{SHOP_ORDER_STATUS_LABELS[order.status]}</dd>
              </div>
              <div className={styles.row}>
                <dt>Создан</dt>
                <dd>{new Date(order.createdAt).toLocaleString("ru-RU")}</dd>
              </div>
              <div className={styles.row}>
                <dt>Обновлён</dt>
                <dd>{new Date(order.updatedAt).toLocaleString("ru-RU")}</dd>
              </div>
              <div className={styles.row}>
                <dt>Имя</dt>
                <dd>{order.customerName || "не указано"}</dd>
              </div>
              <div className={styles.row}>
                <dt>Телефон</dt>
                <dd>{order.phone || "не указан"}</dd>
              </div>
              <div className={styles.row}>
                <dt>Доставка</dt>
                <dd>{order.delivery === "yandex_go" ? "Яндекс Go" : "CDEK"}</dd>
              </div>
              <div className={styles.row}>
                <dt>Адрес</dt>
                <dd>{order.address || "не указан"}</dd>
              </div>
              <div className={styles.row}>
                <dt>Итого</dt>
                <dd>{formatStarsFromCents(order.totalStarsCents)} ⭐</dd>
              </div>
              {order.comment ? (
                <div className={styles.row}>
                  <dt>Комментарий</dt>
                  <dd>{order.comment}</dd>
                </div>
              ) : null}
            </section>

            <section className={styles.itemsWrap}>
              <h2>Состав заказа</h2>
              <div className={styles.itemsScroll}>
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
                    {order.items.map((item) => (
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
            </section>

            <section className={styles.history}>
              <h2>История статусов</h2>
              {order.history.length === 0 ? (
                <p className={styles.muted}>История пока пустая.</p>
              ) : (
                <ul>
                  {order.history.map((entry) => (
                    <li key={entry.id}>
                      <span>{new Date(entry.at).toLocaleString("ru-RU")}</span>
                      <b>
                        {entry.fromStatus ? `${SHOP_ORDER_STATUS_LABELS[entry.fromStatus]} → ` : ""}
                        {SHOP_ORDER_STATUS_LABELS[entry.toStatus]}
                      </b>
                      {entry.note ? <em>{entry.note}</em> : null}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </div>
  );
}

