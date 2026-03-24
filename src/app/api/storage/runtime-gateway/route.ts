import { NextResponse } from "next/server";

import { getTonStorageRuntimeBridgeStatus } from "@/lib/server/storage-ton-runtime-bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "storage-runtime-gateway",
    bridge: getTonStorageRuntimeBridgeStatus(),
  });
}

export async function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "x-c3k-ton-runtime-gateway": "ok",
    },
  });
}
