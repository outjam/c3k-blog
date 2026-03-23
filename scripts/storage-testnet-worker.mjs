const DEFAULT_BASE_URL =
  process.env.C3K_STORAGE_WORKER_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://127.0.0.1:3000";

const WORKER_SECRET = process.env.C3K_STORAGE_WORKER_SECRET || "";

const args = new Set(process.argv.slice(2));
const loop = args.has("--loop");
const intervalArg = [...args].find((entry) => entry.startsWith("--interval="));
const intervalMs = Math.max(1_000, Number(intervalArg?.split("=")[1] || 5_000));

if (!WORKER_SECRET.trim()) {
  console.error("Missing C3K_STORAGE_WORKER_SECRET");
  process.exit(1);
}

const baseUrl = DEFAULT_BASE_URL.replace(/\/+$/, "");
const workerHeaders = {
  "x-worker-key": WORKER_SECRET,
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const digestSha256 = async (bytes) => {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Buffer.from(hash).toString("hex");
};

const toPointer = (claim, checksum) => {
  return (
    claim?.uploadTarget?.existingPointer ||
    `tonstorage://testnet/c3k-runtime/external/${claim?.job?.id || "job"}/${checksum.slice(0, 16)}`
  );
};

const claimJob = async () => {
  const response = await fetch(`${baseUrl}/api/storage/ingest/worker`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...workerHeaders,
    },
    body: JSON.stringify({ action: "claim" }),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Claim failed with HTTP ${response.status}`);
  }

  return payload;
};

const fetchSource = async (sourceUrl) => {
  const response = await fetch(sourceUrl, {
    method: "GET",
    headers: workerHeaders,
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Source fetch failed with HTTP ${response.status}`);
  }

  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    mimeType: response.headers.get("content-type") || "application/octet-stream",
    fileName: response.headers.get("content-disposition") || "",
    sourceKind: response.headers.get("x-c3k-upload-source-kind") || "unknown",
  };
};

const completeJob = async (input) => {
  const response = await fetch(`${baseUrl}/api/storage/ingest/worker`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...workerHeaders,
    },
    body: JSON.stringify(input),
    cache: "no-store",
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Complete failed with HTTP ${response.status}`);
  }

  return payload;
};

const runOnce = async () => {
  const claimPayload = await claimJob();
  const claimed = claimPayload?.claimed;

  if (!claimed?.job?.id || !claimed?.job?.workerLockId || !claimPayload?.endpoints?.source) {
    console.log("[storage-worker] no prepared jobs");
    return false;
  }

  console.log(`[storage-worker] claimed ${claimed.job.id}`);

  try {
    const source = await fetchSource(claimPayload.endpoints.source);
    const checksum = await digestSha256(source.bytes);
    const tonstorageUri = toPointer(claimed, checksum);

    await completeJob({
      action: "complete",
      jobId: claimed.job.id,
      workerLockId: claimed.job.workerLockId,
      ok: true,
      bagExternalId: claimed.uploadTarget?.existingBagExternalId,
      tonstorageUri,
      metaFileUrl: claimed.uploadTarget?.sourceUrl,
      replicasActual: 1,
      replicasTarget: 3,
      bagStatus: "uploaded",
      message: `Local worker uploaded ${source.bytes.byteLength} bytes via ${source.sourceKind}. checksum=${checksum.slice(0, 16)}`,
    });

    console.log(
      `[storage-worker] completed ${claimed.job.id} -> ${tonstorageUri} (${source.bytes.byteLength} bytes, ${source.sourceKind})`,
    );
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown_error";
    await completeJob({
      action: "complete",
      jobId: claimed.job.id,
      workerLockId: claimed.job.workerLockId,
      ok: false,
      failureCode: "local_worker_failed",
      failureMessage: message,
      message: `Local worker failed: ${message}`,
    }).catch(() => null);

    console.error(`[storage-worker] failed ${claimed.job.id}: ${message}`);
    return false;
  }
};

const main = async () => {
  console.log(`[storage-worker] baseUrl=${baseUrl} loop=${loop ? "yes" : "no"} interval=${intervalMs}ms`);

  if (!loop) {
    await runOnce();
    return;
  }

  while (true) {
    try {
      await runOnce();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[storage-worker] iteration error: ${message}`);
    }

    await sleep(intervalMs);
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
