import { NextResponse } from "next/server";

import { listStorageNodes, upsertStorageNode } from "@/lib/server/storage-registry-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import type { StorageNode } from "@/types/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface NodeBody {
  id?: unknown;
  userTelegramId?: unknown;
  walletAddress?: unknown;
  nodeLabel?: unknown;
  publicLabel?: unknown;
  city?: unknown;
  countryCode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  nodeType?: unknown;
  platform?: unknown;
  status?: unknown;
  diskAllocatedBytes?: unknown;
  diskUsedBytes?: unknown;
  bandwidthLimitKbps?: unknown;
  lastSeenAt?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeTelegramUserId = (value: unknown): number | undefined => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeNumber = (value: unknown): number | undefined => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
};

const normalizeNodeType = (value: unknown): StorageNode["nodeType"] | undefined => {
  return value === "owned_provider" || value === "partner_provider" || value === "community_node" ? value : undefined;
};

const normalizeNodePlatform = (value: unknown): StorageNode["platform"] | undefined => {
  return value === "macos" || value === "windows" || value === "linux" ? value : undefined;
};

const normalizeNodeStatus = (value: unknown): StorageNode["status"] | undefined => {
  return value === "candidate" || value === "active" || value === "degraded" || value === "suspended"
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

  const nodes = await listStorageNodes();
  return NextResponse.json({ nodes });
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

  let payload: NodeBody;

  try {
    payload = (await request.json()) as NodeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nodeLabel = normalizeText(payload.nodeLabel, 120);

  if (!nodeLabel) {
    return NextResponse.json({ error: "nodeLabel is required" }, { status: 400 });
  }

  const node = await upsertStorageNode({
    id: normalizeText(payload.id, 120) || undefined,
    userTelegramId: normalizeTelegramUserId(payload.userTelegramId),
    walletAddress: normalizeText(payload.walletAddress, 160) || undefined,
    nodeLabel,
    publicLabel: normalizeText(payload.publicLabel, 120) || undefined,
    city: normalizeText(payload.city, 120) || undefined,
    countryCode: normalizeText(payload.countryCode, 8) || undefined,
    latitude: normalizeNumber(payload.latitude),
    longitude: normalizeNumber(payload.longitude),
    nodeType: normalizeNodeType(payload.nodeType),
    platform: normalizeNodePlatform(payload.platform),
    status: normalizeNodeStatus(payload.status),
    diskAllocatedBytes: normalizeNumber(payload.diskAllocatedBytes),
    diskUsedBytes: normalizeNumber(payload.diskUsedBytes),
    bandwidthLimitKbps: normalizeNumber(payload.bandwidthLimitKbps),
    lastSeenAt:
      payload.lastSeenAt === null ? null : normalizeText(payload.lastSeenAt, 120) || undefined,
  });

  if (!node) {
    return NextResponse.json({ error: "Failed to upsert storage node" }, { status: 500 });
  }

  return NextResponse.json({ node });
}
