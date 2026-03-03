import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { canTransitionShopOrderStatus } from "@/lib/shop-order-status";
import { buildOrderCardSvg } from "@/lib/server/shop-order-card-image";
import { notifyAdminsAboutNewOrder } from "@/lib/server/shop-order-notify";
import { mutateShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { mutateShopOrder } from "@/lib/server/shop-orders-store";
import { sendTelegramDocument, sendTelegramMessage } from "@/lib/server/telegram-bot";
import type { TelegramInlineButton } from "@/lib/server/telegram-bot";
import type { ShopOrder } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TelegramPreCheckoutQuery {
  id: string;
}

interface TelegramSuccessfulPayment {
  total_amount: number;
  currency: string;
  invoice_payload: string;
  telegram_payment_charge_id?: string;
  provider_payment_charge_id?: string;
}

interface TelegramUpdate {
  pre_checkout_query?: TelegramPreCheckoutQuery;
  message?: {
    from?: {
      id: number;
      username?: string;
      first_name?: string;
      last_name?: string;
    };
    chat?: { id: number };
    successful_payment?: TelegramSuccessfulPayment;
  };
}

const PAYMENT_SUCCESS_EMOJI_ID = "5895669571058142797";
const XTR_EMOJI_ID = "6028338546736107668";
const OPEN_BUTTON_EMOJI_ID = "5920332557466997677";
const ORDER_TITLE_STEMS = ["Фигурк", "Ваз", "Кружк", "Светильник", "Тарелк"] as const;

const escapeHtml = (value: string): string => {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
};

interface ParsedInvoicePayload {
  orderCode: string;
  productIds: string[];
}

const parseInvoicePayload = (rawPayload: string): ParsedInvoicePayload => {
  const [rawOrderCode, rawProductIds = ""] = rawPayload.split("|", 2);
  const normalizedOrderCode = rawOrderCode
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "");
  const orderCode = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(normalizedOrderCode) ? normalizedOrderCode : "";
  const productIds = rawProductIds
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => /^clay-\d+$/.test(item))
    .slice(0, 3);

  return { orderCode, productIds };
};

const productIdToTitle = (productId: string): string => {
  const match = /^clay-(\d+)$/i.exec(productId);
  const sequence = Number(match?.[1] ?? NaN);

  if (!Number.isFinite(sequence) || sequence < 1) {
    return "Товар из корзины";
  }

  const stem = ORDER_TITLE_STEMS[(sequence - 1) % ORDER_TITLE_STEMS.length] ?? ORDER_TITLE_STEMS[0];
  return `${stem} из глины №${sequence}`;
};

const formatAmount = (amount: number): string => {
  return new Intl.NumberFormat("ru-RU").format(Math.max(0, Math.round(amount)));
};

const clampStarsAmount = (value: number): number => {
  return Math.max(1, Math.round(Number(value || 1)));
};

const getMiniAppBaseUrl = (request: Request): string | null => {
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

const telegramApi = async (botToken: string, method: string, body: Record<string, unknown>) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  return response.ok;
};

const bumpPromoUsage = async (promoCode: string): Promise<void> => {
  const normalized = promoCode.trim().toUpperCase().slice(0, 24);

  if (!normalized) {
    return;
  }

  await mutateShopAdminConfig((current) => {
    const nowUpdated = new Date().toISOString();
    const promoCodes = current.promoCodes.map((promo) =>
      promo.code === normalized ? { ...promo, usedCount: promo.usedCount + 1, updatedAt: nowUpdated } : promo,
    );

    return {
      ...current,
      promoCodes,
      updatedAt: nowUpdated,
    };
  });
};

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  const providedSecret = (request.headers.get("x-telegram-bot-api-secret-token") ?? "").trim();

  if (!secret) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_WEBHOOK_SECRET" }, { status: 500 });
  }

  if (providedSecret !== secret) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret" }, { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (update.pre_checkout_query?.id) {
    let answered = await telegramApi(botToken, "answerPreCheckoutQuery", {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok: true,
    });

    if (!answered) {
      answered = await telegramApi(botToken, "answerPreCheckoutQuery", {
        pre_checkout_query_id: update.pre_checkout_query.id,
        ok: true,
      });
    }

    return NextResponse.json({ ok: answered });
  }

  if (update.message?.successful_payment && update.message.chat?.id) {
    const payment = update.message.successful_payment;
    const payload = parseInvoicePayload(payment.invoice_payload);

    if (!payload.orderCode) {
      return NextResponse.json({ ok: true, ignored: "invalid_order_code" });
    }

    const now = new Date().toISOString();
    const payloadHash = createHash("sha256").update(payment.invoice_payload).digest("hex");
    const telegramChargeId = String(payment.telegram_payment_charge_id ?? "").trim().slice(0, 160);
    const providerChargeId = String(payment.provider_payment_charge_id ?? "").trim().slice(0, 160);

    let previousStatus: ShopOrder["status"] | null = null;
    let wasDuplicate = false;
    let promoCodeToApply: string | undefined;

    const updatedOrder = await mutateShopOrder(payload.orderCode, (currentOrder) => {
      const currentChargeId = currentOrder.payment?.telegramPaymentChargeId;

      if (currentChargeId && telegramChargeId && currentChargeId === telegramChargeId) {
        wasDuplicate = true;
        return currentOrder;
      }

      if (currentOrder.payment?.invoicePayloadHash && currentOrder.payment.invoicePayloadHash !== payloadHash) {
        throw new Error("payload_hash_mismatch");
      }

      if (currentOrder.status === "paid") {
        wasDuplicate = true;
        return {
          ...currentOrder,
          payment: {
            currency: payment.currency || currentOrder.payment?.currency || "XTR",
            amount: clampStarsAmount(payment.total_amount),
            invoicePayloadHash: currentOrder.payment?.invoicePayloadHash ?? payloadHash,
            invoicePayload: currentOrder.payment?.invoicePayload ?? payment.invoice_payload,
            telegramPaymentChargeId: telegramChargeId || currentOrder.payment?.telegramPaymentChargeId,
            providerPaymentChargeId: providerChargeId || currentOrder.payment?.providerPaymentChargeId,
            status: "paid",
            updatedAt: now,
          },
        };
      }

      if (!canTransitionShopOrderStatus(currentOrder.status, "paid")) {
        throw new Error("invalid_transition");
      }

      previousStatus = currentOrder.status;
      promoCodeToApply = currentOrder.promoCode;

      const history = [...currentOrder.history];
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: now,
        fromStatus: currentOrder.status,
        toStatus: "paid",
        actor: "bot",
        actorTelegramId: update.message?.from?.id ?? currentOrder.telegramUserId,
        note: "Webhook: успешная оплата Telegram Stars",
      });

      return {
        ...currentOrder,
        status: "paid",
        updatedAt: now,
        invoiceStars: clampStarsAmount(payment.total_amount),
        payment: {
          currency: payment.currency || "XTR",
          amount: clampStarsAmount(payment.total_amount),
          invoicePayloadHash: currentOrder.payment?.invoicePayloadHash ?? payloadHash,
          invoicePayload: currentOrder.payment?.invoicePayload ?? payment.invoice_payload,
          telegramPaymentChargeId: telegramChargeId || undefined,
          providerPaymentChargeId: providerChargeId || undefined,
          status: "paid",
          updatedAt: now,
        },
        history,
      };
    }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "";
      if (message === "payload_hash_mismatch" || message === "invalid_transition") {
        return message as "payload_hash_mismatch" | "invalid_transition";
      }

      throw error;
    });

    if (!updatedOrder) {
      return NextResponse.json({ ok: true, ignored: "order_not_found" });
    }

    if (updatedOrder === "payload_hash_mismatch" || updatedOrder === "invalid_transition") {
      return NextResponse.json({ ok: true, ignored: updatedOrder });
    }

    if (!wasDuplicate) {
      const baseUrl = getMiniAppBaseUrl(request);
      const shopMiniAppUrl = baseUrl ? `${baseUrl}/shop` : undefined;
      const profileOrderUrl = baseUrl
        ? `${baseUrl}/profile?section=orders&order=${encodeURIComponent(payload.orderCode)}`
        : undefined;
      const orderMiniAppUrl = baseUrl ? `${baseUrl}/orders/${encodeURIComponent(payload.orderCode)}` : undefined;

      if (promoCodeToApply) {
        await bumpPromoUsage(promoCodeToApply);
      }

      await notifyAdminsAboutNewOrder(updatedOrder, baseUrl);

      const buttons: TelegramInlineButton[][] = [];

      if (orderMiniAppUrl) {
        buttons.push([
          {
            text: "Открыть заказ",
            web_app: { url: orderMiniAppUrl },
            icon_custom_emoji_id: OPEN_BUTTON_EMOJI_ID,
            style: "success" as const,
          },
        ]);
      }

      const secondRow: TelegramInlineButton[] = [];

      if (profileOrderUrl) {
        secondRow.push({ text: "Мои заказы", web_app: { url: profileOrderUrl }, style: "default" as const });
      }

      if (shopMiniAppUrl) {
        secondRow.push({ text: "Магазин", web_app: { url: shopMiniAppUrl }, style: "primary" as const });
      }

      if (secondRow.length > 0) {
        buttons.push(secondRow);
      }

      const orderItems = updatedOrder.items?.length
        ? updatedOrder.items.map((item) => ({
            title: item.title,
            quantity: item.quantity,
          }))
        : (payload.productIds.length > 0 ? payload.productIds : [""]).map((productId) => ({
            title: productId ? productIdToTitle(productId) : "Товар из корзины",
            quantity: 1,
          }));

      const orderLines = orderItems.map((item) => `∙ ${escapeHtml(item.title)}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`);

      const summaryText =
        `<b>Заказ № ${payload.orderCode} <tg-emoji emoji-id="${PAYMENT_SUCCESS_EMOJI_ID}">✅</tg-emoji></b>\n\n` +
        `${orderLines.join("\n")}\n\n` +
        `${formatAmount(payment.total_amount)} <tg-emoji emoji-id="${XTR_EMOJI_ID}">⭐</tg-emoji>`;

      const cardSvg = buildOrderCardSvg({
        orderId: payload.orderCode,
        amountStars: payment.total_amount,
        items: orderItems,
        appTitle: "C3K Telegram Shop",
      });

      const sentCard = await sendTelegramDocument(update.message.chat.id, cardSvg, {
        fileName: `order-${payload.orderCode}.svg`,
        mimeType: "image/svg+xml",
        caption: summaryText,
        parseMode: "HTML",
        buttons: buttons.length > 0 ? buttons : undefined,
      });

      if (!sentCard) {
        await sendTelegramMessage(update.message.chat.id, summaryText, {
          parseMode: "HTML",
          buttons: buttons.length > 0 ? buttons : undefined,
          messageEffectId: process.env.TELEGRAM_ORDER_SUCCESS_EFFECT_ID,
        });
      }
    }

    if (previousStatus === null && wasDuplicate) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
  }

  return NextResponse.json({ ok: true });
}
