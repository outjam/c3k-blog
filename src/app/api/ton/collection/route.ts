import { NextResponse } from "next/server";

import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { getTonRuntimeConfig, setTonRuntimeCollectionAddress } from "@/lib/server/ton-runtime-config-store";
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
    const activeCollectionAddress = runtimeConfig?.collectionAddress || resolveTonNftCollectionAddress();
    const relayConfig = getSponsoredRelayConfigStatus(activeCollectionAddress);

    return NextResponse.json({
      ok: true,
      runtimeConfig,
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
    const deployResult = await deploySponsoredNftCollection({
      collectionMetadataUrl: `${publicBaseUrl}/api/ton/nft/metadata/collection`,
      collectionAddress: runtimeConfig?.collectionAddress,
    });
    const savedConfig = await setTonRuntimeCollectionAddress(deployResult.collectionAddress, new Date().toISOString());

    return NextResponse.json({
      ok: true,
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
