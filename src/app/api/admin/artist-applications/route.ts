import { NextResponse } from "next/server";

import {
  readArtistApplicationSnapshot,
  hydrateArtistApplicationsInConfig,
  upsertArtistApplications,
} from "@/lib/server/artist-application-store";
import {
  readArtistCatalogSnapshot,
  hydrateArtistCatalogStateInConfig,
  upsertArtistProfiles,
} from "@/lib/server/artist-catalog-store";
import { readArtistFinanceSnapshot } from "@/lib/server/artist-finance-store";
import { notifyUserAboutArtistApplicationStatus } from "@/lib/server/shop-artist-notify";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { applyArtistFinanceOverlay, hydrateArtistFinanceStateInConfig } from "@/lib/server/shop-artist-studio";
import type { ArtistApplication, ArtistProfile } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PatchBody {
  telegramUserId?: number;
  status?: ArtistApplication["status"];
  moderationNote?: string;
}

const normalizeTelegramUserId = (value: unknown): number => {
  const normalized = Math.round(Number(value ?? 0));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
};

const normalizeStatus = (value: unknown): ArtistApplication["status"] | null => {
  if (value === "pending" || value === "needs_info" || value === "approved" || value === "rejected") {
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
  const applicationsSnapshot = await readArtistApplicationSnapshot({ config });
  const applications = applicationsSnapshot.applications;

  return NextResponse.json({ applications, source: applicationsSnapshot.source });
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

  const telegramUserId = normalizeTelegramUserId(payload.telegramUserId);
  const status = normalizeStatus(payload.status);
  const moderationNote = normalizeNote(payload.moderationNote);

  if (!telegramUserId || !status) {
    return NextResponse.json({ error: "telegramUserId and valid status are required" }, { status: 400 });
  }

  const config = await readShopAdminConfig();
  const [applicationsSnapshot, artistCatalog, financeSnapshot] = await Promise.all([
    readArtistApplicationSnapshot({
      config,
      telegramUserId,
      limit: 1,
    }),
    readArtistCatalogSnapshot({
      config,
      artistTelegramUserId: telegramUserId,
      profileLimit: 1,
      trackLimit: 1,
    }),
    readArtistFinanceSnapshot({
      config,
      artistTelegramUserId: telegramUserId,
      earningsLimit: 20000,
      payoutRequestsLimit: 5000,
      payoutAuditEntriesLimit: 20000,
    }),
  ]);
  const fallbackApplication = applicationsSnapshot.applications[0] ?? null;
  const fallbackProfile = artistCatalog.profiles[0] ?? null;
  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const hydratedCurrent = hydrateArtistFinanceStateInConfig(
      hydrateArtistApplicationsInConfig(
        hydrateArtistCatalogStateInConfig(current, {
          profiles: fallbackProfile ? [fallbackProfile] : [],
        }),
        fallbackApplication ? [fallbackApplication] : [],
      ),
      {
        earnings: financeSnapshot.earnings,
        requests: financeSnapshot.payoutRequests,
        auditEntries: financeSnapshot.payoutAuditEntries,
      },
    );
    const application = hydratedCurrent.artistApplications[String(telegramUserId)] ?? fallbackApplication;

    if (!application) {
      throw new Error("application_not_found");
    }

    const nextApplication: ArtistApplication = {
      ...application,
      status,
      moderationNote,
      updatedAt: now,
      reviewedAt: now,
    };

    const nextProfiles = { ...hydratedCurrent.artistProfiles };
    const currentProfileBase = nextProfiles[String(telegramUserId)] ?? fallbackProfile;
    const currentProfile =
      applyArtistFinanceOverlay({
        profile: currentProfileBase,
        earnings: hydratedCurrent.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === telegramUserId),
        requests: hydratedCurrent.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === telegramUserId),
      }) ?? currentProfileBase;

    if (status === "approved") {
      const nextProfile: ArtistProfile = {
        telegramUserId,
        slug: currentProfile?.slug || `${application.displayName}-${telegramUserId}`.toLowerCase().replace(/[^a-z0-9а-яё_-]+/gi, "-").replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120) || `artist-${telegramUserId}`,
        displayName: application.displayName,
        bio: application.bio,
        avatarUrl: application.avatarUrl,
        coverUrl: application.coverUrl,
        tonWalletAddress: application.tonWalletAddress,
        status: "approved",
        moderationNote,
        donationEnabled: currentProfile?.donationEnabled ?? true,
        subscriptionEnabled: currentProfile?.subscriptionEnabled ?? false,
        subscriptionPriceStarsCents: currentProfile?.subscriptionPriceStarsCents ?? 100,
        balanceStarsCents: currentProfile?.balanceStarsCents ?? 0,
        lifetimeEarningsStarsCents: currentProfile?.lifetimeEarningsStarsCents ?? 0,
        followersCount: currentProfile?.followersCount ?? 0,
        createdAt: currentProfile?.createdAt ?? now,
        updatedAt: now,
      };

      nextProfiles[String(telegramUserId)] = nextProfile;
    } else if (currentProfile && currentProfile.status !== "approved") {
      nextProfiles[String(telegramUserId)] = {
        ...currentProfile,
        status: status === "rejected" ? "rejected" : "pending",
        moderationNote,
        updatedAt: now,
      };
    }

    return {
      ...hydratedCurrent,
      artistApplications: {
        ...hydratedCurrent.artistApplications,
        [String(telegramUserId)]: nextApplication,
      },
      artistProfiles: nextProfiles,
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "application_not_found") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    return NextResponse.json({ error: "Artist application not found" }, { status: 404 });
  }

  const application = updated.artistApplications[String(telegramUserId)] ?? null;
  const profile = updated.artistProfiles[String(telegramUserId)] ?? fallbackProfile;
  const normalizedProfile = profile
    ? applyArtistFinanceOverlay({
        profile,
        earnings: updated.artistEarningsLedger.filter((entry) => entry.artistTelegramUserId === telegramUserId),
        requests: updated.artistPayoutRequests.filter((entry) => entry.artistTelegramUserId === telegramUserId),
      }) ?? profile
    : null;

  if (normalizedProfile) {
    await upsertArtistProfiles([normalizedProfile]).catch(() => undefined);
  }

  if (application) {
    await upsertArtistApplications([application]).catch(() => undefined);
    await notifyUserAboutArtistApplicationStatus(application, normalizedProfile, resolvePublicBaseUrl(request));
  }

  return NextResponse.json({ application, profile: normalizedProfile });
}
