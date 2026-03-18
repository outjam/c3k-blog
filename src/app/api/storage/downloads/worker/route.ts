import { NextResponse } from "next/server";

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

  const stats = await processTelegramStorageDeliveryQueue(parseWorkerQueueLimit(request));
  return NextResponse.json({ ok: true, ...stats });
}

export async function POST(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const queueSizeBefore = await getTelegramStorageDeliveryQueueSize();
  const stats = await processTelegramStorageDeliveryQueue(parseWorkerQueueLimit(request));
  return NextResponse.json({ ok: true, queueSizeBefore, ...stats });
}
