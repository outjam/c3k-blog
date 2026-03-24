import { getC3kStorageConfig } from "@/lib/storage-config";
import { getStorageDeliveryState } from "@/lib/server/storage-delivery-store";
import { getStorageIngestState } from "@/lib/server/storage-ingest-store";
import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import type {
  StorageBag,
  StorageBagFile,
  StorageHealthEvent,
  StorageNode,
  StorageNodeAssignment,
  StoragePeerAssignmentPreview,
  StorageProgramRuntimeSummary,
  StorageProgramMembership,
  StorageProgramNetworkSummary,
  StorageProgramNodeSummary,
  StoragePublicNodeSnapshot,
  StorageProgramSnapshot,
  StorageProviderContract,
  StorageRegistryState,
  StorageAsset,
  StorageDeliveryState,
  StorageIngestState,
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

const normalizeLatitude = (value: unknown): number | undefined => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed >= -90 && parsed <= 90 ? parsed : undefined;
};

const normalizeLongitude = (value: unknown): number | undefined => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) && parsed >= -180 && parsed <= 180 ? parsed : undefined;
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

const STORAGE_NODE_HEALTH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const STORAGE_NODE_STALE_HEARTBEAT_MS = 72 * 60 * 60 * 1000;

const parseTimestamp = (value: string | undefined): number => {
  const timestamp = Date.parse(String(value ?? ""));
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const pickLatestIso = (values: Array<string | undefined>): string | undefined => {
  return [...values]
    .filter((entry) => parseTimestamp(entry) > 0)
    .sort((left, right) => parseTimestamp(right) - parseTimestamp(left))[0];
};

const calculateDistanceKm = (
  leftLat: number,
  leftLon: number,
  rightLat: number,
  rightLon: number,
): number => {
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(rightLat - leftLat);
  const dLon = toRadians(rightLon - leftLon);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(leftLat)) *
      Math.cos(toRadians(rightLat)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusKm * c;
};

const buildNodeReliabilitySnapshot = (
  entry: StorageNode,
  healthEvents: StorageHealthEvent[],
): Pick<
  StorageProgramNodeSummary,
  "reliabilityScore" | "reliabilityLabel" | "recentWarningCount" | "recentCriticalCount"
> => {
  const nowMs = Date.now();
  const recentEvents = healthEvents.filter((event) => {
    return (
      event.entityType === "node" &&
      event.entityId === entry.id &&
      nowMs - new Date(event.createdAt).getTime() <= STORAGE_NODE_HEALTH_WINDOW_MS
    );
  });
  const recentWarningCount = recentEvents.filter((event) => event.severity === "warning").length;
  const recentCriticalCount = recentEvents.filter((event) => event.severity === "critical").length;
  const lastSeenAgeHours = entry.lastSeenAt
    ? Math.max(0, (nowMs - new Date(entry.lastSeenAt).getTime()) / (1000 * 60 * 60))
    : null;

  let score = 20;

  if (entry.status === "active") {
    score += 40;
  } else if (entry.status === "degraded") {
    score += 22;
  } else if (entry.status === "candidate") {
    score += 10;
  }

  if (typeof entry.latitude === "number" && typeof entry.longitude === "number") {
    score += 10;
  }

  if (entry.diskAllocatedBytes > 0) {
    score += 8;
  }

  if (entry.bandwidthLimitKbps > 0) {
    score += 8;
  }

  if (lastSeenAgeHours !== null) {
    if (lastSeenAgeHours <= 12) {
      score += 14;
    } else if (lastSeenAgeHours <= 48) {
      score += 8;
    } else if (lastSeenAgeHours <= 168) {
      score += 2;
    } else {
      score -= 10;
    }
  }

  score -= recentWarningCount * 8;
  score -= recentCriticalCount * 18;

  const reliabilityScore = Math.max(0, Math.min(100, Math.round(score)));
  const reliabilityLabel =
    reliabilityScore >= 72 ? "stable" : reliabilityScore >= 42 ? "warming" : "attention";

  return {
    reliabilityScore,
    reliabilityLabel,
    recentWarningCount,
    recentCriticalCount,
  };
};

const buildNodeRewardSnapshot = (
  entry: StorageNode,
  reliability: Pick<
    StorageProgramNodeSummary,
    "reliabilityScore" | "reliabilityLabel" | "recentWarningCount" | "recentCriticalCount"
  >,
): Pick<
  StorageProgramNodeSummary,
  "rewardScore" | "rewardLabel" | "weeklyCreditsPreview" | "staleHeartbeat"
> => {
  const nowMs = Date.now();
  const lastSeenAgeMs = entry.lastSeenAt ? nowMs - new Date(entry.lastSeenAt).getTime() : Number.POSITIVE_INFINITY;
  const staleHeartbeat = !entry.lastSeenAt || lastSeenAgeMs > STORAGE_NODE_STALE_HEARTBEAT_MS;
  const diskGb = entry.diskAllocatedBytes / (1024 * 1024 * 1024);
  const bandwidthMbps = entry.bandwidthLimitKbps / 1000;

  let score = reliability.reliabilityScore * 0.58;

  if (entry.status === "active") {
    score += 12;
  } else if (entry.status === "degraded") {
    score += 5;
  }

  if (typeof entry.latitude === "number" && typeof entry.longitude === "number") {
    score += 6;
  }

  score += Math.min(12, diskGb / 20);
  score += Math.min(10, bandwidthMbps / 8);

  if (entry.nodeType !== "community_node") {
    score += 8;
  }

  if (staleHeartbeat) {
    score -= 18;
  }

  score -= reliability.recentWarningCount * 2;
  score -= reliability.recentCriticalCount * 6;

  const rewardScore = Math.max(0, Math.min(100, Math.round(score)));
  const rewardLabel = rewardScore >= 72 ? "strong" : rewardScore >= 42 ? "building" : "low";
  const weeklyCreditsPreview = Math.max(
    0,
    Math.round(rewardScore * (entry.nodeType === "community_node" ? 2.8 : 3.6)),
  );

  return {
    rewardScore,
    rewardLabel,
    weeklyCreditsPreview,
    staleHeartbeat,
  };
};

const buildPeerAssignmentReason = (input: {
  source: StorageProgramNodeSummary;
  target: StorageProgramNodeSummary;
  distanceKm?: number;
}): string => {
  const crossRegion = Boolean(input.source.countryCode && input.target.countryCode && input.source.countryCode !== input.target.countryCode);
  const mixedRoles = input.source.nodeType !== input.target.nodeType;

  if (crossRegion && mixedRoles) {
    return "Связывает разные регионы и роли сети, чтобы replica contour был устойчивее к локальным сбоям.";
  }

  if (crossRegion) {
    return "Даёт межрегиональный резервный peer, чтобы bags не зависели от одного города или страны.";
  }

  if (mixedRoles) {
    return "Связывает community node с provider-точкой и повышает устойчивость swarm contour.";
  }

  if ((input.distanceKm ?? 0) > 800) {
    return "Добавляет дальний резервный peer для более здорового swarm и recovery path.";
  }

  return "Добавляет соседний peer для более плотной репликации и быстрых handoff внутри сети.";
};

const buildPeerAssignmentStatus = (input: {
  source: StorageProgramNodeSummary;
  target: StorageProgramNodeSummary;
}): StoragePeerAssignmentPreview["status"] => {
  if (
    input.source.reliabilityLabel === "attention" ||
    input.target.reliabilityLabel === "attention" ||
    input.source.status === "suspended" ||
    input.target.status === "suspended"
  ) {
    return "risk";
  }

  if (input.source.reliabilityLabel === "stable" && input.target.reliabilityLabel === "stable") {
    return "ready";
  }

  return "watch";
};

const buildPeerAssignmentPreviews = (nodes: StorageProgramNodeSummary[]): StoragePeerAssignmentPreview[] => {
  const byId = new Map(nodes.map((entry) => [entry.id, entry]));
  const features = nodes.filter((entry) => entry.mapReady);
  const edges = new Map<string, StoragePeerAssignmentPreview>();

  features.forEach((source) => {
    const candidates = features
      .filter((target) => target.id !== source.id)
      .map((target) => {
        const distanceKm =
          typeof source.latitude === "number" &&
          typeof source.longitude === "number" &&
          typeof target.latitude === "number" &&
          typeof target.longitude === "number"
            ? calculateDistanceKm(source.latitude, source.longitude, target.latitude, target.longitude)
            : undefined;

        let score = target.reliabilityScore * 1.2 + target.rewardScore * 0.4;

        if (target.status === "active") {
          score += 12;
        } else if (target.status === "degraded") {
          score += 4;
        }

        if (source.nodeType !== target.nodeType) {
          score += 14;
        }

        if (source.countryCode && target.countryCode && source.countryCode !== target.countryCode) {
          score += 12;
        }

        if (distanceKm !== undefined) {
          if (distanceKm >= 2000) {
            score += 14;
          } else if (distanceKm >= 700) {
            score += 10;
          } else if (distanceKm >= 120) {
            score += 6;
          } else {
            score += 2;
          }
        }

        return {
          target,
          distanceKm,
          score,
        };
      })
      .sort((left, right) => right.score - left.score)
      .slice(0, 2);

    candidates.forEach(({ target, distanceKm }) => {
      const edgeKey = [source.id, target.id].sort().join("::");

      if (edges.has(edgeKey)) {
        return;
      }

      const status = buildPeerAssignmentStatus({ source, target });
      const edge: StoragePeerAssignmentPreview = {
        id: `peer-${edgeKey}`,
        sourceNodeId: source.id,
        sourceLabel: source.publicLabel || source.city || source.nodeLabel,
        sourceNodeType: source.nodeType,
        sourceLatitude: source.latitude,
        sourceLongitude: source.longitude,
        sourceReliabilityScore: source.reliabilityScore,
        targetNodeId: target.id,
        targetLabel: target.publicLabel || target.city || target.nodeLabel,
        targetNodeType: target.nodeType,
        targetLatitude: target.latitude,
        targetLongitude: target.longitude,
        targetReliabilityScore: target.reliabilityScore,
        status,
        reason: buildPeerAssignmentReason({ source, target, distanceKm }),
        distanceKm: distanceKm ? Math.round(distanceKm) : undefined,
      };

      edges.set(edgeKey, edge);
    });
  });

  return [...edges.values()]
    .filter((entry) => byId.has(entry.sourceNodeId) && byId.has(entry.targetNodeId))
    .sort((left, right) => {
      const statusWeight = { ready: 0, watch: 1, risk: 2 };
      const leftWeight = statusWeight[left.status];
      const rightWeight = statusWeight[right.status];

      if (leftWeight !== rightWeight) {
        return leftWeight - rightWeight;
      }

      const rightReliability = right.sourceReliabilityScore + right.targetReliabilityScore;
      const leftReliability = left.sourceReliabilityScore + left.targetReliabilityScore;
      return rightReliability - leftReliability;
    })
    .slice(0, 12);
};

const toStorageProgramNodeSummary = (
  entry: StorageNode,
  healthEvents: StorageHealthEvent[],
): StorageProgramNodeSummary => {
  const reliability = buildNodeReliabilitySnapshot(entry, healthEvents);
  const reward = buildNodeRewardSnapshot(entry, reliability);

  return {
    id: entry.id,
    nodeLabel: entry.nodeLabel,
    publicLabel: entry.publicLabel,
    city: entry.city,
    countryCode: entry.countryCode,
    latitude: entry.latitude,
    longitude: entry.longitude,
    status: entry.status,
    nodeType: entry.nodeType,
    platform: entry.platform,
    diskAllocatedBytes: entry.diskAllocatedBytes,
    diskUsedBytes: entry.diskUsedBytes,
    bandwidthLimitKbps: entry.bandwidthLimitKbps,
    lastSeenAt: entry.lastSeenAt,
    updatedAt: entry.updatedAt,
    mapReady: typeof entry.latitude === "number" && typeof entry.longitude === "number",
    peerLinkCount: 0,
    ...reliability,
    ...reward,
  };
};

const applyPeerLinkCounts = (
  nodes: StorageProgramNodeSummary[],
  peerAssignments: StoragePeerAssignmentPreview[],
): StorageProgramNodeSummary[] => {
  const counts = new Map<string, number>();

  peerAssignments.forEach((entry) => {
    counts.set(entry.sourceNodeId, (counts.get(entry.sourceNodeId) ?? 0) + 1);
    counts.set(entry.targetNodeId, (counts.get(entry.targetNodeId) ?? 0) + 1);
  });

  return nodes.map((entry) => ({
    ...entry,
    peerLinkCount: counts.get(entry.id) ?? 0,
  }));
};

const buildStorageProgramNetworkSummary = (
  nodes: StorageProgramNodeSummary[],
  healthEvents: StorageHealthEvent[],
  peerAssignments: StoragePeerAssignmentPreview[],
): StorageProgramNetworkSummary => {
  const nowMs = Date.now();
  const publicCountries = Array.from(
    new Set(nodes.map((entry) => normalizeText(entry.countryCode, 8).toUpperCase()).filter(Boolean)),
  ).slice(0, 8);
  const publicCities = Array.from(
    new Set(nodes.map((entry) => normalizeText(entry.city, 120)).filter(Boolean)),
  ).slice(0, 8);
  const recentNodeEvents = healthEvents.filter(
    (event) =>
      event.entityType === "node" && nowMs - new Date(event.createdAt).getTime() <= STORAGE_NODE_HEALTH_WINDOW_MS,
  );
  const recentWarningEvents = recentNodeEvents.filter((event) => event.severity === "warning").length;
  const recentCriticalEvents = recentNodeEvents.filter((event) => event.severity === "critical").length;
  const stableNodes = nodes.filter((entry) => entry.reliabilityLabel === "stable").length;
  const warmingNodes = nodes.filter((entry) => entry.reliabilityLabel === "warming").length;
  const attentionNodes = nodes.filter((entry) => entry.reliabilityLabel === "attention").length;
  const staleHeartbeatNodes = nodes.filter((entry) => entry.staleHeartbeat).length;
  const avgReliabilityScore =
    nodes.length > 0
      ? Math.round(nodes.reduce((sum, entry) => sum + entry.reliabilityScore, 0) / nodes.length)
      : 0;
  const avgRewardScore =
    nodes.length > 0 ? Math.round(nodes.reduce((sum, entry) => sum + entry.rewardScore, 0) / nodes.length) : 0;
  const totalWeeklyCreditsPreview = nodes.reduce((sum, entry) => sum + entry.weeklyCreditsPreview, 0);
  const topRewardNode = [...nodes].sort((left, right) => right.rewardScore - left.rewardScore)[0];
  const readyPeerAssignments = peerAssignments.filter((entry) => entry.status === "ready").length;
  const watchPeerAssignments = peerAssignments.filter((entry) => entry.status === "watch").length;
  const riskPeerAssignments = peerAssignments.filter((entry) => entry.status === "risk").length;
  const overallReliabilityLabel =
    avgReliabilityScore >= 72 && recentCriticalEvents === 0
      ? "stable"
      : avgReliabilityScore >= 42
        ? "warming"
        : "attention";
  const summary =
    overallReliabilityLabel === "stable"
      ? "Сеть уже выглядит устойчивой: есть живые peer-links, стабильные ноды и база для reward-layer."
      : overallReliabilityLabel === "warming"
        ? "Сеть растёт, но ей всё ещё нужны более стабильные heartbeat, peer-links и равномерная география."
        : "Сеть пока хрупкая: мало стабильных peer-links или слишком много attention-сигналов по нодам.";

  return {
    totalNodes: nodes.length,
    activeNodes: nodes.filter((entry) => entry.status === "active").length,
    degradedNodes: nodes.filter((entry) => entry.status === "degraded").length,
    communityNodes: nodes.filter((entry) => entry.nodeType === "community_node").length,
    providerNodes: nodes.filter((entry) => entry.nodeType !== "community_node").length,
    stableNodes,
    warmingNodes,
    attentionNodes,
    staleHeartbeatNodes,
    avgReliabilityScore,
    avgRewardScore,
    totalWeeklyCreditsPreview,
    topRewardNodeLabel: topRewardNode ? topRewardNode.publicLabel || topRewardNode.city || topRewardNode.nodeLabel : undefined,
    recentWarningEvents,
    recentCriticalEvents,
    peerAssignmentCount: peerAssignments.length,
    readyPeerAssignments,
    watchPeerAssignments,
    riskPeerAssignments,
    overallReliabilityLabel,
    summary,
    countries: publicCountries,
    cities: publicCities,
  };
};

const buildStorageProgramRuntimeSummary = (input: {
  registryState: StorageRegistryState | null;
  ingestState: StorageIngestState | null;
  deliveryState: StorageDeliveryState | null;
  telegramUserId: number;
}): StorageProgramRuntimeSummary => {
  const assets = input.registryState ? Object.values(input.registryState.assets) : [];
  const bags = input.registryState ? Object.values(input.registryState.bags) : [];
  const bagFiles = input.registryState ? Object.values(input.registryState.bagFiles) : [];
  const healthEvents = input.registryState ? input.registryState.healthEvents : [];
  const jobs = input.ingestState ? Object.values(input.ingestState.jobs) : [];
  const userDeliveries = input.deliveryState
    ? Object.values(input.deliveryState.requests).filter((entry) => entry.telegramUserId === input.telegramUserId)
    : [];

  const sourceReadyAssetCount = assets.filter((entry) => Boolean(entry.sourceUrl || entry.audioFileId || entry.resourceKey)).length;
  const uploadedBagCount = bags.filter((entry) =>
    entry.status === "uploaded" || entry.status === "replicating" || entry.status === "healthy",
  ).length;
  const pointerReadyBagCount = bags.filter((entry) => Boolean(entry.tonstorageUri || entry.bagId)).length;
  const verifiedBagCount = bags.filter((entry) => entry.runtimeFetchStatus === "verified").length;
  const failedBagCount = bags.filter(
    (entry) => entry.runtimeFetchStatus === "failed" || entry.status === "degraded" || entry.status === "disabled",
  ).length;
  const queuedJobCount = jobs.filter((entry) => entry.status === "queued").length;
  const processingJobCount = jobs.filter((entry) => entry.status === "processing").length;
  const preparedJobCount = jobs.filter((entry) => entry.status === "prepared").length;
  const uploadedJobCount = jobs.filter((entry) => entry.status === "uploaded").length;
  const failedJobCount = jobs.filter((entry) => entry.status === "failed").length;
  const processingDeliveryCount = userDeliveries.filter((entry) => entry.status === "processing").length;
  const pendingAssetMappingCount = userDeliveries.filter((entry) => entry.status === "pending_asset_mapping").length;
  const readyDeliveryCount = userDeliveries.filter((entry) => entry.status === "ready").length;
  const deliveredDeliveryCount = userDeliveries.filter((entry) => entry.status === "delivered").length;
  const failedDeliveryCount = userDeliveries.filter((entry) => entry.status === "failed").length;
  const runtimeBackedDeliveryCount = userDeliveries.filter(
    (entry) =>
      entry.lastDeliveredVia === "tonstorage_gateway" ||
      entry.lastDeliveredVia === "bag_http_pointer" ||
      entry.lastDeliveredVia === "bag_meta",
  ).length;
  const attentionCount = failedBagCount + failedJobCount + failedDeliveryCount + pendingAssetMappingCount;
  const recentEvents = [...healthEvents]
    .filter((entry) => entry.entityType === "runtime" || entry.entityType === "bag")
    .sort((left, right) => parseTimestamp(right.createdAt) - parseTimestamp(left.createdAt))
    .slice(0, 3);
  const lastActivityAt = pickLatestIso([
    ...assets.map((entry) => entry.updatedAt || entry.createdAt),
    ...bags.map((entry) => entry.updatedAt || entry.createdAt),
    ...jobs.map((entry) => entry.updatedAt || entry.completedAt || entry.createdAt),
    ...recentEvents.map((entry) => entry.createdAt),
  ]);
  const lastDeliveryAt = pickLatestIso(
    userDeliveries.map((entry) => entry.deliveredAt || entry.updatedAt || entry.createdAt),
  );

  let tone: StorageProgramRuntimeSummary["tone"] = "pending";
  let headline = "Runtime ещё собирается";
  let note = "После первых sync и ingest здесь появятся live bags, verified pointers и выдачи файлов.";

  if (verifiedBagCount > 0 || runtimeBackedDeliveryCount > 0) {
    tone = "live";
    headline = "Runtime уже живой";
    note =
      runtimeBackedDeliveryCount > 0
        ? `${verifiedBagCount} bag подтверждён(о), а ${runtimeBackedDeliveryCount} выдач уже прошли через storage contour.`
        : `${verifiedBagCount} bag подтверждён(о) и runtime уже готов к честной выдаче файлов.`;
  } else if (
    uploadedBagCount > 0 ||
    preparedJobCount > 0 ||
    processingJobCount > 0 ||
    readyDeliveryCount > 0 ||
    deliveredDeliveryCount > 0 ||
    assets.length > 0
  ) {
    tone = "ready";
    headline = "Runtime уже в работе";

    if (preparedJobCount > 0) {
      note = `${preparedJobCount} job ждут upload, ${pointerReadyBagCount} bag уже имеют pointer и metadata.`;
    } else if (uploadedBagCount > 0) {
      note = `${uploadedBagCount} bag уже загружены, осталось добить verification и delivery contour.`;
    } else if (assets.length > 0) {
      note = `${sourceReadyAssetCount}/${assets.length} файлов уже имеют source для upload и archive pipeline.`;
    }
  }

  return {
    tone,
    headline,
    note,
    assetCount: assets.length,
    sourceReadyAssetCount,
    bagCount: bags.length,
    uploadedBagCount,
    pointerReadyBagCount,
    verifiedBagCount,
    failedBagCount,
    bagFileCount: bagFiles.length,
    queuedJobCount,
    processingJobCount,
    preparedJobCount,
    uploadedJobCount,
    failedJobCount,
    userDeliveryCount: userDeliveries.length,
    processingDeliveryCount,
    pendingAssetMappingCount,
    readyDeliveryCount,
    deliveredDeliveryCount,
    failedDeliveryCount,
    runtimeBackedDeliveryCount,
    webDeliveryCount: userDeliveries.filter((entry) => entry.channel === "web_download").length,
    telegramDeliveryCount: userDeliveries.filter((entry) => entry.channel === "telegram_bot").length,
    desktopDeliveryCount: userDeliveries.filter((entry) => entry.channel === "desktop_download").length,
    attentionCount,
    lastActivityAt,
    lastDeliveryAt,
    recentEvents,
  };
};

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
    runtimeMode:
      source.runtimeMode === "tonstorage_testnet" || source.runtimeMode === "test_prepare"
        ? source.runtimeMode
        : undefined,
    runtimeLabel: normalizeOptionalText(source.runtimeLabel, 160),
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
    runtimeFetchStatus:
      source.runtimeFetchStatus === "pending" ||
      source.runtimeFetchStatus === "verified" ||
      source.runtimeFetchStatus === "failed"
        ? source.runtimeFetchStatus
        : undefined,
    runtimeFetchCheckedAt: source.runtimeFetchCheckedAt
      ? normalizeIsoDateTime(source.runtimeFetchCheckedAt, now)
      : undefined,
    runtimeFetchVerifiedAt: source.runtimeFetchVerifiedAt
      ? normalizeIsoDateTime(source.runtimeFetchVerifiedAt, now)
      : undefined,
    runtimeFetchUrl: normalizeOptionalText(source.runtimeFetchUrl, 3000),
    runtimeFetchError: normalizeOptionalText(source.runtimeFetchError, 500),
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
    publicLabel: normalizeOptionalText(source.publicLabel, 120),
    city: normalizeOptionalText(source.city, 120),
    countryCode: normalizeOptionalText(source.countryCode, 8),
    latitude: normalizeLatitude(source.latitude),
    longitude: normalizeLongitude(source.longitude),
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
      source.entityType === "node" ||
      source.entityType === "bag" ||
      source.entityType === "provider" ||
      source.entityType === "runtime"
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

export const getStorageNode = async (
  id: string,
): Promise<StorageNode | null> => {
  const normalizedId = normalizeSafeId(id, 120);

  if (!normalizedId) {
    return null;
  }

  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return null;
  }

  return snapshot.nodes[normalizedId] ?? null;
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
  const runtimeStatus = getStorageRuntimeStatus();
  const [snapshot, ingestState, deliveryState] = await Promise.all([
    getStorageRegistrySnapshot(),
    getStorageIngestState(),
    getStorageDeliveryState(),
  ]);
  const membership = snapshot?.memberships[String(telegramUserId)] ?? null;
  const healthEvents = snapshot ? snapshot.healthEvents : [];
  const userNodes = snapshot
    ? Object.values(snapshot.nodes)
        .filter((entry) => entry.userTelegramId === telegramUserId)
        .sort((a, b) => {
          const left = new Date(a.updatedAt || a.createdAt).getTime();
          const right = new Date(b.updatedAt || b.createdAt).getTime();
          return right - left;
        })
    : [];
  const publicNodes = snapshot
    ? Object.values(snapshot.nodes)
        .filter((entry) => entry.status !== "suspended")
        .filter((entry) => typeof entry.latitude === "number" && typeof entry.longitude === "number")
        .sort((a, b) => {
          const left = new Date(a.updatedAt || a.createdAt).getTime();
          const right = new Date(b.updatedAt || b.createdAt).getTime();
          return right - left;
        })
        .slice(0, 6)
    : [];
  const publicNodeSummariesBase = publicNodes.map((entry) => toStorageProgramNodeSummary(entry, healthEvents));
  const peerAssignments = buildPeerAssignmentPreviews(publicNodeSummariesBase);
  const publicNodeSummaries = applyPeerLinkCounts(publicNodeSummariesBase, peerAssignments);
  const userNodeSummaries = applyPeerLinkCounts(
    userNodes.map((entry) => toStorageProgramNodeSummary(entry, healthEvents)),
    peerAssignments,
  );
  const networkSummary = buildStorageProgramNetworkSummary(publicNodeSummaries, healthEvents, peerAssignments);
  const runtimeSummary = buildStorageProgramRuntimeSummary({
    registryState: snapshot,
    ingestState,
    deliveryState,
    telegramUserId,
  });
  const nodeIds = userNodes.map((entry) => entry.id);
  const nodeCount = nodeIds.length;

  return {
    enabled: config.enabled,
    desktopClientEnabled: config.desktopClientEnabled,
    tonSiteDesktopGatewayEnabled: config.tonSiteDesktopGatewayEnabled,
    telegramBotDeliveryEnabled: config.telegramBotDeliveryEnabled,
    testModeIngestEnabled: config.testModeIngestEnabled,
    runtimeStatus,
    membership,
    nodeCount,
    nodeIds,
    nodes: userNodeSummaries,
    publicNodeCount: publicNodes.length,
    publicNodes: publicNodeSummaries,
    runtimeSummary,
    networkSummary,
    peerAssignments,
  };
};

export const buildPublicStorageNodeSnapshot = async (
  nodeId: string,
): Promise<StoragePublicNodeSnapshot | null> => {
  const normalizedId = normalizeSafeId(nodeId, 120);

  if (!normalizedId) {
    return null;
  }

  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return null;
  }

  const node = snapshot.nodes[normalizedId];

  if (
    !node ||
    node.status === "suspended" ||
    typeof node.latitude !== "number" ||
    typeof node.longitude !== "number"
  ) {
    return null;
  }

  const publicNodes = Object.values(snapshot.nodes)
    .filter((entry) => entry.status !== "suspended")
    .filter((entry) => typeof entry.latitude === "number" && typeof entry.longitude === "number")
    .sort((a, b) => {
      const left = new Date(a.updatedAt || a.createdAt).getTime();
      const right = new Date(b.updatedAt || b.createdAt).getTime();
      return right - left;
    });

  const recentHealthEvents = [...snapshot.healthEvents]
    .filter((entry) => entry.entityType === "node" && entry.entityId === normalizedId)
    .sort((a, b) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      return right - left;
    })
    .slice(0, 8);
  const publicNodeSummariesBase = publicNodes.map((entry) => toStorageProgramNodeSummary(entry, snapshot.healthEvents));
  const peerAssignments = buildPeerAssignmentPreviews(publicNodeSummariesBase);
  const publicNodeSummaries = applyPeerLinkCounts(publicNodeSummariesBase, peerAssignments);
  const nodeSummary = publicNodeSummaries.find((entry) => entry.id === normalizedId) ?? toStorageProgramNodeSummary(node, snapshot.healthEvents);
  const otherPublicNodes = publicNodeSummaries.filter((entry) => entry.id !== normalizedId).slice(0, 4);
  const nodePeerAssignments = peerAssignments.filter(
    (entry) => entry.sourceNodeId === normalizedId || entry.targetNodeId === normalizedId,
  );

  return {
    node: nodeSummary,
    recentHealthEvents,
    otherPublicNodes,
    networkSummary: buildStorageProgramNetworkSummary(publicNodeSummaries, snapshot.healthEvents, peerAssignments),
    peerAssignments: nodePeerAssignments,
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

export const listStorageBagFiles = async (): Promise<StorageBagFile[]> => {
  const snapshot = await getStorageRegistrySnapshot();

  if (!snapshot) {
    return [];
  }

  return Object.values(snapshot.bagFiles).sort((a, b) => a.priority - b.priority);
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
  runtimeMode?: StorageBag["runtimeMode"];
  runtimeLabel?: string;
  status?: StorageBag["status"];
  replicasTarget?: number;
  replicasActual?: number;
  runtimeFetchStatus?: StorageBag["runtimeFetchStatus"];
  runtimeFetchCheckedAt?: string | null;
  runtimeFetchVerifiedAt?: string | null;
  runtimeFetchUrl?: string | null;
  runtimeFetchError?: string | null;
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
      runtimeMode: input.runtimeMode ?? existing?.runtimeMode,
      runtimeLabel: normalizeOptionalText(input.runtimeLabel, 160) ?? existing?.runtimeLabel,
      status: input.status ?? existing?.status ?? "draft",
      replicasTarget: normalizeNonNegativeInt(input.replicasTarget ?? existing?.replicasTarget ?? 0),
      replicasActual: normalizeNonNegativeInt(input.replicasActual ?? existing?.replicasActual ?? 0),
      runtimeFetchStatus: input.runtimeFetchStatus ?? existing?.runtimeFetchStatus,
      runtimeFetchCheckedAt:
        input.runtimeFetchCheckedAt === null
          ? undefined
          : input.runtimeFetchCheckedAt
            ? normalizeIsoDateTime(input.runtimeFetchCheckedAt, now)
            : existing?.runtimeFetchCheckedAt,
      runtimeFetchVerifiedAt:
        input.runtimeFetchVerifiedAt === null
          ? undefined
          : input.runtimeFetchVerifiedAt
            ? normalizeIsoDateTime(input.runtimeFetchVerifiedAt, now)
            : existing?.runtimeFetchVerifiedAt,
      runtimeFetchUrl:
        input.runtimeFetchUrl === null
          ? undefined
          : normalizeOptionalText(input.runtimeFetchUrl, 3000) ?? existing?.runtimeFetchUrl,
      runtimeFetchError:
        input.runtimeFetchError === null
          ? undefined
          : normalizeOptionalText(input.runtimeFetchError, 500) ?? existing?.runtimeFetchError,
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

export const upsertStorageBagFile = async (input: {
  id?: string;
  bagId: string;
  path: string;
  sizeBytes?: number;
  priority?: number;
  mimeType?: string;
}): Promise<StorageBagFile | null> => {
  const bagId = normalizeSafeId(input.bagId, 120);
  const path = normalizeText(input.path, 1000);

  if (!bagId || !path) {
    return null;
  }

  const id =
    normalizeSafeId(input.id ?? `${bagId}:${path}`, 120) ||
    normalizeSafeId(`${bagId}:${Date.now()}`, 120) ||
    `bagfile-${Date.now()}`;

  const next = await mutateState((current) => {
    const existing = current.bagFiles[id];
    const bagFile: StorageBagFile = {
      id,
      bagId,
      path,
      sizeBytes: normalizeNonNegativeInt(input.sizeBytes ?? existing?.sizeBytes ?? 0),
      priority: normalizeNonNegativeInt(input.priority ?? existing?.priority ?? 0),
      mimeType: normalizeOptionalText(input.mimeType, 180) ?? existing?.mimeType,
    };

    return {
      ...current,
      bagFiles: {
        ...current.bagFiles,
        [id]: bagFile,
      },
    };
  });

  return next?.bagFiles[id] ?? null;
};

export const appendStorageHealthEvent = async (input: {
  entityType: "node" | "bag" | "provider" | "runtime";
  entityId: string;
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
}): Promise<StorageHealthEvent | null> => {
  const entityId = normalizeSafeId(input.entityId, 120);
  const code = normalizeSafeId(input.code, 120);
  const message = normalizeText(input.message, 500);

  if (!entityId || !code || !message) {
    return null;
  }

  const event: StorageHealthEvent = {
    id: normalizeSafeId(`${input.entityType}:${entityId}:${Date.now()}`, 120) || `healthevent-${Date.now()}`,
    entityType: input.entityType,
    entityId,
    severity: input.severity,
    code,
    message,
    createdAt: new Date().toISOString(),
  };

  const next = await mutateState((current) => ({
    ...current,
    healthEvents: [event, ...current.healthEvents].slice(0, 500),
  }));

  return next?.healthEvents.find((entry) => entry.id === event.id) ?? event;
};

export const upsertStorageNode = async (input: {
  id?: string;
  userTelegramId?: number;
  walletAddress?: string;
  nodeLabel: string;
  publicLabel?: string | null;
  city?: string | null;
  countryCode?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  nodeType?: StorageNode["nodeType"];
  platform?: StorageNode["platform"];
  status?: StorageNode["status"];
  diskAllocatedBytes?: number;
  diskUsedBytes?: number;
  bandwidthLimitKbps?: number;
  lastSeenAt?: string | null;
}): Promise<StorageNode | null> => {
  const nodeLabel = normalizeText(input.nodeLabel, 120);

  if (!nodeLabel) {
    return null;
  }

  const id = normalizeSafeId(input.id ?? `node-${Date.now()}`, 120) || `node-${Date.now()}`;

  const next = await mutateState((current) => {
    const now = new Date().toISOString();
    const existing = current.nodes[id];
    const node: StorageNode = {
      id,
      userTelegramId: normalizeTelegramUserId(input.userTelegramId) ?? existing?.userTelegramId,
      walletAddress: normalizeWalletAddress(input.walletAddress) ?? existing?.walletAddress,
      nodeLabel,
      publicLabel:
        input.publicLabel === null
          ? undefined
          : normalizeOptionalText(input.publicLabel, 120) ?? existing?.publicLabel,
      city:
        input.city === null
          ? undefined
          : normalizeOptionalText(input.city, 120) ?? existing?.city,
      countryCode:
        input.countryCode === null
          ? undefined
          : normalizeOptionalText(input.countryCode, 8) ?? existing?.countryCode,
      latitude:
        input.latitude === null
          ? undefined
          : normalizeLatitude(input.latitude) ?? existing?.latitude,
      longitude:
        input.longitude === null
          ? undefined
          : normalizeLongitude(input.longitude) ?? existing?.longitude,
      nodeType: input.nodeType ?? existing?.nodeType ?? "community_node",
      platform: input.platform ?? existing?.platform ?? "linux",
      status: input.status ?? existing?.status ?? "candidate",
      diskAllocatedBytes: normalizeNonNegativeInt(input.diskAllocatedBytes ?? existing?.diskAllocatedBytes ?? 0),
      diskUsedBytes: normalizeNonNegativeInt(input.diskUsedBytes ?? existing?.diskUsedBytes ?? 0),
      bandwidthLimitKbps: normalizeNonNegativeInt(input.bandwidthLimitKbps ?? existing?.bandwidthLimitKbps ?? 0),
      lastSeenAt:
        input.lastSeenAt === null
          ? undefined
          : input.lastSeenAt
            ? normalizeIsoDateTime(input.lastSeenAt, now)
            : existing?.lastSeenAt,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    return {
      ...current,
      nodes: {
        ...current.nodes,
        [id]: node,
      },
    };
  });

  return next?.nodes[id] ?? null;
};

export const deleteStorageAssetsByIds = async (ids: string[]): Promise<string[]> => {
  const normalizedIds = Array.from(
    new Set(
      ids
        .map((entry) => normalizeSafeId(entry, 120))
        .filter(Boolean),
    ),
  );

  if (normalizedIds.length === 0) {
    return [];
  }

  const next = await mutateState((current) => {
    const assets = { ...current.assets };

    normalizedIds.forEach((id) => {
      delete assets[id];
    });

    return {
      ...current,
      assets,
    };
  });

  if (!next) {
    return [];
  }

  return normalizedIds.filter((id) => !next.assets[id]);
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
