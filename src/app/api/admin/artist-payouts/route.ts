import { NextResponse } from "next/server";

import { notifyUserAboutArtistPayoutStatus } from "@/lib/server/shop-artist-notify";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import {
  readArtistFinanceSnapshot,
  upsertArtistPayoutRequestRecord,
} from "@/lib/server/artist-finance-store";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistPayoutRequest } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  id?: string;
  status?: ArtistPayoutRequest["status"];
  adminNote?: string;
}

const normalizeId = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const normalizeStatus = (value: unknown): ArtistPayoutRequest["status"] | null => {
  if (value === "pending_review" || value === "approved" || value === "rejected" || value === "paid") {
    return value;
  }

  return null;
};

const normalizeNote = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim().slice(0, 240);
  return normalized || undefined;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "artists:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();
  const finance = await readArtistFinanceSnapshot({ config });
  const payoutRequests = [...finance.payoutRequests].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });

  return NextResponse.json({ payoutRequests });
}

export async function PATCH(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "artists:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: PatchBody;
  try {
    payload = (await request.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = normalizeId(payload.id);
  const status = normalizeStatus(payload.status);
  const adminNote = normalizeNote(payload.adminNote);

  if (!id || !status) {
    return NextResponse.json({ error: "id and valid status are required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const index = current.artistPayoutRequests.findIndex((entry) => entry.id === id);

    if (index < 0) {
      throw new Error("request_not_found");
    }

    const requestRecord = current.artistPayoutRequests[index];
    const nextRequest: ArtistPayoutRequest = {
      ...requestRecord,
      status,
      adminNote,
      updatedAt: now,
      reviewedAt: status === "pending_review" ? undefined : now,
      reviewedByTelegramUserId: status === "pending_review" ? undefined : auth.telegramUserId,
      paidAt: status === "paid" ? now : requestRecord.paidAt,
    };

    const nextRequests = [...current.artistPayoutRequests];
    nextRequests[index] = nextRequest;

    const nextProfiles = { ...current.artistProfiles };
    const artistProfile = nextProfiles[String(requestRecord.artistTelegramUserId)];

    if (artistProfile && requestRecord.status !== "paid" && status === "paid") {
      nextProfiles[String(requestRecord.artistTelegramUserId)] = {
        ...artistProfile,
        balanceStarsCents: Math.max(0, artistProfile.balanceStarsCents - requestRecord.amountStarsCents),
        updatedAt: now,
      };
    }

    return {
      ...current,
      artistPayoutRequests: nextRequests,
      artistProfiles: nextProfiles,
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "request_not_found") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    return NextResponse.json({ error: "Payout request not found" }, { status: 404 });
  }

  const payoutRequest = updated.artistPayoutRequests.find((entry) => entry.id === id) ?? null;

  if (payoutRequest) {
    await upsertArtistPayoutRequestRecord(payoutRequest).catch(() => undefined);
    await notifyUserAboutArtistPayoutStatus(payoutRequest, resolvePublicBaseUrl(request));
  }

  return NextResponse.json({ payoutRequest });
}
