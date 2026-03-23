import { NextResponse } from "next/server";

import { listAdminWorkerRuns } from "@/lib/server/admin-worker-run-store";
import { forbiddenResponse, getShopApiAccess, hasAdminPermission, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
