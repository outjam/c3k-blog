import { NextResponse } from "next/server";

import { fetchTonStorageUploadSource } from "@/lib/server/storage-upload-worker";
import { isAuthorizedWorkerRequest } from "@/lib/server/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const isAuthorized = (request: Request): boolean => {
  return isAuthorizedWorkerRequest(request, {
    workerSecretEnv: "C3K_STORAGE_WORKER_SECRET",
  });
};

const buildContentDisposition = (fileName: string): string => {
  const fallback =
    fileName
      .replace(/[^\w.\-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "") || "c3k-upload-source";

  return `attachment; filename="${fallback}"`;
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const workerLockId = String(new URL(request.url).searchParams.get("lock") ?? "").trim();

  if (!workerLockId) {
    return NextResponse.json({ ok: false, error: "Missing worker lock" }, { status: 400 });
  }

  const source = await fetchTonStorageUploadSource({
    jobId: id,
    workerLockId,
  });

  if (!source.ok || !source.bytes) {
    return NextResponse.json({ ok: false, error: source.error ?? "Source not available" }, { status: 409 });
  }

  return new NextResponse(Buffer.from(source.bytes), {
    status: 200,
    headers: {
      "content-type": source.mimeType || "application/octet-stream",
      "content-disposition": buildContentDisposition(source.fileName || "c3k-upload-source"),
      "cache-control": "private, no-store, max-age=0",
      "x-c3k-upload-source-kind": source.sourceKind || "unknown",
    },
  });
}
