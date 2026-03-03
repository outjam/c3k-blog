import { NextResponse } from "next/server";

import { forbiddenResponse, getShopApiAuth, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { getShopOrderById } from "@/lib/server/shop-orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sanitizeOrderId = (value: string): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
};

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = getShopApiAuth(_request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const params = await context.params;
  const orderId = sanitizeOrderId(params.id);

  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const order = await getShopOrderById(orderId);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if (!auth.isAdmin && order.telegramUserId !== auth.telegramUserId) {
    return forbiddenResponse();
  }

  return NextResponse.json({ order });
}

