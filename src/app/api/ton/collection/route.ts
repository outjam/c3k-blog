import { NextResponse } from "next/server";

import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import {
  getActiveTonRuntimeCollectionAddress,
  getCurrentTonRuntimeNetwork,
  getTonRuntimeConfig,
  isTonRuntimeConfigForActiveNetwork,
  setTonRuntimeCollectionAddress,
} from "@/lib/server/ton-runtime-config-store";
import { resolveTonNftCollectionAddress } from "@/lib/server/ton-nft-reference";
import { deploySponsoredNftCollection, getSponsoredRelayConfigStatus } from "@/lib/server/ton-sponsored-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const assertAdminAccess = (request: Request): NextResponse | null => {
  const adminKey = process.env.TELEGRAM_ADMIN_KEY;

  if (!adminKey) {
    return null;
  }

  const authorization = (request.headers.get("authorization") ?? "").trim();
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length).trim() : "";
  const fromHeader = request.headers.get("x-admin-key");
  const fromQuery = new URL(request.url).searchParams.get("key");

  if (fromHeader === adminKey || fromQuery === adminKey || bearer === adminKey) {
    return null;
  }

  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
};

export async function GET(request: Request) {
  const unauthorized = assertAdminAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  try {
    const runtimeConfig = await getTonRuntimeConfig();
    const activeNetwork = getCurrentTonRuntimeNetwork();
    const activeRuntimeCollectionAddress = getActiveTonRuntimeCollectionAddress(runtimeConfig);
    const activeCollectionAddress = activeRuntimeCollectionAddress || resolveTonNftCollectionAddress();
    const relayConfig = getSponsoredRelayConfigStatus(activeCollectionAddress);

    return NextResponse.json({
      ok: true,
      activeNetwork,
      runtimeConfig,
      runtimeNetworkMatches: isTonRuntimeConfigForActiveNetwork(runtimeConfig),
      envCollectionAddress: resolveTonNftCollectionAddress() || null,
      activeCollectionAddress: activeCollectionAddress || null,
      relayConfig,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to load TON collection status",
      },
      { status: 502 },
    );
  }
}

export async function POST(request: Request) {
  const unauthorized = assertAdminAccess(request);

  if (unauthorized) {
    return unauthorized;
  }

  const activeNetwork = getCurrentTonRuntimeNetwork();
  const url = new URL(request.url);
  const fromQuery = (url.searchParams.get("confirmNetwork") ?? "").trim().toLowerCase();
  const fromBody = request.headers
    .get("content-type")
    ?.toLowerCase()
    .includes("application/json")
    ? String(
        ((await request.clone().json().catch(() => null)) as { confirmNetwork?: unknown } | null)?.confirmNetwork ?? "",
      )
        .trim()
        .toLowerCase()
    : "";
  const confirmNetwork = fromBody || fromQuery;

  if (confirmNetwork !== activeNetwork) {
    return NextResponse.json(
      {
        ok: false,
        error: `TON collection deploy requires confirmNetwork=${activeNetwork}.`,
      },
      { status: 409 },
    );
  }

  const publicBaseUrl = resolvePublicBaseUrl(request);

  if (!publicBaseUrl) {
    return NextResponse.json(
      {
        ok: false,
        error: "Missing TELEGRAM_WEBHOOK_BASE_URL or NEXT_PUBLIC_APP_URL (or VERCEL_URL).",
      },
      { status: 500 },
    );
  }

  try {
    const runtimeConfig = await getTonRuntimeConfig();
    const activeRuntimeCollectionAddress = getActiveTonRuntimeCollectionAddress(runtimeConfig);
    const deployResult = await deploySponsoredNftCollection({
      collectionMetadataUrl: `${publicBaseUrl}/api/ton/nft/metadata/collection`,
      collectionAddress: activeRuntimeCollectionAddress,
    });
    const savedConfig = await setTonRuntimeCollectionAddress(
      deployResult.collectionAddress,
      new Date().toISOString(),
      getCurrentTonRuntimeNetwork(),
    );

    return NextResponse.json({
      ok: true,
      activeNetwork,
      deploy: deployResult,
      runtimeConfig: savedConfig,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to deploy TON NFT collection",
      },
      { status: 502 },
    );
  }
}
