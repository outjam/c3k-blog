import type { MintedReleaseNft } from "@/lib/social-hub";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";

interface MintViaSponsoredTonPayload {
  releaseSlug: string;
  ownerAddress: string;
  collectionAddress?: string;
}

export type MintViaSponsoredTonResult =
  | {
      ok: true;
      alreadyMinted: boolean;
      gasDebitedCents: number;
      walletCents: number;
      relay: {
        txHash: string;
        network: "mainnet" | "testnet";
        sponsorAddress: string;
        collectionAddress: string;
        itemAddress: string;
        itemIndex: string;
        amountNano: string;
        itemValueNano: string;
        confirmed: boolean;
        relaySeqno: number;
      } | null;
      nft: MintedReleaseNft;
      mintedReleaseNfts: MintedReleaseNft[];
    }
  | {
      ok: false;
      reason:
        | "wallet_required"
        | "not_purchased"
        | "insufficient_funds"
        | "relay_unavailable"
        | "relay_failed"
        | "network_error";
      walletCents: number;
      gasDebitedCents: number;
      relayError?: string;
      relayProvider?: string;
      message?: string;
    };

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeOptionalBigIntString = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim().slice(0, 40);

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = BigInt(normalized);
    return parsed >= BigInt(0) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

const normalizeMintedReleaseNft = (value: unknown): MintedReleaseNft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const releaseSlug = normalizeSlug(source.releaseSlug);
  const ownerAddress = normalizeTonAddress(source.ownerAddress);

  if (!releaseSlug || !ownerAddress) {
    return null;
  }

  const mintedAt = String(source.mintedAt ?? "").trim();

  return {
    id: String(source.id ?? `nft:${releaseSlug}:${mintedAt}`)
      .trim()
      .slice(0, 96),
    releaseSlug,
    ownerAddress,
    collectionAddress: normalizeTonAddress(source.collectionAddress) || undefined,
    itemAddress: normalizeTonAddress(source.itemAddress) || undefined,
    itemIndex: normalizeOptionalBigIntString(source.itemIndex),
    txHash: String(source.txHash ?? "").trim().slice(0, 256) || undefined,
    mintedAt,
    status: "minted",
  };
};

const normalizeMintedReleaseNfts = (value: unknown): MintedReleaseNft[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeMintedReleaseNft(entry))
    .filter((entry): entry is MintedReleaseNft => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry.releaseSlug)) {
        return false;
      }

      seen.add(entry.releaseSlug);
      return true;
    });
};

export const mintViaSponsoredTon = async (payload: MintViaSponsoredTonPayload): Promise<MintViaSponsoredTonResult> => {
  const releaseSlug = normalizeSlug(payload.releaseSlug);
  const ownerAddress = normalizeTonAddress(payload.ownerAddress);

  if (!releaseSlug || !ownerAddress) {
    return {
      ok: false,
      reason: "wallet_required",
      walletCents: 0,
      gasDebitedCents: 0,
      message: "releaseSlug и ownerAddress обязательны",
    };
  }

  try {
    const response = await fetch("/api/ton/sponsored-mint", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      cache: "no-store",
      body: JSON.stringify({
        releaseSlug,
        ownerAddress,
        collectionAddress: payload.collectionAddress,
      }),
    });

    const result = (await response.json()) as Record<string, unknown>;

    if (Boolean(result.ok)) {
      const nft = normalizeMintedReleaseNft(result.nft);
      if (!nft) {
        return {
          ok: false,
          reason: "network_error",
          walletCents: normalizeNonNegativeInt(result.walletCents),
          gasDebitedCents: 0,
          message: "Некорректный ответ mint API",
        };
      }

      const relaySource = result.relay;
      const relay =
        relaySource && typeof relaySource === "object"
          ? (() => {
              const relayNetwork: "mainnet" | "testnet" =
                String((relaySource as Record<string, unknown>).network ?? "").trim() === "mainnet" ? "mainnet" : "testnet";

              return {
                txHash: String((relaySource as Record<string, unknown>).txHash ?? "").trim(),
                network: relayNetwork,
                sponsorAddress: normalizeTonAddress((relaySource as Record<string, unknown>).sponsorAddress),
                collectionAddress: normalizeTonAddress((relaySource as Record<string, unknown>).collectionAddress),
                itemAddress: normalizeTonAddress((relaySource as Record<string, unknown>).itemAddress),
                itemIndex: normalizeOptionalBigIntString((relaySource as Record<string, unknown>).itemIndex) ?? "0",
                amountNano: String((relaySource as Record<string, unknown>).amountNano ?? "").trim(),
                itemValueNano: String((relaySource as Record<string, unknown>).itemValueNano ?? "").trim(),
                confirmed: Boolean((relaySource as Record<string, unknown>).confirmed),
                relaySeqno: normalizeNonNegativeInt((relaySource as Record<string, unknown>).relaySeqno),
              };
            })()
          : null;

      return {
        ok: true,
        alreadyMinted: Boolean(result.alreadyMinted),
        gasDebitedCents: normalizeNonNegativeInt(result.gasDebitedCents),
        walletCents: normalizeNonNegativeInt(result.walletCents),
        relay,
        nft,
        mintedReleaseNfts: normalizeMintedReleaseNfts(result.mintedReleaseNfts),
      };
    }

    return {
      ok: false,
      reason:
        String(result.reason ?? "").trim() === "insufficient_funds"
          ? "insufficient_funds"
          : String(result.reason ?? "").trim() === "not_purchased"
            ? "not_purchased"
            : String(result.reason ?? "").trim() === "relay_unavailable"
              ? "relay_unavailable"
              : String(result.reason ?? "").trim() === "relay_failed"
                ? "relay_failed"
                : "wallet_required",
      walletCents: normalizeNonNegativeInt(result.walletCents),
      gasDebitedCents: normalizeNonNegativeInt(result.gasDebitedCents),
      relayError: String(result.relayError ?? "").trim() || undefined,
      relayProvider: String(result.relayProvider ?? "").trim() || undefined,
      message: !response.ok ? `HTTP ${response.status}` : undefined,
    };
  } catch {
    return {
      ok: false,
      reason: "network_error",
      walletCents: 0,
      gasDebitedCents: 0,
      message: "Network error",
    };
  }
};
