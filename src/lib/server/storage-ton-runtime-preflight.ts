import { execFile } from "node:child_process";
import { promisify } from "node:util";

import {
  getTonStorageBridgeEnvConfig,
  getTonStorageRuntimeBridgeStatus,
} from "@/lib/server/storage-ton-runtime-bridge";
import type { StorageTonRuntimePreflightSnapshot } from "@/types/storage";

const execFileAsync = promisify(execFile);
const CLI_TIMEOUT_MS = 15_000;
const GATEWAY_TIMEOUT_MS = 8_000;
const TONSTORAGE_BAG_ID_PATTERN = /\b[a-f0-9]{64}\b/gi;

const shorten = (value: string | undefined, limit = 240): string | undefined => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > limit ? `${normalized.slice(0, limit - 1)}…` : normalized;
};

const parseBagCount = (value: string): number => {
  return (String(value || "").match(TONSTORAGE_BAG_ID_PATTERN) || []).length;
};

const probeGatewayBase = async (
  gatewayBase: string,
): Promise<{
  ok: boolean;
  status?: number;
  error?: string;
}> => {
  const response = await fetch(gatewayBase, {
    method: "HEAD",
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(GATEWAY_TIMEOUT_MS),
  }).catch(() => null);

  if (!response) {
    return {
      ok: false,
      error: "Gateway не ответил по сети.",
    };
  }

  // Для base URL нам важнее факт ответа, чем конкретный код.
  return {
    ok: response.status < 500,
    status: response.status,
    error: response.status < 500 ? undefined : `Gateway ответил HTTP ${response.status}.`,
  };
};

export const runTonStorageRuntimePreflight = async (): Promise<StorageTonRuntimePreflightSnapshot> => {
  const checkedAt = new Date().toISOString();
  const bridgeStatus = getTonStorageRuntimeBridgeStatus();
  const config = getTonStorageBridgeEnvConfig();
  const snapshot: StorageTonRuntimePreflightSnapshot = {
    checkedAt,
    uploadMode: config.uploadMode,
    workerSecretConfigured: config.workerSecretConfigured,
    daemonCliBin: config.daemonCliBin,
    daemonCliArgsConfigured: config.daemonCliArgs.length > 0,
    gatewayBase: config.gatewayBase,
    cliChecked: false,
    cliOk: false,
    gatewayChecked: false,
    gatewayOk: false,
    overallReady: false,
    notes: [],
    nextActions: [],
  };

  if (config.uploadMode === "tonstorage_cli" && config.daemonCliBin) {
    snapshot.cliChecked = true;
    snapshot.cliCommand = [config.daemonCliBin, ...config.daemonCliArgs, "-c", "list --hashes"].join(" ");

    try {
      const { stdout, stderr } = await execFileAsync(
        config.daemonCliBin,
        [...config.daemonCliArgs, "-c", "list --hashes"],
        {
          timeout: CLI_TIMEOUT_MS,
          maxBuffer: 8 * 1024 * 1024,
        },
      );
      const combined = [stdout, stderr].filter(Boolean).join("\n").trim();
      snapshot.cliOk = true;
      snapshot.cliKnownBagCount = parseBagCount(combined);
      snapshot.cliSample = shorten(combined || "storage-daemon-cli ответил без вывода.");
      snapshot.notes.push(
        snapshot.cliKnownBagCount > 0
          ? `CLI видит ${snapshot.cliKnownBagCount} bag id и готов к list-команде.`
          : "CLI ответил успешно. Даже если bag list пуст, daemon-контур уже доступен.",
      );
    } catch (error) {
      snapshot.cliOk = false;
      snapshot.cliError = shorten(error instanceof Error ? error.message : "CLI probe failed.");
      snapshot.nextActions.push("Проверь локальный запуск storage-daemon и доступность storage-daemon-cli с теми же аргументами.");
    }
  } else if (config.uploadMode === "simulated") {
    snapshot.nextActions.push("Переключи bridge mode на tonstorage_cli, если хочешь реальный testnet upload вместо симуляции.");
  }

  if (config.gatewayBase) {
    snapshot.gatewayChecked = true;
    snapshot.gatewayProbeUrl = config.gatewayBase;
    const gatewayProbe = await probeGatewayBase(config.gatewayBase);
    snapshot.gatewayOk = gatewayProbe.ok;
    snapshot.gatewayStatus = gatewayProbe.status;
    snapshot.gatewayError = gatewayProbe.error;

    if (gatewayProbe.ok) {
      snapshot.notes.push(
        typeof gatewayProbe.status === "number"
          ? `Gateway ответил на probe с HTTP ${gatewayProbe.status}.`
          : "Gateway reachable.",
      );
    } else {
      snapshot.nextActions.push("Подними HTTP gateway для чтения tonstorage:// pointer и задай корректный C3K_STORAGE_TON_HTTP_GATEWAY_BASE.");
    }
  } else {
    snapshot.nextActions.push("Задай C3K_STORAGE_TON_HTTP_GATEWAY_BASE, чтобы web и Telegram могли читать tonstorage:// pointer.");
  }

  if (!config.workerSecretConfigured) {
    snapshot.nextActions.push("Задай C3K_STORAGE_WORKER_SECRET для защищённого upload worker контура.");
  }

  snapshot.overallReady =
    bridgeStatus.realUploadReady &&
    snapshot.cliOk &&
    bridgeStatus.gatewayRetrievalReady &&
    snapshot.gatewayOk;

  if (snapshot.overallReady) {
    snapshot.notes.push("Контур готов к живому testnet upload через Прогнать upload once или внешний worker.");
  }

  if (bridgeStatus.missing.length > 0) {
    for (const item of bridgeStatus.missing) {
      if (!snapshot.notes.includes(item)) {
        snapshot.notes.push(item);
      }
    }
  }

  if (snapshot.nextActions.length === 0 && !snapshot.overallReady) {
    snapshot.nextActions.push("Проверь runtime probe конкретного asset после настройки CLI и gateway.");
  }

  return snapshot;
};
