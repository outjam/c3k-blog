import { resolvePublicBaseUrl } from "@/lib/server/public-base-url";
import {
  getActiveTonRuntimeCollectionAddress,
  getCurrentTonRuntimeNetwork,
  getTonRuntimeConfig,
  isTonRuntimeConfigForActiveNetwork,
} from "@/lib/server/ton-runtime-config-store";
import { isTonOnchainNftMintEnabled, resolveTonNftCollectionAddress } from "@/lib/server/ton-nft-reference";
import { getSponsoredRelayConfigStatus } from "@/lib/server/ton-sponsored-relay";
import type { AdminTonEnvironmentStatus } from "@/types/admin";

export const readAdminTonEnvironmentStatus = async (
  request: Request,
): Promise<AdminTonEnvironmentStatus> => {
  const updatedAt = new Date().toISOString();
  const network = getCurrentTonRuntimeNetwork();
  const runtimeConfig = await getTonRuntimeConfig();
  const runtimeNetworkMatches = isTonRuntimeConfigForActiveNetwork(runtimeConfig);
  const runtimeCollectionAddress = runtimeConfig?.collectionAddress || null;
  const envCollectionAddress = resolveTonNftCollectionAddress() || null;
  const activeRuntimeCollectionAddress = getActiveTonRuntimeCollectionAddress(runtimeConfig) || null;
  const activeCollectionAddress = activeRuntimeCollectionAddress || envCollectionAddress;
  const collectionSource: AdminTonEnvironmentStatus["collectionSource"] = activeRuntimeCollectionAddress
    ? "runtime"
    : envCollectionAddress
      ? "env"
      : "missing";
  const relayConfig = getSponsoredRelayConfigStatus(activeCollectionAddress ?? undefined);
  const onchainMintEnabled = isTonOnchainNftMintEnabled();
  const publicBaseUrl = resolvePublicBaseUrl(request);
  const warnings: string[] = [];

  if (runtimeConfig?.collectionAddress && !runtimeNetworkMatches) {
    warnings.push(
      `Runtime collection сохранена для другой сети (${runtimeConfig.network ?? "unknown"}). Сейчас активна ${network}.`,
    );
  }

  if (onchainMintEnabled && !activeCollectionAddress) {
    warnings.push("On-chain mint включён, но активная collection не настроена ни в runtime, ни в env.");
  }

  if (onchainMintEnabled && !publicBaseUrl) {
    warnings.push("Не удаётся определить публичный base URL для metadata и deploy flow.");
  }

  if (onchainMintEnabled && relayConfig.missing.length > 0) {
    warnings.push(`Relay env неполный: ${relayConfig.missing.join(", ")}.`);
  }

  return {
    updatedAt,
    network,
    onchainMintEnabled,
    publicBaseUrl,
    envCollectionAddress,
    runtimeCollectionAddress,
    runtimeConfigNetwork: runtimeConfig?.network ?? null,
    runtimeNetworkMatches,
    activeCollectionAddress,
    collectionSource,
    relayReady: relayConfig.ok,
    relayMissing: relayConfig.missing,
    sponsorAddress: relayConfig.sponsorAddress,
    warnings,
  };
};
