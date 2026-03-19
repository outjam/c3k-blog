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
import { readArtistCatalogSnapshot, upsertArtistProfiles } from "@/lib/server/artist-catalog-store";
import {
  readArtistFinanceSnapshot,
  upsertArtistPayoutAuditEntries,
  upsertArtistPayoutRequestRecord,
} from "@/lib/server/artist-finance-store";
import { applyArtistFinanceOverlay, syncArtistFinanceCountersInConfig } from "@/lib/server/shop-artist-studio";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ArtistPayoutAuditEntry, ArtistPayoutRequest } from "@/types/shop";

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

  return NextResponse.json({
    payoutRequests,
    payoutAuditEntries: finance.payoutAuditEntries,
    source: finance.source,
  });
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

  const config = await readShopAdminConfig();
  const [financeSnapshot, artistCatalog] = await Promise.all([
    readArtistFinanceSnapshot({ config }),
    readArtistCatalogSnapshot({ config, profileLimit: 5000, trackLimit: 1 }),
  ]);
  const normalizedRequestById = new Map(financeSnapshot.payoutRequests.map((entry) => [entry.id, entry]));
  const normalizedProfileByArtistId = new Map(artistCatalog.profiles.map((entry) => [entry.telegramUserId, entry]));
  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const index = current.artistPayoutRequests.findIndex((entry) => entry.id === id);
    const fallbackRequest = normalizedRequestById.get(id) ?? null;

    if (index < 0 && !fallbackRequest) {
      throw new Error("request_not_found");
    }

    const requestRecord = index >= 0 ? current.artistPayoutRequests[index] : fallbackRequest;
    if (!requestRecord) {
      throw new Error("request_not_found");
    }
    const nextAuditEntries = [...current.artistPayoutAuditLog];
    const statusChanged = requestRecord.status !== status;
    const noteChanged = (requestRecord.adminNote ?? "") !== (adminNote ?? "");

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
    if (index >= 0) {
      nextRequests[index] = nextRequest;
    } else {
      nextRequests.unshift(nextRequest);
    }

    if (statusChanged || noteChanged) {
      const auditEntry: ArtistPayoutAuditEntry = {
        id: `artist-payout-audit-${requestRecord.id}-${Date.now()}-${statusChanged ? "status" : "note"}`,
        payoutRequestId: requestRecord.id,
        artistTelegramUserId: requestRecord.artistTelegramUserId,
        actor: "admin",
        actorTelegramUserId: auth.telegramUserId,
        action: statusChanged ? "status_changed" : "note_updated",
        statusBefore: statusChanged ? requestRecord.status : undefined,
        statusAfter: statusChanged ? status : requestRecord.status,
        note: adminNote,
        createdAt: now,
      };
      nextAuditEntries.unshift(auditEntry);
    }

    return syncArtistFinanceCountersInConfig(
      {
        ...current,
        artistPayoutRequests: nextRequests,
        artistPayoutAuditLog: nextAuditEntries.slice(0, 20000),
        updatedAt: now,
      },
      [requestRecord.artistTelegramUserId],
    );
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
  const fallbackProfile = payoutRequest ? normalizedProfileByArtistId.get(payoutRequest.artistTelegramUserId) ?? null : null;
  const nextProfile = payoutRequest
    ? applyArtistFinanceOverlay({
        profile: updated.artistProfiles[String(payoutRequest.artistTelegramUserId)] ?? fallbackProfile,
        earnings: updated.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === payoutRequest.artistTelegramUserId),
        requests: updated.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === payoutRequest.artistTelegramUserId),
      })
    : null;
  const payoutAuditEntry =
    updated.artistPayoutAuditLog.find(
      (entry) =>
        entry.payoutRequestId === id &&
        entry.actor === "admin" &&
        entry.actorTelegramUserId === auth.telegramUserId &&
        entry.createdAt === now,
    ) ?? null;

  if (payoutRequest) {
    await upsertArtistPayoutRequestRecord(payoutRequest).catch(() => undefined);
    if (nextProfile) {
      await upsertArtistProfiles([nextProfile]).catch(() => undefined);
    }
    if (payoutAuditEntry) {
      await upsertArtistPayoutAuditEntries([payoutAuditEntry]).catch(() => undefined);
      await notifyUserAboutArtistPayoutStatus(payoutRequest, resolvePublicBaseUrl(request));
    }
  }

  return NextResponse.json({ payoutRequest, payoutAuditEntry });
}
