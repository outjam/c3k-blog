import { NextResponse } from "next/server";

import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { forbiddenResponse, getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { listShopOrders } from "@/lib/server/shop-orders-store";
import type { ShopOrderStatus } from "@/types/shop";

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

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!auth.isAdmin) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const status = normalizeStatusFilter(url.searchParams.get("status"));
  const query = (url.searchParams.get("query") ?? "").trim().toLowerCase();

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

  return NextResponse.json({ orders: filtered });
}
