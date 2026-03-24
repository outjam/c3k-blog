import { NextResponse } from "next/server";

import {
  getStorageNode,
  getStorageProgramMembership,
  upsertStorageNode,
} from "@/lib/server/storage-registry-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ClaimLocalNodeBody {
  nodeId?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
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

  let payload: ClaimLocalNodeBody;

  try {
    payload = (await request.json()) as ClaimLocalNodeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const nodeId = normalizeText(payload.nodeId, 120);

  if (!nodeId) {
    return NextResponse.json({ error: "nodeId is required" }, { status: 400 });
  }

  const membership = await getStorageProgramMembership(auth.telegramUserId);

  if (!membership) {
    return NextResponse.json(
      { error: "Join storage program first before claiming a desktop node." },
      { status: 409 },
    );
  }

  if (membership.status === "rejected" || membership.status === "suspended") {
    return NextResponse.json(
      { error: "Storage program membership is not active for this account." },
      { status: 409 },
    );
  }

  const node = await getStorageNode(nodeId);

  if (!node) {
    return NextResponse.json({ error: "Storage node not found" }, { status: 404 });
  }

  const updated = await upsertStorageNode({
    id: node.id,
    userTelegramId: auth.telegramUserId,
    walletAddress: membership.walletAddress ?? node.walletAddress,
    nodeLabel: node.nodeLabel,
    publicLabel: node.publicLabel,
    city: node.city,
    countryCode: node.countryCode,
    latitude: node.latitude,
    longitude: node.longitude,
    nodeType: node.nodeType,
    platform: node.platform,
    status: node.status,
    diskAllocatedBytes: node.diskAllocatedBytes,
    diskUsedBytes: node.diskUsedBytes,
    bandwidthLimitKbps: node.bandwidthLimitKbps,
    lastSeenAt: node.lastSeenAt ?? new Date().toISOString(),
  });

  if (!updated) {
    return NextResponse.json({ error: "Failed to claim local desktop node" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    node: updated,
    membership,
  });
}
