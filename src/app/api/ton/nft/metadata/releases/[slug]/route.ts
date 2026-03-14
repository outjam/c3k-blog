import { NextResponse } from "next/server";

import { getCatalogSnapshot } from "@/lib/server/shop-catalog";
import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

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

export async function GET(request: Request, context: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await context.params;
  const slug = normalizeSlug(rawSlug);

  if (!slug) {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const snapshot = await getCatalogSnapshot();
  const product = snapshot.products.find((entry) => entry.slug === slug);

  if (!product) {
    return NextResponse.json({ error: "Release not found" }, { status: 404 });
  }

  const baseUrl = resolvePublicBaseUrl(request);
  const imageUrl = toAbsoluteUrl(baseUrl, product.image);
  const externalUrl = toAbsoluteUrl(baseUrl, `/shop/${product.slug}`);
  const animationUrl = toAbsoluteUrl(baseUrl, product.previewUrl);
  const tracksCount = Array.isArray(product.releaseTracklist) && product.releaseTracklist.length > 0 ? product.releaseTracklist.length : 1;
  const releaseType = product.releaseType ?? "single";

  return NextResponse.json(
    {
      name: `${product.artistName ? `${product.artistName} - ` : ""}${product.title} NFT`,
      description: product.description || `NFT релиза ${product.title} в Culture3k`,
      image: imageUrl,
      external_url: externalUrl,
      animation_url: animationUrl,
      attributes: [
        {
          trait_type: "release_slug",
          value: product.slug,
        },
        {
          trait_type: "artist",
          value: product.artistName ?? product.subtitle,
        },
        {
          trait_type: "release_type",
          value: releaseType,
        },
        {
          trait_type: "tracks",
          value: tracksCount,
        },
        {
          trait_type: "collection",
          value: product.subcategoryLabel ?? product.attributes.collection,
        },
      ],
    },
    {
      headers: {
        "cache-control": "public, max-age=300, s-maxage=300",
      },
    },
  );
}
