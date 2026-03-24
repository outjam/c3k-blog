import { NextResponse } from "next/server";

import {
  verifyTelegramBrowserSession,
  verifyTelegramDesktopBridgeToken,
} from "@/lib/server/telegram-browser-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "").trim();
  if (!botToken) {
    return NextResponse.json({ error: "Bot token is not configured" }, { status: 500 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const bridgeToken =
    payload && typeof payload === "object" && typeof (payload as Record<string, unknown>).bridgeToken === "string"
      ? String((payload as Record<string, unknown>).bridgeToken).trim()
      : "";

  if (!bridgeToken) {
    return NextResponse.json({ error: "Missing bridgeToken" }, { status: 400 });
  }

  const sessionToken = verifyTelegramDesktopBridgeToken(bridgeToken, botToken);
  if (!sessionToken) {
    return NextResponse.json({ error: "Invalid or expired desktop bridge token" }, { status: 401 });
  }

  const user = verifyTelegramBrowserSession(sessionToken, botToken);
  if (!user) {
    return NextResponse.json({ error: "Desktop bridge session is invalid" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    sessionToken,
    user: {
      id: user.id,
      first_name: user.first_name ?? "",
      last_name: user.last_name ?? "",
      username: user.username ?? "",
      photo_url: user.photo_url ?? "",
    },
  });
}
