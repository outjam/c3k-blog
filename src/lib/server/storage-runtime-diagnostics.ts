import { resolveStorageRuntimeFetchTargetFromRegistry } from "@/lib/server/storage-runtime-fetch";
import type { StorageAsset, StorageBag, StorageRuntimeFetchVia } from "@/types/storage";

export interface StorageRuntimeDiagnosticsIssue {
  id: string;
  label: string;
  reason: string;
}

export interface StorageRuntimeDiagnosticsSnapshot {
  generatedAt: string;
  assetsTotal: number;
  assetsResolvable: number;
  bagsTotal: number;
  bagsResolvable: number;
  pointerReadyBags: number;
  viaCounts: Record<StorageRuntimeFetchVia, number>;
  unresolvedAssets: StorageRuntimeDiagnosticsIssue[];
  unresolvedBags: StorageRuntimeDiagnosticsIssue[];
}

const emptyViaCounts = (): Record<StorageRuntimeFetchVia, number> => ({
  delivery_url: 0,
  resolved_source: 0,
  bag_meta: 0,
  asset_source: 0,
  bag_http_pointer: 0,
  tonstorage_gateway: 0,
});

const isPointerReadyBag = (bag: StorageBag): boolean => {
  return Boolean(String(bag.bagId ?? "").trim() || String(bag.tonstorageUri ?? "").trim());
};

export const buildStorageRuntimeDiagnostics = (input: {
  assets: StorageAsset[];
  bags: StorageBag[];
}): StorageRuntimeDiagnosticsSnapshot => {
  const { assets, bags } = input;
  const viaCounts = emptyViaCounts();
  const unresolvedAssets: StorageRuntimeDiagnosticsIssue[] = [];
  const unresolvedBags: StorageRuntimeDiagnosticsIssue[] = [];

  let assetsResolvable = 0;
  let bagsResolvable = 0;

  for (const asset of assets) {
    const resolved = resolveStorageRuntimeFetchTargetFromRegistry(
      {
        assetId: asset.id,
        storagePointer: asset.resourceKey,
      },
      input,
    );

    if (resolved.ok && resolved.via) {
      assetsResolvable += 1;
      viaCounts[resolved.via] += 1;
      continue;
    }

    unresolvedAssets.push({
      id: asset.id,
      label: `${asset.releaseSlug || "no-release"} · ${asset.trackId || "full-release"} · ${asset.format}`,
      reason: resolved.error ?? "Нет fetchable source ни у asset, ни у связанного bag.",
    });
  }

  for (const bag of bags) {
    const resolved = resolveStorageRuntimeFetchTargetFromRegistry(
      {
        bagId: bag.id,
        storagePointer: bag.tonstorageUri || bag.bagId,
      },
      input,
    );

    if (resolved.ok && resolved.via) {
      bagsResolvable += 1;
      viaCounts[resolved.via] += 1;
      continue;
    }

    unresolvedBags.push({
      id: bag.id,
      label: `${bag.assetId} · ${bag.runtimeLabel || bag.runtimeMode || "runtime pending"} · ${bag.status}`,
      reason: resolved.error ?? "У bag нет fetchable source для runtime.",
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    assetsTotal: assets.length,
    assetsResolvable,
    bagsTotal: bags.length,
    bagsResolvable,
    pointerReadyBags: bags.filter((bag) => isPointerReadyBag(bag)).length,
    viaCounts,
    unresolvedAssets: unresolvedAssets.slice(0, 8),
    unresolvedBags: unresolvedBags.slice(0, 8),
  };
};
