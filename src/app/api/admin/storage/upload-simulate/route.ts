import { NextResponse } from "next/server";

import { runSimulatedTonStorageUploadPass } from "@/lib/server/storage-upload-worker";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:manage")) {
    return forbiddenResponse();
  }

  let body: { limit?: number } = {};

  try {
    body = (await request.json()) as { limit?: number };
  } catch {
    body = {};
  }

  try {
    const summary = await runSimulatedTonStorageUploadPass(body.limit ?? 5);
    return NextResponse.json({ ok: true, summary });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to execute simulated upload pass.",
      },
      { status: 500 },
    );
  }
}
