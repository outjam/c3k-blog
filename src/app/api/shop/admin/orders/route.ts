import { NextResponse } from "next/server";

import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { listShopOrders } from "@/lib/server/shop-orders-store";
import type { ShopOrder, ShopOrderStatus } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeStatusFilter = (value: string | null): ShopOrderStatus | "all" => {
  if (!value || value === "all") {
    return "all";
  }

  if (value in SHOP_ORDER_STATUS_LABELS) {
    return value as ShopOrderStatus;
  }

  return "all";
};

type OrdersSort = "updated_desc" | "updated_asc" | "created_desc" | "created_asc" | "total_desc" | "total_asc";

const normalizeSort = (value: string | null): OrdersSort => {
  if (
    value === "updated_desc" ||
    value === "updated_asc" ||
    value === "created_desc" ||
    value === "created_asc" ||
    value === "total_desc" ||
    value === "total_asc"
  ) {
    return value;
  }

  return "updated_desc";
};

const normalizeLimit = (value: string | null): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 30;
  }

  return Math.max(1, Math.min(100, Math.round(parsed)));
};

interface OrdersCursorPayload {
  id: string;
}

const decodeCursor = (raw: string | null): OrdersCursorPayload | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<OrdersCursorPayload>;
    const id = String(parsed.id ?? "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9-]/g, "")
      .slice(0, 32);

    if (!id) {
      return null;
    }

    return { id };
  } catch {
    return null;
  }
};

const encodeCursor = (order: ShopOrder): string => {
  const payload: OrdersCursorPayload = { id: order.id };
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
};

const toTime = (value: string): number => {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const compareOrders = (left: ShopOrder, right: ShopOrder, sort: OrdersSort): number => {
  if (sort === "updated_desc") {
    const result = toTime(right.updatedAt || right.createdAt) - toTime(left.updatedAt || left.createdAt);
    return result || right.id.localeCompare(left.id);
  }

  if (sort === "updated_asc") {
    const result = toTime(left.updatedAt || left.createdAt) - toTime(right.updatedAt || right.createdAt);
    return result || left.id.localeCompare(right.id);
  }

  if (sort === "created_desc") {
    const result = toTime(right.createdAt) - toTime(left.createdAt);
    return result || right.id.localeCompare(left.id);
  }

  if (sort === "created_asc") {
    const result = toTime(left.createdAt) - toTime(right.createdAt);
    return result || left.id.localeCompare(right.id);
  }

  if (sort === "total_desc") {
    const result = right.totalStarsCents - left.totalStarsCents;
    return result || right.id.localeCompare(left.id);
  }

  const result = left.totalStarsCents - right.totalStarsCents;
  return result || left.id.localeCompare(right.id);
};

const buildStatusCounters = (orders: ShopOrder[]): Record<string, number> => {
  const counters: Record<string, number> = {};

  for (const order of orders) {
    counters[order.status] = (counters[order.status] ?? 0) + 1;
  }

  return counters;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "orders:view")) {
    return forbiddenResponse();
  }

  const rate = await checkRateLimit({
    scope: "admin_orders_list",
    identifier: auth.telegramUserId,
    limit: 240,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const url = new URL(request.url);
  const status = normalizeStatusFilter(url.searchParams.get("status"));
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();
  const sort = normalizeSort(url.searchParams.get("sort"));
  const limit = normalizeLimit(url.searchParams.get("limit"));
  const cursor = decodeCursor(url.searchParams.get("cursor"));

  const orders = await listShopOrders();

  const filtered = orders.filter((order) => {
    if (status !== "all" && order.status !== status) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack =
      `${order.id} ${order.customerName} ${order.phone} ${order.address} ${order.telegramUsername ?? ""} ${order.telegramUserId}`.toLowerCase();
    return haystack.includes(query);
  });

  const sorted = [...filtered].sort((left, right) => compareOrders(left, right, sort));

  let startIndex = 0;

  if (cursor) {
    const found = sorted.findIndex((order) => order.id === cursor.id);
    if (found >= 0) {
      startIndex = found + 1;
    }
  }

  const page = sorted.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sorted.length;
  const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1] as ShopOrder) : null;

  return NextResponse.json({
    orders: page,
    pageInfo: {
      limit,
      hasMore,
      nextCursor,
      sort,
    },
    totalFiltered: filtered.length,
    statusCounters: buildStatusCounters(filtered),
  });
}
