"use client";

import { useEffect, useMemo, useState } from "react";

import { fetchAdminOrders } from "@/lib/admin-api";
import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { updateAdminOrderStatus } from "@/lib/shop-orders-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ShopOrder, ShopOrderStatus } from "@/types/shop";

import styles from "./shop-admin-orders-panel.module.scss";

interface ShopAdminOrdersPanelProps {
  enabled: boolean;
  canManage?: boolean;
}

interface DraftState {
  status: ShopOrderStatus;
  note: string;
}

const STATUS_OPTIONS = Object.entries(SHOP_ORDER_STATUS_LABELS).map(([value, label]) => ({
  value: value as ShopOrderStatus,
  label,
}));

const toOrderDraft = (order: ShopOrder): DraftState => {
  return { status: order.status, note: "" };
};

export function ShopAdminOrdersPanel({ enabled, canManage = true }: ShopAdminOrdersPanelProps) {
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShopOrderStatus | "all">("all");
  const [query, setQuery] = useState("");
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  const loadOrders = async () => {
    setLoading(true);
    setError("");

    const response = await fetchAdminOrders({ status: statusFilter, query });

    if (response.error) {
      setError(response.error);
      setLoading(false);
      return;
    }

    setOrders(response.orders);
    setDrafts((prev) => {
      const next = { ...prev };

      for (const order of response.orders) {
        next[order.id] = prev[order.id] ?? toOrderDraft(order);
      }

      return next;
    });
    setLoading(false);
  };

  useEffect(() => {
    if (!enabled) {
      return;
    }

    void loadOrders();
  }, [enabled, statusFilter]);

  const summary = useMemo(() => {
    const counters: Partial<Record<ShopOrderStatus, number>> = {};

    for (const order of orders) {
      counters[order.status] = (counters[order.status] ?? 0) + 1;
    }

    return counters;
  }, [orders]);

  if (!enabled) {
    return null;
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <h2>Админка заказов</h2>
        <button type="button" onClick={() => void loadOrders()} disabled={loading}>
          {loading ? "Обновляем..." : "Обновить"}
        </button>
      </div>

      <div className={styles.filters}>
        <label>
          Статус
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ShopOrderStatus | "all")}>
            <option value="all">Все</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Поиск
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ID, клиент, телефон, username"
          />
        </label>
        <button type="button" onClick={() => void loadOrders()} disabled={loading}>
          Найти
        </button>
      </div>

      <div className={styles.statusRow}>
        {STATUS_OPTIONS.map((option) => (
          <span key={option.value}>
            {option.label}: <b>{summary[option.value] ?? 0}</b>
          </span>
        ))}
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      {orders.length === 0 ? (
        <p className={styles.empty}>Заказы не найдены.</p>
      ) : (
        <div className={styles.list}>
          {orders.map((order) => {
            const draft = drafts[order.id] ?? toOrderDraft(order);
            const isSaving = savingId === order.id;

            return (
              <article key={order.id} className={styles.card}>
                <div className={styles.cardHead}>
                  <h3>№ {order.id}</h3>
                  <p>{SHOP_ORDER_STATUS_LABELS[order.status]}</p>
                </div>

                <p className={styles.meta}>
                  Клиент: {order.customerName || "Без имени"} · Telegram: {order.telegramUserId}
                  {order.telegramUsername ? ` · @${order.telegramUsername}` : ""}
                </p>
                <p className={styles.meta}>Телефон: {order.phone || "не указан"} · Адрес: {order.address || "не указан"}</p>
                <p className={styles.meta}>
                  Сумма: {formatStarsFromCents(order.totalStarsCents)} ⭐ · Создан: {new Date(order.createdAt).toLocaleString("ru-RU")}
                </p>
                <ul className={styles.items}>
                  {order.items.map((item) => (
                    <li key={`${order.id}-${item.productId}-${item.title}`}>
                      {item.title} × {item.quantity}
                    </li>
                  ))}
                </ul>

                <div className={styles.actions}>
                  <select
                    value={draft.status}
                    disabled={!canManage}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [order.id]: {
                          ...draft,
                          status: event.target.value as ShopOrderStatus,
                        },
                      }))
                    }
                  >
                    {STATUS_OPTIONS.map((option) => (
                      <option key={`${order.id}-${option.value}`} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <input
                    value={draft.note}
                    disabled={!canManage}
                    onChange={(event) =>
                      setDrafts((prev) => ({
                        ...prev,
                        [order.id]: {
                          ...draft,
                          note: event.target.value,
                        },
                      }))
                    }
                    placeholder="Комментарий к изменению"
                  />
                  <button
                    type="button"
                    disabled={isSaving || !canManage}
                    onClick={async () => {
                      if (!canManage) {
                        return;
                      }

                      setSavingId(order.id);
                      const result = await updateAdminOrderStatus({
                        orderId: order.id,
                        status: draft.status,
                        note: draft.note,
                      });
                      setSavingId(null);

                      if (result.error || !result.order) {
                        setError(result.error ?? "Не удалось обновить статус.");
                        return;
                      }

                      const updatedOrder = result.order;
                      setOrders((prev) => prev.map((item) => (item.id === updatedOrder.id ? updatedOrder : item)));
                      setDrafts((prev) => ({
                        ...prev,
                        [order.id]: toOrderDraft(updatedOrder),
                      }));
                    }}
                  >
                    {isSaving ? "Сохраняем..." : canManage ? "Применить" : "Только просмотр"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
