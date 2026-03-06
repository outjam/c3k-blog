import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";

interface TopupPayload {
  amountStars?: number;
  title?: string;
  description?: string;
}

interface CreateInvoiceLinkResponse {
  ok: boolean;
  result?: string;
  description?: string;
}

const sanitize = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 255) : fallback;
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
    scope: "telegram_wallet_topup_invoice",
    identifier: auth.telegramUserId,
    limit: 16,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!secretToken) {
    return NextResponse.json({ error: "Missing TELEGRAM_WEBHOOK_SECRET" }, { status: 500 });
  }

  let payload: TopupPayload;

  try {
    payload = (await request.json()) as TopupPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const amountStars = Math.max(1, Math.min(2000, Math.round(Number(payload.amountStars ?? 0))));
  if (!Number.isFinite(amountStars) || amountStars < 1) {
    return NextResponse.json({ error: "Invalid amountStars" }, { status: 400 });
  }

  const title = sanitize(String(payload.title ?? "Пополнение баланса"), "Пополнение баланса");
  const description = sanitize(
    String(payload.description ?? "Пополнение внутреннего баланса C3K"),
    "Пополнение внутреннего баланса C3K",
  );

  const baseUrl = resolvePublicBaseUrl(request);
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Missing TELEGRAM_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL (or VERCEL_URL)." },
      { status: 500 },
    );
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const setWebhook = await telegramRequest<boolean>(botToken, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["pre_checkout_query", "message"],
    drop_pending_updates: false,
  });

  if (!setWebhook.ok) {
    return NextResponse.json({ error: `setWebhook failed: ${setWebhook.description ?? "unknown error"}` }, { status: 502 });
  }

  const nonce = randomUUID().slice(0, 12);
  const invoicePayload = `wallet_topup|${auth.telegramUserId}|${amountStars}|${nonce}`;

  const invoice = await telegramRequest<string>(botToken, "createInvoiceLink", {
    title,
    description,
    payload: invoicePayload,
    currency: "XTR",
    prices: [{ label: title, amount: amountStars }],
  });

  if (!invoice.ok || !invoice.result) {
    return NextResponse.json(
      { error: `createInvoiceLink failed: ${invoice.description ?? "unknown error"}` },
      { status: 502 },
    );
  }

  return NextResponse.json({
    invoiceLink: invoice.result,
    amountStars,
    amountStarsCents: amountStars * 100,
  });
}
