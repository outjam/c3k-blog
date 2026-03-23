import { NextResponse } from "next/server";

import { executeAdminWorkerRun } from "@/lib/server/admin-worker-execution";
import { listAdminWorkerRuns } from "@/lib/server/admin-worker-run-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import {
  getTelegramStorageDeliveryQueueSize,
  processTelegramStorageDeliveryQueue,
} from "@/lib/server/storage-delivery";
import {
  getTelegramNotificationQueueSize,
  processTelegramNotificationQueue,
} from "@/lib/server/telegram-notification-queue";
import type { AdminWorkerRunWorkerId } from "@/types/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeWorkerId = (value: unknown): AdminWorkerRunWorkerId | null => {
  if (value === "telegram_notifications" || value === "storage_delivery_telegram") {
    return value;
  }

  return null;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "dashboard:view")) {
    return forbiddenResponse();
  }

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(50, Math.round(Number(url.searchParams.get("limit") ?? 12) || 12)));
  const workerId = (url.searchParams.get("workerId") ?? "").trim();
  const runs = await listAdminWorkerRuns({
    limit,
    workerId: workerId === "telegram_notifications" ? workerId : workerId === "storage_delivery_telegram" ? workerId : undefined,
  });

  return NextResponse.json({
    updatedAt: runs[0]?.completedAt ?? new Date().toISOString(),
    runs,
  });
}

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "dashboard:view")) {
    return forbiddenResponse();
  }

  const jsonGuard = requireJsonRequest(request);

  if (jsonGuard) {
    return jsonGuard;
  }

  const payload = (await request.json().catch(() => null)) as
    | {
        workerId?: unknown;
        limit?: unknown;
      }
    | null;
  const workerId = normalizeWorkerId(payload?.workerId ?? "");

  if (!workerId) {
    return NextResponse.json({ error: "Unknown workerId" }, { status: 400 });
  }

  const parsedLimit = Math.round(Number(payload?.limit ?? 25));
  const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(100, parsedLimit)) : 25;

  const run =
    workerId === "telegram_notifications"
      ? await executeAdminWorkerRun({
          workerId,
          limit,
          getQueueSize: getTelegramNotificationQueueSize,
          run: processTelegramNotificationQueue,
          failureMessage: "telegram notifications worker failed",
          trigger: "admin_manual",
          triggeredByTelegramUserId: auth.telegramUserId,
        })
      : await executeAdminWorkerRun({
          workerId,
          limit,
          getQueueSize: getTelegramStorageDeliveryQueueSize,
          run: processTelegramStorageDeliveryQueue,
          failureMessage: "storage delivery worker failed",
          trigger: "admin_manual",
          triggeredByTelegramUserId: auth.telegramUserId,
        });

  return NextResponse.json({
    ok: true,
    run,
  });
}
