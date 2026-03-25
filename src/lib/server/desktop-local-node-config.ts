import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import type { C3kDesktopLocalNodeSettings } from "@/types/desktop";

const GIGABYTE = 1024 * 1024 * 1024;
const DEFAULT_STORAGE_QUOTA_BYTES = 50 * GIGABYTE;
const DEFAULT_BANDWIDTH_KBPS = 25_000;

interface PersistedDesktopLocalNodeConfig {
  storageQuotaBytes?: number;
  bandwidthLimitKbps?: number;
  autoAcceptNewBags?: boolean;
  prioritizeTelegramDelivery?: boolean;
  seedingStrategy?: C3kDesktopLocalNodeSettings["seedingStrategy"];
}

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.round(Number(value ?? fallback));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean): boolean => {
  if (value === true || value === false) {
    return value;
  }

  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }

  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }

  return fallback;
};

const normalizeSeedingStrategy = (
  value: unknown,
  fallback: C3kDesktopLocalNodeSettings["seedingStrategy"],
): C3kDesktopLocalNodeSettings["seedingStrategy"] => {
  return value === "throughput" || value === "conservative" || value === "balanced" ? value : fallback;
};

const getConfigPath = (): string => {
  return path.join(process.cwd(), ".local", "desktop", "node-config.json");
};

const sanitizeConfig = (value: unknown): C3kDesktopLocalNodeSettings => {
  const source = value && typeof value === "object" ? (value as PersistedDesktopLocalNodeConfig) : {};
  const defaultQuotaBytes = normalizePositiveInt(
    process.env.C3K_STORAGE_LOCAL_NODE_TARGET_BYTES,
    DEFAULT_STORAGE_QUOTA_BYTES,
  );
  const defaultBandwidth = normalizePositiveInt(
    process.env.C3K_STORAGE_LOCAL_NODE_BANDWIDTH_KBPS,
    DEFAULT_BANDWIDTH_KBPS,
  );

  return {
    storageQuotaBytes: Math.max(
      10 * GIGABYTE,
      normalizePositiveInt(source.storageQuotaBytes, defaultQuotaBytes),
    ),
    bandwidthLimitKbps: Math.max(1_000, normalizePositiveInt(source.bandwidthLimitKbps, defaultBandwidth)),
    autoAcceptNewBags: normalizeBoolean(source.autoAcceptNewBags, true),
    prioritizeTelegramDelivery: normalizeBoolean(source.prioritizeTelegramDelivery, true),
    seedingStrategy: normalizeSeedingStrategy(source.seedingStrategy, "balanced"),
  };
};

export const getDesktopLocalNodeSettings = async (): Promise<C3kDesktopLocalNodeSettings> => {
  try {
    const raw = await readFile(getConfigPath(), "utf8");
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return sanitizeConfig({});
  }
};

export const updateDesktopLocalNodeSettings = async (
  patch: Partial<C3kDesktopLocalNodeSettings>,
): Promise<C3kDesktopLocalNodeSettings> => {
  const current = await getDesktopLocalNodeSettings();
  const next = sanitizeConfig({
    ...current,
    ...patch,
  });
  const configPath = getConfigPath();
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(next, null, 2), "utf8");
  return next;
};
