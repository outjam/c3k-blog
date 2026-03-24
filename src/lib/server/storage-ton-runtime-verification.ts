import { buildTonStorageGatewayFetchUrl, isRealTonStorageBagId, parseTonStoragePointer } from "@/lib/server/storage-ton-runtime-bridge";
import { reconcileStorageDeliveryRequestsForRuntimeAsset } from "@/lib/server/storage-delivery";
import {
  appendStorageHealthEvent,
  listStorageAssets,
  listStorageBags,
  listStorageBagFiles,
  upsertStorageBag,
} from "@/lib/server/storage-registry-store";
import type { StorageBagRuntimeReverifySummary, StorageBagRuntimeSweepSummary } from "@/types/storage";

export interface StorageTonRuntimeVerificationResult {
  status: "pending" | "verified" | "failed";
  checkedAt: string;
  verifiedAt?: string;
  gatewayUrl?: string;
  error?: string;
  probeMethod?: "HEAD" | "GET";
  httpStatus?: number;
}

const probeGatewayUrl = async (
  gatewayUrl: string,
): Promise<{
  ok: boolean;
  error?: string;
  probeMethod?: "HEAD" | "GET";
  httpStatus?: number;
}> => {
  const headResponse = await fetch(gatewayUrl, {
    method: "HEAD",
    cache: "no-store",
  }).catch(() => null);

  if (headResponse?.ok) {
    return {
      ok: true,
      probeMethod: "HEAD",
      httpStatus: headResponse.status,
    };
  }

  const getResponse = await fetch(gatewayUrl, {
    method: "GET",
    headers: {
      range: "bytes=0-0",
    },
    cache: "no-store",
  }).catch(() => null);

  if (!getResponse) {
    return {
      ok: false,
      error: "Gateway probe failed due to network error.",
    };
  }

  await getResponse.body?.cancel().catch(() => null);

  return {
    ok: getResponse.ok,
    probeMethod: "GET",
    httpStatus: getResponse.status,
    error: getResponse.ok ? undefined : `Gateway probe failed with HTTP ${getResponse.status}.`,
  };
};

export const verifyTonStorageRuntimePointer = async (input: {
  bagId?: string;
  storagePointer?: string;
  filePath?: string;
}): Promise<StorageTonRuntimeVerificationResult> => {
  const checkedAt = new Date().toISOString();
  const parsedPointer = parseTonStoragePointer(input.storagePointer);
  const resolvedBagId =
    (input.bagId && isRealTonStorageBagId(input.bagId) ? input.bagId : undefined) ?? parsedPointer?.bagId;

  if (!resolvedBagId || !isRealTonStorageBagId(resolvedBagId)) {
    return {
      status: "pending",
      checkedAt,
      error: "У bag пока нет реального TON Storage BagID.",
    };
  }

  const gatewayUrl = buildTonStorageGatewayFetchUrl({
    storagePointer: input.storagePointer,
    bagId: resolvedBagId,
    fileName: input.filePath || parsedPointer?.filePath,
  });

  if (!gatewayUrl) {
    return {
      status: "pending",
      checkedAt,
      error: "HTTP gateway для tonstorage:// pointer ещё не настроен.",
    };
  }

  const probe = await probeGatewayUrl(gatewayUrl);

  if (!probe.ok) {
    return {
      status: "failed",
      checkedAt,
      gatewayUrl,
      error: probe.error,
      probeMethod: probe.probeMethod,
      httpStatus: probe.httpStatus,
    };
  }

  return {
    status: "verified",
    checkedAt,
    verifiedAt: checkedAt,
    gatewayUrl,
    probeMethod: probe.probeMethod,
    httpStatus: probe.httpStatus,
  };
};

const pickBagFilePath = (input: {
  bagId: string;
  bagFiles: Awaited<ReturnType<typeof listStorageBagFiles>>;
  fallbackFileName?: string;
}): string | undefined => {
  const scoped = input.bagFiles
    .filter((entry) => entry.bagId === input.bagId)
    .sort((left, right) => left.priority - right.priority || left.path.localeCompare(right.path));

  return scoped[0]?.path || String(input.fallbackFileName ?? "").trim() || undefined;
};

export const reverifyStorageBagRuntimePointer = async (input: {
  bagId: string;
}): Promise<StorageBagRuntimeReverifySummary> => {
  const checkedAt = new Date().toISOString();
  const requestedBagId = String(input.bagId || "").trim();
  const [bags, assets, bagFiles] = await Promise.all([listStorageBags(), listStorageAssets(), listStorageBagFiles()]);
  const bag = bags.find((entry) => entry.id === requestedBagId) ?? null;

  if (!bag) {
    return {
      checkedAt,
      bagId: requestedBagId,
      assetId: "",
      status: "failed",
      error: "Bag not found.",
      reconciledRequestsUpdated: 0,
      reconciledReady: 0,
      reconciledProcessing: 0,
      reconciledPending: 0,
    };
  }

  const asset = assets.find((entry) => entry.id === bag.assetId) ?? null;
  const filePath = pickBagFilePath({
    bagId: bag.id,
    bagFiles,
    fallbackFileName: asset?.fileName,
  });
  const verification = await verifyTonStorageRuntimePointer({
    bagId: bag.bagId,
    storagePointer: bag.tonstorageUri,
    filePath,
  });

  const updatedBag = await upsertStorageBag({
    id: bag.id,
    assetId: bag.assetId,
    bagId: bag.bagId,
    description: bag.description,
    tonstorageUri: bag.tonstorageUri,
    metaFileUrl: bag.metaFileUrl,
    runtimeMode: bag.runtimeMode,
    runtimeLabel: bag.runtimeLabel,
    status: verification.status === "verified" ? "healthy" : bag.status,
    replicasTarget: bag.replicasTarget,
    replicasActual: bag.replicasActual,
    runtimeFetchStatus: verification.status,
    runtimeFetchCheckedAt: verification.checkedAt,
    runtimeFetchVerifiedAt: verification.verifiedAt ?? null,
    runtimeFetchUrl: verification.gatewayUrl ?? null,
    runtimeFetchError: verification.error ?? null,
  });

  if (updatedBag && verification.status === "verified") {
    await appendStorageHealthEvent({
      entityType: "bag",
      entityId: updatedBag.id,
      severity: "info",
      code: "runtime_fetch_reverified",
      message: `Gateway повторно подтвердил доступность ${updatedBag.tonstorageUri || updatedBag.bagId || updatedBag.id}.`,
    });
  } else if (updatedBag && verification.status === "failed") {
    await appendStorageHealthEvent({
      entityType: "bag",
      entityId: updatedBag.id,
      severity: "warning",
      code: "runtime_fetch_reverify_failed",
      message: verification.error || "Повторная проверка runtime pointer не прошла.",
    });
  }

  const reconcile =
    updatedBag && verification.status === "verified"
      ? await reconcileStorageDeliveryRequestsForRuntimeAsset({
          assetId: updatedBag.assetId,
          bagId: updatedBag.id,
        }).catch(() => ({
          scanned: 0,
          updated: 0,
          ready: 0,
          processing: 0,
          pending: 0,
        }))
      : {
          scanned: 0,
          updated: 0,
          ready: 0,
          processing: 0,
          pending: 0,
        };

  return {
    checkedAt,
    bagId: bag.id,
    assetId: bag.assetId,
    filePath,
    status: verification.status,
    gatewayUrl: verification.gatewayUrl,
    error: verification.error,
    probeMethod: verification.probeMethod,
    httpStatus: verification.httpStatus,
    reconciledRequestsUpdated: reconcile.updated,
    reconciledReady: reconcile.ready,
    reconciledProcessing: reconcile.processing,
    reconciledPending: reconcile.pending,
  };
};

export const reverifyPointerReadyStorageBags = async (input?: {
  limit?: number;
  onlyUnverified?: boolean;
}): Promise<StorageBagRuntimeSweepSummary> => {
  const checkedAt = new Date().toISOString();
  const safeLimit = Math.max(1, Math.min(100, Math.round(Number(input?.limit ?? 25) || 25)));
  const onlyUnverified = input?.onlyUnverified !== false;
  const bags = await listStorageBags();
  const candidates = bags
    .filter((bag) => bag.runtimeMode === "tonstorage_testnet")
    .filter((bag) => Boolean(String(bag.tonstorageUri ?? "").trim() || String(bag.bagId ?? "").trim()))
    .filter((bag) => bag.status !== "disabled")
    .filter((bag) => (onlyUnverified ? bag.runtimeFetchStatus !== "verified" : true))
    .sort((left, right) => Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt))
    .slice(0, safeLimit);

  let verified = 0;
  let failed = 0;
  let pending = 0;
  let reconciledRequestsUpdated = 0;
  let reconciledReady = 0;
  let reconciledProcessing = 0;
  let reconciledPending = 0;

  for (const bag of candidates) {
    const result = await reverifyStorageBagRuntimePointer({ bagId: bag.id });

    if (result.status === "verified") {
      verified += 1;
    } else if (result.status === "failed") {
      failed += 1;
    } else {
      pending += 1;
    }

    reconciledRequestsUpdated += result.reconciledRequestsUpdated;
    reconciledReady += result.reconciledReady;
    reconciledProcessing += result.reconciledProcessing;
    reconciledPending += result.reconciledPending;
  }

  return {
    checkedAt,
    scanned: candidates.length,
    verified,
    failed,
    pending,
    reconciledRequestsUpdated,
    reconciledReady,
    reconciledProcessing,
    reconciledPending,
    bagIds: candidates.map((bag) => bag.id),
  };
};
