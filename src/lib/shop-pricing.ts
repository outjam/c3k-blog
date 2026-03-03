import type { CartItem, PromoDiscountType, ShopProduct } from "@/types/shop";

export interface PromoRule {
  code: string;
  label: string;
  discountType: PromoDiscountType;
  discountValue: number;
}

export const PROMO_RULES: PromoRule[] = [];

const parseMoneyEnv = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : 0;
};

export const DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS = parseMoneyEnv(
  process.env.NEXT_PUBLIC_DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS,
);
export const DEFAULT_DELIVERY_FEE_STARS_CENTS = parseMoneyEnv(process.env.NEXT_PUBLIC_DEFAULT_DELIVERY_FEE_STARS_CENTS);

export const findPromoRule = (value: string, rules: PromoRule[] = PROMO_RULES): PromoRule | null => {
  const normalized = value.trim().toUpperCase();
  return rules.find((rule) => rule.code === normalized) ?? null;
};

const toMap = (products: ShopProduct[]): Map<string, ShopProduct> => {
  return new Map(products.map((product) => [product.id, product]));
};

export const getCartSubtotalStarsCents = (products: ShopProduct[], items: CartItem[]): number => {
  const map = toMap(products);
  return items.reduce((acc, item) => {
    const product = map.get(item.productId);
    return product ? acc + product.priceStarsCents * item.quantity : acc;
  }, 0);
};

export const getDiscountAmountStarsCents = (
  subtotalStarsCents: number,
  promoCode: string,
  rules: PromoRule[] = PROMO_RULES,
): number => {
  const promo = findPromoRule(promoCode, rules);

  if (!promo) {
    return 0;
  }

  if (promo.discountType === "fixed") {
    return Math.min(subtotalStarsCents, Math.max(0, Math.round(promo.discountValue)));
  }

  return Math.min(subtotalStarsCents, Math.round((subtotalStarsCents * promo.discountValue) / 100));
};

export const getDeliveryFeeStarsCents = (
  subtotalAfterDiscountStarsCents: number,
  options?: { freeDeliveryThresholdStarsCents?: number; defaultDeliveryFeeStarsCents?: number },
): number => {
  const threshold = Math.max(0, Math.round(options?.freeDeliveryThresholdStarsCents ?? DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS));
  const deliveryFee = Math.max(0, Math.round(options?.defaultDeliveryFeeStarsCents ?? DEFAULT_DELIVERY_FEE_STARS_CENTS));

  return subtotalAfterDiscountStarsCents >= threshold ? 0 : deliveryFee;
};
