import { NextResponse } from "next/server";

import { listStorageBags, upsertStorageBag } from "@/lib/server/storage-registry-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import type { StorageBag } from "@/types/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface BagBody {
  id?: unknown;
  assetId?: unknown;
  bagId?: unknown;
  description?: unknown;
  tonstorageUri?: unknown;
  metaFileUrl?: unknown;
  status?: unknown;
  replicasTarget?: unknown;
  replicasActual?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeBagStatus = (value: unknown): StorageBag["status"] | undefined => {
  return value === "draft" ||
    value === "created" ||
    value === "uploaded" ||
    value === "replicating" ||
    value === "healthy" ||
    value === "degraded" ||
    value === "disabled"
    ? value
    : undefined;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "storage:view")) {
    return forbiddenResponse();
  }

  const bags = await listStorageBags();
  return NextResponse.json({ bags });
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

  let payload: BagBody;

  try {
    payload = (await request.json()) as BagBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const assetId = normalizeText(payload.assetId, 120);

  if (!assetId) {
    return NextResponse.json({ error: "assetId is required" }, { status: 400 });
  }

  const bag = await upsertStorageBag({
    id: normalizeText(payload.id, 120) || undefined,
    assetId,
    bagId: normalizeText(payload.bagId, 160) || undefined,
    description: normalizeText(payload.description, 500) || undefined,
    tonstorageUri: normalizeText(payload.tonstorageUri, 500) || undefined,
    metaFileUrl: normalizeText(payload.metaFileUrl, 3000) || undefined,
    status: normalizeBagStatus(payload.status),
    replicasTarget: normalizeNonNegativeInt(payload.replicasTarget),
    replicasActual: normalizeNonNegativeInt(payload.replicasActual),
  });

  if (!bag) {
    return NextResponse.json({ error: "Failed to upsert storage bag" }, { status: 500 });
  }

  return NextResponse.json({ bag });
}
