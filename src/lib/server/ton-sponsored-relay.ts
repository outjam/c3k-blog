import { Address, internal, type OpenedContract, type TupleItem, type TupleReader } from "@ton/core";
import { mnemonicToPrivateKey } from "@ton/crypto";
import { TonClient, TonClient4, WalletContractV4 } from "@ton/ton";

import {
  areTonAddressesEqual,
  buildReferenceNftIndexStack,
  buildReferenceNftMintBody,
  parseReferenceNftCollectionData,
  parseReferenceNftItemData,
  resolveTonNftCollectionAddress,
} from "./ton-nft-reference";

type TonNetworkMode = "mainnet" | "testnet";
type RelayProviderMode = "toncenter_v2" | "tonhub_v4";
type RelayClient = TonClient | TonClient4;

interface RelayConfig {
  network: TonNetworkMode;
  endpoint: string;
  endpointV4: string;
  apiKey?: string;
  sponsorMnemonicWords: string[];
  sponsorAddress?: string;
  collectionAddress: string;
  mintMessageValueNano: bigint;
  nftItemForwardValueNano: bigint;
  confirmationTimeoutMs: number;
  providerRetryCount: number;
  providerRetryDelayMs: number;
  providerMinRequestGapMs: number;
  primaryProvider: RelayProviderMode;
}

export interface SponsoredRelayConfigStatus {
  ok: boolean;
  missing: string[];
  network: TonNetworkMode;
  collectionAddress: string;
  sponsorAddress?: string;
}

export interface SponsoredMintRelayInput {
  releaseSlug: string;
  telegramUserId: number;
  ownerAddress: string;
  itemContentValue: string;
}

export interface SponsoredMintRelayResult {
  txHash: string;
  network: TonNetworkMode;
  sponsorAddress: string;
  collectionAddress: string;
  itemAddress: string;
  itemIndex: string;
  amountNano: string;
  itemValueNano: string;
  confirmed: boolean;
  relaySeqno: number;
  provider: "toncenter_v2" | "tonhub_v4";
}

type RelayError = Error & {
  status?: number;
  provider?: RelayProviderMode;
};

const TON_ENDPOINT_MAINNET_DEFAULT = "https://toncenter.com/api/v2/jsonRPC";
const TON_ENDPOINT_TESTNET_DEFAULT = "https://testnet.toncenter.com/api/v2/jsonRPC";
const TON_V4_ENDPOINT_MAINNET_DEFAULT = "https://mainnet-v4.tonhubapi.com";
const TON_V4_ENDPOINT_TESTNET_DEFAULT = "https://testnet-v4.tonhubapi.com";
const ZERO_BIGINT = BigInt(0);
const ONE_BIGINT = BigInt(1);
const DEFAULT_MINT_MESSAGE_VALUE_NANO = BigInt("50000000");
const DEFAULT_NFT_ITEM_FORWARD_VALUE_NANO = BigInt("30000000");
const MIN_COLLECTION_GAS_OVERHEAD_NANO = BigInt("10000000");
const DEFAULT_PROVIDER_RETRY_COUNT = 4;
const DEFAULT_PROVIDER_RETRY_DELAY_MS = 1200;
const DEFAULT_PROVIDER_MIN_REQUEST_GAP_MS = 1250;

const normalizeTonNetwork = (value: unknown): TonNetworkMode => {
  return String(value ?? "").trim().toLowerCase() === "mainnet" ? "mainnet" : "testnet";
};

const normalizeRelayProviderMode = (value: unknown, fallback: RelayProviderMode): RelayProviderMode => {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();

  if (normalized === "tonhub_v4" || normalized === "tonhub") {
    return "tonhub_v4";
  }

  if (normalized === "toncenter_v2" || normalized === "toncenter") {
    return "toncenter_v2";
  }

  return fallback;
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

const resolveNftItemForwardValueNano = (totalValueNano: bigint): bigint => {
  const requestedValue = normalizeNonNegativeBigInt(process.env.TON_NFT_ITEM_FORWARD_VALUE_NANO, DEFAULT_NFT_ITEM_FORWARD_VALUE_NANO);

  if (requestedValue < totalValueNano) {
    return requestedValue;
  }

  if (totalValueNano > MIN_COLLECTION_GAS_OVERHEAD_NANO) {
    return totalValueNano - MIN_COLLECTION_GAS_OVERHEAD_NANO;
  }

  if (totalValueNano > ONE_BIGINT) {
    return totalValueNano / BigInt(2);
  }

  return ONE_BIGINT;
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

const shouldFallbackProvider = (error: unknown): boolean => {
  const statusCode = extractStatusCode(error);

  if (statusCode === 401 || statusCode === 429) {
    return true;
  }

  if (statusCode !== null && statusCode >= 500) {
    return true;
  }

  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ["timeout", "temporarily unavailable", "network", "socket hang up", "econnreset"].some((entry) => message.includes(entry));
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
        const wrappedError = new Error(buildProviderErrorMessage(error, options.config, options.phase)) as RelayError;
        wrappedError.status = extractStatusCode(error) ?? undefined;
        throw wrappedError;
      }

      const backoffMs = options.config.providerRetryDelayMs * (attempt + 1);
      await sleep(backoffMs);
    }
  }

  const wrappedError = new Error(buildProviderErrorMessage(lastError, options.config, options.phase)) as RelayError;
  wrappedError.status = extractStatusCode(lastError) ?? undefined;
  throw wrappedError;
};

const withRelayProvider = (error: unknown, provider: RelayProviderMode): RelayError => {
  if (error instanceof Error) {
    const wrapped = error as RelayError;
    wrapped.provider = provider;
    return wrapped;
  }

  const wrapped = new Error(String(error)) as RelayError;
  wrapped.provider = provider;
  wrapped.status = extractStatusCode(error) ?? undefined;
  return wrapped;
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

const runContractMethod = async (
  client: RelayClient,
  address: Address,
  name: string,
  args: TupleItem[],
  options: {
    config: RelayConfig;
    state: {
      lastRequestAt: number;
    };
    phase?: string;
  },
): Promise<TupleReader> => {
  if (client instanceof TonClient4) {
    const block = await runWithProviderRetry(() => client.getLastBlock(), {
      config: options.config,
      phase: options.phase ? `${options.phase}:getLastBlock` : `${name}:getLastBlock`,
      state: options.state,
    });
    const result = await runWithProviderRetry(() => client.runMethod(block.last.seqno, address, name, args), {
      config: options.config,
      phase: options.phase ?? name,
      state: options.state,
    });

    return result.reader;
  }

  const result = await runWithProviderRetry(() => client.runMethod(address, name, args), {
    config: options.config,
    phase: options.phase ?? name,
    state: options.state,
  });

  return result.stack;
};

const waitForMintConfirmation = async (params: {
  client: RelayClient;
  config: RelayConfig;
  providerState: {
    lastRequestAt: number;
  };
  collectionAddress: Address;
  itemAddress: Address;
  itemIndex: bigint;
  ownerAddress: string;
}): Promise<boolean> => {
  const timeoutAt = Date.now() + Math.max(2_000, params.config.confirmationTimeoutMs);
  const pollIntervalMs = Math.max(1_100, params.config.providerMinRequestGapMs);

  while (Date.now() < timeoutAt) {
    await sleep(pollIntervalMs);

    try {
      const itemData = parseReferenceNftItemData(
        await runContractMethod(params.client, params.itemAddress, "get_nft_data", [], {
          config: params.config,
          state: params.providerState,
          phase: "get_nft_data",
        }),
      );

      if (
        itemData.initialized &&
        itemData.index === params.itemIndex &&
        areTonAddressesEqual(itemData.ownerAddress, params.ownerAddress)
      ) {
        return true;
      }
    } catch {
      // ignore transient provider errors while waiting for item deployment
    }

    try {
      const collectionData = parseReferenceNftCollectionData(
        await runContractMethod(params.client, params.collectionAddress, "get_collection_data", [], {
          config: params.config,
          state: params.providerState,
          phase: "get_collection_data:confirm",
        }),
      );

      if (collectionData.nextItemIndex > params.itemIndex) {
        return true;
      }
    } catch {
      // ignore transient provider errors while waiting for collection state
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
  const endpointV4 =
    String(
      (network === "mainnet" ? process.env.TON_MAINNET_V4_ENDPOINT : process.env.TON_TESTNET_V4_ENDPOINT) ??
        (network === "mainnet" ? TON_V4_ENDPOINT_MAINNET_DEFAULT : TON_V4_ENDPOINT_TESTNET_DEFAULT),
    ).trim() || (network === "mainnet" ? TON_V4_ENDPOINT_MAINNET_DEFAULT : TON_V4_ENDPOINT_TESTNET_DEFAULT);
  const apiKey = String(process.env.TONCENTER_API_KEY ?? "").trim() || undefined;

  const sponsorMnemonicWords = splitMnemonic(process.env.TON_SPONSOR_WALLET_MNEMONIC || process.env.TON_TESTNET_WALLET_MNEMONIC);
  const sponsorAddress = normalizeTonAddress(process.env.TON_SPONSOR_WALLET_ADDRESS || process.env.TON_TESTNET_WALLET_BOUNCEABLE);
  const collectionAddress = resolveTonNftCollectionAddress();

  const mintMessageValueNano = normalizeNonNegativeBigInt(process.env.NEXT_PUBLIC_TON_MINT_FEE_NANO, DEFAULT_MINT_MESSAGE_VALUE_NANO);
  const nftItemForwardValueNano = resolveNftItemForwardValueNano(mintMessageValueNano);
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
  const primaryProvider = normalizeRelayProviderMode(
    process.env.TON_SPONSOR_PRIMARY_PROVIDER,
    network === "testnet" ? "tonhub_v4" : "toncenter_v2",
  );

  return {
    network,
    endpoint,
    endpointV4,
    apiKey,
    sponsorMnemonicWords,
    sponsorAddress: sponsorAddress || undefined,
    collectionAddress,
    mintMessageValueNano,
    nftItemForwardValueNano,
    confirmationTimeoutMs,
    providerRetryCount,
    providerRetryDelayMs,
    providerMinRequestGapMs,
    primaryProvider,
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

  if (!config.collectionAddress) {
    missing.push("TON_NFT_COLLECTION_ADDRESS");
    missing.push("NEXT_PUBLIC_TON_NFT_COLLECTION_ADDRESS");
    missing.push("NEXT_PUBLIC_TON_MINT_ADDRESS");
  }

  return {
    ok: missing.length === 0,
    missing,
    network: config.network,
    collectionAddress: config.collectionAddress,
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

  if (!config.collectionAddress) {
    throw new Error("TON NFT collection address is not configured");
  }

  if (!String(input.itemContentValue ?? "").trim()) {
    throw new Error("TON NFT item content is not configured");
  }

  const executeRelay = async (activeConfig: RelayConfig, provider: RelayProviderMode): Promise<SponsoredMintRelayResult> => {
    const keyPair = await mnemonicToPrivateKey(activeConfig.sponsorMnemonicWords);
    const wallet = WalletContractV4.create({
      workchain: 0,
      publicKey: keyPair.publicKey,
    });
    const client: RelayClient =
      provider === "tonhub_v4"
        ? new TonClient4({
            endpoint: activeConfig.endpointV4,
          })
        : new TonClient({
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

    const collectionAddress = Address.parse(activeConfig.collectionAddress);
    const normalizedOwnerAddress = normalizeTonAddress(input.ownerAddress);

    if (!normalizedOwnerAddress) {
      throw new Error("TON owner address is required for NFT mint");
    }

    const collectionData = parseReferenceNftCollectionData(
      await runContractMethod(client, collectionAddress, "get_collection_data", [], {
        config: activeConfig,
        state: providerState,
      }),
    );
    const itemIndex = collectionData.nextItemIndex;
    const itemAddressStack = await runContractMethod(
      client,
      collectionAddress,
      "get_nft_address_by_index",
      buildReferenceNftIndexStack(itemIndex),
      {
        config: activeConfig,
        state: providerState,
      },
    );
    const itemAddress = itemAddressStack.readAddressOpt();

    if (!itemAddress) {
      throw new Error("NFT collection did not return an item address for the next index");
    }

    const sponsorWalletAddress = wallet.address.toString({ testOnly: activeConfig.network === "testnet" });
    const sponsorAddress = activeConfig.sponsorAddress || sponsorWalletAddress;
    const collectionOwnerAddress = collectionData.ownerAddress?.toString({ testOnly: activeConfig.network === "testnet" }) ?? undefined;

    if (collectionOwnerAddress && !areTonAddressesEqual(collectionOwnerAddress, sponsorWalletAddress)) {
      throw new Error(
        `TON sponsor wallet ${sponsorAddress} is not the owner of NFT collection ${activeConfig.collectionAddress}. Collection owner: ${collectionOwnerAddress}`,
      );
    }

    const body = buildReferenceNftMintBody({
      itemIndex,
      ownerAddress: normalizedOwnerAddress,
      itemContentValue: input.itemContentValue,
      itemValueNano: activeConfig.nftItemForwardValueNano,
    });

    await runWithProviderRetry(
      () =>
        openedWallet.sendTransfer({
          seqno,
          secretKey: keyPair.secretKey,
          messages: [
            internal({
              to: collectionAddress,
              value: activeConfig.mintMessageValueNano,
              body,
              bounce: true,
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

    const seqnoConfirmed = await waitForSeqnoIncrease(
      openedWallet,
      seqno,
      activeConfig.confirmationTimeoutMs,
      activeConfig.providerMinRequestGapMs,
    );
    const mintConfirmed =
      seqnoConfirmed &&
      (await waitForMintConfirmation({
        client,
        config: activeConfig,
        providerState,
        collectionAddress,
        itemAddress,
        itemIndex,
        ownerAddress: normalizedOwnerAddress,
      }));
    const txHash = `sponsored:${sponsorWalletAddress}:${seqno}:${itemIndex.toString()}`;

    return {
      txHash,
      network: activeConfig.network,
      sponsorAddress,
      collectionAddress: collectionAddress.toString({ testOnly: activeConfig.network === "testnet" }),
      itemAddress: itemAddress.toString({ testOnly: activeConfig.network === "testnet" }),
      itemIndex: itemIndex.toString(),
      amountNano: activeConfig.mintMessageValueNano.toString(),
      itemValueNano: activeConfig.nftItemForwardValueNano.toString(),
      confirmed: mintConfirmed,
      relaySeqno: seqno,
      provider,
    };
  };

  const providerOrder: RelayProviderMode[] =
    config.primaryProvider === "tonhub_v4" ? ["tonhub_v4", "toncenter_v2"] : ["toncenter_v2", "tonhub_v4"];

  let lastError: unknown = null;

  for (const provider of providerOrder) {
    try {
      const nextConfig =
        provider === "toncenter_v2"
          ? config
          : {
              ...config,
              apiKey: undefined,
              providerMinRequestGapMs: Math.max(config.providerMinRequestGapMs, DEFAULT_PROVIDER_MIN_REQUEST_GAP_MS),
            };

      return await executeRelay(nextConfig, provider);
    } catch (error) {
      lastError = withRelayProvider(error, provider);

      if (!shouldFallbackProvider(error)) {
        throw lastError;
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("TON relay failed on all configured providers");
};
