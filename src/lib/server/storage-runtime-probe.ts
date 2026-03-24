import { listStorageAssets, listStorageBags } from "@/lib/server/storage-registry-store";
import { resolveStorageRuntimeFetchTargetFromRegistry } from "@/lib/server/storage-runtime-fetch";
import type { StorageAsset, StorageBag, StorageRuntimeFetchVia } from "@/types/storage";

export interface StorageRuntimeProbeResult {
  checkedAt: string;
  ok: boolean;
  assetId?: string;
  bagId?: string;
  sourceUrl?: string;
  via?: StorageRuntimeFetchVia;
  probeMethod?: "HEAD" | "GET";
  httpStatus?: number;
  contentType?: string;
  contentLength?: number;
  error?: string;
  assetLabel?: string;
  bagLabel?: string;
}

const toAssetLabel = (asset: StorageAsset | null | undefined): string | undefined => {
  if (!asset) {
    return undefined;
  }

  return `${asset.releaseSlug || "no-release"} · ${asset.trackId || "full-release"} · ${asset.format}`;
};

const toBagLabel = (bag: StorageBag | null | undefined): string | undefined => {
  if (!bag) {
    return undefined;
  }

  return `${bag.assetId} · ${bag.runtimeLabel || bag.runtimeMode || "runtime pending"} · ${bag.status}`;
};

const probeHttpSource = async (
  sourceUrl: string,
): Promise<{
  ok: boolean;
  probeMethod?: "HEAD" | "GET";
  httpStatus?: number;
  contentType?: string;
  contentLength?: number;
  error?: string;
}> => {
  try {
    const headResponse = await fetch(sourceUrl, {
      method: "HEAD",
      cache: "no-store",
    }).catch(() => null);

    if (headResponse?.ok) {
      return {
        ok: true,
        probeMethod: "HEAD",
        httpStatus: headResponse.status,
        contentType: headResponse.headers.get("content-type") || undefined,
        contentLength: Number(headResponse.headers.get("content-length") || "") || undefined,
      };
    }

    const getResponse = await fetch(sourceUrl, {
      method: "GET",
      headers: {
        range: "bytes=0-0",
      },
      cache: "no-store",
    }).catch(() => null);

    if (!getResponse) {
      return {
        ok: false,
        error: "Storage runtime probe failed due to network error.",
      };
    }

    await getResponse.body?.cancel().catch(() => null);

    return {
      ok: getResponse.ok,
      probeMethod: "GET",
      httpStatus: getResponse.status,
      contentType: getResponse.headers.get("content-type") || undefined,
      contentLength: Number(getResponse.headers.get("content-length") || "") || undefined,
      error: getResponse.ok ? undefined : `Storage runtime probe failed with HTTP ${getResponse.status}.`,
    };
  } catch {
    return {
      ok: false,
      error: "Storage runtime probe failed due to unexpected error.",
    };
  }
};

export const probeStorageRuntime = async (input?: {
  assetId?: string;
  bagId?: string;
}): Promise<StorageRuntimeProbeResult> => {
  const [assets, bags] = await Promise.all([listStorageAssets(), listStorageBags()]);
  const explicitBag = input?.bagId ? bags.find((entry) => entry.id === input.bagId) ?? null : null;
  const explicitAsset = input?.assetId ? assets.find((entry) => entry.id === input.assetId) ?? null : null;
  const fallbackBag =
    explicitBag ??
    [...bags].sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0] ??
    null;
  const fallbackAsset =
    explicitAsset ??
    (fallbackBag ? assets.find((entry) => entry.id === fallbackBag.assetId) ?? null : null) ??
    [...assets].sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))[0] ??
    null;

  if (!fallbackAsset && !fallbackBag) {
    return {
      checkedAt: new Date().toISOString(),
      ok: false,
      error: "Storage runtime probe не нашёл ни assets, ни bags для проверки.",
    };
  }

  const resolved = resolveStorageRuntimeFetchTargetFromRegistry(
    {
      assetId: fallbackAsset?.id,
      bagId: fallbackBag?.id,
      storagePointer: fallbackBag?.tonstorageUri ?? fallbackBag?.bagId ?? fallbackAsset?.resourceKey,
    },
    { assets, bags },
  );

  if (!resolved.ok || !resolved.sourceUrl) {
    return {
      checkedAt: new Date().toISOString(),
      ok: false,
      assetId: fallbackAsset?.id,
      bagId: fallbackBag?.id,
      assetLabel: toAssetLabel(fallbackAsset),
      bagLabel: toBagLabel(fallbackBag),
      error: resolved.error ?? "Storage runtime probe не смог резолвить fetchable source.",
    };
  }

  const httpProbe = await probeHttpSource(resolved.sourceUrl);

  return {
    checkedAt: new Date().toISOString(),
    ok: httpProbe.ok,
    assetId: resolved.asset?.id ?? fallbackAsset?.id,
    bagId: resolved.bag?.id ?? fallbackBag?.id,
    sourceUrl: resolved.sourceUrl,
    via: resolved.via,
    probeMethod: httpProbe.probeMethod,
    httpStatus: httpProbe.httpStatus,
    contentType: httpProbe.contentType,
    contentLength: httpProbe.contentLength,
    assetLabel: toAssetLabel(resolved.asset ?? fallbackAsset),
    bagLabel: toBagLabel(resolved.bag ?? fallbackBag),
    error: httpProbe.error,
  };
};
