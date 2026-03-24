import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_BASE_URL =
  process.env.C3K_STORAGE_WORKER_BASE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "http://127.0.0.1:3000";

const WORKER_SECRET = process.env.C3K_STORAGE_WORKER_SECRET || "";
const UPLOAD_MODE = String(process.env.C3K_STORAGE_TON_UPLOAD_BRIDGE_MODE || "simulated")
  .trim()
  .toLowerCase();
const STORAGE_DAEMON_CLI_BIN = String(process.env.C3K_STORAGE_TON_DAEMON_CLI_BIN || "storage-daemon-cli").trim();

const parseCliArgs = () => {
  const raw = String(process.env.C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON || "").trim();

  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    console.warn("[storage-worker] invalid C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON, using []");
    return [];
  }
};

const STORAGE_DAEMON_CLI_ARGS = parseCliArgs();

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

const sanitizeFileName = (value) => {
  const base = String(value || "asset.bin")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  return base || "asset.bin";
};

const quoteCli = (value) => {
  return `"${String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
};

const parseBagIds = (value) => {
  const matches = String(value || "").match(/\b[a-f0-9]{64}\b/gi) || [];
  return [...new Set(matches.map((entry) => entry.toLowerCase()))];
};

const toPointer = (claim, checksum) => {
  return (
    claim?.uploadTarget?.existingPointer ||
    `tonstorage://testnet/c3k-runtime/external/${claim?.job?.id || "job"}/${checksum.slice(0, 16)}`
  );
};

const toRealBagPointer = (bagId, fileName) => {
  const safeFileName = sanitizeFileName(fileName || "asset.bin");
  return `tonstorage://${bagId}/${safeFileName}`;
};

const runDaemonCliCommand = async (command) => {
  const { stdout, stderr } = await execFileAsync(
    STORAGE_DAEMON_CLI_BIN,
    [...STORAGE_DAEMON_CLI_ARGS, "-c", command],
    {
      maxBuffer: 20 * 1024 * 1024,
    },
  );

  return [stdout, stderr].filter(Boolean).join("\n").trim();
};

const listTonStorageBagIds = async () => {
  const output = await runDaemonCliCommand("list --hashes");
  return parseBagIds(output);
};

const uploadViaTonStorageCli = async (claim, source) => {
  const tempDir = await mkdtemp(join(tmpdir(), "c3k-tonstorage-upload-"));
  const safeFileName = sanitizeFileName(
    claim?.asset?.fileName || claim?.uploadTarget?.fileName || basename(`asset.${claim?.asset?.format || "bin"}`),
  );
  const sourcePath = join(tempDir, safeFileName);

  try {
    await writeFile(sourcePath, Buffer.from(source.bytes));

    const beforeBagIds = await listTonStorageBagIds();
    const createDescription = `C3K ${claim?.asset?.releaseSlug || claim?.asset?.id || claim?.job?.id || "asset"}`;
    const createOutput = await runDaemonCliCommand(
      `create ${quoteCli(sourcePath)} -d ${quoteCli(createDescription)}`,
    );
    const afterBagIds = await listTonStorageBagIds();
    const createdBagId = afterBagIds.find((entry) => !beforeBagIds.includes(entry)) || parseBagIds(createOutput)[0];

    if (!createdBagId) {
      throw new Error("storage-daemon-cli did not return a BagID");
    }

    const pointer = toRealBagPointer(createdBagId, safeFileName);

    try {
      const metaPath = join(tempDir, "bag.meta");
      await runDaemonCliCommand(`get-meta ${createdBagId} ${quoteCli(metaPath)}`);
    } catch {
      // Meta extraction is helpful but not required for runtime completion.
    }

    return {
      bagExternalId: createdBagId,
      tonstorageUri: pointer,
      replicasActual: 1,
      replicasTarget: 3,
      bagStatus: "uploaded",
      message: `storage-daemon-cli created bag ${createdBagId} (${source.bytes.byteLength} bytes).`,
    };
  } finally {
    await rm(tempDir, { recursive: true, force: true }).catch(() => null);
  }
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

    const uploadResult =
      UPLOAD_MODE === "tonstorage_cli"
        ? await uploadViaTonStorageCli(claimed, source)
        : {
            bagExternalId: claimed.uploadTarget?.existingBagExternalId,
            tonstorageUri: toPointer(claimed, checksum),
            replicasActual: 1,
            replicasTarget: 3,
            bagStatus: "uploaded",
            message: `Local worker uploaded ${source.bytes.byteLength} bytes via ${source.sourceKind}. checksum=${checksum.slice(0, 16)}`,
          };

    await completeJob({
      action: "complete",
      jobId: claimed.job.id,
      workerLockId: claimed.job.workerLockId,
      ok: true,
      bagExternalId: uploadResult.bagExternalId,
      tonstorageUri: uploadResult.tonstorageUri,
      metaFileUrl: claimed.uploadTarget?.sourceUrl,
      replicasActual: uploadResult.replicasActual,
      replicasTarget: uploadResult.replicasTarget,
      bagStatus: uploadResult.bagStatus,
      message: uploadResult.message,
    });

    console.log(
      `[storage-worker] completed ${claimed.job.id} -> ${uploadResult.tonstorageUri} (${source.bytes.byteLength} bytes, ${source.sourceKind}, mode=${UPLOAD_MODE})`,
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
  console.log(
    `[storage-worker] baseUrl=${baseUrl} loop=${loop ? "yes" : "no"} interval=${intervalMs}ms mode=${UPLOAD_MODE}`,
  );

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
