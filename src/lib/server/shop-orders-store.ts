import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import { executeUpstashPipeline } from "@/lib/server/upstash-store";
import type { ShopOrder } from "@/types/shop";

const ORDER_STORAGE_KEY = "c3k:shop:orders:v2";
const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1";
const POSTGRES_MUTATION_RETRIES = 4;

type GlobalWithStore = typeof globalThis & { __c3kShopOrdersMemory__?: ShopOrder[] };

interface PostgresOrderSnapshotRow {
  order_snapshot?: ShopOrder;
  row_version?: number;
  updated_at?: string;
}

interface PostgresMutationResultRow {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

const getMemoryStore = (): ShopOrder[] => {
  const root = globalThis as GlobalWithStore;

  if (!root.__c3kShopOrdersMemory__) {
    root.__c3kShopOrdersMemory__ = [];
  }

  return root.__c3kShopOrdersMemory__;
};

const sortOrders = (orders: ShopOrder[]): ShopOrder[] => {
  return [...orders].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
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

const readOrdersLegacy = async (): Promise<ShopOrder[]> => {
  const fromRedis = await readOrdersFromRedis();

  if (fromRedis) {
    return sortOrders(fromRedis);
  }

  return sortOrders(getMemoryStore());
};

const writeOrdersLegacy = async (orders: ShopOrder[]): Promise<void> => {
  const normalized = sortOrders(orders);
  const saved = await writeOrdersToRedis(normalized);

  if (!saved) {
    const memory = getMemoryStore();
    memory.splice(0, memory.length, ...normalized);
  }
};

const normalizeOrderId = (value: string): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
};

const normalizeOrder = (value: unknown): ShopOrder | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as ShopOrder;
};

const listOrdersFromPostgres = async (telegramUserId?: number): Promise<{ ok: true; orders: ShopOrder[] } | { ok: false }> => {
  const rows = await postgresRpc<PostgresOrderSnapshotRow[]>("c3k_list_order_snapshots", {
    p_telegram_user_id: typeof telegramUserId === "number" ? telegramUserId : null,
  });

  if (!rows) {
    return { ok: false };
  }

  const orders = rows
    .map((row) => normalizeOrder(row.order_snapshot))
    .filter((row): row is ShopOrder => Boolean(row));

  return { ok: true, orders: sortOrders(orders) };
};

const getOrderFromPostgres = async (orderId: string): Promise<{ ok: true; order: ShopOrder | null; rowVersion: number | null } | { ok: false }> => {
  const rows = await postgresRpc<PostgresOrderSnapshotRow[]>("c3k_get_order_snapshot", {
    p_order_code: normalizeOrderId(orderId),
  });

  if (!rows) {
    return { ok: false };
  }

  const first = rows[0];

  if (!first) {
    return { ok: true, order: null, rowVersion: null };
  }

  const order = normalizeOrder(first.order_snapshot);

  if (!order) {
    return { ok: true, order: null, rowVersion: null };
  }

  return {
    ok: true,
    order,
    rowVersion: typeof first.row_version === "number" ? first.row_version : 1,
  };
};

const upsertOrderInPostgres = async (
  order: ShopOrder,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresMutationResultRow[]>("c3k_upsert_order_snapshot", {
    p_order: order,
    p_expected_row_version: expectedRowVersion,
  });

  if (!rows || !rows[0]) {
    return { ok: false, conflict: false };
  }

  const first = rows[0];
  const ok = Boolean(first.ok);
  const error = String(first.error ?? "");

  if (ok) {
    return { ok: true };
  }

  return { ok: false, conflict: error === "version_conflict" };
};

const shouldUsePostgres = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const handlePostgresFailure = (message: string): never => {
  throw new Error(message);
};

export const listShopOrders = async (): Promise<ShopOrder[]> => {
  if (shouldUsePostgres()) {
    const postgres = await listOrdersFromPostgres();

    if (postgres.ok) {
      return postgres.orders;
    }

    if (POSTGRES_STRICT) {
      handlePostgresFailure("Failed to list orders from Postgres");
    }
  }

  return readOrdersLegacy();
};

export const listShopOrdersByTelegramUser = async (telegramUserId: number): Promise<ShopOrder[]> => {
  if (shouldUsePostgres()) {
    const postgres = await listOrdersFromPostgres(telegramUserId);

    if (postgres.ok) {
      return postgres.orders;
    }

    if (POSTGRES_STRICT) {
      handlePostgresFailure("Failed to list user orders from Postgres");
    }
  }

  const orders = await readOrdersLegacy();
  return orders.filter((order) => order.telegramUserId === telegramUserId);
};

export const getShopOrderById = async (orderId: string): Promise<ShopOrder | null> => {
  if (shouldUsePostgres()) {
    const postgres = await getOrderFromPostgres(orderId);

    if (postgres.ok) {
      return postgres.order;
    }

    if (POSTGRES_STRICT) {
      handlePostgresFailure(`Failed to get order ${orderId} from Postgres`);
    }
  }

  const orders = await readOrdersLegacy();
  return orders.find((order) => order.id === orderId) ?? null;
};

export const upsertShopOrder = async (order: ShopOrder): Promise<ShopOrder> => {
  if (shouldUsePostgres()) {
    const result = await upsertOrderInPostgres(order, null);

    if (result.ok) {
      return order;
    }

    if (POSTGRES_STRICT) {
      handlePostgresFailure(`Failed to upsert order ${order.id} in Postgres`);
    }
  }

  const orders = await readOrdersLegacy();
  const index = orders.findIndex((item) => item.id === order.id);

  if (index >= 0) {
    orders[index] = order;
  } else {
    orders.unshift(order);
  }

  await writeOrdersLegacy(orders);
  return order;
};

export const mutateShopOrder = async (
  orderId: string,
  mutate: (order: ShopOrder) => ShopOrder,
): Promise<ShopOrder | null> => {
  if (shouldUsePostgres()) {
    for (let attempt = 0; attempt < POSTGRES_MUTATION_RETRIES; attempt += 1) {
      const current = await getOrderFromPostgres(orderId);

      if (!current.ok) {
        break;
      }

      if (!current.order) {
        return null;
      }

      const next = mutate(current.order);
      const saved = await upsertOrderInPostgres(next, current.rowVersion);

      if (saved.ok) {
        return next;
      }

      if (!saved.conflict) {
        break;
      }
    }

    if (POSTGRES_STRICT) {
      handlePostgresFailure(`Failed to mutate order ${orderId} in Postgres`);
    }
  }

  const orders = await readOrdersLegacy();
  const index = orders.findIndex((item) => item.id === orderId);

  if (index < 0) {
    return null;
  }

  const next = mutate(orders[index] as ShopOrder);
  orders[index] = next;
  await writeOrdersLegacy(orders);

  return next;
};

