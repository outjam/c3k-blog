import { NextResponse } from "next/server";

import {
  buildBrowserAuthCookie,
  issueTelegramBrowserSession,
  verifyTelegramBrowserLogin,
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

  const verified = verifyTelegramBrowserLogin(payload, botToken);
  if (!verified) {
    return NextResponse.json({ error: "Invalid Telegram login payload" }, { status: 401 });
  }

  const sessionToken = issueTelegramBrowserSession(verified, botToken);
  const response = NextResponse.json({
    ok: true,
    user: {
      id: verified.id,
      first_name: verified.first_name ?? "",
      last_name: verified.last_name ?? "",
      username: verified.username ?? "",
      photo_url: verified.photo_url ?? "",
    },
  });

  response.headers.append("set-cookie", buildBrowserAuthCookie(sessionToken));
  return response;
}
