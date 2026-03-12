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

const waitForSeqnoIncrease = async (
  wallet: OpenedContract<WalletContractV4>,
  currentSeqno: number,
  timeoutMs: number,
): Promise<boolean> => {
  const timeoutAt = Date.now() + Math.max(1_000, timeoutMs);

  while (Date.now() < timeoutAt) {
    await sleep(1_100);

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

  return {
    network,
    endpoint,
    apiKey,
    sponsorMnemonicWords: mnemonicWords,
    sponsorAddress: sponsorAddress || undefined,
    mintRecipientAddress,
    mintFeeNano,
    confirmationTimeoutMs,
  };
};

export const resolveSponsoredMintGasFeeCents = (): number => {
  return normalizePositiveInt(process.env.TON_SPONSORED_MINT_GAS_STARS_CENTS, 2500);
};

export const hasSponsoredRelayConfig = (): boolean => {
  const config = resolveRelayConfig();
  return config.sponsorMnemonicWords.length >= 12 && Boolean(config.mintRecipientAddress);
};

export const sendSponsoredMintRelay = async (input: SponsoredMintRelayInput): Promise<SponsoredMintRelayResult> => {
  const config = resolveRelayConfig();

  if (config.sponsorMnemonicWords.length < 12) {
    throw new Error("TON sponsor mnemonic is not configured");
  }

  if (!config.mintRecipientAddress) {
    throw new Error("TON mint recipient address is not configured");
  }

  const keyPair = await mnemonicToPrivateKey(config.sponsorMnemonicWords);
  const wallet = WalletContractV4.create({
    workchain: 0,
    publicKey: keyPair.publicKey,
  });
  const client = new TonClient({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
  });
  const openedWallet = client.open(wallet);
  const seqno = await openedWallet.getSeqno();

  const recipientAddress = Address.parse(config.mintRecipientAddress);
  const normalizedOwnerAddress = normalizeTonAddress(input.ownerAddress);
  const memo = `c3k sponsored mint | release=${input.releaseSlug} | user=${input.telegramUserId} | owner=${normalizedOwnerAddress}`.slice(
    0,
    240,
  );

  await openedWallet.sendTransfer({
    seqno,
    secretKey: keyPair.secretKey,
    messages: [
      internal({
        to: recipientAddress,
        value: config.mintFeeNano,
        body: memo,
        bounce: false,
      }),
    ],
  });

  const confirmed = await waitForSeqnoIncrease(openedWallet, seqno, config.confirmationTimeoutMs);
  const sponsorAddress = config.sponsorAddress || wallet.address.toString({ testOnly: config.network === "testnet" });
  const txHash = `sponsored:${wallet.address.toString({ testOnly: config.network === "testnet" })}:${seqno}`;

  return {
    txHash,
    network: config.network,
    sponsorAddress,
    recipientAddress: recipientAddress.toString({ testOnly: config.network === "testnet" }),
    amountNano: config.mintFeeNano.toString(),
    confirmed,
    relaySeqno: seqno,
  };
};
