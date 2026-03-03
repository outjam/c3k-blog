import type { ShopOrder } from "@/types/shop";

const ORDER_STORAGE_KEY = "c3k:shop:orders:v2";

type GlobalWithStore = typeof globalThis & { __c3kShopOrdersMemory__?: ShopOrder[] };

const getMemoryStore = (): ShopOrder[] => {
  const root = globalThis as GlobalWithStore;

  if (!root.__c3kShopOrdersMemory__) {
    root.__c3kShopOrdersMemory__ = [];
  }

  return root.__c3kShopOrdersMemory__;
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

const parseOrders = (raw: unknown): ShopOrder[] => {
  if (typeof raw !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ShopOrder[]) : [];
  } catch {
    return [];
  }
};

const readOrdersFromRedis = async (): Promise<ShopOrder[] | null> => {
  const result = await executeUpstashPipeline([["GET", ORDER_STORAGE_KEY]]);

  if (!result) {
    return null;
  }

  const first = result[0];

  if (!first || first.error) {
    return null;
  }

  return parseOrders(first.result);
};

const writeOrdersToRedis = async (orders: ShopOrder[]): Promise<boolean> => {
  const result = await executeUpstashPipeline([["SET", ORDER_STORAGE_KEY, JSON.stringify(orders)]]);

  if (!result) {
    return false;
  }

  const first = result[0];
  return Boolean(first && !first.error);
};

const sortOrders = (orders: ShopOrder[]): ShopOrder[] => {
  return [...orders].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
};

const readOrders = async (): Promise<ShopOrder[]> => {
  const fromRedis = await readOrdersFromRedis();

  if (fromRedis) {
    return sortOrders(fromRedis);
  }

  return sortOrders(getMemoryStore());
};

const writeOrders = async (orders: ShopOrder[]): Promise<void> => {
  const normalized = sortOrders(orders);
  const saved = await writeOrdersToRedis(normalized);

  if (!saved) {
    const memory = getMemoryStore();
    memory.splice(0, memory.length, ...normalized);
  }
};

export const listShopOrders = async (): Promise<ShopOrder[]> => {
  return readOrders();
};

export const listShopOrdersByTelegramUser = async (telegramUserId: number): Promise<ShopOrder[]> => {
  const orders = await readOrders();
  return orders.filter((order) => order.telegramUserId === telegramUserId);
};

export const getShopOrderById = async (orderId: string): Promise<ShopOrder | null> => {
  const orders = await readOrders();
  return orders.find((order) => order.id === orderId) ?? null;
};

export const upsertShopOrder = async (order: ShopOrder): Promise<ShopOrder> => {
  const orders = await readOrders();
  const index = orders.findIndex((item) => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  await writeOrders(orders);
  return order;
};

export const mutateShopOrder = async (
  orderId: string,
  mutate: (order: ShopOrder) => ShopOrder,
): Promise<ShopOrder | null> => {
  const orders = await readOrders();
  const index = orders.findIndex((item) => item.id === orderId);

  if (index < 0) {
    return null;
  }

  const next = mutate(orders[index] as ShopOrder);
  orders[index] = next;
  await writeOrders(orders);

  return next;
};
