import { NextResponse } from "next/server";

import { getShopApiAuth } from "@/lib/server/shop-api-auth";
import {
  extractCookieValue,
  issueTelegramDesktopBridgeToken,
  TELEGRAM_BROWSER_AUTH_COOKIE,
  verifyTelegramBrowserSession,
} from "@/lib/server/telegram-browser-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "").trim();
  if (!botToken) {
    return NextResponse.json({ error: "Bot token is not configured" }, { status: 500 });
  }

  const auth = getShopApiAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessionToken = extractCookieValue(request, TELEGRAM_BROWSER_AUTH_COOKIE);
  const verifiedSession = verifyTelegramBrowserSession(sessionToken, botToken);
  if (!sessionToken || !verifiedSession || verifiedSession.id !== auth.telegramUserId) {
    return NextResponse.json({ error: "Browser session is not available" }, { status: 401 });
  }

  const bridgeToken = issueTelegramDesktopBridgeToken(sessionToken, botToken);
  return NextResponse.json({
    ok: true,
    bridgeToken,
    user: {
      id: auth.telegramUserId,
      first_name: auth.firstName,
      last_name: auth.lastName,
      username: auth.username,
      photo_url: auth.photoUrl ?? "",
    },
  });
}
