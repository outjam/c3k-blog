import { NextResponse } from "next/server";

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

  if (secret && secretHeader !== secret) {
    return NextResponse.json({ ok: false, error: "Invalid webhook secret" }, { status: 401 });
  }

  let update: TelegramUpdate;

  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (update.pre_checkout_query?.id) {
    await telegramApi(botToken, "answerPreCheckoutQuery", {
      pre_checkout_query_id: update.pre_checkout_query.id,
      ok: true,
    });
  }

  if (update.message?.successful_payment && update.message.chat?.id) {
    const payment = update.message.successful_payment;

    await telegramApi(botToken, "sendMessage", {
      chat_id: update.message.chat.id,
      text: `Оплата получена ✅\nЗаказ: ${payment.invoice_payload}\nСумма: ${payment.total_amount} ${payment.currency}`,
    });
  }

  return NextResponse.json({ ok: true });
}
