import { NextResponse } from "next/server";

import { runTestStorageIngest } from "@/lib/server/storage-ingest";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface IngestBody {
  assetIds?: unknown;
  onlyMissingBags?: unknown;
  limit?: unknown;
}

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeAssetIds = (value: unknown): string[] => {
  return Array.isArray(value)
    ? Array.from(
        new Set(
          value
            .map((entry) => normalizeSafeId(entry, 120))
            .filter(Boolean),
        ),
      )
    : [];
};

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();

    if (["1", "true", "yes", "on"].includes(normalized)) {
      return true;
    }

    if (["0", "false", "no", "off"].includes(normalized)) {
      return false;
    }
  }

  return fallback;
};

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

  let payload: IngestBody;

  try {
    payload = (await request.json()) as IngestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const result = await runTestStorageIngest({
    assetIds: normalizeAssetIds(payload.assetIds),
    onlyMissingBags: normalizeBoolean(payload.onlyMissingBags, true),
    limit: normalizePositiveInt(payload.limit, 25),
    requestedByTelegramUserId: auth.telegramUserId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.message }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    ...result.summary,
  });
}
