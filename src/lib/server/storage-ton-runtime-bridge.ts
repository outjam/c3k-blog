import type { StorageTonRuntimeBridgeStatus, StorageTonUploadBridgeMode } from "@/types/storage";

const TONSTORAGE_BAG_ID_PATTERN = /^[a-f0-9]{64}$/i;

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeBaseUrl = (value: unknown): string | undefined => {
  const normalized = normalizeText(value).replace(/\/+$/, "");
  return normalized ? normalized : undefined;
};

const resolvePublicBaseUrl = (): string | undefined => {
  const explicit = normalizeBaseUrl(process.env.TELEGRAM_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_APP_URL);

  if (explicit) {
    return explicit;
  }

  const vercelUrl = normalizeText(process.env.VERCEL_URL);
  if (vercelUrl) {
    return `https://${vercelUrl.replace(/^https?:\/\//, "").replace(/\/+$/, "")}`;
  }

  const port = normalizeText(process.env.PORT) || "3000";
  return `http://127.0.0.1:${port}`;
};

const parseBridgeMode = (value: unknown): StorageTonUploadBridgeMode => {
  return normalizeText(value).toLowerCase() === "tonstorage_cli" ? "tonstorage_cli" : "simulated";
};

const parseJsonArray = (value: unknown): string[] => {
  const normalized = normalizeText(value);

  if (!normalized) {
    return [];
  }

  try {
    const parsed = JSON.parse(normalized) as unknown;
    return Array.isArray(parsed) ? parsed.map((entry) => String(entry)) : [];
  } catch {
    return [];
  }
};

const encodePath = (path: string | undefined): string => {
  return String(path ?? "")
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
};

const buildLocalTonStorageGatewayBase = (): string | undefined => {
  const publicBaseUrl = resolvePublicBaseUrl();
  return publicBaseUrl ? `${publicBaseUrl}/api/storage/runtime-gateway` : undefined;
};

export interface TonStorageBridgeEnvConfig {
  uploadMode: StorageTonUploadBridgeMode;
  workerSecretConfigured: boolean;
  daemonCliBin?: string;
  daemonCliArgs: string[];
  gatewayBase?: string;
}

export const isRealTonStorageBagId = (value: unknown): boolean => {
  return TONSTORAGE_BAG_ID_PATTERN.test(normalizeText(value));
};

export const parseTonStoragePointer = (
  pointer: string | undefined,
): {
  bagId?: string;
  filePath?: string;
} | null => {
  const normalized = normalizeText(pointer);

  if (!normalized.toLowerCase().startsWith("tonstorage://")) {
    return null;
  }

  const withoutScheme = normalized.slice("tonstorage://".length).replace(/^\/+/, "");
  const parts = withoutScheme.split("/").filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  if ((parts[0] === "testnet" || parts[0] === "mainnet") && parts.length >= 2) {
    const bagId = parts[1];
    return {
      bagId: isRealTonStorageBagId(bagId) ? bagId : undefined,
      filePath: parts.slice(2).join("/") || undefined,
    };
  }

  return {
    bagId: isRealTonStorageBagId(parts[0]) ? parts[0] : undefined,
    filePath: parts.slice(1).join("/") || undefined,
  };
};

export const buildTonStorageGatewayFetchUrl = (input: {
  storagePointer?: string;
  bagId?: string;
  fileName?: string;
}): string | null => {
  const config = getTonStorageBridgeEnvConfig();
  const gatewayBase = config.gatewayBase;

  if (!gatewayBase) {
    return null;
  }

  const parsedPointer = parseTonStoragePointer(input.storagePointer);
  const bagId = isRealTonStorageBagId(input.bagId) ? normalizeText(input.bagId) : parsedPointer?.bagId;

  if (!bagId || !isRealTonStorageBagId(bagId)) {
    return null;
  }

  const filePath = normalizeText(parsedPointer?.filePath || input.fileName);
  return filePath ? `${gatewayBase}/${bagId}/${encodePath(filePath)}` : `${gatewayBase}/${bagId}`;
};

export const getTonStorageBridgeEnvConfig = (): TonStorageBridgeEnvConfig => {
  const uploadMode = parseBridgeMode(process.env.C3K_STORAGE_TON_UPLOAD_BRIDGE_MODE);
  const workerSecretConfigured = Boolean(normalizeText(process.env.C3K_STORAGE_WORKER_SECRET));
  const daemonCliBin = normalizeText(process.env.C3K_STORAGE_TON_DAEMON_CLI_BIN) || "storage-daemon-cli";
  const daemonCliArgs = parseJsonArray(process.env.C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON);
  const explicitGatewayBase = normalizeBaseUrl(process.env.C3K_STORAGE_TON_HTTP_GATEWAY_BASE);
  const localGatewayBase = uploadMode === "tonstorage_cli" ? buildLocalTonStorageGatewayBase() : undefined;
  const gatewayBase = explicitGatewayBase || localGatewayBase;

  return {
    uploadMode,
    workerSecretConfigured,
    daemonCliBin: uploadMode === "tonstorage_cli" ? daemonCliBin : undefined,
    daemonCliArgs,
    gatewayBase,
  };
};

export const getTonStorageRuntimeBridgeStatus = (): StorageTonRuntimeBridgeStatus => {
  const config = getTonStorageBridgeEnvConfig();
  const { uploadMode, workerSecretConfigured, daemonCliBin, daemonCliArgs, gatewayBase } = config;

  const missing: string[] = [];
  const notes: string[] = [];

  if (!workerSecretConfigured) {
    missing.push("Не задан C3K_STORAGE_WORKER_SECRET для внешнего upload worker.");
  }

  if (!gatewayBase) {
    missing.push("Не задан C3K_STORAGE_TON_HTTP_GATEWAY_BASE для чтения tonstorage:// pointer через HTTP gateway.");
  } else {
    notes.push(
      process.env.C3K_STORAGE_TON_HTTP_GATEWAY_BASE
        ? "Gateway base позволит web и Telegram выдаче читать реальные tonstorage:// pointers."
        : "Для чтения tonstorage:// pointer будет использоваться встроенный local runtime gateway приложения.",
    );
  }

  if (uploadMode === "tonstorage_cli") {
    notes.push("Внешний worker будет пытаться вызвать storage-daemon-cli и получить настоящий BagID.");
    if (!daemonCliBin) {
      missing.push("Не задан путь к storage-daemon-cli.");
    }
  } else {
    notes.push("Сейчас upload bridge остаётся в simulated-режиме. Это подходит для test UX, но ещё не публикует bag в TON Storage.");
  }

  if (daemonCliArgs.length > 0) {
    notes.push("Для storage-daemon-cli уже заданы дополнительные аргументы подключения.");
  } else if (uploadMode === "tonstorage_cli") {
    notes.push("storage-daemon-cli будет вызван без дополнительных аргументов. Если daemon слушает нестандартный endpoint, добавь C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON.");
  }

  return {
    generatedAt: new Date().toISOString(),
    uploadMode,
    workerSecretConfigured,
    daemonCliBin,
    daemonCliArgsConfigured: daemonCliArgs.length > 0,
    gatewayBase,
    realUploadReady: workerSecretConfigured && uploadMode === "tonstorage_cli",
    gatewayRetrievalReady: Boolean(gatewayBase),
    missing,
    notes,
  };
};
