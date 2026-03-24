import { execFile, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const cwd = process.cwd();
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

const parseNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.round(parsed)) : fallback;
};

const parseArgs = () => {
  const result = {
    publicUrl:
      process.env.C3K_DESKTOP_PUBLIC_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://c3k-blog.vercel.app",
    nextPort: parseNumber(process.env.C3K_DESKTOP_LOCAL_WEB_PORT, 3000),
    daemonAdnlPort: parseNumber(process.env.C3K_STORAGE_DAEMON_ADNL_PORT, 5555),
    daemonControlPort: parseNumber(process.env.C3K_STORAGE_DAEMON_CONTROL_PORT, 5556),
    gatewayPort: parseNumber(process.env.C3K_DESKTOP_GATEWAY_PORT, 3467),
    noElectron: false,
  };

  for (const arg of process.argv.slice(2)) {
    if (arg === "--no-electron") {
      result.noElectron = true;
      continue;
    }

    if (arg === "--help") {
      console.log(`C3K Desktop Node Launcher

Usage:
  npm run desktop:node
  npm run desktop:node -- --public-url=https://c3k-blog.vercel.app
  npm run desktop:node:headless

Flags:
  --public-url=<url>           Public web UI origin to open inside Electron
  --next-port=<port>           Local Next.js control-plane port (default: 3000)
  --daemon-adnl-port=<port>    storage-daemon ADNL port (default: 5555)
  --daemon-control-port=<port> storage-daemon control port for CLI (default: 5556)
  --gateway-port=<port>        Desktop local gateway port (default: 3467)
  --no-electron                Only verify/start daemon + local runtime and exit
`);
      process.exit(0);
    }

    if (arg.startsWith("--public-url=")) {
      result.publicUrl = arg.slice("--public-url=".length).trim() || result.publicUrl;
      continue;
    }

    if (arg.startsWith("--next-port=")) {
      result.nextPort = parseNumber(arg.slice("--next-port=".length), result.nextPort);
      continue;
    }

    if (arg.startsWith("--daemon-adnl-port=")) {
      result.daemonAdnlPort = parseNumber(arg.slice("--daemon-adnl-port=".length), result.daemonAdnlPort);
      continue;
    }

    if (arg.startsWith("--daemon-control-port=")) {
      result.daemonControlPort = parseNumber(
        arg.slice("--daemon-control-port=".length),
        result.daemonControlPort,
      );
      continue;
    }

    if (arg.startsWith("--gateway-port=")) {
      result.gatewayPort = parseNumber(arg.slice("--gateway-port=".length), result.gatewayPort);
      continue;
    }
  }

  return result;
};

const options = parseArgs();
const localOrigin = `http://127.0.0.1:${options.nextPort}`;
const localRuntimeUrl = `${localOrigin}/api/desktop/runtime`;
const localGatewayUrl = `${localOrigin}/api/storage/runtime-gateway`;

const paths = {
  daemonBin: path.join(cwd, ".local/ton/full/storage-daemon"),
  cliBin: path.join(cwd, ".local/ton/full/storage-daemon-cli"),
  globalConfig: path.join(cwd, ".local/ton/config/testnet-global.config.json"),
  storageDb: path.join(cwd, ".local/ton/storage-db"),
  cliKey: path.join(cwd, ".local/ton/storage-db/cli-keys/client"),
  serverPub: path.join(cwd, ".local/ton/storage-db/cli-keys/server.pub"),
  electronMarker: path.join(cwd, "desktop/node_modules/electron"),
};

const managedChildren = [];
let shuttingDown = false;

const log = (message) => {
  console.log(`[c3k-node-launcher] ${message}`);
};

const fileExists = (targetPath) => {
  try {
    fs.accessSync(targetPath, fs.constants.R_OK);
    return true;
  } catch {
    return false;
  }
};

const ensurePrerequisites = () => {
  const required = [
    ["storage-daemon", paths.daemonBin],
    ["storage-daemon-cli", paths.cliBin],
    ["TON testnet config", paths.globalConfig],
    ["storage db", paths.storageDb],
    ["CLI private key", paths.cliKey],
    ["daemon public key", paths.serverPub],
  ];

  const missing = required.filter(([, targetPath]) => !fileExists(targetPath));

  if (missing.length > 0) {
    for (const [label, targetPath] of missing) {
      console.error(`[c3k-node-launcher] missing ${label}: ${targetPath}`);
    }
    process.exit(1);
  }
};

const wireLogs = (stream, label) => {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    if (line.trim()) {
      console.log(`[${label}] ${line}`);
    }
  });
};

const spawnManaged = (label, command, args, extra = {}) => {
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...extra.env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: extra.shell ?? false,
  });

  wireLogs(child.stdout, label);
  wireLogs(child.stderr, label);

  child.once("exit", (code, signal) => {
    if (!shuttingDown) {
      console.log(`[${label}] exited (code=${code ?? "null"}, signal=${signal ?? "null"})`);
    }
  });

  managedChildren.push({ label, child, owned: extra.owned !== false });
  return child;
};

const stopChild = async (entry) => {
  const { child } = entry;

  if (!entry.owned || child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGINT");
  await new Promise((resolve) => setTimeout(resolve, 300));

  if (child.exitCode === null && !child.killed) {
    child.kill("SIGTERM");
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  if (child.exitCode === null && !child.killed) {
    child.kill("SIGKILL");
  }
};

const shutdown = async (exitCode = 0) => {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  const children = [...managedChildren].reverse();
  for (const entry of children) {
    await stopChild(entry);
  }
  process.exit(exitCode);
};

process.on("SIGINT", () => void shutdown(0));
process.on("SIGTERM", () => void shutdown(0));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const daemonCliArgs = () => {
  return [
    "-I",
    `127.0.0.1:${options.daemonControlPort}`,
    "-k",
    paths.cliKey,
    "-p",
    paths.serverPub,
  ];
};

const probeDaemon = async () => {
  try {
    const { stdout, stderr } = await execFileAsync(
      paths.cliBin,
      [...daemonCliArgs(), "-c", "list --hashes"],
      {
        timeout: 5_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );

    return {
      ok: true,
      sample: (stdout || stderr || "").trim(),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "daemon probe failed",
    };
  }
};

const probeRuntime = async () => {
  try {
    const response = await fetch(localRuntimeUrl, {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      runtime: payload.runtime,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "runtime probe failed",
    };
  }
};

const waitFor = async (label, probe, validate, timeoutMs = 60_000) => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const result = await probe();
    if (validate(result)) {
      return result;
    }
    await wait(1_000);
  }

  throw new Error(`Timed out while waiting for ${label}`);
};

const ensureDesktopInstall = async () => {
  if (fileExists(paths.electronMarker)) {
    return;
  }

  log("Electron не найден. Запускаю npm run desktop:install");

  await new Promise((resolve, reject) => {
    const installer = spawn(npmCommand, ["run", "desktop:install"], {
      cwd,
      env: process.env,
      stdio: "inherit",
      shell: false,
    });

    installer.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`desktop:install exited with code ${code ?? "null"}`));
    });
  });
};

const ensureDaemon = async () => {
  const existing = await probeDaemon();
  if (existing.ok) {
    log("Переиспользую уже запущенный storage-daemon.");
    return { reused: true, sample: existing.sample };
  }

  log(`Запускаю storage-daemon на ADNL :${options.daemonAdnlPort} и control ${options.daemonControlPort}`);
  spawnManaged(
    "storage-daemon",
    paths.daemonBin,
    [
      "-C",
      paths.globalConfig,
      "-D",
      paths.storageDb,
      "-I",
      `:${options.daemonAdnlPort}`,
      "-p",
      String(options.daemonControlPort),
    ],
    { owned: true },
  );

  const ready = await waitFor(
    "storage-daemon control port",
    probeDaemon,
    (result) => result.ok,
    30_000,
  );

  return { reused: false, sample: ready.sample };
};

const buildNextEnv = () => {
  return {
    PORT: String(options.nextPort),
    NEXT_PUBLIC_APP_URL: options.publicUrl,
    TELEGRAM_WEBHOOK_BASE_URL: options.publicUrl,
    NEXT_PUBLIC_C3K_STORAGE_ENABLED: "1",
    C3K_STORAGE_ENABLED: "1",
    NEXT_PUBLIC_C3K_STORAGE_DESKTOP_CLIENT_ENABLED: "1",
    C3K_STORAGE_DESKTOP_CLIENT_ENABLED: "1",
    NEXT_PUBLIC_C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED: "1",
    C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED: "1",
    NEXT_PUBLIC_C3K_DESKTOP_APP_SCHEME: "c3k",
    C3K_DESKTOP_APP_SCHEME: "c3k",
    NEXT_PUBLIC_C3K_DESKTOP_GATEWAY_HOST: "127.0.0.1",
    C3K_DESKTOP_GATEWAY_HOST: "127.0.0.1",
    NEXT_PUBLIC_C3K_DESKTOP_GATEWAY_PORT: String(options.gatewayPort),
    C3K_DESKTOP_GATEWAY_PORT: String(options.gatewayPort),
    NEXT_PUBLIC_C3K_DESKTOP_TON_SITE_HOST: "c3k.ton",
    C3K_DESKTOP_TON_SITE_HOST: "c3k.ton",
    NEXT_PUBLIC_C3K_STORAGE_RUNTIME_MODE: "tonstorage_testnet",
    C3K_STORAGE_RUNTIME_MODE: "tonstorage_testnet",
    C3K_STORAGE_TON_TESTNET_POINTER_BASE: "tonstorage://testnet/c3k-runtime",
    C3K_STORAGE_TON_TESTNET_PROVIDER_LABEL: "C3K Testnet Provider",
    C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED: "1",
    C3K_STORAGE_WORKER_SECRET: process.env.C3K_STORAGE_WORKER_SECRET || "local-desktop-worker-secret",
    C3K_STORAGE_TON_UPLOAD_BRIDGE_MODE: "tonstorage_cli",
    C3K_STORAGE_TON_DAEMON_CLI_BIN: paths.cliBin,
    C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON: JSON.stringify(daemonCliArgs()),
    C3K_STORAGE_TON_HTTP_GATEWAY_BASE: localGatewayUrl,
  };
};

const ensureLocalRuntime = async () => {
  const existing = await probeRuntime();
  if (existing.ok) {
    const runtime = existing.runtime;
    const matchesPublicUrl = runtime?.webAppOrigin === options.publicUrl;
    const matchesGateway = runtime?.localNode?.gatewayUrl === localGatewayUrl;
    const matchesMode = runtime?.localNode?.uploadMode === "tonstorage_cli";

    if (matchesPublicUrl && matchesGateway && matchesMode) {
      log("Переиспользую уже поднятый local runtime.");
      return { reused: true, runtime };
    }

    throw new Error(
      `Локальный runtime уже занят другой конфигурацией на ${localRuntimeUrl}. Останови его или используй matching --public-url.`,
    );
  }

  log(`Запускаю local Next runtime на ${localOrigin}`);
  spawnManaged("next-dev", [npmCommand][0], ["run", "dev"], {
    env: buildNextEnv(),
    owned: true,
  });

  const ready = await waitFor(
    "local desktop runtime",
    probeRuntime,
    (result) => {
      return (
        result.ok &&
        result.runtime?.webAppOrigin === options.publicUrl &&
        result.runtime?.localNode?.daemonReady === true &&
        result.runtime?.localNode?.gatewayReady === true
      );
    },
    90_000,
  );

  return { reused: false, runtime: ready.runtime };
};

const startElectron = () => {
  log("Запускаю Electron desktop client.");
  const electron = spawnManaged("desktop", npmCommand, ["run", "desktop:dev"], {
    env: {
      C3K_DESKTOP_RUNTIME_URL: localRuntimeUrl,
    },
    owned: true,
  });

  electron.once("exit", () => {
    if (!shuttingDown) {
      void shutdown(0);
    }
  });
};

const main = async () => {
  ensurePrerequisites();
  await ensureDesktopInstall();

  log(`Public UI: ${options.publicUrl}`);
  log(`Local runtime: ${localRuntimeUrl}`);
  log(`Local gateway: ${localGatewayUrl}`);

  const daemon = await ensureDaemon();
  if (daemon.sample) {
    log(`Daemon ready: ${daemon.sample.split("\n")[0]}`);
  }

  const runtimeState = await ensureLocalRuntime();
  const runtime = runtimeState.runtime;

  log(
    `Runtime ready: ${runtime.localNode.deviceLabel} · bags ${runtime.localNode.bagCount} · ${runtime.localNode.storageRuntimeLabel}`,
  );

  if (options.noElectron) {
    log("Headless mode complete. Local node contour is ready.");
    await shutdown(0);
    return;
  }

  log("Opening prod desktop with local node runtime.");
  startElectron();
};

main().catch(async (error) => {
  console.error(
    `[c3k-node-launcher] ${error instanceof Error ? error.message : "launcher failed"}`,
  );
  await shutdown(1);
});
