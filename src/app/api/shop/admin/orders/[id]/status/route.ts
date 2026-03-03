import { NextResponse } from "next/server";

import { canTransitionShopOrderStatus, SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import {
  notifyAdminsAboutStatusChange,
  notifyUserAboutStatusChange,
} from "@/lib/server/shop-order-notify";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { mutateShopOrder } from "@/lib/server/shop-orders-store";
import type { ShopOrderStatus } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateStatusBody {
  status?: ShopOrderStatus;
  note?: string;
}

const getBaseUrl = (request: Request): string | null => {
  const explicit = process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL;

  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";

  if (!host) {
    return null;
  }

  return `${proto}://${host}`.replace(/\/+$/, "");
};

const normalizeStatus = (value: unknown): ShopOrderStatus | null => {
  const raw = String(value ?? "");

  if (!raw) {
    return null;
  }

  return raw in SHOP_ORDER_STATUS_LABELS ? (raw as ShopOrderStatus) : null;
};

const sanitizeOrderId = (value: string): string => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  return normalized.slice(0, 32);
};

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "orders:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const params = await context.params;
  const orderId = sanitizeOrderId(params.id);

  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  let payload: UpdateStatusBody;

  try {
    payload = (await request.json()) as UpdateStatusBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nextStatus = normalizeStatus(payload.status);

  if (!nextStatus) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const note = String(payload.note ?? "").trim().slice(0, 1000);
  let previousStatus: ShopOrderStatus | null = null;

  const updatedOrder = await mutateShopOrder(orderId, (currentOrder) => {
    if (!canTransitionShopOrderStatus(currentOrder.status, nextStatus)) {
      throw new Error(`Invalid transition: ${currentOrder.status} -> ${nextStatus}`);
    }

    previousStatus = currentOrder.status;

    const now = new Date().toISOString();
    const history = [...currentOrder.history];
    history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: now,
      fromStatus: currentOrder.status,
      toStatus: nextStatus,
      actor: "admin",
      actorTelegramId: auth.telegramUserId,
      note: note || undefined,
    });

    return {
      ...currentOrder,
      status: nextStatus,
      updatedAt: now,
      history,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.startsWith("Invalid transition")) {
      return { __transitionError: message } as const;
    }

    throw error;
  });

  if (!updatedOrder) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  if ("__transitionError" in updatedOrder) {
    return NextResponse.json({ error: updatedOrder.__transitionError }, { status: 409 });
  }

  if (previousStatus && previousStatus !== updatedOrder.status) {
    const baseUrl = getBaseUrl(request);
    await Promise.all([
      notifyUserAboutStatusChange(updatedOrder, previousStatus, baseUrl, note),
      notifyAdminsAboutStatusChange(updatedOrder, previousStatus, auth.telegramUserId, note),
    ]);
  }

  return NextResponse.json({ order: updatedOrder });
}
