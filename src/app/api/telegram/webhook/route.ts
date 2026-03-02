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
    const orderUrl = baseUrl
      ? `${baseUrl}/profile?section=orders&order=${encodeURIComponent(payment.invoice_payload)}`
      : undefined;

    await telegramApi(botToken, "sendMessage", {
      chat_id: update.message.chat.id,
      text: `Оплата получена ✅\nЗаказ: ${payment.invoice_payload}\nСумма: ${payment.total_amount} ${payment.currency}`,
      reply_markup: orderUrl
        ? {
            inline_keyboard: [
              [
                {
                  text: "Открыть заказ",
                  url: orderUrl,
                  style: "success",
                },
              ],
            ],
          }
        : undefined,
    });
  }

  return NextResponse.json({ ok: true });
}
