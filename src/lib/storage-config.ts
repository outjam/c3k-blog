import type { StorageRuntimeMode } from "@/types/storage";

const parseBooleanFlag = (value: string | undefined, fallback = false): boolean => {
  if (typeof value !== "string") {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
};

const parseStorageRuntimeMode = (value: string | undefined): StorageRuntimeMode => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized === "tonstorage_testnet" ? "tonstorage_testnet" : "test_prepare";
};

export const C3K_STORAGE_ENABLED = parseBooleanFlag(
  process.env.NEXT_PUBLIC_C3K_STORAGE_ENABLED ?? process.env.C3K_STORAGE_ENABLED,
  false,
);

export const C3K_STORAGE_DESKTOP_CLIENT_ENABLED = parseBooleanFlag(
  process.env.NEXT_PUBLIC_C3K_STORAGE_DESKTOP_CLIENT_ENABLED ?? process.env.C3K_STORAGE_DESKTOP_CLIENT_ENABLED,
  false,
);

export const C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED = parseBooleanFlag(
  process.env.NEXT_PUBLIC_C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED ?? process.env.C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED,
  false,
);

export const C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED = parseBooleanFlag(
  process.env.C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED,
  false,
);

export const C3K_STORAGE_TEST_MODE_INGEST_ENABLED = parseBooleanFlag(
  process.env.C3K_STORAGE_TEST_MODE_INGEST_ENABLED,
  process.env.NODE_ENV !== "production",
);

export const C3K_STORAGE_RUNTIME_MODE = parseStorageRuntimeMode(
  process.env.NEXT_PUBLIC_C3K_STORAGE_RUNTIME_MODE ?? process.env.C3K_STORAGE_RUNTIME_MODE,
);

export const C3K_STORAGE_TON_TESTNET_POINTER_BASE = String(
  process.env.C3K_STORAGE_TON_TESTNET_POINTER_BASE ?? "tonstorage://testnet/c3k-runtime",
)
  .trim()
  .replace(/\/+$/, "");

export const C3K_STORAGE_TON_TESTNET_PROVIDER_LABEL = String(
  process.env.C3K_STORAGE_TON_TESTNET_PROVIDER_LABEL ?? "C3K Testnet Provider",
).trim();

export const getC3kStorageConfig = () => {
  return {
    enabled: C3K_STORAGE_ENABLED,
    desktopClientEnabled: C3K_STORAGE_DESKTOP_CLIENT_ENABLED,
    tonSiteDesktopGatewayEnabled: C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED,
    telegramBotDeliveryEnabled: C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED,
    testModeIngestEnabled: C3K_STORAGE_TEST_MODE_INGEST_ENABLED,
    runtimeMode: C3K_STORAGE_RUNTIME_MODE,
    tonTestnetPointerBase: C3K_STORAGE_TON_TESTNET_POINTER_BASE,
    tonTestnetProviderLabel: C3K_STORAGE_TON_TESTNET_PROVIDER_LABEL,
  };
};
