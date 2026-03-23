"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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
  fetchAdminDeploymentReadiness,
  fetchAdminIncidentStatus,
  fetchAdminMigrationStatus,
  fetchAdminMembers,
  fetchAdminOperatorGuide,
  fetchAdminProductCategories,
  fetchAdminProducts,
  fetchAdminPromos,
  fetchAdminSession,
  fetchAdminSettings,
  fetchAdminTonEnvironmentStatus,
  fetchAdminWorkerRuns,
  patchAdminProductCategory,
  patchAdminProduct,
  patchAdminPromo,
  patchAdminSettings,
  removeAdminMember,
  runAdminArtistApplicationBackfill,
  runAdminArtistCatalogBackfill,
  runAdminArtistFinanceBackfill,
  runAdminMigrationBackfillSuite,
  runAdminArtistSupportBackfill,
  runAdminWorker,
  runAdminSocialEntitlementBackfill,
  type AdminArtistApplicationBackfillResult,
  type AdminArtistCatalogBackfillResult,
  type AdminArtistFinanceBackfillResult,
  type AdminMigrationBackfillSuiteResult,
  type AdminMigrationDomainStatus,
  type AdminOperatorGuideSnapshot,
  type AdminArtistSupportBackfillResult,
  type AdminDeploymentReadinessSnapshot,
  type AdminIncidentStatusSnapshot,
  type AdminMigrationStatusSnapshot,
  type AdminTonEnvironmentStatus,
  type AdminWorkerRunSnapshot,
  type AdminWorkerRunWorkerId,
  upsertAdminMember,
  type AdminSocialEntitlementBackfillResult,
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
  { id: "dashboard", label: "Обзор" },
  { id: "orders", label: "Заказы" },
  { id: "customers", label: "Клиенты" },
  { id: "products", label: "Товары" },
  { id: "categories", label: "Категории" },
  { id: "promos", label: "Промокоды" },
  { id: "settings", label: "Настройки" },
  { id: "admins", label: "Админы" },
];

const ROLE_OPTIONS: ShopAdminRole[] = ["owner", "admin", "orders", "catalog", "support"];
const CUTOVER_LABELS: Record<AdminMigrationStatusSnapshot["overallState"], string> = {
  legacy_only: "Только legacy",
  dual_write: "Переходный dual-write",
  ready: "Готово к cutover",
};
const INCIDENT_STATE_LABELS: Record<NonNullable<AdminIncidentStatusSnapshot["sections"][number]["state"]>, string> = {
  ok: "Стабильно",
  warning: "Нужно внимание",
  critical: "Критично",
};
const INCIDENT_SOURCE_LABELS: Record<NonNullable<AdminIncidentStatusSnapshot["sections"][number]["sourceState"]>, string> =
  {
    ok: "источник ok",
    degraded: "источник degraded",
  };
const WORKER_LABELS: Record<NonNullable<AdminWorkerRunSnapshot["runs"][number]["workerId"]>, string> = {
  telegram_notifications: "Telegram notifications",
  storage_delivery_telegram: "Storage delivery",
};
const WORKER_STATUS_LABELS: Record<NonNullable<AdminWorkerRunSnapshot["runs"][number]["status"]>, string> = {
  completed: "Выполнен",
  partial: "Частично",
  failed: "Ошибка",
};
const WORKER_TRIGGER_LABELS: Record<NonNullable<AdminWorkerRunSnapshot["runs"][number]["trigger"]>, string> = {
  worker_route: "Автоматический route",
  admin_manual: "Ручной recovery",
};
const TON_COLLECTION_SOURCE_LABELS: Record<AdminTonEnvironmentStatus["collectionSource"], string> = {
  runtime: "runtime config",
  env: "env fallback",
  missing: "не задана",
};
const DEPLOYMENT_STATE_LABELS: Record<AdminDeploymentReadinessSnapshot["overallState"], string> = {
  ready: "Готово",
  warning: "Есть предупреждения",
  missing: "Не готово",
};
const OPERATOR_GUIDE_STATE_LABELS: Record<AdminOperatorGuideSnapshot["overallState"], string> = {
  blocked: "Блокирующие риски",
  caution: "Нужна подготовка",
  ready: "Контур стабилен",
};
const OPERATOR_RELEASE_MODE_LABELS: Record<AdminOperatorGuideSnapshot["releaseMode"], string> = {
  test_only: "Test-only",
  mainnet_blocked: "Mainnet заблокирован",
  mainnet_ready: "Mainnet ready",
};

const TAB_COPY: Record<AdminTab, { title: string; description: string; example: string }> = {
  dashboard: {
    title: "Обзор состояния системы",
    description:
      "Главная вкладка для оператора. Здесь вы смотрите здоровье магазина, миграции, backfill и общую готовность данных перед следующим техническим шагом.",
    example:
      "Пример: после нового backend slice сначала проверяете coverage по доменам, потом делаете dry-run backfill и только потом запускаете реальный перенос.",
  },
  orders: {
    title: "Заказы и деньги",
    description:
      "Рабочее место для проверки реальных покупок, статусов оплаты и спорных кейсов по заказам.",
    example:
      "Пример: покупатель пишет, что оплатил релиз, но не получил доступ. Здесь вы видите, дошёл ли заказ и в каком он статусе.",
  },
  customers: {
    title: "Клиентская база",
    description:
      "Справочник по покупателям: кто покупает, сколько тратит и когда последний раз взаимодействовал с магазином.",
    example:
      "Пример: если нужно вручную помочь VIP-покупателю или проверить историю клиента, искать его нужно здесь.",
  },
  products: {
    title: "Карточки товаров",
    description:
      "Здесь вы управляете тем, как релизы и товары выглядят в витрине: цена, публикация, остаток, бейдж и категория.",
    example:
      "Пример: перед промо-кампанией можно быстро поменять бейдж, скрыть товар из витрины или скорректировать цену.",
  },
  categories: {
    title: "Структура каталога",
    description:
      "Вкладка для наведения порядка в витрине: как товары группируются, в каком порядке показываются и в какие разделы попадают.",
    example:
      "Пример: если появляется новая сцена или формат дропа, сначала заводите категорию здесь, а потом раскладываете туда товары.",
  },
  promos: {
    title: "Промо и скидки",
    description:
      "Здесь создаются акции, которые видит пользователь на витрине или получает в маркетинговой кампании.",
    example:
      "Пример: артист запускает недельную акцию на EP. Вы задаёте код, порог и контролируете, чтобы он не конфликтовал с другими офферами.",
  },
  settings: {
    title: "Глобальные правила магазина",
    description:
      "Операционные настройки приложения: всё, что влияет сразу на весь магазин, checkout и режимы работы.",
    example:
      "Пример: перед стресс-тестом вы временно меняете глобальный флаг или лимит в одном месте, а не правите отдельные релизы вручную.",
  },
  admins: {
    title: "Команда и права доступа",
    description:
      "Вкладка для распределения ролей: кто видит выплаты, кто правит каталог, кто может запускать миграции и backfill.",
    example:
      "Пример: если подключаете нового модератора, даёте ему только support/catalog права, не открывая финансы и системные кнопки.",
  },
};

const MIGRATION_DOMAIN_COPY: Record<AdminMigrationDomainStatus["id"], string> = {
  entitlements:
    "Права пользователя на релизы, треки и NFT. Этот домен влияет на библиотеку, коллекцию и file delivery после покупки.",
  artist_applications:
    "Заявки обычных пользователей на переход в статус артиста. Здесь важно не потерять moderation history и финальное решение.",
  artist_catalog:
    "Профили артистов и их релизы. Это основа для каталога, студии и публичных страниц, поэтому покрытие должно быть почти полным перед cutover.",
  artist_finance:
    "Earnings, запросы на вывод и audit trail. Это финансовый контур, поэтому сначала проверяем цифры в dry-run, а уже потом переносим.",
  artist_support:
    "Донаты и подписки в поддержку артиста. Этот слой нужен, чтобы support-метрики не терялись между legacy и Postgres.",
};

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
  const [deploymentReadiness, setDeploymentReadiness] = useState<AdminDeploymentReadinessSnapshot | null>(null);
  const [operatorGuide, setOperatorGuide] = useState<AdminOperatorGuideSnapshot | null>(null);
  const [incidentStatus, setIncidentStatus] = useState<AdminIncidentStatusSnapshot | null>(null);
  const [migrationStatus, setMigrationStatus] = useState<AdminMigrationStatusSnapshot | null>(null);
  const [tonEnvironmentStatus, setTonEnvironmentStatus] = useState<AdminTonEnvironmentStatus | null>(null);
  const [workerRuns, setWorkerRuns] = useState<AdminWorkerRunSnapshot | null>(null);
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
  const [backfillLoading, setBackfillLoading] = useState<"dry-run" | "run" | null>(null);
  const [backfillResult, setBackfillResult] = useState<AdminSocialEntitlementBackfillResult | null>(null);
  const [applicationBackfillLoading, setApplicationBackfillLoading] = useState<"dry-run" | "run" | null>(null);
  const [applicationBackfillResult, setApplicationBackfillResult] = useState<AdminArtistApplicationBackfillResult | null>(null);
  const [artistBackfillLoading, setArtistBackfillLoading] = useState<"dry-run" | "run" | null>(null);
  const [artistBackfillResult, setArtistBackfillResult] = useState<AdminArtistCatalogBackfillResult | null>(null);
  const [financeBackfillLoading, setFinanceBackfillLoading] = useState<"dry-run" | "run" | null>(null);
  const [financeBackfillResult, setFinanceBackfillResult] = useState<AdminArtistFinanceBackfillResult | null>(null);
  const [supportBackfillLoading, setSupportBackfillLoading] = useState<"dry-run" | "run" | null>(null);
  const [supportBackfillResult, setSupportBackfillResult] = useState<AdminArtistSupportBackfillResult | null>(null);
  const [migrationSuiteLoading, setMigrationSuiteLoading] = useState<"dry-run" | "run" | null>(null);
  const [migrationSuiteResult, setMigrationSuiteResult] = useState<AdminMigrationBackfillSuiteResult | null>(null);
  const [runningWorkerId, setRunningWorkerId] = useState<AdminWorkerRunWorkerId | null>(null);
  const [workerTriggerMessage, setWorkerTriggerMessage] = useState("");

  const hasPermission = useCallback(
    (permission: ShopAdminPermission): boolean => {
      return Boolean(session?.permissions?.includes(permission));
    },
    [session],
  );

  const availableTabs = useMemo(() => {
    return TABS.filter((tab) => hasPermission(TAB_REQUIREMENTS[tab.id]));
  }, [hasPermission]);

  const resolvedActiveTab = useMemo<AdminTab>(() => {
    if (availableTabs.some((tab) => tab.id === activeTab)) {
      return activeTab;
    }

    return availableTabs[0]?.id ?? "dashboard";
  }, [activeTab, availableTabs]);

  const loadSession = useCallback(async () => {
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
  }, []);

  const loadAll = useCallback(async () => {
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
      jobs.push(
        fetchAdminDeploymentReadiness().then((response) => {
          setDeploymentReadiness(response.status);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
      jobs.push(
        fetchAdminOperatorGuide().then((response) => {
          setOperatorGuide(response.status);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
      jobs.push(
        fetchAdminIncidentStatus().then((response) => {
          setIncidentStatus(response.status);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
      jobs.push(
        fetchAdminMigrationStatus().then((response) => {
          setMigrationStatus(response.status);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
      jobs.push(
        fetchAdminWorkerRuns().then((response) => {
          setWorkerRuns(response.snapshot);
          if (response.error) {
            errors.push(response.error);
          }
        }),
      );
      jobs.push(
        fetchAdminTonEnvironmentStatus().then((response) => {
          setTonEnvironmentStatus(response.status);
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
  }, [hasPermission, productCategories, session?.isAdmin]);

  const refreshWorkerOperations = useCallback(async () => {
    if (!hasPermission("dashboard:view")) {
      return;
    }

    const errors: string[] = [];
    const [incidentResponse, workerResponse] = await Promise.all([fetchAdminIncidentStatus(), fetchAdminWorkerRuns()]);

    setIncidentStatus(incidentResponse.status);
    setWorkerRuns(workerResponse.snapshot);

    if (incidentResponse.error) {
      errors.push(incidentResponse.error);
    }

    if (workerResponse.error) {
      errors.push(workerResponse.error);
    }

    if (errors.length > 0) {
      setError(errors.join(" · "));
    }
  }, [hasPermission]);

  const handleWorkerTrigger = useCallback(
    async (workerId: AdminWorkerRunWorkerId) => {
      setRunningWorkerId(workerId);
      setWorkerTriggerMessage("");
      setError("");

      const response = await runAdminWorker({
        workerId,
        limit: workerId === "storage_delivery_telegram" ? 20 : 25,
      });

      if (response.error) {
        setError(response.error);
        setRunningWorkerId(null);
        return;
      }

      await refreshWorkerOperations();

      const run = response.run;
      setWorkerTriggerMessage(
        run
          ? `${WORKER_LABELS[workerId]}: обработано ${run.processed}, доставлено ${run.delivered}, ошибок ${run.failed}, в очереди осталось ${run.remaining ?? 0}.`
          : `${WORKER_LABELS[workerId]}: запуск выполнен, но итоговая запись run не была прочитана.`,
      );
      setRunningWorkerId(null);
    },
    [refreshWorkerOperations],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSession();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadSession]);

  useEffect(() => {
    if (!session?.isAdmin) {
      return;
    }

    const timer = window.setTimeout(() => {
      void loadAll();
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, [loadAll, session?.isAdmin, session?.telegramUserId]);

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

  const currentTabCopy = TAB_COPY[resolvedActiveTab];
  const migrationActionsBusy =
    backfillLoading !== null ||
    applicationBackfillLoading !== null ||
    artistBackfillLoading !== null ||
    financeBackfillLoading !== null ||
    supportBackfillLoading !== null ||
    migrationSuiteLoading !== null;

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
            <h1>Пульт C3K</h1>
            <p>
              Роль: <b>{session.role ? SHOP_ADMIN_ROLE_LABELS[session.role] : "—"}</b>
            </p>
            <p>Операционный центр магазина, артистов, storage и миграций данных.</p>
          </div>
          <div className={styles.headerActions}>
            <button type="button" onClick={() => void loadAll()} disabled={loading}>
              {loading ? "Обновляем..." : "Обновить всё"}
            </button>
            {hasPermission("artists:view") ? (
              <Link href="/admin/artists" className={styles.linkButton}>
                Артисты
              </Link>
            ) : null}
            {hasPermission("showcase:view") ? (
              <Link href="/admin/showcase" className={styles.linkButton}>
                Подборки
              </Link>
            ) : null}
            {hasPermission("storage:view") ? (
              <Link href="/admin/storage" className={styles.linkButton}>
                Storage
              </Link>
            ) : null}
          </div>
        </header>

        <section className={styles.introGrid}>
          <article className={styles.introCard}>
            <span className={styles.introEyebrow}>Как читать админку</span>
            <strong>Сначала обзор, потом действие</strong>
            <p>
              Эта панель лучше работает как операторский пульт: сначала вы смотрите картину целиком, потом уже нажимаете
              кнопки. Особенно это важно для backfill, payouts и storage-подготовки.
            </p>
          </article>
          <article className={styles.introCard}>
            <span className={styles.introEyebrow}>Безопасный сценарий</span>
            <strong>Dry-run → проверка → реальный запуск</strong>
            <p>
              Почти все технические операции имеют dry-run. Это безопасный предпросмотр. Пользуйтесь им перед каждым
              переносом, если не уверены в состоянии данных.
            </p>
          </article>
          <article className={styles.introCard}>
            <span className={styles.introEyebrow}>Реальный кейс</span>
            <strong>После нового backend slice</strong>
            <p>
              Вы выкатили новые таблицы в Supabase, открыли эту панель, посмотрели coverage, запустили dry-run и только потом
              сделали реальный backfill. Так и должен выглядеть рабочий цикл.
            </p>
          </article>
        </section>

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
              className={tab.id === resolvedActiveTab ? styles.tabActive : styles.tab}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className={styles.tabLead}>
          <div>
            <span className={styles.introEyebrow}>{currentTabCopy.title}</span>
            <p>{currentTabCopy.description}</p>
          </div>
          <p className={styles.tabLeadExample}>{currentTabCopy.example}</p>
        </section>

        {resolvedActiveTab === "dashboard" && hasPermission("dashboard:view") ? (
          <section className={styles.section}>
            <h2>Показатели</h2>
            <p className={styles.sectionHint}>
              Это сводка по витрине и данным. Если что-то пошло не так, начинайте разбор отсюда: видно заказы, выручку,
              промо-активность и состояние перехода с legacy на Postgres.
            </p>
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
            {incidentStatus ? (
              <div className={styles.incidentBlock}>
                <div className={styles.incidentSummary}>
                  <div>
                    <span>Открытые сигналы</span>
                    <b>{incidentStatus.openIncidents}</b>
                  </div>
                  <div>
                    <span>Критичные</span>
                    <b>{incidentStatus.criticalIncidents}</b>
                  </div>
                  <div>
                    <span>Warnings</span>
                    <b>{incidentStatus.warningIncidents}</b>
                  </div>
                </div>
                <div className={styles.incidentGrid}>
                  {incidentStatus.sections.map((section) => (
                    <article
                      key={section.id}
                      className={[
                        styles.incidentCard,
                        section.state === "critical"
                          ? styles.incidentCardCritical
                          : section.state === "warning"
                            ? styles.incidentCardWarning
                            : styles.incidentCardOk,
                      ].join(" ")}
                    >
                      <div className={styles.incidentCardHead}>
                        <div>
                          <h3>{section.label}</h3>
                          <p>
                            Статус: {INCIDENT_STATE_LABELS[section.state]} · {INCIDENT_SOURCE_LABELS[section.sourceState]}
                          </p>
                        </div>
                        <strong>{section.count}</strong>
                      </div>
                      <p className={styles.incidentSummaryText}>{section.summary}</p>
                      <p className={styles.incidentActionHint}>{section.actionHint}</p>
                      {section.windowLabel ? <p className={styles.incidentWindow}>{section.windowLabel}</p> : null}
                      {section.sourceNote ? <p className={styles.incidentSourceNote}>{section.sourceNote}</p> : null}
                      {section.entries.length > 0 ? (
                        <div className={styles.incidentEntryList}>
                          {section.entries.map((entry) => (
                            <article key={entry.id} className={styles.incidentEntry}>
                              <div className={styles.incidentEntryHead}>
                                <strong>{entry.title}</strong>
                                <span
                                  className={
                                    entry.severity === "critical"
                                      ? styles.incidentStateCritical
                                      : entry.severity === "warning"
                                        ? styles.incidentStateWarning
                                        : styles.incidentStateInfo
                                  }
                                >
                                  {entry.severity}
                                </span>
                              </div>
                              <p>{entry.description}</p>
                              <div className={styles.incidentEntryMeta}>
                                <span>{new Date(entry.timestamp).toLocaleString("ru-RU")}</span>
                                {entry.ageLabel ? <span>{entry.ageLabel} назад</span> : null}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <p className={styles.incidentEmpty}>
                          Активных инцидентов нет. Этот блок нужен как быстрый операционный радар перед ручными действиями.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {migrationStatus ? (
              <div className={styles.migrationBlock}>
                <div className={styles.migrationSummary}>
                  <div>
                    <span>Общее состояние миграций</span>
                    <b>{CUTOVER_LABELS[migrationStatus.overallState]}</b>
                  </div>
                  <div>
                    <span>Домены</span>
                    <b>
                      ready {migrationStatus.readyDomains} · active {migrationStatus.inProgressDomains} · legacy{" "}
                      {migrationStatus.legacyDomains}
                    </b>
                  </div>
                  <div>
                    <span>Postgres</span>
                    <b>{migrationStatus.postgresEnabled ? "enabled" : "disabled"}</b>
                  </div>
                </div>
                <div className={styles.migrationGrid}>
                  {migrationStatus.domains.map((domain) => (
                    <article key={domain.id} className={styles.migrationCard}>
                      <div className={styles.migrationCardHead}>
                        <div>
                          <h3>{domain.label}</h3>
                          <p>
                            Источник: {domain.source} · {CUTOVER_LABELS[domain.cutoverState]}
                          </p>
                        </div>
                        <strong>{domain.coveragePercent}%</strong>
                      </div>
                      <p className={styles.migrationDescription}>{MIGRATION_DOMAIN_COPY[domain.id]}</p>
                      <div className={styles.migrationMetrics}>
                        {domain.metrics.map((metric) => (
                          <p key={metric.id}>
                            <span>{metric.label}</span>
                            <b>
                              legacy {metric.legacyCount} · pg {metric.normalizedCount}
                            </b>
                          </p>
                        ))}
                      </div>
                      <div className={styles.migrationNotes}>
                        {domain.notes.map((note) => (
                          <p key={note}>{note}</p>
                        ))}
                      </div>
                      <p className={styles.migrationUpdatedAt}>
                        Updated {new Date(domain.updatedAt).toLocaleString("ru-RU")}
                      </p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {operatorGuide ? (
              <div className={styles.operatorGuideBlock}>
                <div className={styles.operatorGuideHead}>
                  <div>
                    <h3>Operator guide</h3>
                    <p>
                      Единый go-live и recovery слой. Здесь в одном месте собраны следующий шаг, release mode и базовые
                      runbooks перед mainnet или после проблемного деплоя.
                    </p>
                  </div>
                  <span className={styles.workerRunUpdatedAt}>
                    Updated {new Date(operatorGuide.updatedAt).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className={styles.operatorGuideSummary}>
                  <div>
                    <span>Состояние</span>
                    <b>{OPERATOR_GUIDE_STATE_LABELS[operatorGuide.overallState]}</b>
                  </div>
                  <div>
                    <span>Release mode</span>
                    <b>{OPERATOR_RELEASE_MODE_LABELS[operatorGuide.releaseMode]}</b>
                  </div>
                  <div>
                    <span>Next actions</span>
                    <b>{operatorGuide.nextActions.length}</b>
                  </div>
                </div>
                <p className={styles.operatorGuideSummaryText}>{operatorGuide.summary}</p>
                <div className={styles.operatorGuideGrid}>
                  <div className={styles.operatorGuideActions}>
                    <h4>Что делать сейчас</h4>
                    {operatorGuide.nextActions.map((action) => (
                      <article key={action.id} className={styles.operatorGuideActionCard}>
                        <div className={styles.operatorGuideActionHead}>
                          <strong>{action.title}</strong>
                          <span
                            className={
                              action.priority === "critical"
                                ? styles.incidentStateCritical
                                : action.priority === "high"
                                  ? styles.incidentStateWarning
                                  : styles.incidentStateInfo
                            }
                          >
                            {action.priority}
                          </span>
                        </div>
                        <p>{action.description}</p>
                      </article>
                    ))}
                  </div>
                  <div className={styles.operatorGuideRunbooks}>
                    <h4>Runbooks</h4>
                    <div className={styles.operatorGuideRunbookList}>
                      {operatorGuide.runbooks.map((runbook) => (
                        <article key={runbook.id} className={styles.operatorGuideRunbookCard}>
                          <strong>{runbook.label}</strong>
                          <p>{runbook.when}</p>
                          <ol>
                            {runbook.steps.map((step) => (
                              <li key={step}>{step}</li>
                            ))}
                          </ol>
                        </article>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            {workerRuns ? (
              <div className={styles.workerRunBlock}>
                <div className={styles.workerRunHead}>
                  <div>
                    <h3>История worker runs</h3>
                    <p>
                      Последние реальные прогоны очередей. Нужны, чтобы быстро понять, срабатывают ли worker routes и чем
                      заканчивается обработка.
                    </p>
                  </div>
                  <div className={styles.workerRunControls}>
                    <div className={styles.workerRunActions}>
                      <button
                        type="button"
                        className={styles.workerRunTriggerButton}
                        onClick={() => void handleWorkerTrigger("telegram_notifications")}
                        disabled={runningWorkerId !== null}
                      >
                        {runningWorkerId === "telegram_notifications" ? "Запускаю…" : "Прогнать notifications"}
                      </button>
                      <button
                        type="button"
                        className={styles.workerRunTriggerButton}
                        onClick={() => void handleWorkerTrigger("storage_delivery_telegram")}
                        disabled={runningWorkerId !== null}
                      >
                        {runningWorkerId === "storage_delivery_telegram" ? "Запускаю…" : "Прогнать storage delivery"}
                      </button>
                    </div>
                    <span className={styles.workerRunUpdatedAt}>
                      Updated {new Date(workerRuns.updatedAt).toLocaleString("ru-RU")}
                    </span>
                  </div>
                </div>
                <p className={styles.workerRunActionResult}>
                  Ручной прогон нужен для recovery-кейсов: например, после деплоя, очереди ошибок или подозрения, что cron
                  не дошёл до нужного worker route.
                </p>
                {workerTriggerMessage ? <p className={styles.workerRunActionResult}>{workerTriggerMessage}</p> : null}
                <div className={styles.workerRunList}>
                  {workerRuns.runs.map((run) => (
                    <article key={run.id} className={styles.workerRunCard}>
                      <div className={styles.workerRunCardHead}>
                        <div>
                          <strong>{WORKER_LABELS[run.workerId]}</strong>
                          <p>
                            {new Date(run.completedAt).toLocaleString("ru-RU")} · limit {run.limit}
                          </p>
                          <div className={styles.workerRunMetaRow}>
                            <span className={styles.workerRunMetaPill}>{WORKER_TRIGGER_LABELS[run.trigger]}</span>
                            {run.triggeredByTelegramUserId ? (
                              <span className={styles.workerRunMetaPill}>admin {run.triggeredByTelegramUserId}</span>
                            ) : null}
                          </div>
                        </div>
                        <span
                          className={
                            run.status === "failed"
                              ? styles.incidentStateCritical
                              : run.status === "partial"
                                ? styles.incidentStateWarning
                                : styles.incidentStateInfo
                          }
                        >
                          {WORKER_STATUS_LABELS[run.status]}
                        </span>
                      </div>
                      <div className={styles.workerRunMetrics}>
                        <p>
                          <span>Очередь</span>
                          <b>
                            {run.queueSizeBefore ?? 0} → {run.queueSizeAfter ?? run.remaining ?? 0}
                          </b>
                        </p>
                        <p>
                          <span>Обработано</span>
                          <b>{run.processed}</b>
                        </p>
                        <p>
                          <span>Доставлено</span>
                          <b>{run.delivered}</b>
                        </p>
                        <p>
                          <span>Ошибки</span>
                          <b>{run.failed}</b>
                        </p>
                        {run.claimed !== undefined ? (
                          <p>
                            <span>Claimed</span>
                            <b>{run.claimed}</b>
                          </p>
                        ) : null}
                        {run.retried !== undefined ? (
                          <p>
                            <span>Retry</span>
                            <b>{run.retried}</b>
                          </p>
                        ) : null}
                        {run.skipped !== undefined ? (
                          <p>
                            <span>Skipped</span>
                            <b>{run.skipped}</b>
                          </p>
                        ) : null}
                        {run.remaining !== undefined ? (
                          <p>
                            <span>Осталось</span>
                            <b>{run.remaining}</b>
                          </p>
                        ) : null}
                      </div>
                      {run.errorMessage ? <p className={styles.workerRunError}>{run.errorMessage}</p> : null}
                    </article>
                  ))}
                  {workerRuns.runs.length === 0 ? (
                    <p className={styles.workerRunEmpty}>
                      История пуста. Как только worker routes начнут реально отрабатывать очереди, последние прогоны
                      появятся здесь.
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}
            {tonEnvironmentStatus ? (
              <div className={styles.tonStatusBlock}>
                <div className={styles.tonStatusHead}>
                  <div>
                    <h3>TON environment</h3>
                    <p>
                      Контроль активной сети, NFT runtime и collection source. Нужен, чтобы не смешивать
                      testnet и mainnet перед mint/deploy сценариями.
                    </p>
                  </div>
                  <span className={styles.workerRunUpdatedAt}>
                    Updated {new Date(tonEnvironmentStatus.updatedAt).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className={styles.tonStatusSummary}>
                  <div>
                    <span>Сеть</span>
                    <b>{tonEnvironmentStatus.network}</b>
                  </div>
                  <div>
                    <span>Mint</span>
                    <b>{tonEnvironmentStatus.onchainMintEnabled ? "enabled" : "disabled"}</b>
                  </div>
                  <div>
                    <span>Relay</span>
                    <b>{tonEnvironmentStatus.relayReady ? "ready" : "incomplete"}</b>
                  </div>
                  <div>
                    <span>Collection source</span>
                    <b>{TON_COLLECTION_SOURCE_LABELS[tonEnvironmentStatus.collectionSource]}</b>
                  </div>
                </div>
                <div className={styles.tonStatusGrid}>
                  <article className={styles.tonStatusCard}>
                    <strong>Runtime config</strong>
                    <p>Сеть: {tonEnvironmentStatus.runtimeConfigNetwork ?? "не сохранена"}</p>
                    <p>Collection: {tonEnvironmentStatus.runtimeCollectionAddress ?? "не задана"}</p>
                    <p>
                      Совпадает с активной сетью:{" "}
                      {tonEnvironmentStatus.runtimeCollectionAddress
                        ? tonEnvironmentStatus.runtimeNetworkMatches
                          ? "да"
                          : "нет"
                        : "не применимо"}
                    </p>
                  </article>
                  <article className={styles.tonStatusCard}>
                    <strong>Активный контур</strong>
                    <p>Активная collection: {tonEnvironmentStatus.activeCollectionAddress ?? "не задана"}</p>
                    <p>Env fallback: {tonEnvironmentStatus.envCollectionAddress ?? "не задан"}</p>
                    <p>Public URL: {tonEnvironmentStatus.publicBaseUrl ?? "не определён"}</p>
                  </article>
                  <article className={styles.tonStatusCard}>
                    <strong>Relay config</strong>
                    <p>Sponsor: {tonEnvironmentStatus.sponsorAddress ?? "не определён"}</p>
                    <p>
                      Missing env:{" "}
                      {tonEnvironmentStatus.relayMissing.length > 0
                        ? tonEnvironmentStatus.relayMissing.join(", ")
                        : "нет"}
                    </p>
                  </article>
                </div>
                {tonEnvironmentStatus.warnings.length > 0 ? (
                  <div className={styles.tonWarningList}>
                    {tonEnvironmentStatus.warnings.map((warning) => (
                      <p key={warning}>{warning}</p>
                    ))}
                  </div>
                ) : (
                  <p className={styles.tonStatusOk}>
                    TON runtime не показывает признаков смешения сетей. Активный контур выглядит согласованным.
                  </p>
                )}
              </div>
            ) : null}
            {deploymentReadiness ? (
              <div className={styles.deploymentBlock}>
                <div className={styles.deploymentHead}>
                  <div>
                    <h3>Deployment readiness</h3>
                    <p>
                      Preflight по базовым env и infra-контурам. Удобно проверять перед rollout или после обновления
                      настроек Vercel и Supabase.
                    </p>
                  </div>
                  <span className={styles.workerRunUpdatedAt}>
                    {DEPLOYMENT_STATE_LABELS[deploymentReadiness.overallState]} ·{" "}
                    {new Date(deploymentReadiness.updatedAt).toLocaleString("ru-RU")}
                  </span>
                </div>
                <div className={styles.deploymentSummary}>
                  <div>
                    <span>Ready</span>
                    <b>{deploymentReadiness.readyChecks}</b>
                  </div>
                  <div>
                    <span>Warning</span>
                    <b>{deploymentReadiness.warningChecks}</b>
                  </div>
                  <div>
                    <span>Missing</span>
                    <b>{deploymentReadiness.missingChecks}</b>
                  </div>
                </div>
                <div className={styles.deploymentGrid}>
                  {deploymentReadiness.checks.map((check) => (
                    <article key={check.id} className={styles.deploymentCard}>
                      <div className={styles.deploymentCardHead}>
                        <strong>{check.label}</strong>
                        <span
                          className={
                            check.status === "missing"
                              ? styles.incidentStateCritical
                              : check.status === "warning"
                                ? styles.incidentStateWarning
                                : styles.incidentStateInfo
                          }
                        >
                          {check.status}
                        </span>
                      </div>
                      <p>{check.summary}</p>
                      <p>{check.hint}</p>
                    </article>
                  ))}
                </div>
              </div>
            ) : null}
            {hasPermission("settings:manage") ? (
              <div className={styles.actionGuideGrid}>
                <article className={`${styles.actionGuideCard} ${styles.actionGuideCardPrimary}`}>
                  <div className={styles.actionGuideHead}>
                    <h3>Полный Sprint 08 cutover</h3>
                    <span>Все критичные нормализованные домены разом</span>
                  </div>
                  <p className={styles.actionGuideText}>
                    Запускает единый backfill по ownership, artist applications, catalog, finance и support. Это
                    операторская кнопка для финального прогона после backend-изменений, когда нужно понять, готов ли
                    переходный слой к cutover.
                  </p>
                  <p className={styles.actionGuideExample}>
                    Пример: вы закончили migration slice, хотите не кликать пять карточек подряд и вам нужен один итоговый
                    отчёт, сколько доменов уже `ready`, а сколько ещё в `dual-write`.
                  </p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setMigrationSuiteLoading("dry-run");
                        const response = await runAdminMigrationBackfillSuite({
                          dryRun: true,
                          limit: 1000,
                        });
                        setMigrationSuiteLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setMigrationSuiteResult(response.result);
                        setMigrationStatus(response.result?.migrationStatus ?? null);
                      }}
                    >
                      {migrationSuiteLoading === "dry-run" ? "Собираем..." : "Dry-run всего cutover"}
                    </button>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setMigrationSuiteLoading("run");
                        const response = await runAdminMigrationBackfillSuite({
                          dryRun: false,
                          limit: 1000,
                        });
                        setMigrationSuiteLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setMigrationSuiteResult(response.result);
                        setMigrationStatus(response.result?.migrationStatus ?? null);
                      }}
                    >
                      {migrationSuiteLoading === "run" ? "Переносим..." : "Запустить весь backfill"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    {migrationSuiteResult
                      ? `${migrationSuiteResult.dryRun ? "Dry-run" : "Backfill"}: domains ${migrationSuiteResult.domainsReady}/${migrationSuiteResult.domainsCompleted} ready · state ${migrationSuiteResult.overallState} · entitlements ${migrationSuiteResult.entitlements.processedUsers} users · catalog ${migrationSuiteResult.artistCatalog.profiles}/${migrationSuiteResult.artistCatalog.tracks} · finance ${migrationSuiteResult.artistFinance.earnings}/${migrationSuiteResult.artistFinance.payoutRequests} · support ${migrationSuiteResult.artistSupport.donations}/${migrationSuiteResult.artistSupport.subscriptions}`
                      : "Главная операторская кнопка этого спринта. Используйте её после серии migration-изменений, чтобы одним действием прогнать все критичные домены и сразу увидеть общий cutover status."}
                  </p>
                </article>

                <article className={styles.actionGuideCard}>
                  <div className={styles.actionGuideHead}>
                    <h3>Ownership и NFT</h3>
                    <span>Покупки и коллекция</span>
                  </div>
                  <p className={styles.actionGuideText}>
                    Переносит права на релизы, треки и minted NFT из legacy social state в нормализованные таблицы.
                  </p>
                  <p className={styles.actionGuideExample}>
                    Пример: пользователь уже покупал треки раньше, но после нового backend slice они должны появиться в
                    Postgres для библиотеки и file delivery.
                  </p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setBackfillLoading("dry-run");
                        const response = await runAdminSocialEntitlementBackfill({
                          dryRun: true,
                          limit: 500,
                        });
                        setBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setBackfillResult(response.result);
                      }}
                    >
                      {backfillLoading === "dry-run" ? "Считаем..." : "Проверить объём"}
                    </button>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setBackfillLoading("run");
                        const response = await runAdminSocialEntitlementBackfill({
                          dryRun: false,
                          limit: 500,
                        });
                        setBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setBackfillResult(response.result);
                      }}
                    >
                      {backfillLoading === "run" ? "Переносим..." : "Запустить перенос"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    {backfillResult
                      ? `${backfillResult.dryRun ? "Dry-run" : "Backfill"}: users ${backfillResult.processedUsers} · releases ${backfillResult.releaseEntitlements} · tracks ${backfillResult.trackEntitlements} · nft ${backfillResult.nftMints} · source ${new Date(backfillResult.sourceUpdatedAt).toLocaleString("ru-RU")}`
                      : "Сначала используйте проверку объёма, если после релизного обновления нужно понять, сколько прав ещё живёт только в legacy state."}
                  </p>
                </article>

                <article className={styles.actionGuideCard}>
                  <div className={styles.actionGuideHead}>
                    <h3>Artist applications</h3>
                    <span>Заявки на статус артиста</span>
                  </div>
                  <p className={styles.actionGuideText}>
                    Переносит анкеты обычных пользователей, которые хотят стать артистами, и их moderation state.
                  </p>
                  <p className={styles.actionGuideExample}>
                    Пример: вы добавили новую таблицу для заявок, и теперь хотите, чтобы старые pending/approved заявки
                    появились в новой модели без ручной пересборки.
                  </p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setApplicationBackfillLoading("dry-run");
                        const response = await runAdminArtistApplicationBackfill({
                          dryRun: true,
                          limit: 500,
                        });
                        setApplicationBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setApplicationBackfillResult(response.result);
                      }}
                    >
                      {applicationBackfillLoading === "dry-run" ? "Считаем..." : "Проверить объём"}
                    </button>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setApplicationBackfillLoading("run");
                        const response = await runAdminArtistApplicationBackfill({
                          dryRun: false,
                          limit: 500,
                        });
                        setApplicationBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setApplicationBackfillResult(response.result);
                      }}
                    >
                      {applicationBackfillLoading === "run" ? "Переносим..." : "Запустить перенос"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    {applicationBackfillResult
                      ? `${applicationBackfillResult.dryRun ? "Dry-run" : "Backfill"}: users ${applicationBackfillResult.selectedUsers} · applications ${applicationBackfillResult.applications} · source ${new Date(applicationBackfillResult.sourceUpdatedAt).toLocaleString("ru-RU")}`
                      : "Используйте этот блок, когда нужно догнать новый application layer после изменения artist-flow или смены moderation logic."}
                  </p>
                </article>

                <article className={styles.actionGuideCard}>
                  <div className={styles.actionGuideHead}>
                    <h3>Artist catalog</h3>
                    <span>Профили и релизы артистов</span>
                  </div>
                  <p className={styles.actionGuideText}>
                    Переносит профили артистов и их релизы в нормализованные таблицы, которые потом читает каталог, студия и
                    модерация.
                  </p>
                  <p className={styles.actionGuideExample}>
                    Пример: после изменения структуры artist profile или release editor нужно догнать старые профили и треки,
                    чтобы студия и публичные страницы читались из Postgres.
                  </p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setArtistBackfillLoading("dry-run");
                        const response = await runAdminArtistCatalogBackfill({
                          dryRun: true,
                          limit: 500,
                        });
                        setArtistBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setArtistBackfillResult(response.result);
                      }}
                    >
                      {artistBackfillLoading === "dry-run" ? "Считаем..." : "Проверить объём"}
                    </button>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setArtistBackfillLoading("run");
                        const response = await runAdminArtistCatalogBackfill({
                          dryRun: false,
                          limit: 500,
                        });
                        setArtistBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setArtistBackfillResult(response.result);
                      }}
                    >
                      {artistBackfillLoading === "run" ? "Переносим..." : "Запустить перенос"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    {artistBackfillResult
                      ? `${artistBackfillResult.dryRun ? "Dry-run" : "Backfill"}: artists ${artistBackfillResult.selectedArtists} · profiles ${artistBackfillResult.profiles} · tracks ${artistBackfillResult.tracks} · source ${new Date(artistBackfillResult.sourceUpdatedAt).toLocaleString("ru-RU")}`
                      : "Нужен после крупных изменений в artist profile, artist releases или когда source в модерации ещё показывает legacy."}
                  </p>
                </article>

                <article className={styles.actionGuideCard}>
                  <div className={styles.actionGuideHead}>
                    <h3>Artist finance</h3>
                    <span>Заработок, выплаты и аудит</span>
                  </div>
                  <p className={styles.actionGuideText}>
                    Переносит earnings ledger, payout requests и payout audit. Это самый чувствительный блок, потому что
                    влияет на деньги артиста.
                  </p>
                  <p className={styles.actionGuideExample}>
                    Пример: после корректировки payout logic сначала делаете dry-run, сверяете цифры в студии, и только потом
                    запускаете реальный перенос.
                  </p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setFinanceBackfillLoading("dry-run");
                        const response = await runAdminArtistFinanceBackfill({
                          dryRun: true,
                          limit: 1000,
                        });
                        setFinanceBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setFinanceBackfillResult(response.result);
                      }}
                    >
                      {financeBackfillLoading === "dry-run" ? "Считаем..." : "Проверить объём"}
                    </button>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setFinanceBackfillLoading("run");
                        const response = await runAdminArtistFinanceBackfill({
                          dryRun: false,
                          limit: 1000,
                        });
                        setFinanceBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setFinanceBackfillResult(response.result);
                      }}
                    >
                      {financeBackfillLoading === "run" ? "Переносим..." : "Запустить перенос"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    {financeBackfillResult
                      ? `${financeBackfillResult.dryRun ? "Dry-run" : "Backfill"}: artists ${financeBackfillResult.selectedArtists} · earnings ${financeBackfillResult.earnings} · payouts ${financeBackfillResult.payoutRequests} · audit ${financeBackfillResult.payoutAuditEntries} · profiles ${financeBackfillResult.syncedProfiles} · source ${new Date(financeBackfillResult.sourceUpdatedAt).toLocaleString("ru-RU")}`
                      : "Используйте этот перенос после backend-изменений в finance, payouts или audit trail. Это не кнопка «на всякий случай»."}
                  </p>
                </article>

                <article className={styles.actionGuideCard}>
                  <div className={styles.actionGuideHead}>
                    <h3>Artist support</h3>
                    <span>Донаты и подписки</span>
                  </div>
                  <p className={styles.actionGuideText}>
                    Переносит слой поддержки артиста: разовые донаты и регулярные подписки, которые влияют на social и
                    finance-метрики.
                  </p>
                  <p className={styles.actionGuideExample}>
                    Пример: если после нового релиза артист видит донаты не там, где ожидает, сначала проверяете этот домен и
                    догоняете support state.
                  </p>
                  <div className={styles.promoActions}>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setSupportBackfillLoading("dry-run");
                        const response = await runAdminArtistSupportBackfill({
                          dryRun: true,
                          limit: 1000,
                        });
                        setSupportBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setSupportBackfillResult(response.result);
                      }}
                    >
                      {supportBackfillLoading === "dry-run" ? "Считаем..." : "Проверить объём"}
                    </button>
                    <button
                      type="button"
                      disabled={migrationActionsBusy}
                      onClick={async () => {
                        setSupportBackfillLoading("run");
                        const response = await runAdminArtistSupportBackfill({
                          dryRun: false,
                          limit: 1000,
                        });
                        setSupportBackfillLoading(null);

                        if (response.error) {
                          setError(response.error);
                          return;
                        }

                        setSupportBackfillResult(response.result);
                      }}
                    >
                      {supportBackfillLoading === "run" ? "Переносим..." : "Запустить перенос"}
                    </button>
                  </div>
                  <p className={styles.hint}>
                    {supportBackfillResult
                      ? `${supportBackfillResult.dryRun ? "Dry-run" : "Backfill"}: artists ${supportBackfillResult.selectedArtists} · donations ${supportBackfillResult.donations} · subscriptions ${supportBackfillResult.subscriptions} · source ${new Date(supportBackfillResult.sourceUpdatedAt).toLocaleString("ru-RU")}`
                      : "Нужен после изменения support-метрик, artist profile summary или при переходе support-domain на Postgres."}
                  </p>
                </article>
              </div>
            ) : null}
          </section>
        ) : null}

        {resolvedActiveTab === "orders" && hasPermission("orders:view") ? (
          <ShopAdminOrdersPanel enabled canManage={hasPermission("orders:manage")} />
        ) : null}

        {resolvedActiveTab === "customers" && hasPermission("customers:view") ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Клиенты</h2>
              <input
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Поиск по имени, @username, телефону"
              />
            </div>
            <p className={styles.sectionHint}>
              Этот список нужен для ручного разбора клиентских кейсов: кто покупал, когда был последний заказ и сколько всего
              потратил пользователь.
            </p>

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

        {resolvedActiveTab === "products" && hasPermission("products:view") ? (
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
            <p className={styles.sectionHint}>
              Здесь вы управляете тем, как релиз или товар выглядит в витрине: цена, публикация, остаток, бейдж и место в
              каталоге.
            </p>

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

        {resolvedActiveTab === "categories" && hasPermission("products:view") ? (
          <section className={styles.section}>
            <div className={styles.sectionHead}>
              <h2>Категории и подкатегории</h2>
            </div>
            <p className={styles.sectionHint}>
              Категории помогают не только навести порядок в витрине, но и подготовить место под новые сцены, форматы и
              редакционные подборки.
            </p>

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

        {resolvedActiveTab === "promos" && hasPermission("promos:view") ? (
          <section className={styles.section}>
            <h2>Промокоды</h2>
            <p className={styles.sectionHint}>
              Промокоды лучше использовать как понятный маркетинговый инструмент: короткая акция, ясный лимит и понятная
              причина, зачем пользователь должен ввести код.
            </p>
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

        {resolvedActiveTab === "settings" && hasPermission("settings:view") ? (
          <section className={styles.section}>
            <h2>Настройки магазина</h2>
            <p className={styles.sectionHint}>
              Это глобальные правила магазина. Меняйте их аккуратно: эффект может затронуть сразу весь consumer flow, а не
              только один релиз.
            </p>
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

        {resolvedActiveTab === "admins" && hasPermission("admins:view") ? (
          <section className={styles.section}>
            <h2>Администраторы и роли</h2>
            <p className={styles.sectionHint}>
              Раздавайте доступы по принципу минимально необходимых прав. Каталог, support, финансы и системные миграции
              лучше держать разнесёнными по ролям.
            </p>
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
