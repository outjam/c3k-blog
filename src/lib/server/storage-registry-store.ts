import { getC3kStorageConfig } from "@/lib/storage-config";
import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import type {
  StorageBag,
  StorageBagFile,
  StorageHealthEvent,
  StorageNode,
  StorageNodeAssignment,
  StorageProgramMembership,
  StorageProgramSnapshot,
  StorageProviderContract,
  StorageRegistryState,
  StorageAsset,
} from "@/types/storage";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const STORAGE_REGISTRY_KEY = "storage_registry_v1";

interface PostgresAppStateRow {
  payload?: unknown;
  row_version?: number;
}

interface PostgresPutStateResult {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizeTelegramUserId = (value: unknown): number | undefined => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
};

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeSafeSlug = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const normalizeIsoDateTime = (value: unknown, fallbackIso: string): string => {
  const normalized = normalizeText(value, 120);
  const timestamp = Date.parse(normalized);

  if (normalized && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return fallbackIso;
};

const normalizeWalletAddress = (value: unknown): string | undefined => {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);

  return normalized || undefined;
};

const emptyState = (now = new Date().toISOString()): StorageRegistryState => ({
  assets: {},
  bags: {},
  bagFiles: {},
  nodes: {},
  nodeAssignments: {},
  providerContracts: {},
  memberships: {},
  healthEvents: [],
  updatedAt: now,
});

const normalizeAsset = (id: string, value: unknown, now: string): StorageAsset | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;

  return {
    id,
    releaseSlug: normalizeSafeSlug(source.releaseSlug, 120) || undefined,
    trackId: normalizeSafeSlug(source.trackId, 120) || undefined,
    artistTelegramUserId: normalizeTelegramUserId(source.artistTelegramUserId),
    resourceKey: normalizeOptionalText(source.resourceKey, 240),
    audioFileId: normalizeOptionalText(source.audioFileId, 160),
    assetType:
      source.assetType === "audio_master" ||
      source.assetType === "audio_preview" ||
      source.assetType === "cover" ||
      source.assetType === "booklet" ||
      source.assetType === "nft_media" ||
      source.assetType === "site_bundle"
        ? source.assetType
        : "audio_master",
    format:
      source.format === "aac" ||
      source.format === "alac" ||
      source.format === "ogg" ||
      source.format === "wav" ||
      source.format === "flac" ||
      source.format === "zip" ||
      source.format === "png" ||
      source.format === "json" ||
      source.format === "html_bundle"
        ? source.format
        : "mp3",
    sourceUrl: normalizeOptionalText(source.sourceUrl, 3000),
    fileName: normalizeOptionalText(source.fileName, 255),
    mimeType: normalizeOptionalText(source.mimeType, 180),
    sizeBytes: normalizeNonNegativeInt(source.sizeBytes),
    checksumSha256: normalizeOptionalText(source.checksumSha256, 128),
    createdAt: normalizeIsoDateTime(source.createdAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const normalizeBag = (id: string, value: unknown, now: string): StorageBag | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const assetId = normalizeSafeId(source.assetId, 120);

  if (!assetId) {
    return null;
  }

  return {
    id,
    bagId: normalizeOptionalText(source.bagId, 160),
    assetId,
    description: normalizeOptionalText(source.description, 500),
    tonstorageUri: normalizeOptionalText(source.tonstorageUri, 500),
    metaFileUrl: normalizeOptionalText(source.metaFileUrl, 3000),
    status:
      source.status === "draft" ||
      source.status === "created" ||
      source.status === "uploaded" ||
      source.status === "replicating" ||
      source.status === "healthy" ||
      source.status === "degraded" ||
      source.status === "disabled"
        ? source.status
        : "draft",
    replicasTarget: normalizeNonNegativeInt(source.replicasTarget),
    replicasActual: normalizeNonNegativeInt(source.replicasActual),
    createdAt: normalizeIsoDateTime(source.createdAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const normalizeBagFile = (id: string, value: unknown): StorageBagFile | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const bagId = normalizeSafeId(source.bagId, 120);
  const path = normalizeText(source.path, 1000);

  if (!bagId || !path) {
    return null;
  }

  return {
    id,
    bagId,
    path,
    sizeBytes: normalizeNonNegativeInt(source.sizeBytes),
    priority: normalizeNonNegativeInt(source.priority),
    mimeType: normalizeOptionalText(source.mimeType, 180),
  };
};

const normalizeNode = (id: string, value: unknown, now: string): StorageNode | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const nodeLabel = normalizeText(source.nodeLabel, 120);

  if (!nodeLabel) {
    return null;
  }

  return {
    id,
    userTelegramId: normalizeTelegramUserId(source.userTelegramId),
    walletAddress: normalizeWalletAddress(source.walletAddress),
    nodeLabel,
    nodeType:
      source.nodeType === "owned_provider" ||
      source.nodeType === "partner_provider" ||
      source.nodeType === "community_node"
        ? source.nodeType
        : "community_node",
    platform:
      source.platform === "macos" || source.platform === "windows" || source.platform === "linux"
        ? source.platform
        : "linux",
    status:
      source.status === "candidate" ||
      source.status === "active" ||
      source.status === "degraded" ||
      source.status === "suspended"
        ? source.status
        : "candidate",
    diskAllocatedBytes: normalizeNonNegativeInt(source.diskAllocatedBytes),
    diskUsedBytes: normalizeNonNegativeInt(source.diskUsedBytes),
    bandwidthLimitKbps: normalizeNonNegativeInt(source.bandwidthLimitKbps),
    lastSeenAt: source.lastSeenAt ? normalizeIsoDateTime(source.lastSeenAt, now) : undefined,
    createdAt: normalizeIsoDateTime(source.createdAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const normalizeAssignment = (id: string, value: unknown, now: string): StorageNodeAssignment | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const nodeId = normalizeSafeId(source.nodeId, 120);
  const bagId = normalizeSafeId(source.bagId, 120);

  if (!nodeId || !bagId) {
    return null;
  }

  return {
    id,
    nodeId,
    bagId,
    assignmentStatus:
      source.assignmentStatus === "pending" ||
      source.assignmentStatus === "replicating" ||
      source.assignmentStatus === "serving" ||
      source.assignmentStatus === "failed"
        ? source.assignmentStatus
        : "pending",
    assignedAt: normalizeIsoDateTime(source.assignedAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const normalizeProviderContract = (
  id: string,
  value: unknown,
  now: string,
): StorageProviderContract | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const providerNodeId = normalizeSafeId(source.providerNodeId, 120);
  const providerContractAddress = normalizeText(source.providerContractAddress, 160);

  if (!providerNodeId || !providerContractAddress) {
    return null;
  }

  return {
    id,
    providerNodeId,
    providerContractAddress,
    acceptingNewContracts: Boolean(source.acceptingNewContracts),
    minBagSizeBytes: normalizeNonNegativeInt(source.minBagSizeBytes),
    maxBagSizeBytes: normalizeNonNegativeInt(source.maxBagSizeBytes),
    rateNanoTonPerMbDay: normalizeText(source.rateNanoTonPerMbDay, 80) || "0",
    maxSpanSec: normalizeNonNegativeInt(source.maxSpanSec),
    maxContracts: normalizeNonNegativeInt(source.maxContracts),
    maxTotalSizeBytes: normalizeNonNegativeInt(source.maxTotalSizeBytes),
    lastSyncedAt: source.lastSyncedAt ? normalizeIsoDateTime(source.lastSyncedAt, now) : undefined,
  };
};

const normalizeHealthEvent = (value: unknown, index: number, now: string): StorageHealthEvent | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const entityId = normalizeSafeId(source.entityId, 120);
  const code = normalizeText(source.code, 120);
  const message = normalizeText(source.message, 500);

  if (!entityId || !code || !message) {
    return null;
  }

  return {
    id: normalizeSafeId(source.id, 120) || `event-${index + 1}`,
    entityType:
      source.entityType === "node" || source.entityType === "bag" || source.entityType === "provider"
        ? source.entityType
        : "node",
    entityId,
    severity:
      source.severity === "info" || source.severity === "warning" || source.severity === "critical"
        ? source.severity
        : "info",
    code,
    message,
    createdAt: normalizeIsoDateTime(source.createdAt, now),
  };
};

const normalizeMembership = (key: string, value: unknown, now: string): StorageProgramMembership | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const telegramUserId = normalizeTelegramUserId(source.telegramUserId ?? key);

  if (!telegramUserId) {
    return null;
  }

  return {
    telegramUserId,
    walletAddress: normalizeWalletAddress(source.walletAddress),
    status:
      source.status === "approved" ||
      source.status === "rejected" ||
      source.status === "suspended" ||
      source.status === "pending"
        ? source.status
        : "pending",
    tier:
      source.tier === "keeper" ||
      source.tier === "core" ||
      source.tier === "guardian"
        ? source.tier
        : "supporter",
    note: normalizeOptionalText(source.note, 1200),
    moderationNote: normalizeOptionalText(source.moderationNote, 500),
    joinedAt: normalizeIsoDateTime(source.joinedAt, now),
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const sanitizeState = (value: unknown): StorageRegistryState => {
  const now = new Date().toISOString();

  if (!value || typeof value !== "object") {
    return emptyState(now);
  }

  const source = value as Record<string, unknown>;
  const assetsSource = source.assets && typeof source.assets === "object" ? (source.assets as Record<string, unknown>) : {};
  const bagsSource = source.bags && typeof source.bags === "object" ? (source.bags as Record<string, unknown>) : {};
  const bagFilesSource =
    source.bagFiles && typeof source.bagFiles === "object" ? (source.bagFiles as Record<string, unknown>) : {};
  const nodesSource = source.nodes && typeof source.nodes === "object" ? (source.nodes as Record<string, unknown>) : {};
  const assignmentsSource =
    source.nodeAssignments && typeof source.nodeAssignments === "object"
      ? (source.nodeAssignments as Record<string, unknown>)
      : {};
  const providerContractsSource =
    source.providerContracts && typeof source.providerContracts === "object"
      ? (source.providerContracts as Record<string, unknown>)
      : {};
  const membershipsSource =
    source.memberships && typeof source.memberships === "object"
      ? (source.memberships as Record<string, unknown>)
      : {};

  return {
    assets: Object.fromEntries(
      Object.entries(assetsSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeAsset(id, entry, now) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    bags: Object.fromEntries(
      Object.entries(bagsSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeBag(id, entry, now) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    bagFiles: Object.fromEntries(
      Object.entries(bagFilesSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeBagFile(id, entry) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    nodes: Object.fromEntries(
      Object.entries(nodesSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeNode(id, entry, now) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    nodeAssignments: Object.fromEntries(
      Object.entries(assignmentsSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeAssignment(id, entry, now) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    providerContracts: Object.fromEntries(
      Object.entries(providerContractsSource).flatMap(([rawId, entry]) => {
        const id = normalizeSafeId(rawId, 120);
        const normalized = id ? normalizeProviderContract(id, entry, now) : null;
        return normalized ? [[id, normalized]] : [];
      }),
    ),
    memberships: Object.fromEntries(
      Object.entries(membershipsSource).flatMap(([rawId, entry]) => {
        const key = normalizeText(rawId, 32);
        const normalized = key ? normalizeMembership(key, entry, now) : null;
        return normalized ? [[String(normalized.telegramUserId), normalized]] : [];
      }),
    ),
    healthEvents: Array.isArray(source.healthEvents)
      ? source.healthEvents
          .map((entry, index) => normalizeHealthEvent(entry, index, now))
          .filter((entry): entry is StorageHealthEvent => Boolean(entry))
          .slice(0, 5000)
      : [],
    updatedAt: normalizeIsoDateTime(source.updatedAt, now),
  };
};

const ensureDbEnabled = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const throwStrictError = (message: string): never => {
  throw new Error(message);
};

const readStateWithVersion = async (): Promise<{ state: StorageRegistryState; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: STORAGE_REGISTRY_KEY,
  });

  if (!rows) {
    return null;
  }

  const first = rows[0];

  if (!first) {
    return {
      state: emptyState(),
      rowVersion: 0,
    };
  }

  return {
    state: sanitizeState(first.payload),
    rowVersion: typeof first.row_version === "number" ? first.row_version : 1,
  };
};

const writeState = async (
  state: StorageRegistryState,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: STORAGE_REGISTRY_KEY,
    p_payload: state,
    p_expected_row_version: expectedRowVersion,
  });

  if (!rows || !rows[0]) {
    return { ok: false, conflict: false };
  }

  const first = rows[0];

  if (Boolean(first.ok)) {
    return { ok: true };
  }

  return { ok: false, conflict: String(first.error ?? "") === "version_conflict" };
};

const mutateState = async (mutate: (state: StorageRegistryState) => StorageRegistryState): Promise<StorageRegistryState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for storage registry");
    }

    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStateWithVersion();

    if (!current) {
      break;
    }

    const next = sanitizeState(mutate(current.state));
    next.updatedAt = new Date().toISOString();
    const saved = await writeState(next, current.rowVersion);

    if (saved.ok) {
      return next;
    }

    if (!saved.conflict) {
      break;
    }
  }

  if (POSTGRES_STRICT) {
    throwStrictError("Failed to mutate storage registry in Postgres");
  }

  return null;
};

export const getStorageRegistrySnapshot = async (): Promise<StorageRegistryState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for storage registry");
    }

    return null;
  }

  const current = await readStateWithVersion();

  if (!current) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read storage registry from Postgres");
    }

    return null;
  }

  if (current.rowVersion > 0) {
    return current.state;
  }

  const bootstrapped = await writeState(current.state, 0);

  if (bootstrapped.ok) {
    return current.state;
  }

  if (!bootstrapped.conflict) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to bootstrap storage registry in Postgres");
    }

    return null;
  }

  const replay = await readStateWithVersion();

  if (!replay) {
    if (POSTGRES_STRICT) {
      throwStrictError("Failed to read bootstrapped storage registry from Postgres");
    }

    return null;
  }

  return replay.state;
};

export const getStorageProgramMembership = async (
  telegramUserId: number,
): Promise<StorageProgramMembership | null> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return null;
  }

  return snapshot.memberships[String(telegramUserId)] ?? null;
};

export const joinStorageProgram = async (input: {
  telegramUserId: number;
  walletAddress?: string;
  note?: string;
}): Promise<StorageProgramMembership | null> => {
  const telegramUserId = normalizeTelegramUserId(input.telegramUserId);

  if (!telegramUserId) {
    return null;
  }

  const now = new Date().toISOString();
  const walletAddress = normalizeWalletAddress(input.walletAddress);
  const note = normalizeOptionalText(input.note, 1200);

  const next = await mutateState((current) => {
    const existing = current.memberships[String(telegramUserId)];
    const membership: StorageProgramMembership = {
      telegramUserId,
      walletAddress: walletAddress ?? existing?.walletAddress,
      status: existing?.status === "approved" ? "approved" : "pending",
      tier: existing?.tier ?? "supporter",
      note,
      moderationNote: existing?.moderationNote,
      joinedAt: existing?.joinedAt ?? now,
      updatedAt: now,
    };

    return {
      ...current,
      memberships: {
        ...current.memberships,
        [String(telegramUserId)]: membership,
      },
    };
  });

  return next?.memberships[String(telegramUserId)] ?? null;
};

export const buildStorageProgramSnapshot = async (
  telegramUserId: number,
): Promise<StorageProgramSnapshot> => {
  const config = getC3kStorageConfig();
  const snapshot = await getStorageRegistrySnapshot();
  const membership = snapshot?.memberships[String(telegramUserId)] ?? null;
  const nodeCount = snapshot
    ? Object.values(snapshot.nodes).filter((entry) => entry.userTelegramId === telegramUserId).length
    : 0;

  return {
    ...config,
    membership,
    nodeCount,
  };
};

export const listStorageAssets = async (): Promise<StorageAsset[]> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.assets).sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
};

export const listStorageBags = async (): Promise<StorageBag[]> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.bags).sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
};

export const listStorageNodes = async (): Promise<StorageNode[]> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.nodes).sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left;
  });
};

export const listStorageMemberships = async (): Promise<StorageProgramMembership[]> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.memberships).sort((a, b) => {
    const left = new Date(a.updatedAt || a.joinedAt).getTime();
    const right = new Date(b.updatedAt || b.joinedAt).getTime();
    return right - left;
  });
};

export const listStorageHealthEvents = async (): Promise<StorageHealthEvent[]> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return [];
  }

  return [...snapshot.healthEvents].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return right - left;
  });
};

export const upsertStorageAsset = async (input: {
  id?: string;
  releaseSlug?: string;
  trackId?: string;
  artistTelegramUserId?: number;
  resourceKey?: string;
  audioFileId?: string;
  assetType: StorageAsset["assetType"];
  format: StorageAsset["format"];
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  checksumSha256?: string;
}): Promise<StorageAsset | null> => {
  const assetType = input.assetType;
  const format = input.format;
  const id = normalizeSafeId(input.id ?? `asset-${Date.now()}`, 120) || `asset-${Date.now()}`;

  const next = await mutateState((current) => {
    const now = new Date().toISOString();
    const existing = current.assets[id];
    const asset: StorageAsset = {
      id,
      releaseSlug: normalizeSafeSlug(input.releaseSlug, 120) || existing?.releaseSlug,
      trackId: normalizeSafeSlug(input.trackId, 120) || existing?.trackId,
      artistTelegramUserId: normalizeTelegramUserId(input.artistTelegramUserId) ?? existing?.artistTelegramUserId,
      resourceKey: normalizeOptionalText(input.resourceKey, 240) ?? existing?.resourceKey,
      audioFileId: normalizeOptionalText(input.audioFileId, 160) ?? existing?.audioFileId,
      assetType,
      format,
      sourceUrl: normalizeOptionalText(input.sourceUrl, 3000) ?? existing?.sourceUrl,
      fileName: normalizeOptionalText(input.fileName, 255) ?? existing?.fileName,
      mimeType: normalizeOptionalText(input.mimeType, 180) ?? existing?.mimeType,
      sizeBytes: normalizeNonNegativeInt(input.sizeBytes ?? existing?.sizeBytes ?? 0),
      checksumSha256: normalizeOptionalText(input.checksumSha256, 128) ?? existing?.checksumSha256,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    return {
      ...current,
      assets: {
        ...current.assets,
        [id]: asset,
      },
    };
  });

  return next?.assets[id] ?? null;
};

export const upsertStorageBag = async (input: {
  id?: string;
  assetId: string;
  bagId?: string;
  description?: string;
  tonstorageUri?: string;
  metaFileUrl?: string;
  status?: StorageBag["status"];
  replicasTarget?: number;
  replicasActual?: number;
}): Promise<StorageBag | null> => {
  const assetId = normalizeSafeId(input.assetId, 120);

  if (!assetId) {
    return null;
  }

  const id = normalizeSafeId(input.id ?? `bag-${Date.now()}`, 120) || `bag-${Date.now()}`;

  const next = await mutateState((current) => {
    const now = new Date().toISOString();
    const existing = current.bags[id];
    const bag: StorageBag = {
      id,
      bagId: normalizeOptionalText(input.bagId, 160) ?? existing?.bagId,
      assetId,
      description: normalizeOptionalText(input.description, 500) ?? existing?.description,
      tonstorageUri: normalizeOptionalText(input.tonstorageUri, 500) ?? existing?.tonstorageUri,
      metaFileUrl: normalizeOptionalText(input.metaFileUrl, 3000) ?? existing?.metaFileUrl,
      status: input.status ?? existing?.status ?? "draft",
      replicasTarget: normalizeNonNegativeInt(input.replicasTarget ?? existing?.replicasTarget ?? 0),
      replicasActual: normalizeNonNegativeInt(input.replicasActual ?? existing?.replicasActual ?? 0),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    return {
      ...current,
      bags: {
        ...current.bags,
        [id]: bag,
      },
    };
  });

  return next?.bags[id] ?? null;
};

export const updateStorageMembership = async (input: {
  telegramUserId: number;
  status?: StorageProgramMembership["status"];
  tier?: StorageProgramMembership["tier"];
  moderationNote?: string | null;
  walletAddress?: string | null;
}): Promise<StorageProgramMembership | null> => {
  const telegramUserId = normalizeTelegramUserId(input.telegramUserId);

  if (!telegramUserId) {
    return null;
  }

  const next = await mutateState((current) => {
    const now = new Date().toISOString();
    const existing = current.memberships[String(telegramUserId)];

    if (!existing) {
      throw new Error("membership_not_found");
    }

    const membership: StorageProgramMembership = {
      ...existing,
      walletAddress:
        input.walletAddress === null
          ? undefined
          : normalizeWalletAddress(input.walletAddress) ?? existing.walletAddress,
      status: input.status ?? existing.status,
      tier: input.tier ?? existing.tier,
      moderationNote:
        input.moderationNote === null
          ? undefined
          : normalizeOptionalText(input.moderationNote, 500) ?? existing.moderationNote,
      updatedAt: now,
    };

    return {
      ...current,
      memberships: {
        ...current.memberships,
        [String(telegramUserId)]: membership,
      },
    };
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    if (message === "membership_not_found") {
      return message;
    }

    throw error;
  });

  if (typeof next === "string") {
    return null;
  }

  return next?.memberships[String(telegramUserId)] ?? null;
};
