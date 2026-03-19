import { NextResponse } from "next/server";

import { readArtistApplicationSnapshot } from "@/lib/server/artist-application-store";
import { readArtistCatalogSnapshot } from "@/lib/server/artist-catalog-store";
import { notifyAdminsAboutArtistPayoutRequest } from "@/lib/server/shop-artist-notify";
import {
  ARTIST_PAYOUT_MIN_STARS_CENTS,
  applyArtistFinanceOverlay,
  buildArtistPayoutSummary,
  hydrateArtistFinanceStateInConfig,
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
  const [artistCatalog, finance] = await Promise.all([
    readArtistCatalogSnapshot({
      config,
      artistTelegramUserId: auth.telegramUserId,
      profileLimit: 1,
      trackLimit: 1,
    }),
    readArtistFinanceSnapshot({
      config,
      artistTelegramUserId: auth.telegramUserId,
    }),
  ]);
  const profile = artistCatalog.profiles[0] ?? null;
  const payoutRequests = finance.payoutRequests;
  const payoutAuditEntries = finance.payoutAuditEntries;
  const payoutSummary = buildArtistPayoutSummary({
    profile,
    earnings: finance.earnings,
    requests: payoutRequests,
  });
  const financeAwareProfile = applyArtistFinanceOverlay({
    profile,
    earnings: finance.earnings,
    requests: payoutRequests,
  });

  return NextResponse.json({
    profile: financeAwareProfile,
    payoutRequests,
    payoutAuditEntries,
    payoutSummary,
    artistSource: artistCatalog.source,
    financeSource: finance.source,
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
  const [artistCatalog, applications, finance] = await Promise.all([
    readArtistCatalogSnapshot({
      config,
      artistTelegramUserId: auth.telegramUserId,
      profileLimit: 1,
      trackLimit: 1,
    }),
    readArtistApplicationSnapshot({
      config,
      telegramUserId: auth.telegramUserId,
      limit: 1,
    }),
    readArtistFinanceSnapshot({
      config,
      artistTelegramUserId: auth.telegramUserId,
    }),
  ]);

  const profile = artistCatalog.profiles[0] ?? null;
  const latestApplication = applications.applications[0] ?? null;

  if (!profile || profile.status !== "approved") {
    return NextResponse.json({ error: "Artist profile must be approved first" }, { status: 409 });
  }

  if (!profile.tonWalletAddress) {
    return NextResponse.json({ error: "TON wallet is required for payout requests" }, { status: 409 });
  }

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
    const hydratedCurrent = hydrateArtistFinanceStateInConfig(current, {
      earnings: finance.earnings,
      requests: finance.payoutRequests,
      auditEntries: finance.payoutAuditEntries,
    });
    const currentProfile =
      hydratedCurrent.artistProfiles[String(auth.telegramUserId)] ??
      (profile
        ? {
            ...profile,
            balanceStarsCents: profile.balanceStarsCents ?? 0,
            lifetimeEarningsStarsCents: profile.lifetimeEarningsStarsCents ?? 0,
          }
        : null);

    if (!currentProfile || currentProfile.status !== "approved") {
      throw new Error("artist_profile_required");
    }

    const overlayProfile =
      applyArtistFinanceOverlay({
        profile: currentProfile,
        earnings: hydratedCurrent.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId),
        requests: hydratedCurrent.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId),
      }) ?? currentProfile;
    const currentPayoutSummary = buildArtistPayoutSummary({
      profile: overlayProfile,
      earnings: hydratedCurrent.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId),
      requests: hydratedCurrent.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === auth.telegramUserId),
    });

    if (!overlayProfile.tonWalletAddress) {
      throw new Error("ton_wallet_required");
    }

    if (requestedAmount < ARTIST_PAYOUT_MIN_STARS_CENTS) {
      throw new Error("amount_below_minimum");
    }

    if (requestedAmount > currentPayoutSummary.availableStarsCents) {
      throw new Error("amount_exceeds_available");
    }

    const requestRecord: ArtistPayoutRequest = {
      id: requestId,
      artistTelegramUserId: auth.telegramUserId,
      tonWalletAddress: overlayProfile.tonWalletAddress,
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
      ...hydratedCurrent,
      artistPayoutRequests: [requestRecord, ...hydratedCurrent.artistPayoutRequests].slice(0, 5000),
      artistPayoutAuditLog: [auditEntry, ...hydratedCurrent.artistPayoutAuditLog].slice(0, 20000),
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    return message;
  });

  if (typeof updated === "string") {
    if (updated === "artist_profile_required") {
      return NextResponse.json({ error: "Artist profile must be approved first" }, { status: 409 });
    }
    if (updated === "ton_wallet_required") {
      return NextResponse.json({ error: "TON wallet is required for payout requests" }, { status: 409 });
    }
    if (updated === "amount_below_minimum") {
      return NextResponse.json({ error: "Минимальный запрос на вывод: 1000 STARS" }, { status: 400 });
    }
    if (updated === "amount_exceeds_available") {
      return NextResponse.json({ error: "Requested amount exceeds available balance" }, { status: 409 });
    }

    throw new Error(updated);
  }

  const payoutRequest = updated.artistPayoutRequests.find((entry) => entry.id === requestId) ?? null;
  const payoutAuditEntry = updated.artistPayoutAuditLog.find((entry) => entry.id === auditEntryId) ?? null;

  if (payoutRequest) {
    await upsertArtistPayoutRequestRecord(payoutRequest).catch(() => undefined);
    if (payoutAuditEntry) {
      await upsertArtistPayoutAuditEntries([payoutAuditEntry]).catch(() => undefined);
    }
    await notifyAdminsAboutArtistPayoutRequest(
      payoutRequest,
      updated.artistProfiles[String(auth.telegramUserId)] ?? profile,
      resolvePublicBaseUrl(request),
    );
  }

  return NextResponse.json({
    payoutRequest,
    payoutAuditEntry,
    artistSource: artistCatalog.source,
    financeSource: finance.source,
    applicationSource: applications.source,
    application: latestApplication,
  });
}
