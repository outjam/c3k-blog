"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { ShopAdminOrdersPanel } from "@/components/shop/shop-admin-orders-panel";
import {
  createAdminPromo,
  deleteAdminPromo,
  fetchAdminCustomers,
  fetchAdminDashboard,
  fetchAdminProducts,
  fetchAdminPromos,
  fetchAdminSettings,
  patchAdminProduct,
  patchAdminPromo,
  patchAdminSettings,
  type AdminCustomer,
  type AdminDashboardData,
  type AdminProductWithMeta,
} from "@/lib/admin-api";
import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { isShopAdminUserClient } from "@/lib/shop-admin-client";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ShopAppSettings, ShopPromoCode } from "@/types/shop";

import styles from "./page.module.scss";

type AdminTab = "dashboard" | "orders" | "customers" | "products" | "promos" | "settings";

interface ProductDraft {
  priceStarsCents: string;
  stock: string;
  isPublished: boolean;
  isFeatured: boolean;
  badge: string;
}

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "orders", label: "Заказы" },
  { id: "customers", label: "Клиенты" },
  { id: "products", label: "Товары" },
  { id: "promos", label: "Промокоды" },
  { id: "settings", label: "Настройки" },
];

const toProductDraft = (product: AdminProductWithMeta): ProductDraft => {
  return {
    priceStarsCents: String(product.adminOverride?.priceStarsCents ?? ""),
    stock: String(product.adminOverride?.stock ?? ""),
    isPublished: product.adminOverride?.isPublished ?? true,
    isFeatured: product.adminOverride?.isFeatured ?? false,
    badge: product.adminOverride?.badge ?? "",
  };
};

export default function AdminPage() {
  const webApp = useTelegramWebApp();
  const user = webApp?.initDataUnsafe?.user;
  const isAdmin = isShopAdminUserClient(user?.id);
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [products, setProducts] = useState<AdminProductWithMeta[]>([]);
  const [promos, setPromos] = useState<ShopPromoCode[]>([]);
  const [settings, setSettings] = useState<ShopAppSettings | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoLabel, setNewPromoLabel] = useState("");
  const [newPromoType, setNewPromoType] = useState<"percent" | "fixed">("percent");
  const [newPromoValue, setNewPromoValue] = useState("10");
  const [newPromoMinSubtotal, setNewPromoMinSubtotal] = useState("0");

  const loadAll = async () => {
    setLoading(true);
    setError("");

    const [dashboardRes, customersRes, productsRes, promosRes, settingsRes] = await Promise.all([
      fetchAdminDashboard(),
      fetchAdminCustomers(),
      fetchAdminProducts(),
      fetchAdminPromos(),
      fetchAdminSettings(),
    ]);

    if (dashboardRes.error || customersRes.error || productsRes.error || promosRes.error || settingsRes.error) {
      setError(
        dashboardRes.error ||
          customersRes.error ||
          productsRes.error ||
          promosRes.error ||
          settingsRes.error ||
          "Unknown error",
      );
    }

    setDashboard(dashboardRes.data);
    setCustomers(customersRes.customers);
    setProducts(productsRes.products);
    setPromos(promosRes.promos);
    setSettings(settingsRes.settings);
    setProductDrafts((prev) => {
      const next = { ...prev };

      for (const product of productsRes.products) {
        next[product.id] = prev[product.id] ?? toProductDraft(product);
      }

      return next;
    });
    setLoading(false);
  };

  useEffect(() => {
    if (!isAdmin) {
      return;
    }

    void loadAll();
  }, [isAdmin]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    if (!query) {
      return products;
    }

    return products.filter((product) => {
      const haystack = `${product.title} ${product.subtitle} ${product.attributes.sku}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [products, productSearch]);

  if (!isAdmin) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1>Доступ запрещен</h1>
          <p>Эта страница доступна только администраторам.</p>
          <Link href="/profile" className={styles.linkButton}>
            В профиль
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <main className={styles.card}>
        <header className={styles.header}>
          <div>
            <h1>Admin Panel</h1>
            <p>Управление магазином, заказами и клиентами.</p>
          </div>
          <button type="button" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Обновляем..." : "Обновить всё"}
          </button>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

        <nav className={styles.tabs}>
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={tab.id === activeTab ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "dashboard" ? (
          <section className={styles.section}>
            <h2>Показатели</h2>
            <div className={styles.metrics}>
              <article>
                <span>Заказы</span>
                <b>{dashboard?.metrics.totalOrders ?? 0}</b>
              </article>
              <article>
                <span>Клиенты</span>
                <b>{dashboard?.metrics.uniqueCustomers ?? 0}</b>
              </article>
              <article>
                <span>Выручка</span>
                <b>{formatStarsFromCents(dashboard?.metrics.revenueStarsCents ?? 0)} ⭐</b>
              </article>
              <article>
                <span>Активные промо</span>
                <b>{dashboard?.metrics.activePromoCodes ?? 0}</b>
              </article>
            </div>
            <div className={styles.statusGrid}>
              {Object.entries(dashboard?.statusCounters ?? {}).map(([status, count]) => (
                <p key={status}>
                  {status}: <b>{count}</b>
                </p>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "orders" ? <ShopAdminOrdersPanel enabled /> : null}

        {activeTab === "customers" ? (
          <section className={styles.section}>
            <h2>Клиенты</h2>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Telegram</th>
                    <th>Имя</th>
                    <th>Телефон</th>
                    <th>Заказы</th>
                    <th>Сумма</th>
                    <th>Последний заказ</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.telegramUserId}>
                      <td>{customer.username ? `@${customer.username}` : customer.telegramUserId}</td>
                      <td>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "—"}</td>
                      <td>{customer.phone || "—"}</td>
                      <td>{customer.ordersCount}</td>
                      <td>{formatStarsFromCents(customer.totalSpentStarsCents)} ⭐</td>
                      <td>{new Date(customer.lastOrderAt).toLocaleString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        {activeTab === "products" ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Товары</h2>
              <input
                value={productSearch}
                onChange={(event) => setProductSearch(event.target.value)}
                placeholder="Поиск по товару / SKU"
              />
            </div>

            <div className={styles.productsList}>
              {filteredProducts.map((product) => {
                const draft = productDrafts[product.id] ?? toProductDraft(product);
                const isSaving = savingProductId === product.id;

                return (
                  <article key={product.id} className={styles.productCard}>
                    <h3>{product.title}</h3>
                    <p>{product.attributes.sku}</p>
                    <div className={styles.formRow}>
                      <label>
                        Цена (stars cents)
                        <input
                          value={draft.priceStarsCents}
                          onChange={(event) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, priceStarsCents: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Остаток
                        <input
                          value={draft.stock}
                          onChange={(event) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, stock: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.formRow}>
                      <label>
                        Бейдж
                        <input
                          value={draft.badge}
                          onChange={(event) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, badge: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.checkboxRow}>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.isPublished}
                          onChange={(event) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, isPublished: event.target.checked },
                            }))
                          }
                        />
                        Опубликован
                      </label>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.isFeatured}
                          onChange={(event) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, isFeatured: event.target.checked },
                            }))
                          }
                        />
                        Featured
                      </label>
                    </div>
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={async () => {
                        setSavingProductId(product.id);
                        const response = await patchAdminProduct({
                          productId: product.id,
                          priceStarsCents: draft.priceStarsCents.trim() ? Number(draft.priceStarsCents) : null,
                          stock: draft.stock.trim() ? Number(draft.stock) : null,
                          isPublished: draft.isPublished,
                          isFeatured: draft.isFeatured,
                          badge: draft.badge.trim() ? draft.badge.trim() : null,
                        });
                        setSavingProductId(null);

                        if (!response.ok) {
                          setError(response.error ?? "Ошибка обновления товара");
                          return;
                        }

                        await loadAll();
                      }}
                    >
                      {isSaving ? "Сохраняем..." : "Сохранить"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "promos" ? (
          <section className={styles.section}>
            <h2>Промокоды</h2>
            <div className={styles.promoCreate}>
              <input value={newPromoCode} onChange={(event) => setNewPromoCode(event.target.value)} placeholder="CODE" />
              <input value={newPromoLabel} onChange={(event) => setNewPromoLabel(event.target.value)} placeholder="Название" />
              <select value={newPromoType} onChange={(event) => setNewPromoType(event.target.value as "percent" | "fixed")}>
                <option value="percent">percent</option>
                <option value="fixed">fixed</option>
              </select>
              <input value={newPromoValue} onChange={(event) => setNewPromoValue(event.target.value)} placeholder="Значение" />
              <input
                value={newPromoMinSubtotal}
                onChange={(event) => setNewPromoMinSubtotal(event.target.value)}
                placeholder="Мин. сумма"
              />
              <button
                type="button"
                onClick={async () => {
                  const response = await createAdminPromo({
                    code: newPromoCode,
                    label: newPromoLabel || newPromoCode,
                    discountType: newPromoType,
                    discountValue: Number(newPromoValue),
                    minSubtotalStarsCents: Number(newPromoMinSubtotal) || 0,
                  });

                  if (response.error) {
                    setError(response.error);
                    return;
                  }

                  setPromos(response.promos);
                  setNewPromoCode("");
                  setNewPromoLabel("");
                }}
              >
                Добавить
              </button>
            </div>

            <div className={styles.promoList}>
              {promos.map((promo) => (
                <article key={promo.code} className={styles.promoCard}>
                  <h3>{promo.code}</h3>
                  <p>
                    {promo.label} · {promo.discountType} {promo.discountValue}
                  </p>
                  <p>Минимум: {promo.minSubtotalStarsCents} · Использовано: {promo.usedCount}</p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      onClick={async () => {
                        const response = await patchAdminPromo({
                          currentCode: promo.code,
                          active: !promo.active,
                        });
                        if (response.error) {
                          setError(response.error);
                          return;
                        }
                        setPromos(response.promos);
                      }}
                    >
                      {promo.active ? "Выключить" : "Включить"}
                    </button>
                    <button
                      type="button"
                      className={styles.danger}
                      onClick={async () => {
                        const response = await deleteAdminPromo(promo.code);
                        if (response.error) {
                          setError(response.error);
                          return;
                        }
                        setPromos(response.promos);
                      }}
                    >
                      Удалить
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className={styles.section}>
            <h2>Настройки магазина</h2>
            {settings ? (
              <div className={styles.settingsForm}>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.shopEnabled}
                    onChange={(event) => setSettings((prev) => (prev ? { ...prev, shopEnabled: event.target.checked } : prev))}
                  />
                  Магазин включен
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.checkoutEnabled}
                    onChange={(event) =>
                      setSettings((prev) => (prev ? { ...prev, checkoutEnabled: event.target.checked } : prev))
                    }
                  />
                  Checkout включен
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={settings.maintenanceMode}
                    onChange={(event) =>
                      setSettings((prev) => (prev ? { ...prev, maintenanceMode: event.target.checked } : prev))
                    }
                  />
                  Maintenance mode
                </label>
                <label>
                  Стоимость доставки (stars cents)
                  <input
                    value={String(settings.defaultDeliveryFeeStarsCents)}
                    onChange={(event) =>
                      setSettings((prev) =>
                        prev ? { ...prev, defaultDeliveryFeeStarsCents: Math.max(0, Number(event.target.value) || 0) } : prev,
                      )
                    }
                  />
                </label>
                <label>
                  Порог бесплатной доставки
                  <input
                    value={String(settings.freeDeliveryThresholdStarsCents)}
                    onChange={(event) =>
                      setSettings((prev) =>
                        prev
                          ? { ...prev, freeDeliveryThresholdStarsCents: Math.max(0, Number(event.target.value) || 0) }
                          : prev,
                      )
                    }
                  />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    if (!settings) return;
                    const response = await patchAdminSettings(settings);
                    if (response.error || !response.settings) {
                      setError(response.error ?? "Ошибка сохранения настроек");
                      return;
                    }
                    setSettings(response.settings);
                  }}
                >
                  Сохранить настройки
                </button>
              </div>
            ) : (
              <p>Загрузка настроек...</p>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
}
