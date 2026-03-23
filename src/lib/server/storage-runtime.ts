import {
  C3K_STORAGE_RUNTIME_MODE,
  C3K_STORAGE_TEST_MODE_INGEST_ENABLED,
  C3K_STORAGE_TON_TESTNET_POINTER_BASE,
  C3K_STORAGE_TON_TESTNET_PROVIDER_LABEL,
  getC3kStorageConfig,
} from "@/lib/storage-config";
import type { StorageAsset, StorageBag, StorageRuntimeMode, StorageRuntimeStatusSnapshot } from "@/types/storage";

interface PrepareRuntimeBagInput {
  asset: StorageAsset;
  existingBag: StorageBag | null;
  mode: StorageRuntimeMode;
}

interface PrepareRuntimeBagResult {
  runtimeMode: StorageRuntimeMode;
  runtimeLabel: string;
  bagExternalId: string;
  tonstorageUri: string;
  metaFileUrl?: string;
  bagStatus: StorageBag["status"];
  replicasTarget: number;
  replicasActual: number;
  hasFetchableSource: boolean;
  requiresExternalUploadWorker: boolean;
  message: string;
  failureCode?: string;
}

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const inferBagFilePath = (asset: StorageAsset): string => {
  if (asset.fileName) {
    return asset.fileName;
  }

  const base = normalizeSafeId(asset.releaseSlug || asset.trackId || asset.id, 80) || "asset";
  return `${base}.${asset.format}`;
};

const buildTestBagExternalId = (asset: StorageAsset): string => {
  const base = normalizeSafeId(`c3k-test-${asset.releaseSlug || asset.trackId || asset.id}-${asset.format}`, 160);
  return base || `c3k-test-${Date.now()}`;
};

const buildTestTonstorageUri = (bagId: string, fileName: string): string => {
  const normalizedFileName = normalizeSafeId(fileName.replace(/\./g, "-"), 120) || "asset";
  return `tonstorage://c3k-test/${bagId}/${normalizedFileName}`;
};

const buildTestnetBagExternalId = (asset: StorageAsset): string => {
  const base = normalizeSafeId(`c3k-ton-testnet-${asset.releaseSlug || asset.trackId || asset.id}-${asset.format}`, 160);
  return base || `c3k-ton-testnet-${Date.now()}`;
};

const buildTestnetPointer = (bagId: string, fileName: string): string => {
  const normalizedFileName = normalizeSafeId(fileName.replace(/\./g, "-"), 120) || "asset";
  return `${C3K_STORAGE_TON_TESTNET_POINTER_BASE}/${bagId}/${normalizedFileName}`;
};

const hasSourcePointer = (asset: StorageAsset): boolean => {
  return Boolean(String(asset.sourceUrl ?? "").trim() || String(asset.audioFileId ?? "").trim());
};

const buildTestPrepareResult = (asset: StorageAsset, existingBag: StorageBag | null): PrepareRuntimeBagResult => {
  const bagFilePath = inferBagFilePath(asset);
  const hasFetchableSource = Boolean(asset.sourceUrl);
  const bagExternalId = existingBag?.bagId ?? buildTestBagExternalId(asset);
  const tonstorageUri = existingBag?.tonstorageUri ?? buildTestTonstorageUri(bagExternalId, bagFilePath);

  return {
    runtimeMode: "test_prepare",
    runtimeLabel: "Local test prepare",
    bagExternalId,
    tonstorageUri,
    metaFileUrl: asset.sourceUrl ?? existingBag?.metaFileUrl,
    bagStatus: hasFetchableSource ? "healthy" : "created",
    replicasTarget: existingBag?.replicasTarget || 1,
    replicasActual: hasFetchableSource ? Math.max(1, existingBag?.replicasActual ?? 0) : 0,
    hasFetchableSource,
    requiresExternalUploadWorker: false,
    message: hasFetchableSource
      ? existingBag
        ? "Test bag metadata refreshed from storage asset."
        : "Test bag prepared from storage asset."
      : "Test bag prepared without fetchable source URL; delivery stays limited until sourceUrl is added.",
  };
};

const buildTonStorageTestnetResult = (asset: StorageAsset, existingBag: StorageBag | null): PrepareRuntimeBagResult => {
  const bagFilePath = inferBagFilePath(asset);
  const available = hasSourcePointer(asset);

  if (!available) {
    return {
      runtimeMode: "tonstorage_testnet",
      runtimeLabel: "TON Storage testnet",
      bagExternalId: existingBag?.bagId ?? buildTestnetBagExternalId(asset),
      tonstorageUri: existingBag?.tonstorageUri ?? "",
      bagStatus: "draft",
      replicasTarget: existingBag?.replicasTarget || 3,
      replicasActual: existingBag?.replicasActual ?? 0,
      hasFetchableSource: false,
      requiresExternalUploadWorker: true,
      failureCode: "missing_source_pointer",
      message: "TON Storage testnet runtime требует sourceUrl или audioFileId для внешнего upload worker.",
    };
  }

  const bagExternalId = existingBag?.bagId ?? buildTestnetBagExternalId(asset);
  const tonstorageUri = existingBag?.tonstorageUri ?? buildTestnetPointer(bagExternalId, bagFilePath);
  const hasFetchableSource = Boolean(asset.sourceUrl);

  return {
    runtimeMode: "tonstorage_testnet",
    runtimeLabel: "TON Storage testnet",
    bagExternalId,
    tonstorageUri,
    metaFileUrl: asset.sourceUrl ?? existingBag?.metaFileUrl,
    bagStatus: hasFetchableSource ? "uploaded" : "created",
    replicasTarget: existingBag?.replicasTarget || 3,
    replicasActual: hasFetchableSource ? Math.max(1, existingBag?.replicasActual ?? 0) : 0,
    hasFetchableSource,
    requiresExternalUploadWorker: true,
    message: hasFetchableSource
      ? "TON Storage testnet pointer prepared. Следующий шаг — внешний upload/replication worker."
      : "Pointer prepared from asset reference, но внешний upload worker ещё не запущен.",
  };
};

export const getStorageRuntimeStatus = (): StorageRuntimeStatusSnapshot => {
  const config = getC3kStorageConfig();

  if (C3K_STORAGE_RUNTIME_MODE === "tonstorage_testnet") {
    const notes = [
      "Режим готовит настоящие testnet-style storage pointers и bag metadata.",
      "Фактический upload/replication всё ещё должен выполнить внешний runtime worker или daemon bridge.",
    ];

    if (!C3K_STORAGE_TON_TESTNET_POINTER_BASE) {
      notes.push("Не задан pointer base для TON Storage testnet runtime.");
    }

    return {
      mode: "tonstorage_testnet",
      label: "TON Storage testnet",
      pointerBase: C3K_STORAGE_TON_TESTNET_POINTER_BASE || undefined,
      providerLabel: C3K_STORAGE_TON_TESTNET_PROVIDER_LABEL || undefined,
      enabled: config.enabled,
      supportsRealPointers: Boolean(C3K_STORAGE_TON_TESTNET_POINTER_BASE),
      requiresExternalUploadWorker: true,
      notes,
    };
  }

  return {
    mode: "test_prepare",
    label: "Local test prepare",
    enabled: config.enabled,
    supportsRealPointers: false,
    requiresExternalUploadWorker: false,
    notes: [
      "Это placeholder ingest без реального TON Storage upload.",
      C3K_STORAGE_TEST_MODE_INGEST_ENABLED
        ? "Подходит для дешёвого тестирования storage flow и UI."
        : "Test ingest сейчас выключен через env.",
    ],
  };
};

export const prepareStorageBagViaRuntime = (input: PrepareRuntimeBagInput): PrepareRuntimeBagResult => {
  return input.mode === "tonstorage_testnet"
    ? buildTonStorageTestnetResult(input.asset, input.existingBag)
    : buildTestPrepareResult(input.asset, input.existingBag);
};
