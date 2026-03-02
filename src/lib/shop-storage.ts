import { getTelegramWebApp } from "@/lib/telegram";
import type { CartState } from "@/types/shop";

export const SHOP_CART_STORAGE_KEY = "c3k-shop-cart-v1";

const parseVersion = (value: string | undefined): number[] => {
  if (!value) {
    return [0];
  }

  return value
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isNaN(part) ? 0 : part));
};

const isVersionGte = (value: string | undefined, target: string): boolean => {
  const left = parseVersion(value);
  const right = parseVersion(target);
  const max = Math.max(left.length, right.length);

  for (let index = 0; index < max; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;

    if (l > r) {
      return true;
    }

    if (l < r) {
      return false;
    }
  }

  return true;
};

const canUseCloudStorage = (): boolean => {
  const webApp = getTelegramWebApp();
  return Boolean(webApp?.CloudStorage) && isVersionGte(webApp?.version, "6.9");
};

const normalizeState = (value: unknown): CartState => {
  if (!value || typeof value !== "object") {
    return { items: [], promoCode: "" };
  }

  const candidate = value as Partial<CartState>;
  const items = Array.isArray(candidate.items)
    ? candidate.items
        .map((item) => {
          const productId = typeof item?.productId === "string" ? item.productId : "";
          const quantity = typeof item?.quantity === "number" ? Math.max(1, Math.round(item.quantity)) : 1;

          if (!productId) {
            return null;
          }

          return { productId, quantity };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item))
    : [];

  const promoCode = typeof candidate.promoCode === "string" ? candidate.promoCode : "";

  return { items, promoCode };
};

export const readShopCart = async (): Promise<CartState> => {
  const webApp = getTelegramWebApp();

  if (canUseCloudStorage()) {
    return new Promise((resolve) => {
      try {
        webApp?.CloudStorage?.getItem(SHOP_CART_STORAGE_KEY, (_error, value) => {
          if (!value) {
            resolve({ items: [], promoCode: "" });
            return;
          }

          try {
            resolve(normalizeState(JSON.parse(value)));
          } catch {
            resolve({ items: [], promoCode: "" });
          }
        });
      } catch {
        resolve({ items: [], promoCode: "" });
      }
    });
  }

  const raw = window.localStorage.getItem(SHOP_CART_STORAGE_KEY);

  if (!raw) {
    return { items: [], promoCode: "" };
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return { items: [], promoCode: "" };
  }
};

export const writeShopCart = async (state: CartState): Promise<void> => {
  const payload = JSON.stringify(state);
  const webApp = getTelegramWebApp();

  if (canUseCloudStorage()) {
    await new Promise<void>((resolve) => {
      try {
        webApp?.CloudStorage?.setItem(SHOP_CART_STORAGE_KEY, payload, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  window.localStorage.setItem(SHOP_CART_STORAGE_KEY, payload);
};
