import { NextResponse } from "next/server";

import { canTransitionShopOrderStatus } from "@/lib/shop-order-status";
import {
  extractIdempotencyKey,
  hashIdempotencyPayload,
  readIdempotencyRecord,
  saveIdempotencyRecord,
} from "@/lib/server/idempotency-store";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { forbiddenResponse, getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopOrder } from "@/lib/server/shop-orders-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PaymentFailedBody {
  reason?: string;
  providerStatus?: string;
}

const sanitizeOrderId = (value: string): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "")
    .slice(0, 32);
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const rate = await checkRateLimit({
    scope: "shop_order_payment_failed",
    identifier: auth.telegramUserId,
    limit: 30,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const params = await context.params;
  const orderId = sanitizeOrderId(params.id);

  if (!orderId) {
    return NextResponse.json({ error: "Invalid order id" }, { status: 400 });
  }

  let payload: PaymentFailedBody;

  try {
    payload = (await request.json()) as PaymentFailedBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const idempotencyKey = extractIdempotencyKey(request);
  const requestHash = hashIdempotencyPayload(payload);

  if (idempotencyKey) {
    const replay = await readIdempotencyRecord({
      scope: "shop_order_payment_failed",
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

  const reason = String(payload.reason ?? "").trim().slice(0, 300);
  const providerStatus = String(payload.providerStatus ?? "").trim().slice(0, 40);

  const updated = await mutateShopOrder(orderId, (currentOrder) => {
    if (currentOrder.telegramUserId !== auth.telegramUserId) {
      throw new Error("forbidden");
    }

    if (currentOrder.status === "paid") {
      return currentOrder;
    }

    if (!canTransitionShopOrderStatus(currentOrder.status, "payment_failed")) {
      return currentOrder;
    }

    const now = new Date().toISOString();
    const history = [...currentOrder.history];
    const noteParts = ["Клиент сообщил о неуспешной оплате", providerStatus || undefined, reason || undefined].filter(Boolean);

    history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: now,
      fromStatus: currentOrder.status,
      toStatus: "payment_failed",
      actor: "user",
      actorTelegramId: auth.telegramUserId,
      note: noteParts.join(" | "),
    });

    return {
      ...currentOrder,
      status: "payment_failed",
      updatedAt: now,
      payment: {
        currency: currentOrder.payment?.currency ?? "XTR",
        amount: currentOrder.payment?.amount ?? currentOrder.invoiceStars,
        invoicePayloadHash: currentOrder.payment?.invoicePayloadHash ?? "",
        invoicePayload: currentOrder.payment?.invoicePayload,
        telegramPaymentChargeId: currentOrder.payment?.telegramPaymentChargeId,
        providerPaymentChargeId: currentOrder.payment?.providerPaymentChargeId,
        status: "failed",
        updatedAt: now,
      },
      history,
    };
  }).catch((error: unknown) => {
    if (error instanceof Error && error.message === "forbidden") {
      return "forbidden" as const;
    }

    throw error;
  });

  if (updated === "forbidden") {
    return forbiddenResponse();
  }

  if (!updated) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const responseBody = { order: updated };

  if (idempotencyKey) {
    await saveIdempotencyRecord({
      scope: "shop_order_payment_failed",
      actor: auth.telegramUserId,
      key: idempotencyKey,
      requestHash,
      statusCode: 200,
      body: responseBody,
      ttlSec: 60 * 60,
    });
  }

  return NextResponse.json(responseBody);
}
