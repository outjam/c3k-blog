import { NextResponse } from "next/server";

import {
  getTelegramNotificationQueueSize,
  processTelegramNotificationQueue,
} from "@/lib/server/telegram-notification-queue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isAuthorized = (request: Request): boolean => {
  const workerSecret = process.env.TELEGRAM_WORKER_SECRET?.trim();
  const cronSecret = process.env.CRON_SECRET?.trim();

  const fromHeader = (request.headers.get("x-worker-key") ?? "").trim();
  const fromQuery = (new URL(request.url).searchParams.get("key") ?? "").trim();
  const authorization = (request.headers.get("authorization") ?? "").trim();
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";

  if (workerSecret && (fromHeader === workerSecret || fromQuery === workerSecret)) {
    return true;
  }

  if (cronSecret && bearer === cronSecret) {
    return true;
  }

  return false;
};

const parseLimit = (request: Request): number => {
  const fromQuery = Number(new URL(request.url).searchParams.get("limit"));

  if (!Number.isFinite(fromQuery)) {
    return 25;
  }

  return Math.max(1, Math.min(100, Math.round(fromQuery)));
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const mode = (new URL(request.url).searchParams.get("mode") ?? "").trim().toLowerCase();

  if (mode === "status") {
    const size = await getTelegramNotificationQueueSize();
    return NextResponse.json({ ok: true, queueSize: size });
  }

  const stats = await processTelegramNotificationQueue(parseLimit(request));
  return NextResponse.json({ ok: true, ...stats });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const size = await getTelegramNotificationQueueSize();
  const stats = await processTelegramNotificationQueue(parseLimit(request));
  return NextResponse.json({ ok: true, queueSizeBefore: size, ...stats });
}
