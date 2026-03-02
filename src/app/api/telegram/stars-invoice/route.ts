import { NextResponse } from "next/server";

interface CreateInvoiceLinkResponse {
  ok: boolean;
  result?: string;
  description?: string;
}

interface InvoicePayload {
  amountStars?: number;
  orderId?: string;
  title?: string;
  description?: string;
}

const sanitize = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : fallback;
};

export async function POST(request: Request) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  let payload: InvoicePayload;

  try {
    payload = (await request.json()) as InvoicePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const amountStars = Math.max(1, Math.round(Number(payload.amountStars ?? 0)));

  if (!Number.isFinite(amountStars) || amountStars < 1) {
    return NextResponse.json({ error: "Invalid amountStars" }, { status: 400 });
  }

  const orderId = sanitize(String(payload.orderId ?? "order"), "order");
  const title = sanitize(String(payload.title ?? "Заказ"), "Заказ");
  const description = sanitize(String(payload.description ?? "Оплата заказа"), "Оплата заказа");

  const apiUrl = `https://api.telegram.org/bot${botToken}/createInvoiceLink`;

  const telegramBody = {
    title,
    description,
    payload: orderId,
    currency: "XTR",
    prices: [{ label: title, amount: amountStars }],
    provider_token: "",
  };

  try {
    const telegramResponse = await fetch(apiUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(telegramBody),
      cache: "no-store",
    });

    if (!telegramResponse.ok) {
      return NextResponse.json({ error: "Telegram API request failed" }, { status: 502 });
    }

    const telegramResult = (await telegramResponse.json()) as CreateInvoiceLinkResponse;

    if (!telegramResult.ok || !telegramResult.result) {
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
