import { NextResponse } from "next/server";

import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { listShopOrders } from "@/lib/server/shop-orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CustomerAggregate {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  ordersCount: number;
  totalSpentStarsCents: number;
  lastOrderAt: string;
}

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "customers:view")) {
    return forbiddenResponse();
  }

  const orders = await listShopOrders();
  const map = new Map<number, CustomerAggregate>();

  for (const order of orders) {
    const existing = map.get(order.telegramUserId);

    if (!existing) {
      map.set(order.telegramUserId, {
        telegramUserId: order.telegramUserId,
        username: order.telegramUsername,
        firstName: order.telegramFirstName,
        lastName: order.telegramLastName,
        phone: order.phone || undefined,
        email: order.email || undefined,
        ordersCount: 1,
        totalSpentStarsCents: order.totalStarsCents,
        lastOrderAt: order.createdAt,
      });
      continue;
    }

    existing.ordersCount += 1;
    existing.totalSpentStarsCents += order.totalStarsCents;
    existing.lastOrderAt = new Date(existing.lastOrderAt).getTime() < new Date(order.createdAt).getTime() ? order.createdAt : existing.lastOrderAt;
    if (!existing.phone && order.phone) {
      existing.phone = order.phone;
    }
    if (!existing.email && order.email) {
      existing.email = order.email;
    }
    if (!existing.username && order.telegramUsername) {
      existing.username = order.telegramUsername;
    }
  }

  const customers = Array.from(map.values()).sort((a, b) => b.totalSpentStarsCents - a.totalSpentStarsCents);
  return NextResponse.json({ customers });
}
