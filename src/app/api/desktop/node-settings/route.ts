import { NextResponse } from "next/server";

import {
  getDesktopLocalNodeSettings,
  updateDesktopLocalNodeSettings,
} from "@/lib/server/desktop-local-node-config";

const withCors = (response: NextResponse): NextResponse => {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "content-type");
  response.headers.set("Cache-Control", "no-store");
  return response;
};

export async function OPTIONS() {
  return withCors(new NextResponse(null, { status: 204 }));
}

export async function GET() {
  const settings = await getDesktopLocalNodeSettings();
  return withCors(
    NextResponse.json({
      ok: true,
      settings,
    }),
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const settings = await updateDesktopLocalNodeSettings({
    storageQuotaBytes: typeof body.storageQuotaBytes === "number" ? body.storageQuotaBytes : undefined,
    bandwidthLimitKbps: typeof body.bandwidthLimitKbps === "number" ? body.bandwidthLimitKbps : undefined,
    autoAcceptNewBags: typeof body.autoAcceptNewBags === "boolean" ? body.autoAcceptNewBags : undefined,
    prioritizeTelegramDelivery:
      typeof body.prioritizeTelegramDelivery === "boolean"
        ? body.prioritizeTelegramDelivery
        : undefined,
    seedingStrategy:
      body.seedingStrategy === "balanced" ||
      body.seedingStrategy === "throughput" ||
      body.seedingStrategy === "conservative"
        ? body.seedingStrategy
        : undefined,
  });

  return withCors(
    NextResponse.json({
      ok: true,
      settings,
    }),
  );
}
