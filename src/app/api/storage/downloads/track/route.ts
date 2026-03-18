import { NextResponse } from "next/server";

import { requestTrackStorageDelivery } from "@/lib/server/storage-delivery";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import type { StorageDeliveryChannel } from "@/types/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface TrackDownloadBody {
  releaseSlug?: unknown;
  trackId?: unknown;
  requestedFormat?: unknown;
  channel?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeChannel = (value: unknown): StorageDeliveryChannel => {
  return value === "telegram_bot" || value === "desktop_download"
    ? value
    : "web_download";
};

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: TrackDownloadBody;

  try {
    payload = (await request.json()) as TrackDownloadBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const releaseSlug = normalizeText(payload.releaseSlug, 120);
  const trackId = normalizeText(payload.trackId, 120);

  if (!releaseSlug || !trackId) {
    return NextResponse.json({ error: "releaseSlug and trackId are required" }, { status: 400 });
  }

  const result = await requestTrackStorageDelivery({
    telegramUserId: auth.telegramUserId,
    releaseSlug,
    trackId,
    requestedFormat: normalizeText(payload.requestedFormat, 32) || undefined,
    channel: normalizeChannel(payload.channel),
    publicBaseUrl: resolvePublicBaseUrl(request) ?? undefined,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
