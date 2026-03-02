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
    totalStarsCents: Math.max(0, Number(candidate.totalStarsCents ?? (candidate as { totalStars?: number }).totalStars ?? 0)),
    deliveryFeeStarsCents: Math.max(
      0,
      Number(candidate.deliveryFeeStarsCents ?? (candidate as { deliveryFeeStars?: number }).deliveryFeeStars ?? 0),
    ),
    discountStarsCents: Math.max(
      0,
      Number(candidate.discountStarsCents ?? (candidate as { discountStars?: number }).discountStars ?? 0),
    ),
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
          priceStarsCents: Math.max(
            1,
            Math.round(Number(row.priceStarsCents ?? (row as { priceStars?: number }).priceStars ?? 1)),
          ),
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
