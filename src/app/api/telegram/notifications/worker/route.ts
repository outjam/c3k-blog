import { NextResponse } from "next/server";

import { recordAdminWorkerRun } from "@/lib/server/admin-worker-run-store";
import {
  getTelegramNotificationQueueSize,
  processTelegramNotificationQueue,
} from "@/lib/server/telegram-notification-queue";
import {
  isAuthorizedWorkerRequest,
  parseWorkerQueueLimit,
} from "@/lib/server/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const mode = (new URL(request.url).searchParams.get("mode") ?? "").trim().toLowerCase();

  if (mode === "status") {
    const size = await getTelegramNotificationQueueSize();
    return NextResponse.json({ ok: true, queueSize: size });
  }

  const limit = parseWorkerQueueLimit(request);
  const queueSizeBefore = await getTelegramNotificationQueueSize();
  const startedAt = new Date().toISOString();

  try {
    const stats = await processTelegramNotificationQueue(limit);
    await recordAdminWorkerRun({
      workerId: "telegram_notifications",
      status: stats.failed > 0 ? "partial" : "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      limit,
      queueSizeBefore,
      queueSizeAfter: stats.remaining,
      processed: stats.processed,
      delivered: stats.delivered,
      failed: stats.failed,
      retried: stats.retried,
      remaining: stats.remaining,
    });
    return NextResponse.json({ ok: true, queueSizeBefore, ...stats });
  } catch (error) {
    await recordAdminWorkerRun({
      workerId: "telegram_notifications",
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      limit,
      queueSizeBefore,
      queueSizeAfter: queueSizeBefore,
      processed: 0,
      delivered: 0,
      failed: 1,
      remaining: queueSizeBefore,
      errorMessage: error instanceof Error ? error.message : "telegram notifications worker failed",
    });
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const queueSizeBefore = await getTelegramNotificationQueueSize();
  const limit = parseWorkerQueueLimit(request);
  const startedAt = new Date().toISOString();

  try {
    const stats = await processTelegramNotificationQueue(limit);
    await recordAdminWorkerRun({
      workerId: "telegram_notifications",
      status: stats.failed > 0 ? "partial" : "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      limit,
      queueSizeBefore,
      queueSizeAfter: stats.remaining,
      processed: stats.processed,
      delivered: stats.delivered,
      failed: stats.failed,
      retried: stats.retried,
      remaining: stats.remaining,
    });
    return NextResponse.json({ ok: true, queueSizeBefore, ...stats });
  } catch (error) {
    await recordAdminWorkerRun({
      workerId: "telegram_notifications",
      status: "failed",
      startedAt,
      completedAt: new Date().toISOString(),
      limit,
      queueSizeBefore,
      queueSizeAfter: queueSizeBefore,
      processed: 0,
      delivered: 0,
      failed: 1,
      remaining: queueSizeBefore,
      errorMessage: error instanceof Error ? error.message : "telegram notifications worker failed",
    });
    throw error;
  }
}
