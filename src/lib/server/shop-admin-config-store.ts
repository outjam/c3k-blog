import { SHOP_DEFAULT_PRODUCT_CATEGORIES, SHOP_PRODUCTS } from "@/data/shop-products";
import type { BlogPost, PostContentBlock } from "@/data/posts";
import {
  DEFAULT_DELIVERY_FEE_STARS_CENTS,
  DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS,
  PROMO_RULES,
  type PromoRule,
} from "@/lib/shop-pricing";
import { isShopAdminRole } from "@/lib/shop-admin-roles";
import { DEFAULT_ADMIN_TELEGRAM_ID, getShopAdminTelegramIds } from "@/lib/shop-admin";
import type {
  ShopAdminConfig,
  ShopAdminMember,
  ShopAppSettings,
  ShopProduct,
  ShopProductCategory,
  ShopProductSubcategory,
  ShopPromoCode,
} from "@/types/shop";

const ADMIN_CONFIG_KEY = "c3k:shop:admin-config:v1";

type GlobalWithConfig = typeof globalThis & { __c3kShopAdminConfigMemory__?: ShopAdminConfig };

const DEFAULT_PRODUCT = SHOP_PRODUCTS[0] as ShopProduct;
const DEFAULT_BLOG_COVER = {
  src: "/posts/cover-pattern.svg",
  alt: "Обложка поста",
  width: 1200,
  height: 700,
};

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeSafeSlug = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const cloneDefaultProductCategories = (): ShopProductCategory[] => {
  return SHOP_DEFAULT_PRODUCT_CATEGORIES.map((category) => ({
    ...category,
    subcategories: category.subcategories.map((subcategory) => ({ ...subcategory })),
  }));
};

const sanitizeProductSubcategory = (raw: unknown, fallbackOrder: number): ShopProductSubcategory | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Partial<ShopProductSubcategory>;
  const id = normalizeSafeId(source.id, 48);

  if (!id) {
    return null;
  }

  const label = String(source.label ?? "").trim().slice(0, 64);

  if (!label) {
    return null;
  }

  return {
    id,
    label,
    description: source.description ? String(source.description).trim().slice(0, 180) : undefined,
    order:
      typeof source.order === "number" && Number.isFinite(source.order)
        ? Math.max(1, Math.round(source.order))
        : fallbackOrder,
  };
};

const sanitizeProductCategory = (raw: unknown, fallbackOrder: number): ShopProductCategory | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const source = raw as Partial<ShopProductCategory>;
  const id = normalizeSafeId(source.id, 48);

  if (!id) {
    return null;
  }

  const label = String(source.label ?? "").trim().slice(0, 64);

  if (!label) {
    return null;
  }

  const subcategoryMap = new Map<string, ShopProductSubcategory>();
  const rawSubcategories = Array.isArray(source.subcategories) ? source.subcategories : [];

  rawSubcategories.forEach((entry, index) => {
    const sanitized = sanitizeProductSubcategory(entry, (index + 1) * 10);

    if (sanitized) {
      subcategoryMap.set(sanitized.id, sanitized);
    }
  });

  return {
    id,
    label,
    emoji: source.emoji ? String(source.emoji).trim().slice(0, 8) : undefined,
    description: source.description ? String(source.description).trim().slice(0, 220) : undefined,
    order:
      typeof source.order === "number" && Number.isFinite(source.order)
        ? Math.max(1, Math.round(source.order))
        : fallbackOrder,
    subcategories: Array.from(subcategoryMap.values()).sort((a, b) => a.order - b.order),
  };
};

const sanitizeContentBlock = (raw: unknown): PostContentBlock | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const block = raw as Partial<PostContentBlock> & { type?: string };

  if (block.type === "paragraph" && typeof block.text === "string") {
    return { type: "paragraph", text: block.text.slice(0, 6000) };
  }

  if (block.type === "heading" && typeof block.text === "string") {
    return { type: "heading", text: block.text.slice(0, 240) };
  }

  if (block.type === "quote" && typeof block.text === "string") {
    return {
      type: "quote",
      text: block.text.slice(0, 1200),
      author: typeof block.author === "string" ? block.author.slice(0, 120) : undefined,
    };
  }

  if (block.type === "list") {
    const sourceItems = Array.isArray(block.items) ? block.items : [];
    const items = sourceItems
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((item) => item.slice(0, 220));

    if (items.length === 0) {
      return null;
    }

    return {
      type: "list",
      ordered: Boolean(block.ordered),
      items,
    };
  }

  if (block.type === "image" && block.image && typeof block.image === "object") {
    const image = block.image as unknown as Record<string, unknown>;
    const src = String(image.src ?? "").trim();

    if (!src) {
      return null;
    }

    return {
      type: "image",
      image: {
        src,
        alt: String(image.alt ?? "Изображение").slice(0, 220),
        caption: typeof image.caption === "string" ? image.caption.slice(0, 320) : undefined,
        width: Math.max(1, Math.round(Number(image.width ?? 1200))),
        height: Math.max(1, Math.round(Number(image.height ?? 700))),
      },
    };
  }

  return null;
};

const sanitizeBlogPost = (raw: unknown): BlogPost | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const post = raw as Partial<BlogPost>;
  const slug = normalizeSafeSlug(post.slug, 120);

  if (!slug) {
    return null;
  }

  const tags = (Array.isArray(post.tags) ? post.tags : [])
    .map((tag) => String(tag ?? "").trim())
    .filter(Boolean)
    .slice(0, 12)
    .map((tag) => tag.slice(0, 32));

  const sourceBlocks = Array.isArray(post.content) ? post.content : [];
  const content = sourceBlocks
    .map((block) => sanitizeContentBlock(block))
    .filter((block): block is PostContentBlock => Boolean(block));

  return {
    slug,
    title: String(post.title ?? "").trim().slice(0, 180) || "Без названия",
    excerpt: String(post.excerpt ?? "").trim().slice(0, 420) || "Описание отсутствует",
    tags: tags.length > 0 ? tags : ["telegram", "webapp"],
    cardVariant: post.cardVariant === "feature" || post.cardVariant === "glass" || post.cardVariant === "minimal" ? post.cardVariant : "minimal",
    publishedAt: String(post.publishedAt ?? new Date().toISOString().slice(0, 10)),
    readTime: String(post.readTime ?? "5 мин").slice(0, 20),
    cover:
      post.cover && typeof post.cover === "object"
        ? {
            src: String((post.cover as { src?: string }).src ?? DEFAULT_BLOG_COVER.src),
            alt: String((post.cover as { alt?: string }).alt ?? DEFAULT_BLOG_COVER.alt).slice(0, 220),
            caption:
              typeof (post.cover as { caption?: string }).caption === "string"
                ? (post.cover as { caption?: string }).caption?.slice(0, 320)
                : undefined,
            width: Math.max(1, Math.round(Number((post.cover as { width?: number }).width ?? DEFAULT_BLOG_COVER.width))),
            height: Math.max(1, Math.round(Number((post.cover as { height?: number }).height ?? DEFAULT_BLOG_COVER.height))),
          }
        : DEFAULT_BLOG_COVER,
    content: content.length > 0 ? content : [{ type: "paragraph", text: "Контент пока не добавлен." }],
  };
};

const sanitizeProduct = (raw: unknown): ShopProduct | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const product = raw as Partial<ShopProduct>;
  const id = normalizeSafeId(product.id, 80);
  const slug = normalizeSafeSlug(product.slug, 120);

  if (!id || !slug) {
    return null;
  }

  const category = product.category;
  if (category !== "figurine" && category !== "vase" && category !== "mug" && category !== "lamp" && category !== "plate") {
    return null;
  }

  const sourceAttributes = product.attributes ?? DEFAULT_PRODUCT.attributes;

  return {
    id,
    slug,
    title: String(product.title ?? "").trim().slice(0, 160) || "Новый товар",
    subtitle: String(product.subtitle ?? "").trim().slice(0, 220) || "Описание",
    description: String(product.description ?? "").trim().slice(0, 5000) || "Описание товара отсутствует.",
    category,
    image: String(product.image ?? "").trim() || DEFAULT_PRODUCT.image,
    priceStarsCents: Math.max(1, Math.round(Number(product.priceStarsCents ?? 1))),
    oldPriceStarsCents:
      typeof product.oldPriceStarsCents === "number" && Number.isFinite(product.oldPriceStarsCents)
        ? Math.max(1, Math.round(product.oldPriceStarsCents))
        : undefined,
    rating: Math.max(0, Math.min(5, Number(product.rating ?? DEFAULT_PRODUCT.rating))),
    reviewsCount: Math.max(0, Math.round(Number(product.reviewsCount ?? DEFAULT_PRODUCT.reviewsCount))),
    isNew: Boolean(product.isNew),
    isHit: Boolean(product.isHit),
    tags: (Array.isArray(product.tags) ? product.tags : [])
      .map((tag) => String(tag ?? "").trim())
      .filter(Boolean)
      .slice(0, 20)
      .map((tag) => tag.slice(0, 42)),
    attributes: {
      material: String(sourceAttributes.material ?? DEFAULT_PRODUCT.attributes.material).slice(0, 120),
      technique: String(sourceAttributes.technique ?? DEFAULT_PRODUCT.attributes.technique).slice(0, 120),
      color: String(sourceAttributes.color ?? DEFAULT_PRODUCT.attributes.color).slice(0, 120),
      heightCm: Math.max(1, Math.round(Number(sourceAttributes.heightCm ?? DEFAULT_PRODUCT.attributes.heightCm))),
      widthCm: Math.max(1, Math.round(Number(sourceAttributes.widthCm ?? DEFAULT_PRODUCT.attributes.widthCm))),
      weightGr: Math.max(1, Math.round(Number(sourceAttributes.weightGr ?? DEFAULT_PRODUCT.attributes.weightGr))),
      collection: String(sourceAttributes.collection ?? DEFAULT_PRODUCT.attributes.collection).slice(0, 120),
      sku: String(sourceAttributes.sku ?? `SKU-${id}`).slice(0, 60),
      stock: Math.max(0, Math.min(9999, Math.round(Number(sourceAttributes.stock ?? 0)))),
    },
  };
};

const normalizePromoCode = (code: string): string => {
  return code
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
};

const toDefaultPromo = (rule: PromoRule): ShopPromoCode => {
  const now = new Date().toISOString();
  return {
    code: rule.code,
    label: rule.label,
    discountType: rule.discountType,
    discountValue: Math.round(rule.discountValue),
    minSubtotalStarsCents: 0,
    active: true,
    usageLimit: undefined,
    usedCount: 0,
    createdAt: now,
    updatedAt: now,
  };
};

const buildDefaultSettings = (): ShopAppSettings => {
  const now = new Date().toISOString();
  return {
    shopEnabled: true,
    checkoutEnabled: true,
    maintenanceMode: false,
    defaultDeliveryFeeStarsCents: DEFAULT_DELIVERY_FEE_STARS_CENTS,
    freeDeliveryThresholdStarsCents: DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS,
    updatedAt: now,
  };
};

const buildDefaultConfig = (): ShopAdminConfig => {
  const now = new Date().toISOString();
  const staticAdminIds = getShopAdminTelegramIds();
  const adminMembers: ShopAdminMember[] = staticAdminIds.map((telegramUserId) => ({
    telegramUserId,
    role: telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? "owner" : "admin",
    addedAt: now,
    updatedAt: now,
  }));

  return {
    adminMembers,
    productRecords: {},
    productOverrides: {},
    productCategories: cloneDefaultProductCategories(),
    blogPostRecords: {},
    hiddenPostSlugs: [],
    promoCodes: PROMO_RULES.map((rule) => toDefaultPromo(rule)),
    settings: buildDefaultSettings(),
    updatedAt: now,
  };
};

const sanitizeConfig = (input: unknown): ShopAdminConfig => {
  const fallback = buildDefaultConfig();

  if (!input || typeof input !== "object") {
    return fallback;
  }

  const row = input as Partial<ShopAdminConfig>;
  const updatedAt = String(row.updatedAt ?? fallback.updatedAt);
  const staticProductIds = new Set(SHOP_PRODUCTS.map((item) => item.id));
  const staticAdminIds = new Set(getShopAdminTelegramIds());
  staticAdminIds.add(DEFAULT_ADMIN_TELEGRAM_ID);
  const now = new Date().toISOString();

  const memberMap = new Map<number, ShopAdminMember>();

  if (Array.isArray(row.adminMembers)) {
    for (const rawMember of row.adminMembers) {
      const source = rawMember as Partial<ShopAdminMember>;
      const telegramUserId = Math.max(0, Math.round(Number(source.telegramUserId ?? 0)));

      if (!telegramUserId) {
        continue;
      }

      const sourceRole = typeof source.role === "string" ? source.role : "";
      const normalizedRole: ShopAdminMember["role"] = isShopAdminRole(sourceRole) ? sourceRole : "support";

      memberMap.set(telegramUserId, {
        telegramUserId,
        role: normalizedRole,
        username: source.username ? String(source.username).trim().replace(/^@/, "").slice(0, 64) : undefined,
        firstName: source.firstName ? String(source.firstName).trim().slice(0, 80) : undefined,
        lastName: source.lastName ? String(source.lastName).trim().slice(0, 80) : undefined,
        disabled: Boolean(source.disabled),
        addedByTelegramId:
          typeof source.addedByTelegramId === "number" && Number.isFinite(source.addedByTelegramId)
            ? Math.max(1, Math.round(source.addedByTelegramId))
            : undefined,
        addedAt: String(source.addedAt ?? now),
        updatedAt: String(source.updatedAt ?? now),
      });
    }
  }

  for (const staticId of staticAdminIds) {
    const exists = memberMap.get(staticId);

    if (exists) {
      if (staticId === DEFAULT_ADMIN_TELEGRAM_ID) {
        exists.role = "owner";
        exists.disabled = false;
      }

      continue;
    }

    memberMap.set(staticId, {
      telegramUserId: staticId,
      role: staticId === DEFAULT_ADMIN_TELEGRAM_ID ? "owner" : "admin",
      addedAt: now,
      updatedAt: now,
    });
  }

  const adminMembers = Array.from(memberMap.values())
    .sort((a, b) => a.telegramUserId - b.telegramUserId)
    .map((member) => ({
      ...member,
      role: member.telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? "owner" : member.role,
      disabled: member.telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? false : member.disabled,
    }));

  const productRecords = Object.fromEntries(
    Object.entries(row.productRecords ?? {})
      .map(([key, value]) => {
        const sanitized = sanitizeProduct({ ...(value as object), id: key });

        if (!sanitized) {
          return null;
        }

        return [sanitized.id, sanitized] as const;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );

  const blogPostRecords = Object.fromEntries(
    Object.entries(row.blogPostRecords ?? {})
      .map(([key, value]) => {
        const sanitized = sanitizeBlogPost({ ...(value as object), slug: key });

        if (!sanitized) {
          return null;
        }

        return [sanitized.slug, sanitized] as const;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );

  const hiddenPostSlugs = (Array.isArray(row.hiddenPostSlugs) ? row.hiddenPostSlugs : [])
    .map((slug) => normalizeSafeSlug(slug, 120))
    .filter(Boolean);

  const categoryMap = new Map<string, ShopProductCategory>();
  const rawCategories = Array.isArray(row.productCategories) ? row.productCategories : fallback.productCategories;

  rawCategories.forEach((entry, index) => {
    const sanitized = sanitizeProductCategory(entry, (index + 1) * 10);

    if (sanitized) {
      categoryMap.set(sanitized.id, sanitized);
    }
  });

  if (categoryMap.size === 0) {
    cloneDefaultProductCategories().forEach((category) => {
      categoryMap.set(category.id, category);
    });
  }

  const productCategories = Array.from(categoryMap.values()).sort((a, b) => a.order - b.order);

  const validProductIds = new Set([...staticProductIds, ...Object.keys(productRecords)]);

  const productOverrides = Object.fromEntries(
    Object.entries(row.productOverrides ?? {})
      .map(([productId, value]) => {
        const normalizedId = String(productId).trim().toLowerCase();

        if (!validProductIds.has(normalizedId)) {
          return null;
        }

        const source = value as Partial<ShopAdminConfig["productOverrides"][string]>;
        const categoryId = normalizeSafeId(source?.categoryId, 48);
        const resolvedCategoryId = categoryId && categoryMap.has(categoryId) ? categoryId : undefined;
        const subcategoryId = normalizeSafeId(source?.subcategoryId, 48);
        const resolvedSubcategoryId =
          resolvedCategoryId && subcategoryId
            ? categoryMap.get(resolvedCategoryId)?.subcategories.some((item) => item.id === subcategoryId)
              ? subcategoryId
              : undefined
            : undefined;

        return [
          normalizedId,
          {
            productId: normalizedId,
            priceStarsCents:
              typeof source?.priceStarsCents === "number" && Number.isFinite(source.priceStarsCents)
                ? Math.max(1, Math.round(source.priceStarsCents))
                : undefined,
            stock:
              typeof source?.stock === "number" && Number.isFinite(source.stock)
                ? Math.max(0, Math.min(999, Math.round(source.stock)))
                : undefined,
            isPublished: typeof source?.isPublished === "boolean" ? source.isPublished : undefined,
            isFeatured: typeof source?.isFeatured === "boolean" ? source.isFeatured : undefined,
            badge: typeof source?.badge === "string" ? source.badge.slice(0, 40) : undefined,
            categoryId: resolvedCategoryId,
            subcategoryId: resolvedSubcategoryId,
            updatedAt: String(source?.updatedAt ?? updatedAt),
          },
        ] as const;
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  );

  const promoCodes = Array.isArray(row.promoCodes)
    ? row.promoCodes
        .map((promo) => {
          const source = promo as Partial<ShopPromoCode>;
          const code = normalizePromoCode(String(source.code ?? ""));

          if (!code) {
            return null;
          }

          return {
            code,
            label: String(source.label ?? code).slice(0, 80),
            discountType: source.discountType === "fixed" ? "fixed" : "percent",
            discountValue: Math.max(1, Math.round(Number(source.discountValue ?? 1))),
            minSubtotalStarsCents: Math.max(0, Math.round(Number(source.minSubtotalStarsCents ?? 0))),
            active: Boolean(source.active),
            usageLimit:
              typeof source.usageLimit === "number" && Number.isFinite(source.usageLimit) && source.usageLimit > 0
                ? Math.round(source.usageLimit)
                : undefined,
            usedCount: Math.max(0, Math.round(Number(source.usedCount ?? 0))),
            expiresAt: source.expiresAt ? String(source.expiresAt) : undefined,
            createdAt: String(source.createdAt ?? now),
            updatedAt: String(source.updatedAt ?? now),
          } as ShopPromoCode;
        })
        .filter((item): item is ShopPromoCode => Boolean(item))
    : fallback.promoCodes;

  const sourceSettings = row.settings as Partial<ShopAppSettings> | undefined;
  const settings = {
    shopEnabled: sourceSettings?.shopEnabled ?? fallback.settings.shopEnabled,
    checkoutEnabled: sourceSettings?.checkoutEnabled ?? fallback.settings.checkoutEnabled,
    maintenanceMode: sourceSettings?.maintenanceMode ?? fallback.settings.maintenanceMode,
    defaultDeliveryFeeStarsCents: Math.max(
      0,
      Math.round(sourceSettings?.defaultDeliveryFeeStarsCents ?? fallback.settings.defaultDeliveryFeeStarsCents),
    ),
    freeDeliveryThresholdStarsCents: Math.max(
      0,
      Math.round(sourceSettings?.freeDeliveryThresholdStarsCents ?? fallback.settings.freeDeliveryThresholdStarsCents),
    ),
    updatedAt: String(sourceSettings?.updatedAt ?? fallback.settings.updatedAt),
  };

  return {
    adminMembers,
    productRecords,
    productOverrides,
    productCategories,
    blogPostRecords,
    hiddenPostSlugs,
    promoCodes,
    settings,
    updatedAt,
  };
};

const getRedisConfig = (): { url: string; token: string } | null => {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    return null;
  }

  return { url, token };
};

interface UpstashPipelineEntry {
  result?: unknown;
  error?: string;
}

const executeUpstashPipeline = async (commands: Array<Array<string>>): Promise<UpstashPipelineEntry[] | null> => {
  const config = getRedisConfig();

  if (!config) {
    return null;
  }

  try {
    const response = await fetch(`${config.url}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(commands),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as UpstashPipelineEntry[];
    return Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
};

const readConfigFromRedis = async (): Promise<ShopAdminConfig | null> => {
  const result = await executeUpstashPipeline([["GET", ADMIN_CONFIG_KEY]]);

  if (!result) {
    return null;
  }

  const first = result[0];

  if (!first || first.error || typeof first.result !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(first.result) as unknown;
    return sanitizeConfig(parsed);
  } catch {
    return null;
  }
};

const writeConfigToRedis = async (config: ShopAdminConfig): Promise<boolean> => {
  const result = await executeUpstashPipeline([["SET", ADMIN_CONFIG_KEY, JSON.stringify(config)]]);

  if (!result) {
    return false;
  }

  const first = result[0];
  return Boolean(first && !first.error);
};

const getMemoryConfig = (): ShopAdminConfig => {
  const root = globalThis as GlobalWithConfig;

  if (!root.__c3kShopAdminConfigMemory__) {
    root.__c3kShopAdminConfigMemory__ = buildDefaultConfig();
  }

  return root.__c3kShopAdminConfigMemory__;
};

export const readShopAdminConfig = async (): Promise<ShopAdminConfig> => {
  const redisConfig = await readConfigFromRedis();

  if (redisConfig) {
    return redisConfig;
  }

  return sanitizeConfig(getMemoryConfig());
};

export const writeShopAdminConfig = async (config: ShopAdminConfig): Promise<ShopAdminConfig> => {
  const normalized = sanitizeConfig(config);
  normalized.updatedAt = new Date().toISOString();
  const saved = await writeConfigToRedis(normalized);

  if (!saved) {
    const root = globalThis as GlobalWithConfig;
    root.__c3kShopAdminConfigMemory__ = normalized;
  }

  return normalized;
};

export const mutateShopAdminConfig = async (
  mutate: (current: ShopAdminConfig) => ShopAdminConfig,
): Promise<ShopAdminConfig> => {
  const current = await readShopAdminConfig();
  const next = mutate(current);
  return writeShopAdminConfig(next);
};

export const isPromoExpired = (expiresAt: string | undefined): boolean => {
  if (!expiresAt) {
    return false;
  }

  const timestamp = new Date(expiresAt).getTime();

  if (!Number.isFinite(timestamp)) {
    return false;
  }

  return timestamp < Date.now();
};

export const toActivePromoRules = (config: ShopAdminConfig): PromoRule[] => {
  return config.promoCodes
    .filter((promo) => promo.active)
    .filter((promo) => !isPromoExpired(promo.expiresAt))
    .filter((promo) => (promo.usageLimit ? promo.usedCount < promo.usageLimit : true))
    .map((promo) => ({
      code: promo.code,
      label: promo.label,
      discountType: promo.discountType,
      discountValue: promo.discountValue,
    }));
};
