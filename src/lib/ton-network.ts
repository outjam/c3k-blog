import { toUserFriendlyAddress } from "@tonconnect/ui";

export const TON_CHAIN_MAINNET = "-239";
export const TON_CHAIN_TESTNET = "-3";

export type TonNetworkMode = "mainnet" | "testnet";

const normalizeMode = (value: unknown): TonNetworkMode => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  return normalized === "mainnet" ? "mainnet" : "testnet";
};

const parseBooleanFlag = (value: unknown, fallback: boolean): boolean => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return fallback;
  }

  if (["1", "true", "yes", "on", "enabled"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off", "disabled"].includes(normalized)) {
    return false;
  }

  return fallback;
};

const normalizeAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 256);
};

export const TON_NETWORK_MODE: TonNetworkMode = normalizeMode(process.env.NEXT_PUBLIC_TON_NETWORK);
export const TON_REQUIRED_CHAIN = TON_NETWORK_MODE === "mainnet" ? TON_CHAIN_MAINNET : TON_CHAIN_TESTNET;
export const TON_NETWORK_LABEL = TON_NETWORK_MODE === "mainnet" ? "mainnet" : "testnet";
export const TON_IS_TESTNET = TON_NETWORK_MODE === "testnet";
export const TON_TESTNET_SELF_RECIPIENT_FALLBACK = parseBooleanFlag(
  process.env.NEXT_PUBLIC_TON_TESTNET_SELF_RECIPIENT_FALLBACK,
  TON_IS_TESTNET,
);

export const isTonWalletOnRequiredNetwork = (chain: string | null | undefined): boolean => {
  const normalized = String(chain ?? "").trim();

  if (!normalized) {
    return true;
  }

  return normalized === TON_REQUIRED_CHAIN;
};

export const toPreferredTonAddress = (address: string, chain: string | null | undefined): string => {
  const normalized = normalizeAddress(address);
  if (!normalized) {
    return "";
  }

  if (!normalized.includes(":")) {
    return normalized;
  }

  try {
    return toUserFriendlyAddress(normalized, String(chain ?? "").trim() === TON_CHAIN_TESTNET);
  } catch {
    return normalized;
  }
};

export const resolveTonTransferRecipient = (params: {
  configuredAddress: string;
  connectedAddress: string;
  connectedChain: string | null | undefined;
}): { address: string; usedSelfFallback: boolean } => {
  const configuredAddress = normalizeAddress(params.configuredAddress);
  if (configuredAddress) {
    return { address: configuredAddress, usedSelfFallback: false };
  }

  if (TON_IS_TESTNET && TON_TESTNET_SELF_RECIPIENT_FALLBACK) {
    const connectedAddress = toPreferredTonAddress(params.connectedAddress, params.connectedChain);
    if (connectedAddress) {
      return { address: connectedAddress, usedSelfFallback: true };
    }
  }

  return { address: "", usedSelfFallback: false };
};
