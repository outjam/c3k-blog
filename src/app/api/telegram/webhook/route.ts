import { NextResponse } from "next/server";

import { notifyAdminsAboutNewOrder } from "@/lib/server/shop-order-notify";
import { sendTelegramMessage } from "@/lib/server/telegram-bot";
import type { TelegramInlineButton } from "@/lib/server/telegram-bot";
import { mutateShopOrder, upsertShopOrder } from "@/lib/server/shop-orders-store";
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
  const orderCode = /^[A-Z0-9]{3}-[A-Z0-9]{3}$/.test(normalizedOrderCode) ? normalizedOrderCode : "000-000";
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

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const secretHeader = request.headers.get("x-telegram-bot-api-secret-token");
  const strictSecret = process.env.TELEGRAM_STRICT_WEBHOOK_SECRET === "1";

  if (secret) {
    const expected = secret.trim();
    const provided = (secretHeader ?? "").trim();

    if (strictSecret && provided !== expected) {
      return NextResponse.json({ ok: false, error: "Invalid webhook secret" }, { status: 401 });
    }
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
    const baseUrl = getMiniAppBaseUrl(request);
    const shopMiniAppUrl = baseUrl ? `${baseUrl}/shop` : undefined;
    const payload = parseInvoicePayload(payment.invoice_payload);
    const profileOrderUrl = baseUrl
      ? `${baseUrl}/profile?section=orders&order=${encodeURIComponent(payload.orderCode)}`
      : undefined;
    const orderMiniAppUrl = baseUrl ? `${baseUrl}/orders/${encodeURIComponent(payload.orderCode)}` : undefined;
    const orderLines = (payload.productIds.length > 0 ? payload.productIds : [""]).map((productId) =>
      `∙ ${escapeHtml(productId ? productIdToTitle(productId) : "Товар из корзины")}`,
    );
    const now = new Date().toISOString();
    const telegramUser = update.message.from;

    const updatedOrder = await mutateShopOrder(payload.orderCode, (currentOrder) => {
      const history = [...currentOrder.history];
      history.unshift({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        at: now,
        fromStatus: currentOrder.status,
        toStatus: "paid",
        actor: "bot",
        actorTelegramId: telegramUser?.id ?? currentOrder.telegramUserId,
        note: "Webhook: успешная оплата Telegram Stars",
      });

      return {
        ...currentOrder,
        status: "paid",
        updatedAt: now,
        invoiceStars: clampStarsAmount(payment.total_amount),
        history,
      };
    });

    if (!updatedOrder) {
      const fallbackOrder: ShopOrder = {
        id: payload.orderCode,
        createdAt: now,
        updatedAt: now,
        status: "paid",
        invoiceStars: clampStarsAmount(payment.total_amount),
        totalStarsCents: clampStarsAmount(payment.total_amount) * 100,
        deliveryFeeStarsCents: 0,
        discountStarsCents: 0,
        delivery: "yandex_go",
        address: "",
        customerName: [telegramUser?.first_name, telegramUser?.last_name].filter(Boolean).join(" ").trim(),
        phone: "",
        email: undefined,
        comment: "Создано из webhook (fallback)",
        telegramUserId: telegramUser?.id ?? update.message.chat.id,
        telegramUsername: telegramUser?.username,
        telegramFirstName: telegramUser?.first_name,
        telegramLastName: telegramUser?.last_name,
        items: payload.productIds.map((productId) => ({
          productId,
          title: productIdToTitle(productId),
          quantity: 1,
          priceStarsCents: 100,
        })),
        history: [
          {
            id: `${Date.now()}-created`,
            at: now,
            fromStatus: null,
            toStatus: "paid",
            actor: "bot",
            actorTelegramId: telegramUser?.id ?? update.message.chat.id,
            note: "Webhook: заказ создан автоматически",
          },
        ],
      };

      await upsertShopOrder(fallbackOrder);
      await notifyAdminsAboutNewOrder(fallbackOrder, baseUrl);
    }

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

    await sendTelegramMessage(
      update.message.chat.id,
      `<b>Заказ № ${payload.orderCode} <tg-emoji emoji-id="${PAYMENT_SUCCESS_EMOJI_ID}">✅</tg-emoji></b>\n\n` +
        `${orderLines.join("\n")}\n\n` +
        `${formatAmount(payment.total_amount)} <tg-emoji emoji-id="${XTR_EMOJI_ID}">⭐</tg-emoji>`,
      {
        parseMode: "HTML",
        buttons: buttons.length > 0 ? buttons : undefined,
        messageEffectId: process.env.TELEGRAM_ORDER_SUCCESS_EFFECT_ID,
      },
    );
  }

  return NextResponse.json({ ok: true });
}
