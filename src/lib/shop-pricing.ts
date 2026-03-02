import type { CartItem, ShopProduct } from "@/types/shop";

export interface PromoRule {
  code: string;
  label: string;
  discountPercent: number;
}

export const PROMO_RULES: PromoRule[] = [
  { code: "CLAY10", label: "Скидка 10%", discountPercent: 10 },
  { code: "C3K15", label: "Скидка 15%", discountPercent: 15 },
  { code: "STARS5", label: "Скидка 5%", discountPercent: 5 },
];

export const findPromoRule = (value: string): PromoRule | null => {
  const normalized = value.trim().toUpperCase();
  return PROMO_RULES.find((rule) => rule.code === normalized) ?? null;
};

const toMap = (products: ShopProduct[]): Map<string, ShopProduct> => {
  return new Map(products.map((product) => [product.id, product]));
};

export const getCartSubtotalStars = (products: ShopProduct[], items: CartItem[]): number => {
  const map = toMap(products);
  return items.reduce((acc, item) => {
    const product = map.get(item.productId);
    return product ? acc + product.priceStars * item.quantity : acc;
  }, 0);
};

export const getDiscountAmountStars = (subtotalStars: number, promoCode: string): number => {
  const promo = findPromoRule(promoCode);

  if (!promo) {
    return 0;
  }

  return Math.round((subtotalStars * promo.discountPercent) / 100);
};

export const getDeliveryFeeStars = (subtotalAfterDiscountStars: number): number => {
  return subtotalAfterDiscountStars >= 12 ? 0 : 1;
};
