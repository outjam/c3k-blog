import { NextResponse } from "next/server";

import {
  readTonStorageLocalGatewayFile,
  resolveTonStorageLocalGatewayFile,
} from "@/lib/server/storage-ton-runtime-local-gateway";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const buildDisposition = (fileName: string): string => {
  const safe = fileName
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "") || "c3k-tonstorage-file";

  return `inline; filename="${safe}"`;
};

const joinFilePath = (segments: string[] | undefined): string | undefined => {
  return Array.isArray(segments) && segments.length > 0 ? segments.join("/") : undefined;
};

export async function HEAD(
  _request: Request,
  context: { params: Promise<{ bagId: string; filePath?: string[] }> },
) {
  const params = await context.params;
  const resolved = await resolveTonStorageLocalGatewayFile({
    bagId: params.bagId,
    filePath: joinFilePath(params.filePath),
  });

  if (!resolved.ok) {
    return NextResponse.json(
      {
        error: resolved.error ?? "Bag file is not available.",
      },
      { status: 404 },
    );
  }

  return new NextResponse(null, {
    status: 200,
    headers: {
      "cache-control": "no-store",
      "content-type": resolved.mimeType || "application/octet-stream",
      ...(typeof resolved.sizeBytes === "number" ? { "content-length": String(resolved.sizeBytes) } : {}),
      ...(resolved.fileName ? { "content-disposition": buildDisposition(resolved.fileName) } : {}),
      "x-c3k-ton-bag-id": resolved.bagId,
      "x-c3k-ton-file-path": resolved.filePath || "",
    },
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ bagId: string; filePath?: string[] }> },
) {
  const params = await context.params;
  const resolved = await readTonStorageLocalGatewayFile({
    bagId: params.bagId,
    filePath: joinFilePath(params.filePath),
  });

  if (!resolved.ok || !resolved.bytes) {
    return NextResponse.json(
      {
        error: resolved.error ?? "Bag file is not available.",
      },
      { status: 404 },
    );
  }

  return new NextResponse(Buffer.from(resolved.bytes), {
    status: 200,
    headers: {
      "cache-control": "public, max-age=60",
      "content-type": resolved.mimeType || "application/octet-stream",
      ...(typeof resolved.sizeBytes === "number" ? { "content-length": String(resolved.sizeBytes) } : {}),
      ...(resolved.fileName ? { "content-disposition": buildDisposition(resolved.fileName) } : {}),
      "x-c3k-ton-bag-id": resolved.bagId,
      "x-c3k-ton-file-path": resolved.filePath || "",
    },
  });
}
