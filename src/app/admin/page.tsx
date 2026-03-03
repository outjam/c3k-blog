"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { ShopAdminOrdersPanel } from "@/components/shop/shop-admin-orders-panel";
import {
  createAdminProduct,
  createAdminProductCategory,
  createAdminPromo,
  deleteAdminProductCategory,
  deleteAdminProduct,
  deleteAdminPromo,
  fetchAdminCustomers,
  fetchAdminDashboard,
  fetchAdminMembers,
  fetchAdminProductCategories,
  fetchAdminProducts,
  fetchAdminPromos,
  fetchAdminSession,
  fetchAdminSettings,
  patchAdminProductCategory,
  patchAdminProduct,
  patchAdminPromo,
  patchAdminSettings,
  removeAdminMember,
  upsertAdminMember,
  type AdminCustomer,
  type AdminDashboardData,
  type AdminProductWithMeta,
  type AdminSession,
} from "@/lib/admin-api";
import { SHOP_ADMIN_ROLE_LABELS } from "@/lib/shop-admin-roles";
import { formatStarsFromCents } from "@/lib/stars-format";
import type {
  ShopAdminMember,
  ShopAdminPermission,
  ShopAdminRole,
  ShopAppSettings,
  ShopProductCategory,
  ShopPromoCode,
} from "@/types/shop";

import styles from "./page.module.scss";

type AdminTab = "dashboard" | "orders" | "customers" | "products" | "categories" | "promos" | "settings" | "admins";

interface ProductDraft {
  priceStarsCents: string;
  stock: string;
  isPublished: boolean;
  isFeatured: boolean;
  badge: string;
  categoryId: string;
  subcategoryId: string;
}

interface ProductCategoryDraft {
  label: string;
  emoji: string;
  description: string;
  order: string;
}

interface ProductSubcategoryDraft {
  label: string;
  description: string;
  order: string;
}

interface AdminMemberDraft {
  role: ShopAdminRole;
  disabled: boolean;
  username: string;
  firstName: string;
  lastName: string;
}

const TAB_REQUIREMENTS: Record<AdminTab, ShopAdminPermission> = {
  dashboard: "dashboard:view",
  orders: "orders:view",
  customers: "customers:view",
  products: "products:view",
  categories: "products:view",
  promos: "promos:view",
  settings: "settings:view",
  admins: "admins:view",
};

const TABS: Array<{ id: AdminTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "orders", label: "Заказы" },
  { id: "customers", label: "Клиенты" },
  { id: "products", label: "Товары" },
  { id: "categories", label: "Категории" },
  { id: "promos", label: "Промокоды" },
  { id: "settings", label: "Настройки" },
  { id: "admins", label: "Админы" },
];

const ROLE_OPTIONS: ShopAdminRole[] = ["owner", "admin", "orders", "catalog", "support"];

const toProductDraft = (product: AdminProductWithMeta): ProductDraft => {
  return {
    priceStarsCents: String(product.adminOverride?.priceStarsCents ?? ""),
    stock: String(product.adminOverride?.stock ?? ""),
    isPublished: product.adminOverride?.isPublished ?? true,
    isFeatured: product.adminOverride?.isFeatured ?? false,
    badge: product.adminOverride?.badge ?? "",
    categoryId: product.categoryId ?? product.adminOverride?.categoryId ?? product.category,
    subcategoryId: product.subcategoryId ?? product.adminOverride?.subcategoryId ?? "",
  };
};

const toAdminDraft = (admin: ShopAdminMember): AdminMemberDraft => {
  return {
    role: admin.role,
    disabled: Boolean(admin.disabled),
    username: admin.username ?? "",
    firstName: admin.firstName ?? "",
    lastName: admin.lastName ?? "",
  };
};

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [dashboard, setDashboard] = useState<AdminDashboardData | null>(null);
  const [customers, setCustomers] = useState<AdminCustomer[]>([]);
  const [products, setProducts] = useState<AdminProductWithMeta[]>([]);
  const [productCategories, setProductCategories] = useState<ShopProductCategory[]>([]);
  const [promos, setPromos] = useState<ShopPromoCode[]>([]);
  const [settings, setSettings] = useState<ShopAppSettings | null>(null);
  const [adminMembers, setAdminMembers] = useState<ShopAdminMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [productDrafts, setProductDrafts] = useState<Record<string, ProductDraft>>({});
  const [categoryDrafts, setCategoryDrafts] = useState<Record<string, ProductCategoryDraft>>({});
  const [subcategoryDrafts, setSubcategoryDrafts] = useState<Record<string, ProductSubcategoryDraft>>({});
  const [adminDrafts, setAdminDrafts] = useState<Record<number, AdminMemberDraft>>({});
  const [savingProductId, setSavingProductId] = useState<string | null>(null);
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null);
  const [savingAdminId, setSavingAdminId] = useState<number | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [creatingSubcategoryFor, setCreatingSubcategoryFor] = useState<string | null>(null);
  const [savingCategoryKey, setSavingCategoryKey] = useState<string | null>(null);
  const [deletingCategoryKey, setDeletingCategoryKey] = useState<string | null>(null);
  const [newCategoryLabel, setNewCategoryLabel] = useState("");
  const [newCategoryEmoji, setNewCategoryEmoji] = useState("");
  const [newCategoryDescription, setNewCategoryDescription] = useState("");
  const [newSubcategoryLabel, setNewSubcategoryLabel] = useState<Record<string, string>>({});
  const [newSubcategoryDescription, setNewSubcategoryDescription] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [adminSearch, setAdminSearch] = useState("");
  const [newPromoCode, setNewPromoCode] = useState("");
  const [newPromoLabel, setNewPromoLabel] = useState("");
  const [newPromoType, setNewPromoType] = useState<"percent" | "fixed">("percent");
  const [newPromoValue, setNewPromoValue] = useState("10");
  const [newPromoMinSubtotal, setNewPromoMinSubtotal] = useState("0");
  const [newAdminTelegramId, setNewAdminTelegramId] = useState("");
  const [newAdminRole, setNewAdminRole] = useState<ShopAdminRole>("support");
  const [newAdminUsername, setNewAdminUsername] = useState("");
  const [newAdminFirstName, setNewAdminFirstName] = useState("");
  const [newAdminLastName, setNewAdminLastName] = useState("");

  const hasPermission = (permission: ShopAdminPermission): boolean => {
    return Boolean(session?.permissions?.includes(permission));
  };

  const availableTabs = useMemo(() => {
    return TABS.filter((tab) => hasPermission(TAB_REQUIREMENTS[tab.id]));
  }, [session]);

  const loadSession = async () => {
    setSessionLoading(true);
    const sessionResponse = await fetchAdminSession();

    if (sessionResponse.error) {
      setError(sessionResponse.error);
      setSession(null);
      setSessionLoading(false);
      return;
    }

    setSession(sessionResponse.session);
    setSessionLoading(false);
  };

  const loadAll = async () => {
    if (!session?.isAdmin) {
      return;
    }

    setLoading(true);
    setError("");

    const errors: string[] = [];
    const jobs: Promise<void>[] = [];

    if (hasPermission("dashboard:view")) {
      jobs.push(
        fetchAdminDashboard().then((response) => {
          setDashboard(response.data);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
    }

    if (hasPermission("customers:view")) {
      jobs.push(
        fetchAdminCustomers().then((response) => {
          setCustomers(response.customers);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
    }

    if (hasPermission("products:view")) {
      jobs.push(
        fetchAdminProducts().then((response) => {
          setProducts(response.products);
          setProductDrafts((prev) => {
            const next = { ...prev };

            for (const product of response.products) {
              next[product.id] = prev[product.id] ?? toProductDraft(product);
            }

            return next;
          });

          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
      jobs.push(
        fetchAdminProductCategories().then((response) => {
          const nextCategories = response.error ? productCategories : response.categories;
          setProductCategories(nextCategories);
          setCategoryDrafts((prev) => {
            const next = { ...prev };

            for (const category of nextCategories) {
              next[category.id] = prev[category.id] ?? {
                label: category.label,
                emoji: category.emoji ?? "",
                description: category.description ?? "",
                order: String(category.order),
              };
            }

            return next;
          });
          setSubcategoryDrafts((prev) => {
            const next = { ...prev };

            for (const category of nextCategories) {
              for (const subcategory of category.subcategories) {
                const key = `${category.id}:${subcategory.id}`;
                next[key] = prev[key] ?? {
                  label: subcategory.label,
                  description: subcategory.description ?? "",
                  order: String(subcategory.order),
                };
              }
            }

            return next;
          });

          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
    }

    if (hasPermission("promos:view")) {
      jobs.push(
        fetchAdminPromos().then((response) => {
          setPromos(response.promos);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
    }

    if (hasPermission("settings:view")) {
      jobs.push(
        fetchAdminSettings().then((response) => {
          setSettings(response.settings);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
    }

    if (hasPermission("admins:view")) {
      jobs.push(
        fetchAdminMembers().then((response) => {
          const sorted = [...response.admins].sort((a, b) => a.telegramUserId - b.telegramUserId);
          setAdminMembers(sorted);
          setAdminDrafts((prev) => {
            const next = { ...prev };

            for (const admin of sorted) {
              next[admin.telegramUserId] = prev[admin.telegramUserId] ?? toAdminDraft(admin);
            }

            return next;
          });

          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
    }

    await Promise.all(jobs);

    if (errors.length > 0) {
      setError(errors[0] as string);
    }

    setLoading(false);
  };

  useEffect(() => {
    void loadSession();
  }, []);

  useEffect(() => {
    if (!session?.isAdmin) {
      return;
    }

    void loadAll();
  }, [session?.telegramUserId, session?.isAdmin]);

  useEffect(() => {
    if (availableTabs.length === 0) {
      return;
    }

    const exists = availableTabs.some((tab) => tab.id === activeTab);
    if (!exists) {
      setActiveTab(availableTabs[0]?.id ?? "dashboard");
    }
  }, [activeTab, availableTabs]);

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

  const filteredCustomers = useMemo(() => {
    const query = customerSearch.trim().toLowerCase();

    if (!query) {
      return customers;
    }

    return customers.filter((customer) => {
      const haystack = [
        customer.telegramUserId,
        customer.username,
        customer.firstName,
        customer.lastName,
        customer.phone,
        customer.email,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [customerSearch, customers]);

  const filteredAdminMembers = useMemo(() => {
    const query = adminSearch.trim().toLowerCase();

    if (!query) {
      return adminMembers;
    }

    return adminMembers.filter((admin) => {
      const haystack = [
        admin.telegramUserId,
        admin.username,
        admin.firstName,
        admin.lastName,
        admin.role,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [adminMembers, adminSearch]);

  const categoryMap = useMemo(() => {
    return new Map(productCategories.map((category) => [category.id, category]));
  }, [productCategories]);

  const syncCategoryState = (categories: ShopProductCategory[]) => {
    setProductCategories(categories);
    setCategoryDrafts((prev) => {
      const next: Record<string, ProductCategoryDraft> = {};

      for (const category of categories) {
        next[category.id] = prev[category.id] ?? {
          label: category.label,
          emoji: category.emoji ?? "",
          description: category.description ?? "",
          order: String(category.order),
        };
      }

      return next;
    });
    setSubcategoryDrafts((prev) => {
      const next: Record<string, ProductSubcategoryDraft> = {};

      for (const category of categories) {
        for (const subcategory of category.subcategories) {
          const key = `${category.id}:${subcategory.id}`;
          next[key] = prev[key] ?? {
            label: subcategory.label,
            description: subcategory.description ?? "",
            order: String(subcategory.order),
          };
        }
      }

      return next;
    });
    setProductDrafts((prev) => {
      const validCategoryIds = new Set(categories.map((category) => category.id));
      const next: Record<string, ProductDraft> = {};

      for (const [productId, draft] of Object.entries(prev)) {
        const categoryId = validCategoryIds.has(draft.categoryId)
          ? draft.categoryId
          : categories[0]?.id ?? "";
        const selectedCategory = categories.find((category) => category.id === categoryId);
        const isValidSubcategory = Boolean(
          draft.subcategoryId && selectedCategory?.subcategories.some((item) => item.id === draft.subcategoryId),
        );

        next[productId] = {
          ...draft,
          categoryId,
          subcategoryId: isValidSubcategory ? draft.subcategoryId : "",
        };
      }

      return next;
    });
  };

  if (sessionLoading) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1>Проверяем доступ...</h1>
        </section>
      </div>
    );
  }

  if (!session?.isAdmin) {
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
            <p>
              Роль: <b>{session.role ? SHOP_ADMIN_ROLE_LABELS[session.role] : "—"}</b>
            </p>
          </div>
          <button type="button" onClick={() => void loadAll()} disabled={loading}>
            {loading ? "Обновляем..." : "Обновить всё"}
          </button>
        </header>

        <div className={styles.permissionRow}>
          {session.permissions.map((permission) => (
            <span key={permission} className={styles.permissionPill}>
              {permission}
            </span>
          ))}
        </div>

        {error ? <p className={styles.error}>{error}</p> : null}

        <nav className={styles.tabs}>
          {availableTabs.map((tab) => (
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

        {activeTab === "dashboard" && hasPermission("dashboard:view") ? (
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

        {activeTab === "orders" && hasPermission("orders:view") ? (
          <ShopAdminOrdersPanel enabled canManage={hasPermission("orders:manage")} />
        ) : null}

        {activeTab === "customers" && hasPermission("customers:view") ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Клиенты</h2>
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Поиск по имени, @username, телефону"
              />
            </div>

            {filteredCustomers.length === 0 ? (
              <p className={styles.hint}>Клиенты не найдены.</p>
            ) : (
              <div className={styles.customersList}>
                {filteredCustomers.map((customer) => (
                  <article key={customer.telegramUserId} className={styles.customerCard}>
                    <h3>{customer.username ? `@${customer.username}` : customer.telegramUserId}</h3>
                    <p>{[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "Без имени"}</p>
                    <p>Телефон: {customer.phone || "не указан"}</p>
                    <p>Заказы: {customer.ordersCount}</p>
                    <p>Сумма: {formatStarsFromCents(customer.totalSpentStarsCents)} ⭐</p>
                    <p>Последний заказ: {new Date(customer.lastOrderAt).toLocaleString("ru-RU")}</p>
                  </article>
                ))}
              </div>
            )}
          </section>
        ) : null}

        {activeTab === "products" && hasPermission("products:view") ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Товары</h2>
              <div className={styles.sectionHeadActions}>
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Поиск по товару / SKU"
                />
                <button
                  type="button"
                  className={styles.inlineButton}
                  disabled={!hasPermission("products:manage") || creatingProduct}
                  onClick={async () => {
                    if (!hasPermission("products:manage")) {
                      return;
                    }

                    setCreatingProduct(true);
                    const response = await createAdminProduct({});
                    setCreatingProduct(false);

                    if (response.error) {
                      setError(response.error);
                      return;
                    }

                    setProducts(response.products);
                    await loadAll();
                  }}
                >
                  {creatingProduct ? "Создаём..." : "Новый товар"}
                </button>
              </div>
            </div>

            <div className={styles.productsList}>
              {filteredProducts.map((product) => {
                const draft = productDrafts[product.id] ?? toProductDraft(product);
                const isSaving = savingProductId === product.id;
                const isDeleting = deletingProductId === product.id;
                const selectedCategory = categoryMap.get(draft.categoryId);
                const subcategories = selectedCategory?.subcategories ?? [];

                return (
                  <article key={product.id} className={styles.productCard}>
                    <h3>{product.title}</h3>
                    <p>
                      {product.attributes.sku} · {product.isCustom ? "Кастомный товар" : "Базовый товар"}
                    </p>
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
                    <div className={styles.formRow}>
                      <label>
                        Категория витрины
                        <select
                          value={draft.categoryId}
                          onChange={(event) =>
                            setProductDrafts((prev) => {
                              const categoryId = event.target.value;
                              const nextCategory = categoryMap.get(categoryId);
                              const isCurrentSubcategoryValid = Boolean(
                                draft.subcategoryId &&
                                  nextCategory?.subcategories.some((subcategory) => subcategory.id === draft.subcategoryId),
                              );
                              return {
                                ...prev,
                                [product.id]: {
                                  ...draft,
                                  categoryId,
                                  subcategoryId: isCurrentSubcategoryValid ? draft.subcategoryId : "",
                                },
                              };
                            })
                          }
                        >
                          {productCategories.map((category) => (
                            <option key={`product-category-${product.id}-${category.id}`} value={category.id}>
                              {category.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        Подкатегория
                        <select
                          value={draft.subcategoryId}
                          onChange={(event) =>
                            setProductDrafts((prev) => ({
                              ...prev,
                              [product.id]: { ...draft, subcategoryId: event.target.value },
                            }))
                          }
                        >
                          <option value="">Без подкатегории</option>
                          {subcategories.map((subcategory) => (
                            <option key={`product-subcategory-${product.id}-${subcategory.id}`} value={subcategory.id}>
                              {subcategory.label}
                            </option>
                          ))}
                        </select>
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
                      disabled={isSaving || !hasPermission("products:manage")}
                      onClick={async () => {
                        if (!hasPermission("products:manage")) {
                          return;
                        }

                        setSavingProductId(product.id);
                        const response = await patchAdminProduct({
                          productId: product.id,
                          priceStarsCents: draft.priceStarsCents.trim() ? Number(draft.priceStarsCents) : null,
                          stock: draft.stock.trim() ? Number(draft.stock) : null,
                          isPublished: draft.isPublished,
                          isFeatured: draft.isFeatured,
                          badge: draft.badge.trim() ? draft.badge.trim() : null,
                          categoryId: draft.categoryId || null,
                          subcategoryId: draft.subcategoryId.trim() ? draft.subcategoryId.trim() : null,
                        });
                        setSavingProductId(null);

                        if (!response.ok) {
                          setError(response.error ?? "Ошибка обновления товара");
                          return;
                        }

                        await loadAll();
                      }}
                    >
                      {isSaving ? "Сохраняем..." : hasPermission("products:manage") ? "Сохранить" : "Только просмотр"}
                    </button>
                    {product.isCustom ? (
                      <button
                        type="button"
                        className={styles.danger}
                        disabled={isDeleting || !hasPermission("products:manage")}
                        onClick={async () => {
                          if (!hasPermission("products:manage")) {
                            return;
                          }

                          setDeletingProductId(product.id);
                          const response = await deleteAdminProduct(product.id);
                          setDeletingProductId(null);

                          if (response.error) {
                            setError(response.error);
                            return;
                          }

                          setProducts(response.products);
                          await loadAll();
                        }}
                      >
                        {isDeleting ? "Удаляем..." : "Удалить"}
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "categories" && hasPermission("products:view") ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Категории и подкатегории</h2>
            </div>

            <div className={styles.categoryCreate}>
              <input
                value={newCategoryLabel}
                onChange={(event) => setNewCategoryLabel(event.target.value)}
                placeholder="Название категории"
              />
              <input
                value={newCategoryEmoji}
                onChange={(event) => setNewCategoryEmoji(event.target.value)}
                placeholder="Эмодзи"
              />
              <input
                value={newCategoryDescription}
                onChange={(event) => setNewCategoryDescription(event.target.value)}
                placeholder="Описание категории"
              />
              <button
                type="button"
                disabled={!hasPermission("products:manage") || creatingCategory || !newCategoryLabel.trim()}
                onClick={async () => {
                  if (!hasPermission("products:manage")) {
                    return;
                  }

                  setCreatingCategory(true);
                  const response = await createAdminProductCategory({
                    label: newCategoryLabel.trim(),
                    emoji: newCategoryEmoji.trim() || undefined,
                    description: newCategoryDescription.trim() || undefined,
                  });
                  setCreatingCategory(false);

                  if (response.error) {
                    setError(response.error);
                    return;
                  }

                  syncCategoryState(response.categories);
                  setNewCategoryLabel("");
                  setNewCategoryEmoji("");
                  setNewCategoryDescription("");
                  await loadAll();
                }}
              >
                {creatingCategory ? "Создаём..." : "Создать категорию"}
              </button>
            </div>

            <div className={styles.categoriesAdminList}>
              {productCategories.map((category) => {
                const draft = categoryDrafts[category.id] ?? {
                  label: category.label,
                  emoji: category.emoji ?? "",
                  description: category.description ?? "",
                  order: String(category.order),
                };
                const categorySavingKey = `category:${category.id}`;
                const categoryDeletingKey = `category:${category.id}`;

                return (
                  <article key={`category-admin-${category.id}`} className={styles.categoryAdminCard}>
                    <header className={styles.categoryAdminHeader}>
                      <h3>
                        {category.emoji ? `${category.emoji} ` : ""}
                        {category.label}
                      </h3>
                      <p>ID: {category.id}</p>
                    </header>

                    <div className={styles.formRow}>
                      <label>
                        Название
                        <input
                          value={draft.label}
                          onChange={(event) =>
                            setCategoryDrafts((prev) => ({
                              ...prev,
                              [category.id]: { ...draft, label: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Эмодзи
                        <input
                          value={draft.emoji}
                          onChange={(event) =>
                            setCategoryDrafts((prev) => ({
                              ...prev,
                              [category.id]: { ...draft, emoji: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.formRow}>
                      <label>
                        Описание
                        <input
                          value={draft.description}
                          onChange={(event) =>
                            setCategoryDrafts((prev) => ({
                              ...prev,
                              [category.id]: { ...draft, description: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Порядок
                        <input
                          value={draft.order}
                          onChange={(event) =>
                            setCategoryDrafts((prev) => ({
                              ...prev,
                              [category.id]: { ...draft, order: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>

                    <div className={styles.promoActions}>
                      <button
                        type="button"
                        disabled={!hasPermission("products:manage") || savingCategoryKey === categorySavingKey}
                        onClick={async () => {
                          if (!hasPermission("products:manage")) {
                            return;
                          }

                          setSavingCategoryKey(categorySavingKey);
                          const response = await patchAdminProductCategory({
                            categoryId: category.id,
                            label: draft.label.trim(),
                            emoji: draft.emoji.trim() ? draft.emoji.trim() : null,
                            description: draft.description.trim() ? draft.description.trim() : null,
                            order: draft.order.trim() ? Number(draft.order) : null,
                          });
                          setSavingCategoryKey(null);

                          if (response.error) {
                            setError(response.error);
                            return;
                          }

                          syncCategoryState(response.categories);
                          await loadAll();
                        }}
                      >
                        {savingCategoryKey === categorySavingKey ? "Сохраняем..." : "Сохранить категорию"}
                      </button>
                      <button
                        type="button"
                        className={styles.danger}
                        disabled={!hasPermission("products:manage") || deletingCategoryKey === categoryDeletingKey}
                        onClick={async () => {
                          if (!hasPermission("products:manage")) {
                            return;
                          }

                          setDeletingCategoryKey(categoryDeletingKey);
                          const response = await deleteAdminProductCategory({ categoryId: category.id });
                          setDeletingCategoryKey(null);

                          if (response.error) {
                            setError(response.error);
                            return;
                          }

                          syncCategoryState(response.categories);
                          await loadAll();
                        }}
                      >
                        {deletingCategoryKey === categoryDeletingKey ? "Удаляем..." : "Удалить категорию"}
                      </button>
                    </div>

                    <div className={styles.subcategoryBlock}>
                      <h4>Подкатегории</h4>
                      {category.subcategories.length === 0 ? <p className={styles.hint}>Нет подкатегорий.</p> : null}
                      {category.subcategories.map((subcategory) => {
                        const key = `${category.id}:${subcategory.id}`;
                        const subDraft = subcategoryDrafts[key] ?? {
                          label: subcategory.label,
                          description: subcategory.description ?? "",
                          order: String(subcategory.order),
                        };
                        const savingKey = `subcategory:${key}`;
                        const deletingKey = `subcategory:${key}`;

                        return (
                          <div key={key} className={styles.subcategoryRow}>
                            <div className={styles.formRow}>
                              <label>
                                Название
                                <input
                                  value={subDraft.label}
                                  onChange={(event) =>
                                    setSubcategoryDrafts((prev) => ({
                                      ...prev,
                                      [key]: { ...subDraft, label: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                              <label>
                                Порядок
                                <input
                                  value={subDraft.order}
                                  onChange={(event) =>
                                    setSubcategoryDrafts((prev) => ({
                                      ...prev,
                                      [key]: { ...subDraft, order: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <div className={styles.formRow}>
                              <label>
                                Описание
                                <input
                                  value={subDraft.description}
                                  onChange={(event) =>
                                    setSubcategoryDrafts((prev) => ({
                                      ...prev,
                                      [key]: { ...subDraft, description: event.target.value },
                                    }))
                                  }
                                />
                              </label>
                            </div>
                            <div className={styles.promoActions}>
                              <button
                                type="button"
                                disabled={!hasPermission("products:manage") || savingCategoryKey === savingKey}
                                onClick={async () => {
                                  if (!hasPermission("products:manage")) {
                                    return;
                                  }

                                  setSavingCategoryKey(savingKey);
                                  const response = await patchAdminProductCategory({
                                    categoryId: category.id,
                                    subcategoryId: subcategory.id,
                                    label: subDraft.label.trim(),
                                    description: subDraft.description.trim() ? subDraft.description.trim() : null,
                                    order: subDraft.order.trim() ? Number(subDraft.order) : null,
                                  });
                                  setSavingCategoryKey(null);

                                  if (response.error) {
                                    setError(response.error);
                                    return;
                                  }

                                  syncCategoryState(response.categories);
                                  await loadAll();
                                }}
                              >
                                {savingCategoryKey === savingKey ? "Сохраняем..." : "Сохранить"}
                              </button>
                              <button
                                type="button"
                                className={styles.danger}
                                disabled={!hasPermission("products:manage") || deletingCategoryKey === deletingKey}
                                onClick={async () => {
                                  if (!hasPermission("products:manage")) {
                                    return;
                                  }

                                  setDeletingCategoryKey(deletingKey);
                                  const response = await deleteAdminProductCategory({
                                    categoryId: category.id,
                                    subcategoryId: subcategory.id,
                                  });
                                  setDeletingCategoryKey(null);

                                  if (response.error) {
                                    setError(response.error);
                                    return;
                                  }

                                  syncCategoryState(response.categories);
                                  await loadAll();
                                }}
                              >
                                {deletingCategoryKey === deletingKey ? "Удаляем..." : "Удалить"}
                              </button>
                            </div>
                          </div>
                        );
                      })}

                      <div className={styles.subcategoryCreate}>
                        <input
                          value={newSubcategoryLabel[category.id] ?? ""}
                          onChange={(event) =>
                            setNewSubcategoryLabel((prev) => ({
                              ...prev,
                              [category.id]: event.target.value,
                            }))
                          }
                          placeholder="Новая подкатегория"
                        />
                        <input
                          value={newSubcategoryDescription[category.id] ?? ""}
                          onChange={(event) =>
                            setNewSubcategoryDescription((prev) => ({
                              ...prev,
                              [category.id]: event.target.value,
                            }))
                          }
                          placeholder="Описание подкатегории"
                        />
                        <button
                          type="button"
                          disabled={
                            !hasPermission("products:manage") ||
                            creatingSubcategoryFor === category.id ||
                            !(newSubcategoryLabel[category.id] ?? "").trim()
                          }
                          onClick={async () => {
                            if (!hasPermission("products:manage")) {
                              return;
                            }

                            setCreatingSubcategoryFor(category.id);
                            const response = await createAdminProductCategory({
                              parentCategoryId: category.id,
                              label: (newSubcategoryLabel[category.id] ?? "").trim(),
                              description: (newSubcategoryDescription[category.id] ?? "").trim() || undefined,
                            });
                            setCreatingSubcategoryFor(null);

                            if (response.error) {
                              setError(response.error);
                              return;
                            }

                            syncCategoryState(response.categories);
                            setNewSubcategoryLabel((prev) => ({ ...prev, [category.id]: "" }));
                            setNewSubcategoryDescription((prev) => ({ ...prev, [category.id]: "" }));
                            await loadAll();
                          }}
                        >
                          {creatingSubcategoryFor === category.id ? "Добавляем..." : "Добавить подкатегорию"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}

        {activeTab === "promos" && hasPermission("promos:view") ? (
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
                disabled={!hasPermission("promos:manage")}
                onClick={async () => {
                  if (!hasPermission("promos:manage")) {
                    return;
                  }

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
                      disabled={!hasPermission("promos:manage")}
                      onClick={async () => {
                        if (!hasPermission("promos:manage")) {
                          return;
                        }

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
                      disabled={!hasPermission("promos:manage")}
                      onClick={async () => {
                        if (!hasPermission("promos:manage")) {
                          return;
                        }

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

        {activeTab === "settings" && hasPermission("settings:view") ? (
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
                  disabled={!hasPermission("settings:manage")}
                  onClick={async () => {
                    if (!settings || !hasPermission("settings:manage")) {
                      return;
                    }
                    const response = await patchAdminSettings(settings);
                    if (response.error || !response.settings) {
                      setError(response.error ?? "Ошибка сохранения настроек");
                      return;
                    }
                    setSettings(response.settings);
                  }}
                >
                  {hasPermission("settings:manage") ? "Сохранить настройки" : "Только просмотр"}
                </button>
              </div>
            ) : (
              <p>Загрузка настроек...</p>
            )}
          </section>
        ) : null}

        {activeTab === "admins" && hasPermission("admins:view") ? (
          <section className={styles.section}>
            <h2>Администраторы и роли</h2>
            <input
              value={adminSearch}
              onChange={(event) => setAdminSearch(event.target.value)}
              placeholder="Поиск по роли, @username, ID"
            />
            <div className={styles.adminCreate}>
              <input
                value={newAdminTelegramId}
                onChange={(event) => setNewAdminTelegramId(event.target.value)}
                placeholder="Telegram ID"
              />
              <select value={newAdminRole} onChange={(event) => setNewAdminRole(event.target.value as ShopAdminRole)}>
                {ROLE_OPTIONS.map((role) => (
                  <option key={`new-admin-role-${role}`} value={role}>
                    {SHOP_ADMIN_ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
              <input
                value={newAdminUsername}
                onChange={(event) => setNewAdminUsername(event.target.value)}
                placeholder="username"
              />
              <input
                value={newAdminFirstName}
                onChange={(event) => setNewAdminFirstName(event.target.value)}
                placeholder="Имя"
              />
              <input
                value={newAdminLastName}
                onChange={(event) => setNewAdminLastName(event.target.value)}
                placeholder="Фамилия"
              />
              <button
                type="button"
                disabled={!hasPermission("admins:manage") || creatingAdmin}
                onClick={async () => {
                  if (!hasPermission("admins:manage")) {
                    return;
                  }

                  const telegramUserId = Math.round(Number(newAdminTelegramId));

                  if (!Number.isFinite(telegramUserId) || telegramUserId <= 0) {
                    setError("Некорректный Telegram ID");
                    return;
                  }

                  setCreatingAdmin(true);
                  const response = await upsertAdminMember({
                    telegramUserId,
                    role: newAdminRole,
                    username: newAdminUsername || undefined,
                    firstName: newAdminFirstName || undefined,
                    lastName: newAdminLastName || undefined,
                    disabled: false,
                  });
                  setCreatingAdmin(false);

                  if (response.error) {
                    setError(response.error);
                    return;
                  }

                  const sorted = [...response.admins].sort((a, b) => a.telegramUserId - b.telegramUserId);
                  setAdminMembers(sorted);
                  setAdminDrafts((prev) => {
                    const next = { ...prev };

                    for (const admin of sorted) {
                      next[admin.telegramUserId] = next[admin.telegramUserId] ?? toAdminDraft(admin);
                    }

                    return next;
                  });
                  setNewAdminTelegramId("");
                  setNewAdminRole("support");
                  setNewAdminUsername("");
                  setNewAdminFirstName("");
                  setNewAdminLastName("");
                }}
              >
                {creatingAdmin ? "Добавляем..." : "Добавить администратора"}
              </button>
            </div>

            <div className={styles.adminsList}>
              {filteredAdminMembers.map((admin) => {
                const draft = adminDrafts[admin.telegramUserId] ?? toAdminDraft(admin);
                const isSaving = savingAdminId === admin.telegramUserId;
                const isOwner = admin.role === "owner";
                const isSelf = admin.telegramUserId === session.telegramUserId;
                const canManageThisAdmin = hasPermission("admins:manage") && !isOwner;

                return (
                  <article key={admin.telegramUserId} className={styles.adminCard}>
                    <h3>
                      {admin.username ? `@${admin.username}` : admin.telegramUserId} · {SHOP_ADMIN_ROLE_LABELS[admin.role]}
                    </h3>
                    <p>
                      {[admin.firstName, admin.lastName].filter(Boolean).join(" ") || "Без имени"} · ID: {admin.telegramUserId}
                    </p>
                    <div className={styles.formRow}>
                      <label>
                        Роль
                        <select
                          value={draft.role}
                          disabled={!canManageThisAdmin}
                          onChange={(event) =>
                            setAdminDrafts((prev) => ({
                              ...prev,
                              [admin.telegramUserId]: { ...draft, role: event.target.value as ShopAdminRole },
                            }))
                          }
                        >
                          {ROLE_OPTIONS.map((role) => (
                            <option key={`admin-role-${admin.telegramUserId}-${role}`} value={role}>
                              {SHOP_ADMIN_ROLE_LABELS[role]}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        username
                        <input
                          value={draft.username}
                          disabled={!canManageThisAdmin}
                          onChange={(event) =>
                            setAdminDrafts((prev) => ({
                              ...prev,
                              [admin.telegramUserId]: { ...draft, username: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.formRow}>
                      <label>
                        Имя
                        <input
                          value={draft.firstName}
                          disabled={!canManageThisAdmin}
                          onChange={(event) =>
                            setAdminDrafts((prev) => ({
                              ...prev,
                              [admin.telegramUserId]: { ...draft, firstName: event.target.value },
                            }))
                          }
                        />
                      </label>
                      <label>
                        Фамилия
                        <input
                          value={draft.lastName}
                          disabled={!canManageThisAdmin}
                          onChange={(event) =>
                            setAdminDrafts((prev) => ({
                              ...prev,
                              [admin.telegramUserId]: { ...draft, lastName: event.target.value },
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className={styles.checkboxRow}>
                      <label>
                        <input
                          type="checkbox"
                          checked={draft.disabled}
                          disabled={!canManageThisAdmin}
                          onChange={(event) =>
                            setAdminDrafts((prev) => ({
                              ...prev,
                              [admin.telegramUserId]: { ...draft, disabled: event.target.checked },
                            }))
                          }
                        />
                        Отключён
                      </label>
                    </div>
                    <div className={styles.promoActions}>
                      <button
                        type="button"
                        disabled={isSaving || !canManageThisAdmin}
                        onClick={async () => {
                          if (!canManageThisAdmin) {
                            return;
                          }

                          setSavingAdminId(admin.telegramUserId);
                          const response = await upsertAdminMember({
                            telegramUserId: admin.telegramUserId,
                            role: draft.role,
                            username: draft.username || undefined,
                            firstName: draft.firstName || undefined,
                            lastName: draft.lastName || undefined,
                            disabled: draft.disabled,
                          });
                          setSavingAdminId(null);

                          if (response.error) {
                            setError(response.error);
                            return;
                          }

                          const sorted = [...response.admins].sort((a, b) => a.telegramUserId - b.telegramUserId);
                          setAdminMembers(sorted);
                          setAdminDrafts((prev) => {
                            const next = { ...prev };

                            for (const nextAdmin of sorted) {
                              next[nextAdmin.telegramUserId] = toAdminDraft(nextAdmin);
                            }

                            return next;
                          });
                        }}
                      >
                        {isSaving ? "Сохраняем..." : canManageThisAdmin ? "Сохранить" : "Недоступно"}
                      </button>
                      <button
                        type="button"
                        className={styles.danger}
                        disabled={!hasPermission("admins:manage") || isOwner || isSelf}
                        onClick={async () => {
                          if (!hasPermission("admins:manage") || isOwner || isSelf) {
                            return;
                          }

                          const response = await removeAdminMember(admin.telegramUserId);

                          if (response.error) {
                            setError(response.error);
                            return;
                          }

                          const sorted = [...response.admins].sort((a, b) => a.telegramUserId - b.telegramUserId);
                          setAdminMembers(sorted);
                        }}
                      >
                        Удалить
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
