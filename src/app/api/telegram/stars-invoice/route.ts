import { NextResponse } from "next/server";

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
}

const sanitize = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : fallback;
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

  const baseUrl = getPublicBaseUrl(request);
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET;

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
    payload: orderId,
    currency: "XTR",
    prices: [{ label: title, amount: amountStars }],
  };

  try {
    const telegramResult = await telegramRequest<string>(botToken, "createInvoiceLink", telegramBody);

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
