import type { ShopOrder } from "@/types/shop";
import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { readPersistedString, writePersistedString } from "@/lib/telegram-persist";

const SHOP_ORDERS_KEY = "c3k-shop-orders-v1";

const normalizeStatus = (value: unknown): ShopOrder["status"] => {
  const raw = String(value ?? "");

  if (raw === "delivering") {
    return "in_transit";
  }

  if (raw in SHOP_ORDER_STATUS_LABELS) {
    return raw as ShopOrder["status"];
  }

  return "processing";
};

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
    updatedAt: String(candidate.updatedAt ?? candidate.createdAt),
    status: normalizeStatus(candidate.status),
    invoiceStars: Math.max(1, Math.round(Number(candidate.invoiceStars ?? (candidate as { invoiceAmount?: number }).invoiceAmount ?? 1))),
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
    email: String(candidate.email ?? "") || undefined,
    comment: String(candidate.comment ?? ""),
    telegramUserId: Math.max(0, Math.round(Number(candidate.telegramUserId ?? 0))),
    telegramUsername: String(candidate.telegramUsername ?? "") || undefined,
    telegramFirstName: String(candidate.telegramFirstName ?? "") || undefined,
    telegramLastName: String(candidate.telegramLastName ?? "") || undefined,
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
    history: Array.isArray(candidate.history)
      ? candidate.history
          .map((entry) => {
            if (!entry || typeof entry !== "object") {
              return null;
            }

            const row = entry as Partial<ShopOrder["history"][number]>;
            if (!row.toStatus || !row.at) {
              return null;
            }

            return {
              id: String(row.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
              at: String(row.at),
              fromStatus: row.fromStatus ? normalizeStatus(row.fromStatus) : null,
              toStatus: normalizeStatus(row.toStatus),
              actor: row.actor ?? "system",
              actorTelegramId:
                typeof row.actorTelegramId === "number" && Number.isFinite(row.actorTelegramId) ? row.actorTelegramId : undefined,
              note: typeof row.note === "string" ? row.note : undefined,
            };
          })
          .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
      : [],
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
