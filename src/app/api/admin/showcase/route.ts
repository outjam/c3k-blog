import { NextResponse } from "next/server";

import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ShowcaseCollection } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ShowcaseBody {
  collection?: Partial<ShowcaseCollection>;
}

interface ShowcaseDeleteBody {
  id?: string;
}

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeIdList = (value: unknown, maxLength: number): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(new Set(value.map((item) => normalizeSafeId(item, maxLength)).filter(Boolean))).slice(0, 64);
};

const toSorted = (collections: ShowcaseCollection[]): ShowcaseCollection[] => {
  return [...collections].sort((a, b) => a.order - b.order || a.title.localeCompare(b.title, "ru-RU"));
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "showcase:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();
  return NextResponse.json({ collections: toSorted(config.showcaseCollections) });
}

export async function POST(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "showcase:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: ShowcaseBody;

  try {
    payload = (await request.json()) as ShowcaseBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const source = payload.collection;

  if (!source || typeof source !== "object") {
    return NextResponse.json({ error: "collection is required" }, { status: 400 });
  }

  const id = normalizeSafeId(source.id, 64) || `showcase-${Date.now().toString(36)}`;
  const title = normalizeText(source.title, 120);

  if (!title) {
    return NextResponse.json({ error: "collection.title is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => {
    const existing = current.showcaseCollections.find((collection) => collection.id === id);
    const maxOrder = current.showcaseCollections.reduce((acc, item) => Math.max(acc, item.order), 0);
    const order =
      typeof source.order === "number" && Number.isFinite(source.order)
        ? Math.max(1, Math.round(source.order))
        : existing?.order ?? maxOrder + 10;

    const next: ShowcaseCollection = {
      id,
      title,
      subtitle: normalizeOptionalText(source.subtitle, 160),
      description: normalizeOptionalText(source.description, 500),
      coverImage: normalizeOptionalText(source.coverImage, 3000),
      productIds: normalizeIdList(source.productIds, 80),
      trackIds: normalizeIdList(source.trackIds, 80),
      order,
      isPublished: typeof source.isPublished === "boolean" ? source.isPublished : existing?.isPublished ?? true,
    };

    const showcaseCollections = existing
      ? current.showcaseCollections.map((collection) => (collection.id === id ? next : collection))
      : [next, ...current.showcaseCollections];

    return {
      ...current,
      showcaseCollections: toSorted(showcaseCollections),
      updatedAt: now,
    };
  });

  return NextResponse.json({ collections: updated.showcaseCollections });
}

export async function DELETE(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "showcase:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: ShowcaseDeleteBody;

  try {
    payload = (await request.json()) as ShowcaseDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const id = normalizeSafeId(payload.id, 64);

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const updated = await mutateShopAdminConfig((current) => ({
    ...current,
    showcaseCollections: current.showcaseCollections.filter((collection) => collection.id !== id),
    updatedAt: now,
  }));

  return NextResponse.json({ collections: updated.showcaseCollections });
}
