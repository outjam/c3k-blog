import {
  listStorageAssets,
  listStorageBags,
} from "@/lib/server/storage-registry-store";
import type { StorageAsset, StorageBag } from "@/types/storage";

export interface StorageRuntimeFetchTarget {
  sourceUrl: string;
  via: "delivery_url" | "resolved_source" | "bag_meta" | "asset_source" | "bag_http_pointer";
  asset?: StorageAsset | null;
  bag?: StorageBag | null;
}

export interface StorageRuntimeFetchResult {
  ok: boolean;
  sourceUrl?: string;
  via?: StorageRuntimeFetchTarget["via"];
  asset?: StorageAsset | null;
  bag?: StorageBag | null;
  error?: string;
}

export interface StorageRuntimeBinaryResult extends StorageRuntimeFetchResult {
  bytes?: Uint8Array;
}

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const isHttpUrl = (value: string | undefined): boolean => /^https?:\/\//i.test(String(value ?? "").trim());

const pickAssetSourceUrl = (asset: StorageAsset | null | undefined): string | undefined => {
  return isHttpUrl(asset?.sourceUrl) ? String(asset?.sourceUrl).trim() : undefined;
};

const pickBagMetaUrl = (bag: StorageBag | null | undefined): string | undefined => {
  return isHttpUrl(bag?.metaFileUrl) ? String(bag?.metaFileUrl).trim() : undefined;
};

const pickBagPointerUrl = (bag: StorageBag | null | undefined): string | undefined => {
  return isHttpUrl(bag?.tonstorageUri) ? String(bag?.tonstorageUri).trim() : undefined;
};

const findBagByPointer = (bags: StorageBag[], storagePointer: string): StorageBag | null => {
  return (
    bags.find((entry) => normalizeText(entry.tonstorageUri) === storagePointer) ??
    bags.find((entry) => normalizeText(entry.bagId) === storagePointer) ??
    null
  );
};

const findAssetByPointer = (assets: StorageAsset[], storagePointer: string): StorageAsset | null => {
  return assets.find((entry) => normalizeText(entry.resourceKey) === storagePointer) ?? null;
};

const scoreBag = (bag: StorageBag): number => {
  switch (bag.status) {
    case "healthy":
      return 5;
    case "replicating":
      return 4;
    case "uploaded":
      return 3;
    case "created":
      return 2;
    case "draft":
      return 1;
    default:
      return 0;
  }
};

const pickPreferredBagForAsset = (bags: StorageBag[], assetId: string): StorageBag | null => {
  const candidates = bags.filter((entry) => entry.assetId === assetId);

  if (candidates.length === 0) {
    return null;
  }

  return [...candidates].sort((left, right) => scoreBag(right) - scoreBag(left))[0] ?? null;
};

export const resolveStorageRuntimeFetchTargetFromRegistry = (
  input: {
    deliveryUrl?: string;
    resolvedSourceUrl?: string;
    storagePointer?: string;
    assetId?: string;
    bagId?: string;
  },
  registry: { assets: StorageAsset[]; bags: StorageBag[] },
): StorageRuntimeFetchResult => {
  const { assets, bags } = registry;
  const deliveryUrl = normalizeText(input.deliveryUrl);
  if (isHttpUrl(deliveryUrl)) {
    return {
      ok: true,
      sourceUrl: deliveryUrl,
      via: "delivery_url",
    };
  }

  const resolvedSourceUrl = normalizeText(input.resolvedSourceUrl);
  if (isHttpUrl(resolvedSourceUrl)) {
    return {
      ok: true,
      sourceUrl: resolvedSourceUrl,
      via: "resolved_source",
    };
  }

  const bagId = normalizeText(input.bagId);
  const assetId = normalizeText(input.assetId);
  const storagePointer = normalizeText(input.storagePointer);

  const bagFromPointer = storagePointer ? findBagByPointer(bags, storagePointer) : null;
  const assetFromPointer = storagePointer ? findAssetByPointer(assets, storagePointer) : null;

  const explicitAsset = assetId ? assets.find((entry) => entry.id === assetId) ?? null : null;
  const asset = explicitAsset ?? (bagFromPointer ? assets.find((entry) => entry.id === bagFromPointer.assetId) ?? null : null) ?? assetFromPointer;

  const bag =
    (bagId ? bags.find((entry) => entry.id === bagId) ?? null : null) ??
    bagFromPointer ??
    (asset ? pickPreferredBagForAsset(bags, asset.id) : null);

  const bagMetaUrl = pickBagMetaUrl(bag);
  if (bagMetaUrl) {
    return {
      ok: true,
      sourceUrl: bagMetaUrl,
      via: "bag_meta",
      bag,
      asset,
    };
  }

  const assetSourceUrl = pickAssetSourceUrl(asset);
  if (assetSourceUrl) {
    return {
      ok: true,
      sourceUrl: assetSourceUrl,
      via: "asset_source",
      bag,
      asset,
    };
  }

  const bagPointerUrl = pickBagPointerUrl(bag);
  if (bagPointerUrl) {
    return {
      ok: true,
      sourceUrl: bagPointerUrl,
      via: "bag_http_pointer",
      bag,
      asset,
    };
  }

  return {
    ok: false,
    bag,
    asset,
    error: "Storage runtime не смог сопоставить pointer с fetchable source.",
  };
};

export const resolveStorageRuntimeFetchTarget = async (input: {
  deliveryUrl?: string;
  resolvedSourceUrl?: string;
  storagePointer?: string;
  assetId?: string;
  bagId?: string;
}): Promise<StorageRuntimeFetchResult> => {
  const [assets, bags] = await Promise.all([listStorageAssets(), listStorageBags()]);
  return resolveStorageRuntimeFetchTargetFromRegistry(input, { assets, bags });
};

export const canResolveStorageRuntimeFetchTarget = async (input: {
  deliveryUrl?: string;
  resolvedSourceUrl?: string;
  storagePointer?: string;
  assetId?: string;
  bagId?: string;
}): Promise<boolean> => {
  const resolved = await resolveStorageRuntimeFetchTarget(input);
  return resolved.ok;
};

export const fetchStorageRuntimeBinary = async (input: {
  deliveryUrl?: string;
  resolvedSourceUrl?: string;
  storagePointer?: string;
  assetId?: string;
  bagId?: string;
}): Promise<StorageRuntimeBinaryResult> => {
  const target = await resolveStorageRuntimeFetchTarget(input);

  if (!target.ok || !target.sourceUrl) {
    return target;
  }

  try {
    const response = await fetch(target.sourceUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        ...target,
        ok: false,
        error: `Storage runtime fetch failed with HTTP ${response.status}.`,
      };
    }

    const bytes = new Uint8Array(await response.arrayBuffer());

    return {
      ...target,
      ok: true,
      bytes,
    };
  } catch {
    return {
      ...target,
      ok: false,
      error: "Storage runtime fetch failed due to network error.",
    };
  }
};
