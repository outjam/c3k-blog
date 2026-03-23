import { NextResponse } from "next/server";

import { fetchStorageRuntimeBinary } from "@/lib/server/storage-runtime-fetch";
import { getStorageDeliveryRequest } from "@/lib/server/storage-delivery-store";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buildContentDisposition = (fileName: string): string => {
  const fallback = fileName
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "c3k-file";

  return `attachment; filename="${fallback}"`;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const { id } = await context.params;
  const entry = await getStorageDeliveryRequest(id);

  if (!entry) {
    return NextResponse.json({ error: "Delivery request not found" }, { status: 404 });
  }

  const canView =
    entry.telegramUserId === auth.telegramUserId ||
    (auth.isAdmin && hasAdminPermission(auth, "storage:view"));

  if (!canView) {
    return forbiddenResponse();
  }

  const resolved = await fetchStorageRuntimeBinary({
    deliveryUrl: entry.deliveryUrl,
    resolvedSourceUrl: entry.resolvedSourceUrl,
    storagePointer: entry.storagePointer,
    assetId: entry.resolvedAssetId,
    bagId: entry.resolvedBagId,
  });

  if (!resolved.ok || !resolved.bytes) {
    return NextResponse.json(
      {
        error: resolved.error ?? "Storage runtime could not resolve file.",
      },
      { status: 409 },
    );
  }

  return new NextResponse(Buffer.from(resolved.bytes), {
    status: 200,
    headers: {
      "content-type": entry.mimeType || "application/octet-stream",
      "content-disposition": buildContentDisposition(entry.fileName || "c3k-file"),
      "cache-control": "private, no-store, max-age=0",
      "x-c3k-storage-runtime-via": resolved.via || "unknown",
    },
  });
}
