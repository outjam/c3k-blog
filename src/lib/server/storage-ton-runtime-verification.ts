import { buildTonStorageGatewayFetchUrl, isRealTonStorageBagId, parseTonStoragePointer } from "@/lib/server/storage-ton-runtime-bridge";

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
