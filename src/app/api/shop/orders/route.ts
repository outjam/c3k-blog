import { NextResponse } from "next/server";

import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { notifyAdminsAboutNewOrder } from "@/lib/server/shop-order-notify";
import { mutateShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { getShopOrderById, listShopOrdersByTelegramUser, upsertShopOrder } from "@/lib/server/shop-orders-store";
import type { DeliveryMethod, ShopOrder, ShopOrderItem, ShopOrderStatus } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateOrderBody {
  id?: string;
  status?: ShopOrderStatus;
  invoiceStars?: number;
  totalStarsCents?: number;
  deliveryFeeStarsCents?: number;
  discountStarsCents?: number;
  delivery?: DeliveryMethod;
  address?: string;
  customerName?: string;
  phone?: string;
  email?: string;
  comment?: string;
  promoCode?: string;
  items?: Array<{
    productId?: string;
    title?: string;
    quantity?: number;
    priceStarsCents?: number;
  }>;
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

const sanitizeOrderId = (value: string | undefined): string | null => {
  const normalized = String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  if (/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(normalized)) {
    return normalized;
  }

  return null;
};

const sanitizeItems = (value: CreateOrderBody["items"]): ShopOrderItem[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const productId = String(item?.productId ?? "").trim().toLowerCase();
      const title = String(item?.title ?? "").trim();
      const quantity = Math.max(1, Math.min(99, Math.round(Number(item?.quantity ?? 1))));
      const priceStarsCents = Math.max(1, Math.round(Number(item?.priceStarsCents ?? 1)));

      if (!productId || !title) {
        return null;
      }

      return {
        productId,
        title: title.slice(0, 140),
        quantity,
        priceStarsCents,
      };
    })
    .filter((item): item is ShopOrderItem => Boolean(item));
};

const normalizeStatus = (status: ShopOrderStatus | undefined): ShopOrderStatus => {
  if (!status) {
    return "paid";
  }

  return status in SHOP_ORDER_STATUS_LABELS ? status : "paid";
};

const clampMoney = (value: unknown): number => {
  return Math.max(0, Math.round(Number(value ?? 0)));
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const orders = await listShopOrdersByTelegramUser(auth.telegramUserId);
  return NextResponse.json({ orders });
}

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: CreateOrderBody;

  try {
    payload = (await request.json()) as CreateOrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const orderId = sanitizeOrderId(payload.id);

  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  const existing = await getShopOrderById(orderId);

  if (existing && existing.telegramUserId !== auth.telegramUserId) {
    return NextResponse.json({ error: "Order id already exists" }, { status: 409 });
  }

  if (existing) {
    return NextResponse.json({ order: existing, created: false });
  }

  const now = new Date().toISOString();
  const items = sanitizeItems(payload.items);
  const subtotalFromItems = items.reduce((acc, item) => acc + item.priceStarsCents * item.quantity, 0);
  const discountStarsCents = clampMoney(payload.discountStarsCents);
  const deliveryFeeStarsCents = clampMoney(payload.deliveryFeeStarsCents);
  const totalStarsCents = Math.max(clampMoney(payload.totalStarsCents), subtotalFromItems - discountStarsCents + deliveryFeeStarsCents);
  const invoiceStars = Math.max(1, Math.round(Number(payload.invoiceStars ?? Math.ceil(totalStarsCents / 100))));

  const order: ShopOrder = {
    id: orderId,
    createdAt: now,
    updatedAt: now,
    status: normalizeStatus(payload.status),
    invoiceStars,
    totalStarsCents,
    deliveryFeeStarsCents,
    discountStarsCents,
    delivery: payload.delivery === "cdek" ? "cdek" : "yandex_go",
    address: String(payload.address ?? "").trim().slice(0, 255),
    customerName: String(payload.customerName ?? "").trim().slice(0, 120),
    phone: String(payload.phone ?? "").trim().slice(0, 80),
    email: String(payload.email ?? "").trim().slice(0, 120) || undefined,
    comment: String(payload.comment ?? "").trim().slice(0, 1000),
    telegramUserId: auth.telegramUserId,
    telegramUsername: auth.username || undefined,
    telegramFirstName: auth.firstName || undefined,
    telegramLastName: auth.lastName || undefined,
    items,
    history: [
      {
        id: `${Date.now()}-created`,
        at: now,
        fromStatus: null,
        toStatus: normalizeStatus(payload.status),
        actor: "user",
        actorTelegramId: auth.telegramUserId,
        note: "Заказ создан после успешной оплаты",
      },
    ],
  };

  await upsertShopOrder(order);
  const usedPromoCode = String(payload.promoCode ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 24);

  if (usedPromoCode) {
    await mutateShopAdminConfig((current) => {
      const nowUpdated = new Date().toISOString();
      const promoCodes = current.promoCodes.map((promo) =>
        promo.code === usedPromoCode ? { ...promo, usedCount: promo.usedCount + 1, updatedAt: nowUpdated } : promo,
      );

      return {
        ...current,
        promoCodes,
        updatedAt: nowUpdated,
      };
    });
  }

  await notifyAdminsAboutNewOrder(order, getBaseUrl(request));

  return NextResponse.json({ order, created: true });
}
