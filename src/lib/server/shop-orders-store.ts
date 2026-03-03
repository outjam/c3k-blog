import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import type { ShopOrder } from "@/types/shop";

const POSTGRES_MUTATION_RETRIES = 4;

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

const sortOrders = (orders: ShopOrder[]): ShopOrder[] => {
  return [...orders].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
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

const ensurePostgresConfigured = (): void => {
  if (!getPostgresHttpConfig()) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY");
  }
};

export const listShopOrders = async (): Promise<ShopOrder[]> => {
  ensurePostgresConfigured();
  const postgres = await listOrdersFromPostgres();

  if (!postgres.ok) {
    throw new Error("Failed to list orders from Postgres");
  }

  return postgres.orders;
};

export const listShopOrdersByTelegramUser = async (telegramUserId: number): Promise<ShopOrder[]> => {
  ensurePostgresConfigured();
  const postgres = await listOrdersFromPostgres(telegramUserId);

  if (!postgres.ok) {
    throw new Error("Failed to list user orders from Postgres");
  }

  return postgres.orders;
};

export const getShopOrderById = async (orderId: string): Promise<ShopOrder | null> => {
  ensurePostgresConfigured();
  const postgres = await getOrderFromPostgres(orderId);

  if (!postgres.ok) {
    throw new Error(`Failed to get order ${orderId} from Postgres`);
  }

  return postgres.order;
};

export const upsertShopOrder = async (order: ShopOrder): Promise<ShopOrder> => {
  ensurePostgresConfigured();
  const result = await upsertOrderInPostgres(order, null);

  if (!result.ok) {
    throw new Error(`Failed to upsert order ${order.id} in Postgres`);
  }

  return order;
};

export const mutateShopOrder = async (
  orderId: string,
  mutate: (order: ShopOrder) => ShopOrder,
): Promise<ShopOrder | null> => {
  ensurePostgresConfigured();

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

  throw new Error(`Failed to mutate order ${orderId} in Postgres`);
};
