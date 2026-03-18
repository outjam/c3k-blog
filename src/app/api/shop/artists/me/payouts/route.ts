import { NextResponse } from "next/server";

import { notifyAdminsAboutArtistPayoutRequest } from "@/lib/server/shop-artist-notify";
import {
  ARTIST_PAYOUT_MIN_STARS_CENTS,
  buildArtistPayoutSummary,
} from "@/lib/server/shop-artist-studio";
import {
  readArtistFinanceSnapshot,
  upsertArtistPayoutAuditEntries,
  upsertArtistPayoutRequestRecord,
} from "@/lib/server/artist-finance-store";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import type { ArtistPayoutAuditEntry, ArtistPayoutRequest } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CreatePayoutBody {
  amountStarsCents?: number;
  note?: string;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const config = await readShopAdminConfig();
  const profile = config.artistProfiles[String(auth.telegramUserId)] ?? null;
  const finance = await readArtistFinanceSnapshot({
    config,
    artistTelegramUserId: auth.telegramUserId,
  });
  const payoutRequests = finance.payoutRequests;
  const payoutAuditEntries = finance.payoutAuditEntries;
  const payoutSummary = buildArtistPayoutSummary({
    profile,
    earnings: finance.earnings,
    requests: payoutRequests,
  });

  return NextResponse.json({
    profile,
    payoutRequests,
    payoutAuditEntries,
    payoutSummary,
  });
}

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: CreatePayoutBody;
  try {
    payload = (await request.json()) as CreatePayoutBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const config = await readShopAdminConfig();
  const profile = config.artistProfiles[String(auth.telegramUserId)] ?? null;

  if (!profile || profile.status !== "approved") {
    return NextResponse.json({ error: "Artist profile must be approved first" }, { status: 409 });
  }

  if (!profile.tonWalletAddress) {
    return NextResponse.json({ error: "TON wallet is required for payout requests" }, { status: 409 });
  }

  const finance = await readArtistFinanceSnapshot({
    config,
    artistTelegramUserId: auth.telegramUserId,
  });
  const payoutSummary = buildArtistPayoutSummary({
    profile,
    earnings: finance.earnings,
    requests: finance.payoutRequests,
  });

  const requestedAmount = Math.max(0, Math.round(Number(payload.amountStarsCents ?? 0)));

  if (requestedAmount < ARTIST_PAYOUT_MIN_STARS_CENTS) {
    return NextResponse.json(
      { error: "Минимальный запрос на вывод: 1000 STARS" },
      { status: 400 },
    );
  }

  if (requestedAmount > payoutSummary.availableStarsCents) {
    return NextResponse.json({ error: "Requested amount exceeds available balance" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const requestId = `artist-payout-${auth.telegramUserId}-${Date.now()}`;
  const auditEntryId = `artist-payout-audit-${requestId}-requested`;
  const updated = await mutateShopAdminConfig((current) => {
    const requestRecord: ArtistPayoutRequest = {
      id: requestId,
      artistTelegramUserId: auth.telegramUserId,
      tonWalletAddress: profile.tonWalletAddress!,
      amountStarsCents: requestedAmount,
      note: normalizeText(payload.note, 1200) || undefined,
      status: "pending_review",
      adminNote: undefined,
      createdAt: now,
      updatedAt: now,
      reviewedAt: undefined,
      reviewedByTelegramUserId: undefined,
      paidAt: undefined,
    };

    const auditEntry: ArtistPayoutAuditEntry = {
      id: auditEntryId,
      payoutRequestId: requestRecord.id,
      artistTelegramUserId: auth.telegramUserId,
      actor: "artist",
      actorTelegramUserId: auth.telegramUserId,
      action: "requested",
      statusAfter: "pending_review",
      note: requestRecord.note,
      createdAt: now,
    };

    return {
      ...current,
      artistPayoutRequests: [requestRecord, ...current.artistPayoutRequests].slice(0, 5000),
      artistPayoutAuditLog: [auditEntry, ...current.artistPayoutAuditLog].slice(0, 20000),
      updatedAt: now,
    };
  });

  const payoutRequest = updated.artistPayoutRequests.find((entry) => entry.id === requestId) ?? null;
  const payoutAuditEntry = updated.artistPayoutAuditLog.find((entry) => entry.id === auditEntryId) ?? null;

  if (payoutRequest) {
    await upsertArtistPayoutRequestRecord(payoutRequest).catch(() => undefined);
    if (payoutAuditEntry) {
      await upsertArtistPayoutAuditEntries([payoutAuditEntry]).catch(() => undefined);
    }
    await notifyAdminsAboutArtistPayoutRequest(
      payoutRequest,
      updated.artistProfiles[String(auth.telegramUserId)] ?? null,
      resolvePublicBaseUrl(request),
    );
  }

  return NextResponse.json({ payoutRequest, payoutAuditEntry });
}
