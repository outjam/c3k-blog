import { NextResponse } from "next/server";

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
    const orderUrl = baseUrl ? `${baseUrl}/shop` : undefined;
    const payload = parseInvoicePayload(payment.invoice_payload);
    const orderLines = (payload.productIds.length > 0 ? payload.productIds : [""]).map((productId) =>
      `∙ ${escapeHtml(productId ? productIdToTitle(productId) : "Товар из корзины")}`,
    );

    await telegramApi(botToken, "sendMessage", {
      chat_id: update.message.chat.id,
      parse_mode: "HTML",
      text:
        `<b>Заказ № ${payload.orderCode} <tg-emoji emoji-id="${PAYMENT_SUCCESS_EMOJI_ID}">✅</tg-emoji></b>\n\n` +
        `${orderLines.join("\n")}\n\n` +
        `${formatAmount(payment.total_amount)} <tg-emoji emoji-id="${XTR_EMOJI_ID}">⭐</tg-emoji>`,
      reply_markup: orderUrl
        ? {
            inline_keyboard: [
              [
                {
                  text: "Магазин",
                  url: orderUrl,
                  icon_custom_emoji_id: OPEN_BUTTON_EMOJI_ID,
                  style: "primary",
                },
              ],
            ],
          }
        : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
