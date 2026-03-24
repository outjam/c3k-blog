import { NextResponse } from "next/server";

import {
  getStorageNode,
  getStorageProgramMembership,
  upsertStorageNode,
} from "@/lib/server/storage-registry-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface UpdateNodeBody {
  publicLabel?: unknown;
  city?: unknown;
  countryCode?: unknown;
  latitude?: unknown;
  longitude?: unknown;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeNullableText = (value: unknown, maxLength: number): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const normalized = normalizeText(value, maxLength);
  return normalized || null;
};

const normalizeNullableLatitude = (
  value: unknown,
): { value?: number | null; error?: string } => {
  if (value === undefined) {
    return {};
  }

  if (value === null || String(value).trim() === "") {
    return { value: null };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < -90 || parsed > 90) {
    return { error: "Latitude must be between -90 and 90." };
  }

  return { value: parsed };
};

const normalizeNullableLongitude = (
  value: unknown,
): { value?: number | null; error?: string } => {
  if (value === undefined) {
    return {};
  }

  if (value === null || String(value).trim() === "") {
    return { value: null };
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < -180 || parsed > 180) {
    return { error: "Longitude must be between -180 and 180." };
  }

  return { value: parsed };
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const node = await getStorageNode(id);

  if (!node) {
    return NextResponse.json({ error: "Storage node not found" }, { status: 404 });
  }

  if (node.userTelegramId !== auth.telegramUserId) {
    return NextResponse.json({ error: "This storage node is not linked to your account." }, { status: 403 });
  }

  return NextResponse.json({ node });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const { id } = await context.params;
  const node = await getStorageNode(id);

  if (!node) {
    return NextResponse.json({ error: "Storage node not found" }, { status: 404 });
  }

  if (node.userTelegramId !== auth.telegramUserId) {
    return NextResponse.json({ error: "This storage node is not linked to your account." }, { status: 403 });
  }

  const membership = await getStorageProgramMembership(auth.telegramUserId);

  if (!membership) {
    return NextResponse.json(
      { error: "Join storage program first before editing desktop node profile." },
      { status: 409 },
    );
  }

  if (membership.status === "rejected" || membership.status === "suspended") {
    return NextResponse.json(
      { error: "Storage program membership is not active for this account." },
      { status: 409 },
    );
  }

  let payload: UpdateNodeBody;

  try {
    payload = (await request.json()) as UpdateNodeBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const latitude = normalizeNullableLatitude(payload.latitude);

  if (latitude.error) {
    return NextResponse.json({ error: latitude.error }, { status: 400 });
  }

  const longitude = normalizeNullableLongitude(payload.longitude);

  if (longitude.error) {
    return NextResponse.json({ error: longitude.error }, { status: 400 });
  }

  const updated = await upsertStorageNode({
    id: node.id,
    userTelegramId: node.userTelegramId,
    walletAddress: node.walletAddress,
    nodeLabel: node.nodeLabel,
    publicLabel: normalizeNullableText(payload.publicLabel, 120),
    city: normalizeNullableText(payload.city, 120),
    countryCode:
      normalizeNullableText(payload.countryCode, 8)?.toUpperCase() ?? normalizeNullableText(payload.countryCode, 8),
    latitude: latitude.value,
    longitude: longitude.value,
    nodeType: node.nodeType,
    platform: node.platform,
    status: node.status,
    diskAllocatedBytes: node.diskAllocatedBytes,
    diskUsedBytes: node.diskUsedBytes,
    bandwidthLimitKbps: node.bandwidthLimitKbps,
    lastSeenAt: node.lastSeenAt ?? new Date().toISOString(),
  });

  if (!updated) {
    return NextResponse.json({ error: "Failed to update storage node profile" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, node: updated });
}
