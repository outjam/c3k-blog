import { NextResponse } from "next/server";

import { recordAdminWorkerRun } from "@/lib/server/admin-worker-run-store";
import {
  getTelegramStorageDeliveryQueueSize,
  processTelegramStorageDeliveryQueue,
} from "@/lib/server/storage-delivery";
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
    const queueSize = await getTelegramStorageDeliveryQueueSize();
    return NextResponse.json({ ok: true, queueSize });
  }

  const limit = parseWorkerQueueLimit(request);
  const queueSizeBefore = await getTelegramStorageDeliveryQueueSize();
  const startedAt = new Date().toISOString();

  try {
    const stats = await processTelegramStorageDeliveryQueue(limit);
    await recordAdminWorkerRun({
      workerId: "storage_delivery_telegram",
      status: stats.failed > 0 ? "partial" : "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      limit,
      queueSizeBefore,
      queueSizeAfter: stats.remaining,
      processed: stats.processed,
      delivered: stats.delivered,
      failed: stats.failed,
      skipped: stats.skipped,
      claimed: stats.claimed,
      remaining: stats.remaining,
    });
    return NextResponse.json({ ok: true, queueSizeBefore, ...stats });
  } catch (error) {
    await recordAdminWorkerRun({
      workerId: "storage_delivery_telegram",
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
      errorMessage: error instanceof Error ? error.message : "storage delivery worker failed",
    });
    throw error;
  }
}

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const queueSizeBefore = await getTelegramStorageDeliveryQueueSize();
  const limit = parseWorkerQueueLimit(request);
  const startedAt = new Date().toISOString();

  try {
    const stats = await processTelegramStorageDeliveryQueue(limit);
    await recordAdminWorkerRun({
      workerId: "storage_delivery_telegram",
      status: stats.failed > 0 ? "partial" : "completed",
      startedAt,
      completedAt: new Date().toISOString(),
      limit,
      queueSizeBefore,
      queueSizeAfter: stats.remaining,
      processed: stats.processed,
      delivered: stats.delivered,
      failed: stats.failed,
      skipped: stats.skipped,
      claimed: stats.claimed,
      remaining: stats.remaining,
    });
    return NextResponse.json({ ok: true, queueSizeBefore, ...stats });
  } catch (error) {
    await recordAdminWorkerRun({
      workerId: "storage_delivery_telegram",
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
      errorMessage: error instanceof Error ? error.message : "storage delivery worker failed",
    });
    throw error;
  }
}
