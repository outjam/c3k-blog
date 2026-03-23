import { NextResponse } from "next/server";

import { executeAdminWorkerRun } from "@/lib/server/admin-worker-execution";
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
  const run = await executeAdminWorkerRun({
    workerId: "storage_delivery_telegram",
    limit,
    getQueueSize: getTelegramStorageDeliveryQueueSize,
    run: processTelegramStorageDeliveryQueue,
    failureMessage: "storage delivery worker failed",
    trigger: "worker_route",
  });

  return NextResponse.json({
    ok: true,
    run,
    queueSizeBefore: run?.queueSizeBefore ?? 0,
    processed: run?.processed ?? 0,
    delivered: run?.delivered ?? 0,
    failed: run?.failed ?? 0,
    skipped: run?.skipped ?? 0,
    claimed: run?.claimed ?? 0,
    remaining: run?.remaining ?? 0,
  });
}

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const limit = parseWorkerQueueLimit(request);
  const run = await executeAdminWorkerRun({
    workerId: "storage_delivery_telegram",
    limit,
    getQueueSize: getTelegramStorageDeliveryQueueSize,
    run: processTelegramStorageDeliveryQueue,
    failureMessage: "storage delivery worker failed",
    trigger: "worker_route",
  });

  return NextResponse.json({
    ok: true,
    run,
    queueSizeBefore: run?.queueSizeBefore ?? 0,
    processed: run?.processed ?? 0,
    delivered: run?.delivered ?? 0,
    failed: run?.failed ?? 0,
    skipped: run?.skipped ?? 0,
    claimed: run?.claimed ?? 0,
    remaining: run?.remaining ?? 0,
  });
}
