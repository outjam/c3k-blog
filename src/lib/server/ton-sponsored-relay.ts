import { Address, internal, type OpenedContract } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, WalletContractV4 } from "@ton/ton";

type TonNetworkMode = "mainnet" | "testnet";

interface RelayConfig {
  network: TonNetworkMode;
  endpoint: string;
  apiKey?: string;
  sponsorMnemonicWords: string[];
  sponsorAddress?: string;
  mintRecipientAddress: string;
  mintFeeNano: bigint;
  confirmationTimeoutMs: number;
  providerRetryCount: number;
  providerRetryDelayMs: number;
  providerMinRequestGapMs: number;
}

export interface SponsoredRelayConfigStatus {
  ok: boolean;
  missing: string[];
  network: TonNetworkMode;
  mintRecipientAddress: string;
  sponsorAddress?: string;
}

export interface SponsoredMintRelayInput {
  releaseSlug: string;
  telegramUserId: number;
  ownerAddress: string;
}

export interface SponsoredMintRelayResult {
  txHash: string;
  network: TonNetworkMode;
  sponsorAddress: string;
  recipientAddress: string;
  amountNano: string;
  confirmed: boolean;
  relaySeqno: number;
}

const TON_ENDPOINT_MAINNET_DEFAULT = "https://toncenter.com/api/v2/jsonRPC";
const TON_ENDPOINT_TESTNET_DEFAULT = "https://testnet.toncenter.com/api/v2/jsonRPC";
const ZERO_BIGINT = BigInt(0);
const DEFAULT_MINT_FEE_NANO = BigInt("50000000");
const DEFAULT_PROVIDER_RETRY_COUNT = 4;
const DEFAULT_PROVIDER_RETRY_DELAY_MS = 1200;
const DEFAULT_PROVIDER_MIN_REQUEST_GAP_MS = 1250;

const normalizeTonNetwork = (value: unknown): TonNetworkMode => {
  return String(value ?? "").trim().toLowerCase() === "mainnet" ? "mainnet" : "testnet";
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const normalizePositiveInt = (value: unknown, fallback: number): number => {
  const parsed = Math.round(Number(value ?? fallback));

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, parsed);
};

const normalizeNonNegativeBigInt = (value: unknown, fallback: bigint): bigint => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return fallback;
  }

  try {
    const parsed = BigInt(normalized);
    return parsed > ZERO_BIGINT ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const splitMnemonic = (value: unknown): string[] => {
  return String(value ?? "")
    .trim()
    .split(/\s+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const extractStatusCode = (error: unknown): number | null => {
  if (!error || typeof error !== "object") {
    return null;
  }

  const source = error as {
    status?: unknown;
    response?: {
      status?: unknown;
    };
  };
  const directStatus = Math.round(Number(source.status));
  if (Number.isFinite(directStatus) && directStatus > 0) {
    return directStatus;
  }

  const responseStatus = Math.round(Number(source.response?.status));
  if (Number.isFinite(responseStatus) && responseStatus > 0) {
    return responseStatus;
  }

  const message = error instanceof Error ? error.message : String(error);
  const matched = /\bstatus code\s+(\d{3})\b/i.exec(message);
  if (!matched) {
    return null;
  }

  const parsed = Math.round(Number(matched[1]));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const buildProviderErrorMessage = (error: unknown, config: RelayConfig, phase: string): string => {
  const statusCode = extractStatusCode(error);

  if (statusCode === 401) {
    return "TON provider rejected TONCENTER_API_KEY (401). Remove or replace TONCENTER_API_KEY.";
  }

  if (statusCode === 429) {
    return `TON provider rate limit on ${phase} (429). Add TONCENTER_API_KEY or set ${
      config.network === "mainnet" ? "TON_MAINNET_ENDPOINT" : "TON_TESTNET_ENDPOINT"
    } to a dedicated endpoint.`;
  }

  if (statusCode !== null && statusCode >= 500) {
    return `TON provider internal error on ${phase} (${statusCode}). Retry later or switch provider endpoint.`;
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return `TON relay failed during ${phase}`;
};

const shouldRetryProviderError = (error: unknown): boolean => {
  const statusCode = extractStatusCode(error);

  if (statusCode === 429) {
    return true;
  }

  if (statusCode !== null && statusCode >= 500) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ["timeout", "temporarily unavailable", "network", "socket hang up", "econnreset"].some((entry) => message.includes(entry));
};

const runWithProviderRetry = async <T>(
  operation: () => Promise<T>,
  options: {
    config: RelayConfig;
    phase: string;
    state?: {
      lastRequestAt: number;
    };
  },
): Promise<T> => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < options.config.providerRetryCount; attempt += 1) {
    try {
      if (options.state && options.config.providerMinRequestGapMs > 0 && options.state.lastRequestAt > 0) {
        const elapsedMs = Date.now() - options.state.lastRequestAt;
        const waitMs = options.config.providerMinRequestGapMs - elapsedMs;

        if (waitMs > 0) {
          await sleep(waitMs);
        }
      }

      if (options.state) {
        options.state.lastRequestAt = Date.now();
      }

      return await operation();
    } catch (error) {
      lastError = error;

      if (!shouldRetryProviderError(error) || attempt >= options.config.providerRetryCount - 1) {
        const wrappedError = new Error(buildProviderErrorMessage(error, options.config, options.phase)) as Error & {
          status?: number;
        };
        wrappedError.status = extractStatusCode(error) ?? undefined;
        throw wrappedError;
      }

      const backoffMs = options.config.providerRetryDelayMs * (attempt + 1);
      await sleep(backoffMs);
    }
  }

  const wrappedError = new Error(buildProviderErrorMessage(lastError, options.config, options.phase)) as Error & {
    status?: number;
  };
  wrappedError.status = extractStatusCode(lastError) ?? undefined;
  throw wrappedError;
};

const waitForSeqnoIncrease = async (
  wallet: OpenedContract<WalletContractV4>,
  currentSeqno: number,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<boolean> => {
  const timeoutAt = Date.now() + Math.max(1_000, timeoutMs);

  while (Date.now() < timeoutAt) {
    await sleep(Math.max(1_100, pollIntervalMs));

    try {
      const nextSeqno = await wallet.getSeqno();
      if (nextSeqno > currentSeqno) {
        return true;
      }
    } catch {
      // ignore transient provider errors while waiting
    }
  }

  return false;
};

const resolveRelayConfig = (): RelayConfig => {
  const network = normalizeTonNetwork(process.env.NEXT_PUBLIC_TON_NETWORK);
  const endpoint =
    String(
      (network === "mainnet" ? process.env.TON_MAINNET_ENDPOINT : process.env.TON_TESTNET_ENDPOINT) ??
        (network === "mainnet" ? TON_ENDPOINT_MAINNET_DEFAULT : TON_ENDPOINT_TESTNET_DEFAULT),
    ).trim() || (network === "mainnet" ? TON_ENDPOINT_MAINNET_DEFAULT : TON_ENDPOINT_TESTNET_DEFAULT);
  const apiKey = String(process.env.TONCENTER_API_KEY ?? "").trim() || undefined;

  const mnemonicWords = splitMnemonic(process.env.TON_SPONSOR_WALLET_MNEMONIC || process.env.TON_TESTNET_WALLET_MNEMONIC);
  const sponsorAddress = normalizeTonAddress(process.env.TON_SPONSOR_WALLET_ADDRESS || process.env.TON_TESTNET_WALLET_BOUNCEABLE);

  const mintRecipientAddress = normalizeTonAddress(
    process.env.NEXT_PUBLIC_TON_MINT_ADDRESS || process.env.NEXT_PUBLIC_TON_TOPUP_ADDRESS,
  );

  const mintFeeNano = normalizeNonNegativeBigInt(process.env.NEXT_PUBLIC_TON_MINT_FEE_NANO, DEFAULT_MINT_FEE_NANO);
  const confirmationTimeoutMs = normalizePositiveInt(process.env.TON_SPONSOR_CONFIRMATION_TIMEOUT_MS, 12_000);
  const providerRetryCount = normalizePositiveInt(process.env.TON_SPONSOR_PROVIDER_RETRY_COUNT, DEFAULT_PROVIDER_RETRY_COUNT);
  const providerRetryDelayMs = normalizePositiveInt(
    process.env.TON_SPONSOR_PROVIDER_RETRY_DELAY_MS,
    DEFAULT_PROVIDER_RETRY_DELAY_MS,
  );
  const providerMinRequestGapMs = normalizePositiveInt(
    process.env.TON_SPONSOR_PROVIDER_MIN_REQUEST_GAP_MS,
    apiKey ? 1 : DEFAULT_PROVIDER_MIN_REQUEST_GAP_MS,
  );

  return {
    network,
    endpoint,
    apiKey,
    sponsorMnemonicWords: mnemonicWords,
    sponsorAddress: sponsorAddress || undefined,
    mintRecipientAddress,
    mintFeeNano,
    confirmationTimeoutMs,
    providerRetryCount,
    providerRetryDelayMs,
    providerMinRequestGapMs,
  };
};

export const resolveSponsoredMintGasFeeCents = (): number => {
  return normalizePositiveInt(process.env.TON_SPONSORED_MINT_GAS_STARS_CENTS, 2500);
};

export const getSponsoredRelayConfigStatus = (): SponsoredRelayConfigStatus => {
  const config = resolveRelayConfig();
  const missing: string[] = [];

  if (config.sponsorMnemonicWords.length < 12) {
    missing.push("TON_SPONSOR_WALLET_MNEMONIC");
    missing.push("TON_TESTNET_WALLET_MNEMONIC");
  }

  if (!config.mintRecipientAddress) {
    missing.push("NEXT_PUBLIC_TON_MINT_ADDRESS");
    missing.push("NEXT_PUBLIC_TON_TOPUP_ADDRESS");
  }

  return {
    ok: missing.length === 0,
    missing,
    network: config.network,
    mintRecipientAddress: config.mintRecipientAddress,
    sponsorAddress: config.sponsorAddress,
  };
};

export const hasSponsoredRelayConfig = (): boolean => {
  return getSponsoredRelayConfigStatus().ok;
};

export const sendSponsoredMintRelay = async (input: SponsoredMintRelayInput): Promise<SponsoredMintRelayResult> => {
  const config = resolveRelayConfig();

  if (config.sponsorMnemonicWords.length < 12) {
    throw new Error("TON sponsor mnemonic is not configured");
  }

  if (!config.mintRecipientAddress) {
    throw new Error("TON mint recipient address is not configured");
  }

  const executeRelay = async (activeConfig: RelayConfig): Promise<SponsoredMintRelayResult> => {
    const keyPair = await mnemonicToPrivateKey(activeConfig.sponsorMnemonicWords);
    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
    });
    const client = new TonClient({
      endpoint: activeConfig.endpoint,
      apiKey: activeConfig.apiKey,
    });
    const openedWallet = client.open(wallet);
    const providerState = { lastRequestAt: 0 };
    const seqno = await runWithProviderRetry(() => openedWallet.getSeqno(), {
      config: activeConfig,
      phase: "getSeqno",
      state: providerState,
    });

    const recipientAddress = Address.parse(activeConfig.mintRecipientAddress);
    const normalizedOwnerAddress = normalizeTonAddress(input.ownerAddress);
    const memo = `c3k sponsored mint | release=${input.releaseSlug} | user=${input.telegramUserId} | owner=${normalizedOwnerAddress}`.slice(
      0,
      240,
    );

    await runWithProviderRetry(
      () =>
        openedWallet.sendTransfer({
          seqno,
          secretKey: keyPair.secretKey,
          messages: [
            internal({
              to: recipientAddress,
              value: activeConfig.mintFeeNano,
              body: memo,
              bounce: false,
            }),
          ],
        }),
      {
        config: activeConfig,
        phase: "sendTransfer",
        state: providerState,
      },
    );

    if (activeConfig.providerMinRequestGapMs > 0) {
      await sleep(activeConfig.providerMinRequestGapMs);
    }

    const confirmed = await waitForSeqnoIncrease(
      openedWallet,
      seqno,
      activeConfig.confirmationTimeoutMs,
      activeConfig.providerMinRequestGapMs,
    );
    const sponsorAddress = activeConfig.sponsorAddress || wallet.address.toString({ testOnly: activeConfig.network === "testnet" });
    const txHash = `sponsored:${wallet.address.toString({ testOnly: activeConfig.network === "testnet" })}:${seqno}`;

    return {
      txHash,
      network: activeConfig.network,
      sponsorAddress,
      recipientAddress: recipientAddress.toString({ testOnly: activeConfig.network === "testnet" }),
      amountNano: activeConfig.mintFeeNano.toString(),
      confirmed,
      relaySeqno: seqno,
    };
  };

  try {
    return await executeRelay(config);
  } catch (error) {
    const statusCode = extractStatusCode(error);

    if ((statusCode === 401 || (statusCode !== null && statusCode >= 500)) && config.apiKey) {
      const fallbackConfig: RelayConfig = {
        ...config,
        apiKey: undefined,
        providerMinRequestGapMs: Math.max(config.providerMinRequestGapMs, DEFAULT_PROVIDER_MIN_REQUEST_GAP_MS),
      };

      return executeRelay(fallbackConfig);
    }

    throw error;
  }
};
