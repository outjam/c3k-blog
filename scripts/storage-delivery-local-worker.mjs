import process from "node:process";

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
};

const args = process.argv.slice(2);
const baseUrl =
  args.find((entry) => entry.startsWith("--base-url="))?.slice("--base-url=".length) ||
  process.env.C3K_LOCAL_RUNTIME_BASE_URL ||
  "http://127.0.0.1:3000";
const limit = parseNumber(
  args.find((entry) => entry.startsWith("--limit="))?.slice("--limit=".length) || process.env.C3K_LOCAL_DELIVERY_WORKER_LIMIT,
  6,
);
const intervalMs = parseNumber(
  args.find((entry) => entry.startsWith("--interval-ms="))?.slice("--interval-ms=".length) ||
    process.env.C3K_LOCAL_DELIVERY_WORKER_INTERVAL_MS,
  12000,
);
const runOnce = args.includes("--once");
const workerSecret = String(process.env.TELEGRAM_WORKER_SECRET || "").trim();
const cronSecret = String(process.env.CRON_SECRET || "").trim();
const botTokenConfigured = Boolean(String(process.env.TELEGRAM_BOT_TOKEN || "").trim());

const log = (message) => {
  console.log(`[c3k-delivery-worker] ${message}`);
};

const buildHeaders = () => {
  const headers = {
    "content-type": "application/json",
  };

  if (workerSecret) {
    headers["x-worker-key"] = workerSecret;
  } else if (cronSecret) {
    headers.authorization = `Bearer ${cronSecret}`;
  }

  return headers;
};

const readJson = async (response) => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const readQueueStatus = async () => {
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}/api/storage/downloads/worker?mode=status`, {
    method: "GET",
    headers: buildHeaders(),
    cache: "no-store",
  });

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return {
    queueSize: Number(data?.queueSize || 0),
  };
};

const runWorkerPass = async () => {
  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/api/storage/downloads/worker?limit=${encodeURIComponent(String(limit))}`,
    {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({}),
      cache: "no-store",
    },
  );

  const data = await readJson(response);
  if (!response.ok) {
    throw new Error(data?.error || `HTTP ${response.status}`);
  }

  return {
    processed: Number(data?.processed || 0),
    delivered: Number(data?.delivered || 0),
    failed: Number(data?.failed || 0),
    claimed: Number(data?.claimed || 0),
    remaining: Number(data?.remaining || 0),
  };
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const main = async () => {
  if (!workerSecret) {
    if (!cronSecret) {
      throw new Error("Missing TELEGRAM_WORKER_SECRET or CRON_SECRET for local delivery worker.");
    }
  }

  if (!botTokenConfigured) {
    log("Missing TELEGRAM_BOT_TOKEN. Local Telegram delivery loop will stay idle.");
    if (runOnce) {
      return;
    }
  }

  log(`Watching ${baseUrl} with limit ${limit}.`);

  do {
    try {
      const status = await readQueueStatus();

      if (status.queueSize > 0 && botTokenConfigured) {
        const result = await runWorkerPass();
        log(
          `queue ${status.queueSize} -> processed ${result.processed} · delivered ${result.delivered} · failed ${result.failed} · remaining ${result.remaining}`,
        );
      } else {
        log(status.queueSize > 0 ? `queue ${status.queueSize}, but TELEGRAM_BOT_TOKEN is missing` : "queue empty");
      }
    } catch (error) {
      log(error instanceof Error ? error.message : "worker pass failed");
    }

    if (runOnce) {
      break;
    }

    await sleep(intervalMs);
  } while (true);
};

main().catch((error) => {
  console.error(`[c3k-delivery-worker] ${error instanceof Error ? error.message : "failed"}`);
  process.exit(1);
});
