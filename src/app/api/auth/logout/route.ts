import { NextResponse } from "next/server";

import { buildBrowserAuthCookieClear } from "@/lib/server/telegram-browser-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.append("set-cookie", buildBrowserAuthCookieClear());
  return response;
}
