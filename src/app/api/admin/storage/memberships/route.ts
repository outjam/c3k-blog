import { NextResponse } from "next/server";

import { listStorageMemberships, updateStorageMembership } from "@/lib/server/storage-registry-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import type { StorageProgramMembership } from "@/types/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface MembershipBody {
  telegramUserId?: unknown;
  status?: unknown;
  tier?: unknown;
  moderationNote?: unknown;
  walletAddress?: unknown;
}

const normalizeTelegramUserId = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeMembershipStatus = (value: unknown): StorageProgramMembership["status"] | undefined => {
  return value === "pending" || value === "approved" || value === "rejected" || value === "suspended"
    ? value
    : undefined;
};

const normalizeMembershipTier = (value: unknown): StorageProgramMembership["tier"] | undefined => {
  return value === "supporter" || value === "keeper" || value === "core" || value === "guardian"
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

  const memberships = await listStorageMemberships();
  return NextResponse.json({ memberships });
}

export async function PATCH(request: Request) {
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

  let payload: MembershipBody;

  try {
    payload = (await request.json()) as MembershipBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = normalizeTelegramUserId(payload.telegramUserId);

  if (!telegramUserId) {
    return NextResponse.json({ error: "telegramUserId is required" }, { status: 400 });
  }

  const membership = await updateStorageMembership({
    telegramUserId,
    status: normalizeMembershipStatus(payload.status),
    tier: normalizeMembershipTier(payload.tier),
    moderationNote:
      payload.moderationNote === null ? null : normalizeText(payload.moderationNote, 500) || undefined,
    walletAddress:
      payload.walletAddress === null ? null : normalizeText(payload.walletAddress, 160) || undefined,
  });

  if (!membership) {
    return NextResponse.json({ error: "Storage program membership not found" }, { status: 404 });
  }

  return NextResponse.json({ membership });
}
