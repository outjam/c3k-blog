import { NextResponse } from "next/server";

import {
  claimTonStorageUploadJob,
  completeTonStorageUploadJob,
  getStorageUploadWorkerQueueStatus,
} from "@/lib/server/storage-upload-worker";
import { isAuthorizedWorkerRequest } from "@/lib/server/worker-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CompleteBody {
  action?: string;
  jobId?: string;
  workerLockId?: string;
  ok?: boolean;
  bagExternalId?: string;
  tonstorageUri?: string;
  metaFileUrl?: string;
  replicasActual?: number;
  replicasTarget?: number;
  bagStatus?: "created" | "uploaded" | "replicating" | "healthy" | "degraded" | "disabled" | "draft";
  message?: string;
  failureCode?: string;
  failureMessage?: string;
}

const isAuthorized = (request: Request): boolean => {
  return isAuthorizedWorkerRequest(request, {
    workerSecretEnv: "C3K_STORAGE_WORKER_SECRET",
  });
};

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const mode = (new URL(request.url).searchParams.get("mode") ?? "").trim().toLowerCase();

  if (mode === "claim") {
    const claimed = await claimTonStorageUploadJob();
    return NextResponse.json({ ok: true, claimed });
  }

  const status = await getStorageUploadWorkerQueueStatus();
  return NextResponse.json({ ok: true, status });
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: CompleteBody = {};

  try {
    body = (await request.json()) as CompleteBody;
  } catch {
    body = {};
  }

  const action = String(body.action ?? "claim").trim().toLowerCase();

  if (action === "claim") {
    const claimed = await claimTonStorageUploadJob();
    return NextResponse.json({ ok: true, claimed });
  }

  if (action !== "complete") {
    return NextResponse.json({ ok: false, error: "Unsupported action" }, { status: 400 });
  }

  const jobId = String(body.jobId ?? "").trim();
  const workerLockId = String(body.workerLockId ?? "").trim();

  if (!jobId || !workerLockId) {
    return NextResponse.json({ ok: false, error: "jobId and workerLockId are required" }, { status: 400 });
  }

  const result = await completeTonStorageUploadJob({
    jobId,
    workerLockId,
    ok: body.ok !== false,
    bagExternalId: body.bagExternalId,
    tonstorageUri: body.tonstorageUri,
    metaFileUrl: body.metaFileUrl,
    replicasActual: body.replicasActual,
    replicasTarget: body.replicasTarget,
    bagStatus: body.bagStatus,
    message: body.message,
    failureCode: body.failureCode,
    failureMessage: body.failureMessage,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.reason, job: result.job, bag: result.bag }, { status: 409 });
  }

  return NextResponse.json({ ok: true, job: result.job, bag: result.bag });
}
