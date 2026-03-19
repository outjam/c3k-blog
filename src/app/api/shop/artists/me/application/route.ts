import { NextResponse } from "next/server";

import { readArtistCatalogSnapshot, hydrateArtistCatalogStateInConfig } from "@/lib/server/artist-catalog-store";
import { readArtistApplicationSnapshot, hydrateArtistApplicationsInConfig, upsertArtistApplications } from "@/lib/server/artist-application-store";
import { notifyAdminsAboutArtistApplication } from "@/lib/server/shop-artist-notify";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import type { ArtistApplication } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ApplicationBody {
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  coverUrl?: string;
  tonWalletAddress?: string;
  referenceLinks?: string[];
  note?: string;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeReferenceLinks = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => normalizeText(entry, 3000)).filter(Boolean).slice(0, 8);
};

export async function GET(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const config = await readShopAdminConfig();
  const [artistCatalog, applications] = await Promise.all([
    readArtistCatalogSnapshot({
      config,
      artistTelegramUserId: auth.telegramUserId,
      profileLimit: 1,
      trackLimit: 1,
    }),
    readArtistApplicationSnapshot({
      config,
      telegramUserId: auth.telegramUserId,
    }),
  ]);
  const profile = artistCatalog.profiles[0] ?? null;
  const application = applications.applications[0] ?? null;

  return NextResponse.json({
    profile,
    application,
    source: applications.source,
    artistSource: artistCatalog.source,
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

  let payload: ApplicationBody;

  try {
    payload = (await request.json()) as ApplicationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const displayName = normalizeText(payload.displayName || auth.firstName || auth.username || "", 120);
  const tonWalletAddress = normalizeText(payload.tonWalletAddress, 128);

  if (!displayName) {
    return NextResponse.json({ error: "displayName is required" }, { status: 400 });
  }

  if (!tonWalletAddress) {
    return NextResponse.json({ error: "tonWalletAddress is required" }, { status: 400 });
  }

  const config = await readShopAdminConfig();
  const [artistCatalog, applicationsSnapshot] = await Promise.all([
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
  ]);
  const fallbackProfile = artistCatalog.profiles[0] ?? null;
  const fallbackApplication = applicationsSnapshot.applications[0] ?? null;
  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const hydratedCurrent = hydrateArtistApplicationsInConfig(
      hydrateArtistCatalogStateInConfig(current, {
        profiles: fallbackProfile ? [fallbackProfile] : [],
      }),
      fallbackApplication ? [fallbackApplication] : [],
    );
    const existingProfile = hydratedCurrent.artistProfiles[String(auth.telegramUserId)] ?? fallbackProfile;
    if (existingProfile?.status === "approved") {
      throw new Error("already_approved");
    }

    const existing = hydratedCurrent.artistApplications[String(auth.telegramUserId)] ?? fallbackApplication;
    const application: ArtistApplication = {
      id: existing?.id || `artist-application-${auth.telegramUserId}`,
      telegramUserId: auth.telegramUserId,
      displayName,
      bio: normalizeText(payload.bio, 1200),
      avatarUrl: normalizeOptionalText(payload.avatarUrl, 3000),
      coverUrl: normalizeOptionalText(payload.coverUrl, 3000),
      tonWalletAddress,
      referenceLinks: normalizeReferenceLinks(payload.referenceLinks),
      note: normalizeOptionalText(payload.note, 1200),
      status: "pending",
      moderationNote: undefined,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      reviewedAt: undefined,
    };

    return {
      ...hydratedCurrent,
      artistApplications: {
        ...hydratedCurrent.artistApplications,
        [String(auth.telegramUserId)]: application,
      },
      updatedAt: now,
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "already_approved") {
      return message;
    }

    throw error;
  });

  if (typeof updated === "string") {
    return NextResponse.json({ error: "Профиль артиста уже подтверждён." }, { status: 409 });
  }

  const application = updated.artistApplications[String(auth.telegramUserId)] ?? null;
  if (application) {
    await upsertArtistApplications([application]).catch(() => undefined);
    await notifyAdminsAboutArtistApplication(application, resolvePublicBaseUrl(request));
  }

  return NextResponse.json({ application });
}
