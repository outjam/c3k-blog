import { NextResponse } from "next/server";

import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import { getCatalogSnapshot } from "@/lib/server/shop-catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const stripTrailingSlash = (value: string): string => {
  return value.replace(/\/+$/, "");
};

const toAbsoluteUrl = (baseUrl: string | null, value: string | undefined): string | undefined => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (!baseUrl) {
    return normalized;
  }

  return `${stripTrailingSlash(baseUrl)}${normalized.startsWith("/") ? normalized : `/${normalized}`}`;
};

export async function GET(request: Request) {
  const baseUrl = resolvePublicBaseUrl(request);
  const snapshot = await getCatalogSnapshot();
  const featuredRelease = snapshot.products[0];

  return NextResponse.json(
    {
      name: "Culture3k Releases",
      description: "Official NFT collection for Culture3k digital music releases.",
      image: toAbsoluteUrl(baseUrl, featuredRelease?.image),
      external_url: toAbsoluteUrl(baseUrl, "/shop"),
    },
    {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
