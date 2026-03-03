import { NextResponse } from "next/server";

import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { forbiddenResponse, getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { listShopOrders } from "@/lib/server/shop-orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!auth.isAdmin) {
    return forbiddenResponse();
  }

  const [orders, config] = await Promise.all([listShopOrders(), readShopAdminConfig()]);
  const uniqueCustomers = new Set(orders.map((order) => order.telegramUserId));
  const revenueStarsCents = orders.reduce((acc, order) => acc + order.totalStarsCents, 0);

  const statusCounters = Object.fromEntries(
    Object.keys(SHOP_ORDER_STATUS_LABELS).map((status) => [
      status,
      orders.filter((order) => order.status === status).length,
    ]),
  );

  return NextResponse.json({
    metrics: {
      totalOrders: orders.length,
      uniqueCustomers: uniqueCustomers.size,
      revenueStarsCents,
      activePromoCodes: config.promoCodes.filter((promo) => promo.active).length,
      productOverrides: Object.keys(config.productOverrides).length,
      updatedAt: config.updatedAt,
    },
    statusCounters,
  });
}
