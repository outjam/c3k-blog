import { SHOP_PRODUCTS } from "@/data/shop-products";
import {
  DEFAULT_DELIVERY_FEE_STARS_CENTS,
  DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS,
  PROMO_RULES,
  type PromoRule,
} from "@/lib/shop-pricing";
import { isShopAdminRole } from "@/lib/shop-admin-roles";
import { DEFAULT_ADMIN_TELEGRAM_ID, getShopAdminTelegramIds } from "@/lib/shop-admin";
import type { ShopAdminConfig, ShopAdminMember, ShopAppSettings, ShopPromoCode } from "@/types/shop";

const ADMIN_CONFIG_KEY = "c3k:shop:admin-config:v1";

type GlobalWithConfig = typeof globalThis & { __c3kShopAdminConfigMemory__?: ShopAdminConfig };

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
    productOverrides: {},
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
  const validProductIds = new Set(SHOP_PRODUCTS.map((item) => item.id));
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

  const productOverrides = Object.fromEntries(
    Object.entries(row.productOverrides ?? {})
      .map(([productId, value]) => {
        const normalizedId = String(productId).trim().toLowerCase();

        if (!validProductIds.has(normalizedId)) {
          return null;
        }

        const source = value as Partial<ShopAdminConfig["productOverrides"][string]>;

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
    productOverrides,
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
