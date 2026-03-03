import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { canTransitionShopOrderStatus } from "@/lib/shop-order-status";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { mutateShopOrder } from "@/lib/server/shop-orders-store";

interface CreateInvoiceLinkResponse {
  ok: boolean;
  result?: string;
  description?: string;
}

interface TelegramWebhookInfo {
  url?: string;
}

interface InvoicePayload {
  amountStars?: number;
  orderId?: string;
  title?: string;
  description?: string;
  productIds?: string[];
}

const sanitize = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : fallback;
};

const sanitizeOrderCode = (value: string): string | null => {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");

  if (/^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(normalized)) {
    return normalized;
  }

  return null;
};

const normalizeProductIds = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .map((item) => String(item).trim())
        .filter((item) => /^clay-\d+$/i.test(item))
        .map((item) => item.toLowerCase()),
    ),
  ).slice(0, 3);
};

const buildInvoicePayload = (orderCode: string, productIds: string[]): string => {
  const productChunk = productIds.join(",");
  const payload = productChunk ? `${orderCode}|${productChunk}` : orderCode;
  return payload.slice(0, 128);
};

const getPublicBaseUrl = (request: Request): string | null => {
  const explicit = process.env.TELEGRAM_WEBHOOK_BASE_URL;

  if (explicit) {
    return explicit.replace(/\/+$/, "");
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";

  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, "");
  }

  const nextPublicUrl = process.env.NEXT_PUBLIC_APP_URL;

  if (nextPublicUrl) {
    return nextPublicUrl.replace(/\/+$/, "");
  }

  const vercelUrl = process.env.VERCEL_URL;

  if (vercelUrl) {
    return `https://${vercelUrl}`;
  }

  return null;
};

const telegramRequest = async <T,>(
  botToken: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<CreateInvoiceLinkResponse & { result?: T }> => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, description: `HTTP ${response.status}` };
  }

  return (await response.json()) as CreateInvoiceLinkResponse & { result?: T };
};

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!secretToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_WEBHOOK_SECRET" }, { status: 500 });
  }

  let payload: InvoicePayload;

  try {
    payload = (await request.json()) as InvoicePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const orderCode = sanitizeOrderCode(String(payload.orderId ?? ""));

  if (!orderCode) {
    return NextResponse.json({ error: "Invalid orderId" }, { status: 400 });
  }

  const title = sanitize(String(payload.title ?? "Заказ"), "Заказ");
  const description = sanitize(String(payload.description ?? "Оплата заказа"), "Оплата заказа");
  const productIds = normalizeProductIds(payload.productIds);
  const invoicePayload = buildInvoicePayload(orderCode, productIds);
  const invoicePayloadHash = createHash("sha256").update(invoicePayload).digest("hex");
  const now = new Date().toISOString();

  let invoiceAmount = Math.max(1, Math.round(Number(payload.amountStars ?? 0)));

  const orderUpdated = await mutateShopOrder(orderCode, (currentOrder) => {
    if (currentOrder.telegramUserId !== auth.telegramUserId) {
      throw new Error("forbidden");
    }

    if (currentOrder.status === "paid") {
      throw new Error("already_paid");
    }

    if (!canTransitionShopOrderStatus(currentOrder.status, "pending_payment")) {
      throw new Error("invalid_transition");
    }

    invoiceAmount = Math.max(1, Math.round(Number(currentOrder.invoiceStars || invoiceAmount || 1)));

    const history = [...currentOrder.history];
    history.unshift({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      at: now,
      fromStatus: currentOrder.status,
      toStatus: "pending_payment",
      actor: "system",
      actorTelegramId: auth.telegramUserId,
      note: "Открыт invoice Telegram Stars",
    });

    return {
      ...currentOrder,
      status: "pending_payment",
      invoiceStars: invoiceAmount,
      updatedAt: now,
      payment: {
        currency: "XTR",
        amount: invoiceAmount,
        invoicePayloadHash,
        invoicePayload,
        telegramPaymentChargeId: currentOrder.payment?.telegramPaymentChargeId,
        providerPaymentChargeId: currentOrder.payment?.providerPaymentChargeId,
        status: "pending_payment",
        updatedAt: now,
      },
      history,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";

    if (message === "forbidden" || message === "already_paid" || message === "invalid_transition") {
      return message as "forbidden" | "already_paid" | "invalid_transition";
    }

    throw error;
  });

  if (orderUpdated === "forbidden") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (orderUpdated === "already_paid") {
    return NextResponse.json({ error: "Order is already paid" }, { status: 409 });
  }

  if (orderUpdated === "invalid_transition") {
    return NextResponse.json({ error: "Order cannot start a new payment session" }, { status: 409 });
  }

  if (!orderUpdated) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const baseUrl = getPublicBaseUrl(request);

  if (!baseUrl) {
    return NextResponse.json(
      { error: "Missing TELEGRAM_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL (or VERCEL_URL)." },
      { status: 500 },
    );
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const webhookInfo = await telegramRequest<TelegramWebhookInfo>(botToken, "getWebhookInfo");

  if (!webhookInfo.ok) {
    return NextResponse.json({ error: webhookInfo.description ?? "Failed to read webhook info" }, { status: 502 });
  }

  if (webhookInfo.result?.url !== webhookUrl) {
    const setWebhook = await telegramRequest<boolean>(botToken, "setWebhook", {
      url: webhookUrl,
      secret_token: secretToken,
      allowed_updates: ["pre_checkout_query", "message"],
      drop_pending_updates: false,
    });

    if (!setWebhook.ok) {
      return NextResponse.json({ error: setWebhook.description ?? "Failed to set webhook" }, { status: 502 });
    }
  }

  const telegramBody = {
    title,
    description,
    payload: invoicePayload,
    currency: "XTR",
    prices: [{ label: title, amount: invoiceAmount }],
  };

  try {
    const telegramResult = await telegramRequest<string>(botToken, "createInvoiceLink", telegramBody);

    if (!telegramResult.ok || !telegramResult.result) {
      await mutateShopOrder(orderCode, (currentOrder) => {
        if (currentOrder.status !== "pending_payment") {
          return currentOrder;
        }

        const failedAt = new Date().toISOString();
        const history = [...currentOrder.history];
        history.unshift({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          at: failedAt,
          fromStatus: currentOrder.status,
          toStatus: "payment_failed",
          actor: "system",
          note: "createInvoiceLink завершился с ошибкой",
        });

        return {
          ...currentOrder,
          status: "payment_failed",
          updatedAt: failedAt,
          payment: {
            currency: currentOrder.payment?.currency ?? "XTR",
            amount: currentOrder.payment?.amount ?? invoiceAmount,
            invoicePayloadHash: currentOrder.payment?.invoicePayloadHash ?? invoicePayloadHash,
            invoicePayload: currentOrder.payment?.invoicePayload ?? invoicePayload,
            telegramPaymentChargeId: currentOrder.payment?.telegramPaymentChargeId,
            providerPaymentChargeId: currentOrder.payment?.providerPaymentChargeId,
            status: "failed",
            updatedAt: failedAt,
          },
          history,
        };
      });

      return NextResponse.json(
        { error: telegramResult.description ?? "createInvoiceLink returned empty result" },
        { status: 502 },
      );
    }

    return NextResponse.json({ invoiceLink: telegramResult.result });
  } catch {
    return NextResponse.json({ error: "Failed to contact Telegram API" }, { status: 502 });
  }
}
