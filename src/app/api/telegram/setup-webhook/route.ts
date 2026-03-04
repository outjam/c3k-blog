import { NextResponse } from "next/server";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";

interface TelegramApiResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
}

interface TelegramWebhookInfo {
  url: string;
  has_custom_certificate: boolean;
  pending_update_count: number;
  last_error_date?: number;
  last_error_message?: string;
  max_connections?: number;
  allowed_updates?: string[];
}

const assertAdminAccess = (request: Request): NextResponse | null => {
  const adminKey = process.env.TELEGRAM_ADMIN_KEY;

  if (!adminKey) {
    return null;
  }

  const fromHeader = request.headers.get("x-admin-key");
  const fromQuery = new URL(request.url).searchParams.get("key");

  if (fromHeader === adminKey || fromQuery === adminKey) {
    return null;
  }

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
};

const telegramRequest = async <T,>(botToken: string, method: string, body?: Record<string, unknown>) => {
  const response = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
    method: body ? "POST" : "GET",
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  if (!response.ok) {
    return { ok: false, description: `HTTP ${response.status}` } as TelegramApiResponse<T>;
  }

  return (await response.json()) as TelegramApiResponse<T>;
};

export async function GET(request: Request) {
  const unauthorized = assertAdminAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const info = await telegramRequest<TelegramWebhookInfo>(botToken, "getWebhookInfo");

  if (!info.ok) {
    return NextResponse.json({ ok: false, error: info.description ?? "Failed to get webhook info" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, webhook: info.result });
}

export async function POST(request: Request) {
  const unauthorized = assertAdminAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_BOT_TOKEN" }, { status: 500 });
  }

  const baseUrl = resolvePublicBaseUrl(request);

  if (!baseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing TELEGRAM_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL (or VERCEL_URL).",
      },
      { status: 500 },
    );
  }

  const webhookUrl = `${baseUrl}/api/telegram/webhook`;
  const secretToken = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();

  if (!secretToken) {
    return NextResponse.json({ ok: false, error: "Missing TELEGRAM_WEBHOOK_SECRET" }, { status: 500 });
  }

  const setWebhook = await telegramRequest<boolean>(botToken, "setWebhook", {
    url: webhookUrl,
    secret_token: secretToken,
    allowed_updates: ["pre_checkout_query", "message"],
    drop_pending_updates: false,
  });

  if (!setWebhook.ok) {
    return NextResponse.json({ ok: false, error: setWebhook.description ?? "setWebhook failed" }, { status: 502 });
  }

  const info = await telegramRequest<TelegramWebhookInfo>(botToken, "getWebhookInfo");

  return NextResponse.json({
    ok: true,
    webhookUrl,
    secretEnabled: true,
    webhookInfo: info.ok ? info.result : null,
  });
}
