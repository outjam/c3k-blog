import type { ShopOrder } from "@/types/shop";
import { readPersistedString, writePersistedString } from "@/lib/telegram-persist";

const SHOP_ORDERS_KEY = "c3k-shop-orders-v1";

const normalizeOrder = (value: unknown): ShopOrder | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const candidate = value as Partial<ShopOrder>;

  if (!candidate.id || !candidate.createdAt || !candidate.status || !Array.isArray(candidate.items)) {
    return null;
  }

  return {
    id: String(candidate.id),
    createdAt: String(candidate.createdAt),
    status: candidate.status,
    totalStars: Math.max(0, Number(candidate.totalStars ?? 0)),
    deliveryFeeStars: Math.max(0, Number(candidate.deliveryFeeStars ?? 0)),
    discountStars: Math.max(0, Number(candidate.discountStars ?? 0)),
    delivery: candidate.delivery === "cdek" ? "cdek" : "yandex_go",
    address: String(candidate.address ?? ""),
    customerName: String(candidate.customerName ?? ""),
    phone: String(candidate.phone ?? ""),
    comment: String(candidate.comment ?? ""),
    items: candidate.items
      .map((item) => {
        const row = item as Partial<ShopOrder["items"][number]>;
        if (!row?.productId || !row?.title) {
          return null;
        }

        return {
          productId: String(row.productId),
          title: String(row.title),
          quantity: Math.max(1, Math.round(Number(row.quantity ?? 1))),
          priceStars: Math.max(1, Math.round(Number(row.priceStars ?? 1))),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item)),
  };
};

export const readShopOrders = async (): Promise<ShopOrder[]> => {
  const raw = await readPersistedString(SHOP_ORDERS_KEY);

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => normalizeOrder(item))
      .filter((item): item is ShopOrder => Boolean(item))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    return [];
  }
};

export const saveShopOrders = async (orders: ShopOrder[]): Promise<void> => {
  await writePersistedString(SHOP_ORDERS_KEY, JSON.stringify(orders));
};

export const appendShopOrder = async (order: ShopOrder): Promise<void> => {
  const current = await readShopOrders();
  await saveShopOrders([order, ...current]);
};
