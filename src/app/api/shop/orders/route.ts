import { NextResponse } from "next/server";

import {
  extractIdempotencyKey,
  hashIdempotencyPayload,
  readIdempotencyRecord,
  saveIdempotencyRecord,
} from "@/lib/server/idempotency-store";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { getShopOrderById, listShopOrdersByTelegramUser, upsertShopOrder } from "@/lib/server/shop-orders-store";
import type { DeliveryMethod, ShopOrder, ShopOrderItem } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreateOrderBody {
  id?: string;
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

const clampMoney = (value: unknown): number => {
  return Math.max(0, Math.round(Number(value ?? 0)));
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "shop_orders_list",
    identifier: auth.telegramUserId,
    limit: 120,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
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

  const rate = await checkRateLimit({
    scope: "shop_order_create",
    identifier: auth.telegramUserId,
    limit: 24,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: CreateOrderBody;

  try {
    payload = (await request.json()) as CreateOrderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const idempotencyKey = extractIdempotencyKey(request);
  const requestHash = hashIdempotencyPayload(payload);

  if (idempotencyKey) {
    const replay = await readIdempotencyRecord({
      scope: "shop_order_create",
      actor: auth.telegramUserId,
      key: idempotencyKey,
      requestHash,
    });

    if (replay.kind === "mismatch") {
      return NextResponse.json({ error: "Idempotency-Key payload mismatch" }, { status: 409 });
    }

    if (replay.kind === "hit") {
      return NextResponse.json(replay.body as object, {
        status: replay.statusCode,
        headers: { "x-idempotent-replay": "1" },
      });
    }
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
  const promoCode = String(payload.promoCode ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 24);

  const order: ShopOrder = {
    id: orderId,
    createdAt: now,
    updatedAt: now,
    status: "created",
    invoiceStars,
    totalStarsCents,
    deliveryFeeStarsCents,
    discountStarsCents,
    delivery: payload.delivery === "cdek" ? "cdek" : "yandex_go",
    promoCode: promoCode || undefined,
    address: String(payload.address ?? "").trim().slice(0, 255),
    customerName: String(payload.customerName ?? "").trim().slice(0, 120),
    phone: String(payload.phone ?? "").trim().slice(0, 80),
    email: String(payload.email ?? "").trim().slice(0, 120) || undefined,
    comment: String(payload.comment ?? "").trim().slice(0, 1000),
    telegramUserId: auth.telegramUserId,
    telegramUsername: auth.username || undefined,
    telegramFirstName: auth.firstName || undefined,
    telegramLastName: auth.lastName || undefined,
    payment: {
      currency: "XTR",
      amount: invoiceStars,
      invoicePayloadHash: "",
      status: "created",
      updatedAt: now,
    },
    items,
    history: [
      {
        id: `${Date.now()}-created`,
        at: now,
        fromStatus: null,
        toStatus: "created",
        actor: "user",
        actorTelegramId: auth.telegramUserId,
        note: "Заказ создан до оплаты",
      },
    ],
  };

  await upsertShopOrder(order);

  const responseBody = { order, created: true };

  if (idempotencyKey) {
    await saveIdempotencyRecord({
      scope: "shop_order_create",
      actor: auth.telegramUserId,
      key: idempotencyKey,
      requestHash,
      statusCode: 200,
      body: responseBody,
      ttlSec: 60 * 60 * 6,
    });
  }

  return NextResponse.json(responseBody);
}
