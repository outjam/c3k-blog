import { NextResponse } from "next/server";

import { listStorageAssets, upsertStorageAsset } from "@/lib/server/storage-registry-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import type { StorageAsset } from "@/types/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AssetBody {
  id?: unknown;
  releaseSlug?: unknown;
  trackId?: unknown;
  artistTelegramUserId?: unknown;
  resourceKey?: unknown;
  audioFileId?: unknown;
  assetType?: unknown;
  format?: unknown;
  sourceUrl?: unknown;
  fileName?: unknown;
  mimeType?: unknown;
  sizeBytes?: unknown;
  checksumSha256?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeAssetType = (value: unknown): StorageAsset["assetType"] | null => {
  return value === "audio_master" ||
    value === "audio_preview" ||
    value === "cover" ||
    value === "booklet" ||
    value === "nft_media" ||
    value === "site_bundle"
    ? value
    : null;
};

const normalizeAssetFormat = (value: unknown): StorageAsset["format"] | null => {
  return value === "aac" ||
    value === "alac" ||
    value === "mp3" ||
    value === "ogg" ||
    value === "wav" ||
    value === "flac" ||
    value === "zip" ||
    value === "png" ||
    value === "json" ||
    value === "html_bundle"
    ? value
    : null;
};

const normalizeTelegramUserId = (value: unknown): number | undefined => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:view")) {
    return forbiddenResponse();
  }

  const assets = await listStorageAssets();
  return NextResponse.json({ assets });
}

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: AssetBody;

  try {
    payload = (await request.json()) as AssetBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const assetType = normalizeAssetType(payload.assetType);
  const format = normalizeAssetFormat(payload.format);

  if (!assetType || !format) {
    return NextResponse.json({ error: "assetType and format are required" }, { status: 400 });
  }

  const asset = await upsertStorageAsset({
    id: normalizeText(payload.id, 120) || undefined,
    releaseSlug: normalizeText(payload.releaseSlug, 120) || undefined,
    trackId: normalizeText(payload.trackId, 120) || undefined,
    artistTelegramUserId: normalizeTelegramUserId(payload.artistTelegramUserId),
    resourceKey: normalizeText(payload.resourceKey, 240) || undefined,
    audioFileId: normalizeText(payload.audioFileId, 160) || undefined,
    assetType,
    format,
    sourceUrl: normalizeText(payload.sourceUrl, 3000) || undefined,
    fileName: normalizeText(payload.fileName, 255) || undefined,
    mimeType: normalizeText(payload.mimeType, 180) || undefined,
    sizeBytes: normalizeNonNegativeInt(payload.sizeBytes),
    checksumSha256: normalizeText(payload.checksumSha256, 128) || undefined,
  });

  if (!asset) {
    return NextResponse.json({ error: "Failed to upsert storage asset" }, { status: 500 });
  }

  return NextResponse.json({ asset });
}
