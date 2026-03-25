import { existsSync, lstatSync, readFileSync, readdirSync, statfsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDesktopStorageOpenUrl,
  buildDesktopTonSiteOpenUrl,
  getDefaultDesktopAppScheme,
  getDefaultDesktopGatewayConfig,
} from "@/lib/desktop-runtime";
import { getC3kStorageConfig } from "@/lib/storage-config";
import { listAdminWorkerRuns } from "@/lib/server/admin-worker-run-store";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import {
  listStorageBagFiles,
  listStorageBags,
  listStorageHealthEvents,
  listStorageNodes,
  listStorageAssets,
  upsertStorageNode,
} from "@/lib/server/storage-registry-store";
import { listStorageDeliveryRequests } from "@/lib/server/storage-delivery-store";
import { listStorageIngestJobs } from "@/lib/server/storage-ingest-store";
import { getDesktopLocalNodeSettings } from "@/lib/server/desktop-local-node-config";
import { runTonStorageRuntimePreflight } from "@/lib/server/storage-ton-runtime-preflight";
import { getTelegramStorageDeliveryQueueSize } from "@/lib/server/storage-delivery";
import type { C3kDesktopLocalNodeRuntime, C3kDesktopNodeMapNode, C3kDesktopRuntimeContract } from "@/types/desktop";

const GIGABYTE = 1024 * 1024 * 1024;
const LOCAL_NODE_RECENT_HEALTH_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

const toPlatformLabel = (): string => {
  const platform =
    process.platform === "darwin"
      ? "macOS"
      : process.platform === "win32"
        ? "Windows"
        : process.platform === "linux"
          ? "Linux"
          : process.platform;

  return `${platform} ${process.arch}`;
};

const normalizeText = (value: unknown): string => String(value ?? "").trim();

const normalizeSafeId = (value: unknown, maxLength: number): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
};

const parseOptionalNumber = (value: string | undefined): number | undefined => {
  const parsed = Number(value ?? "");
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseIsoTimestamp = (value: string | undefined): number => {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const toStorageNodePlatform = (): "macos" | "windows" | "linux" => {
  if (process.platform === "darwin") {
    return "macos";
  }

  if (process.platform === "win32") {
    return "windows";
  }

  return "linux";
};

const resolveLocalNodeStorageRoot = (): string | undefined => {
  const explicit = normalizeText(process.env.C3K_STORAGE_LOCAL_NODE_STORAGE_ROOT);
  if (explicit && existsSync(explicit)) {
    return explicit;
  }

  const fallback = path.join(process.cwd(), ".local", "ton", "storage-db");
  return existsSync(fallback) ? fallback : undefined;
};

const measurePathBytes = (targetPath: string): number => {
  try {
    const stats = lstatSync(targetPath);

    if (stats.isSymbolicLink()) {
      return 0;
    }

    if (stats.isFile()) {
      return stats.size;
    }

    if (!stats.isDirectory()) {
      return 0;
    }

    return readdirSync(targetPath, { withFileTypes: true }).reduce((total, entry) => {
      if (entry.isSymbolicLink()) {
        return total;
      }

      return total + measurePathBytes(path.join(targetPath, entry.name));
    }, 0);
  } catch {
    return 0;
  }
};

const readFilesystemSpace = (targetPath: string | undefined): { totalBytes?: number; freeBytes?: number } => {
  if (!targetPath) {
    return {};
  }

  try {
    const snapshot = statfsSync(targetPath);
    const blockSize = Number(snapshot.bsize || 0);
    const totalBlocks = Number(snapshot.blocks || 0);
    const freeBlocks = Number(snapshot.bavail || snapshot.bfree || 0);

    if (blockSize <= 0 || totalBlocks <= 0) {
      return {};
    }

    return {
      totalBytes: Math.max(0, Math.round(blockSize * totalBlocks)),
      freeBytes: Math.max(0, Math.round(blockSize * freeBlocks)),
    };
  } catch {
    return {};
  }
};

const buildLocalNodeHealthState = async (): Promise<C3kDesktopLocalNodeRuntime["health"]> => {
  const nowMs = Date.now();
  const events = (await listStorageHealthEvents())
    .filter((entry) => entry.entityType === "runtime" || entry.entityType === "bag" || entry.entityType === "node")
    .filter((entry) => nowMs - new Date(entry.createdAt).getTime() <= LOCAL_NODE_RECENT_HEALTH_WINDOW_MS);

  return {
    infoCount: events.filter((entry) => entry.severity === "info").length,
    warningCount: events.filter((entry) => entry.severity === "warning").length,
    criticalCount: events.filter((entry) => entry.severity === "critical").length,
    lastEventAt: events[0]?.createdAt,
    lastEventMessage: events[0]?.message,
  };
};

const formatAssetTitle = (input: {
  releaseSlug?: string;
  trackId?: string;
  fileName?: string;
  assetId?: string;
}): string => {
  return (
    normalizeText(input.trackId) ||
    normalizeText(input.releaseSlug) ||
    normalizeText(input.fileName) ||
    normalizeText(input.assetId) ||
    "storage-asset"
  );
};

const toQueueTone = (status: string): "live" | "ready" | "relay" => {
  if (status === "uploaded" || status === "healthy" || status === "delivered") {
    return "live";
  }

  if (status === "processing" || status === "replicating" || status === "ready") {
    return "relay";
  }

  return "ready";
};

const buildQueueStatusLabel = (status: string): string => {
  switch (status) {
    case "queued":
      return "Ждёт добавления в swarm";
    case "processing":
      return "Готовится к загрузке";
    case "prepared":
      return "Готов к загрузке в storage";
    case "uploaded":
      return "Уже загружен";
    case "failed":
      return "Требует внимания";
    case "ready":
      return "Готов к выдаче";
    case "delivered":
      return "Уже раздавался";
    case "healthy":
      return "Стабильно сидируется";
    case "replicating":
      return "Размножается по сети";
    default:
      return status;
  }
};

const buildDeliveryChannelLabel = (channel: "telegram_bot" | "web_download" | "desktop_download"): string => {
  switch (channel) {
    case "telegram_bot":
      return "Telegram";
    case "desktop_download":
      return "Desktop";
    default:
      return "Web";
  }
};

const buildLocalNodeSwarmData = async (): Promise<
  Pick<C3kDesktopLocalNodeRuntime, "ingestQueue" | "transferSessions" | "bagInventory">
> => {
  const [assets, bags, bagFiles, jobs, requests] = await Promise.all([
    listStorageAssets().catch(() => []),
    listStorageBags().catch(() => []),
    listStorageBagFiles().catch(() => []),
    listStorageIngestJobs({ limit: 24 }).catch(() => []),
    listStorageDeliveryRequests({ limit: 24 }).catch(() => []),
  ]);

  const assetsById = new Map(assets.map((entry) => [entry.id, entry]));
  const filesByBagId = new Map<string, typeof bagFiles>();
  bagFiles.forEach((entry) => {
    const current = filesByBagId.get(entry.bagId) ?? [];
    current.push(entry);
    filesByBagId.set(entry.bagId, current);
  });

  const ingestQueue = jobs.slice(0, 8).map((job) => {
    const asset = assetsById.get(job.assetId);
    const bag = job.bagId ? bags.find((entry) => entry.id === job.bagId) : undefined;
    return {
      id: job.id,
      assetId: job.assetId,
      bagId: job.bagId,
      title: formatAssetTitle({
        releaseSlug: asset?.releaseSlug,
        trackId: asset?.trackId,
        fileName: asset?.fileName,
        assetId: job.assetId,
      }),
      format: asset?.format,
      sizeBytes: asset?.sizeBytes,
      status: job.status,
      statusLabel: buildQueueStatusLabel(job.status),
      summary:
        job.message ||
        bag?.runtimeLabel ||
        (job.status === "prepared"
          ? "Файл уже собран в bag и ждёт upload/репликацию."
          : "Очередь автоматически ведёт новый контент к storage swarm."),
      updatedAt: job.updatedAt,
      tone: toQueueTone(job.status),
    };
  });

  const transferSessions = requests.slice(0, 8).map((request) => ({
    id: request.id,
    title: formatAssetTitle({
      releaseSlug: request.releaseSlug,
      trackId: request.trackId,
      fileName: request.fileName,
      assetId: request.resolvedAssetId,
    }),
    channel: request.channel,
    channelLabel: buildDeliveryChannelLabel(request.channel),
    routeLabel:
      request.lastDeliveredVia === "tonstorage_gateway"
        ? "Через storage swarm"
        : request.channel === "desktop_download"
          ? "Через desktop node"
          : request.channel === "telegram_bot"
            ? "Через Telegram handoff"
            : "Через web handoff",
    status: request.status,
    statusLabel: buildQueueStatusLabel(request.status),
    fileName: request.fileName,
    format: request.resolvedFormat || request.requestedFormat,
    updatedAt: request.updatedAt,
    tone: toQueueTone(request.status),
  }));

  const bagInventory = bags
    .slice()
    .sort((left, right) => parseIsoTimestamp(right.updatedAt) - parseIsoTimestamp(left.updatedAt))
    .slice(0, 8)
    .map((bag) => {
      const asset = assetsById.get(bag.assetId);
      const primaryFile = (filesByBagId.get(bag.id) ?? []).sort((left, right) => left.priority - right.priority)[0];
      return {
        id: bag.id,
        assetId: bag.assetId,
        title: formatAssetTitle({
          releaseSlug: asset?.releaseSlug,
          trackId: asset?.trackId,
          fileName: primaryFile?.path || asset?.fileName,
          assetId: bag.assetId,
        }),
        filePath: primaryFile?.path,
        format: asset?.format,
        sizeBytes: primaryFile?.sizeBytes || asset?.sizeBytes,
        replicasActual: bag.replicasActual,
        replicasTarget: bag.replicasTarget,
        status: bag.status,
        statusLabel:
          bag.runtimeFetchStatus === "verified"
            ? "Готов к честной раздаче"
            : buildQueueStatusLabel(bag.status),
        updatedAt: bag.updatedAt,
        tone: bag.runtimeFetchStatus === "verified" ? "live" : toQueueTone(bag.status),
      };
    });

  return {
    ingestQueue,
    transferSessions,
    bagInventory,
  };
};

const buildLocalNodeParticipationPreview = (input: {
  daemonReady: boolean;
  gatewayReady: boolean;
  overallReady: boolean;
  bagCount: number;
  verifiedBagCount: number;
  storageDataBytes: number;
  health: C3kDesktopLocalNodeRuntime["health"];
}): C3kDesktopLocalNodeRuntime["participation"] => {
  const storageUnits = Math.min(12, Math.floor(input.storageDataBytes / (2 * GIGABYTE)));
  const readinessBase = input.overallReady ? 6 : input.daemonReady || input.gatewayReady ? 2 : 0;
  const bagScore = Math.min(14, input.bagCount * 2);
  const verifiedScore = Math.min(16, input.verifiedBagCount * 3);
  const healthPenalty = input.health.warningCount + input.health.criticalCount * 3;
  const estimatedDailyCredits = Math.max(0, Math.min(64, readinessBase + bagScore + verifiedScore + storageUnits - healthPenalty));

  if (!input.daemonReady && !input.gatewayReady) {
    return {
      state: "observer",
      label: "Observer",
      summary: "Нода ещё не поднята. Сначала нужен живой daemon/gateway контур.",
      estimatedDailyCredits,
      estimatedWeeklyCredits: estimatedDailyCredits * 7,
    };
  }

  if (!input.overallReady || input.bagCount === 0) {
    return {
      state: "warming",
      label: "Warming up",
      summary: "Контур уже собирается, но устройству ещё нужно больше bag-ов и стабильный runtime.",
      estimatedDailyCredits,
      estimatedWeeklyCredits: estimatedDailyCredits * 7,
    };
  }

  if (input.verifiedBagCount === 0) {
    return {
      state: "serving",
      label: "Serving beta",
      summary: "Нода уже хранит bags и готова к runtime-выдаче, но verified pointer-сигналов пока мало.",
      estimatedDailyCredits,
      estimatedWeeklyCredits: estimatedDailyCredits * 7,
    };
  }

  return {
    state: "keeper",
    label: "Keeper preview",
    summary: "Нода держит живые bags и verified runtime contour. Это уже база для будущего reward-layer.",
    estimatedDailyCredits,
    estimatedWeeklyCredits: estimatedDailyCredits * 7,
  };
};

const buildLocalDeliveryWorkerState = async (): Promise<C3kDesktopLocalNodeRuntime["deliveryWorker"]> => {
  const enabled = normalizeText(process.env.C3K_STORAGE_LOCAL_DELIVERY_WORKER_ENABLED) === "1";
  const tokenConfigured = Boolean(normalizeText(process.env.TELEGRAM_BOT_TOKEN));
  const [queueSize, lastRun] = await Promise.all([
    getTelegramStorageDeliveryQueueSize().catch(() => 0),
    listAdminWorkerRuns({ workerId: "storage_delivery_telegram", limit: 1 })
      .then((entries) => entries[0] ?? null)
      .catch(() => null),
  ]);

  const summary = !enabled
    ? "Локальный Telegram delivery loop пока не включён для этой ноды."
    : !tokenConfigured
      ? "Loop разрешён, но TELEGRAM_BOT_TOKEN не задан, поэтому нода не отправляет файлы в Telegram."
      : queueSize > 0
        ? `В очереди ${queueSize} request(s) на Telegram delivery.`
        : lastRun
          ? "Telegram delivery loop активен и очередь сейчас пуста."
          : "Loop включён. Нода готова обслуживать Telegram delivery, как только появится очередь.";

  return {
    enabled,
    tokenConfigured,
    queueSize,
    lastRunAt: lastRun?.completedAt,
    lastRunStatus: lastRun?.status,
    lastRunProcessed: lastRun?.processed,
    lastRunDelivered: lastRun?.delivered,
    summary,
  };
};

const syncLocalNodeHeartbeat = async (
  localNode: Omit<C3kDesktopLocalNodeRuntime, "registryNodeId">,
): Promise<string | undefined> => {
  const shouldSync =
    Boolean(localNode.storage.rootPath) ||
    localNode.daemonReady ||
    localNode.gatewayReady ||
    localNode.bagCount > 0 ||
    Boolean(normalizeText(process.env.C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON));

  if (!shouldSync) {
    return undefined;
  }

  const nodeId =
    normalizeSafeId(`desktop-node:${localNode.deviceLabel}`, 120) ||
    `desktop-node:${Date.now()}`;
  const node = await upsertStorageNode({
    id: nodeId,
    nodeLabel: localNode.deviceLabel,
    publicLabel: normalizeText(process.env.C3K_STORAGE_LOCAL_NODE_PUBLIC_LABEL) || undefined,
    city: normalizeText(process.env.C3K_STORAGE_LOCAL_NODE_CITY) || undefined,
    countryCode: normalizeText(process.env.C3K_STORAGE_LOCAL_NODE_COUNTRY_CODE) || undefined,
    latitude: parseOptionalNumber(process.env.C3K_STORAGE_LOCAL_NODE_LATITUDE),
    longitude: parseOptionalNumber(process.env.C3K_STORAGE_LOCAL_NODE_LONGITUDE),
    nodeType: "community_node",
    platform: toStorageNodePlatform(),
    status: localNode.overallReady ? "active" : localNode.daemonReady || localNode.gatewayReady ? "degraded" : "candidate",
    diskAllocatedBytes: localNode.settings.storageQuotaBytes,
    diskUsedBytes: localNode.storage.dataBytes,
    bandwidthLimitKbps: localNode.settings.bandwidthLimitKbps,
    lastSeenAt: localNode.checkedAt,
  }).catch(() => null);

  return node?.id;
};

const buildLocalNodeRuntimeStatus = async (): Promise<C3kDesktopLocalNodeRuntime> => {
  const checkedAt = new Date().toISOString();
  const runtimeStatus = getStorageRuntimeStatus();
  const preflight = await runTonStorageRuntimePreflight({ logHealthEvent: false }).catch(() => null);
  const storageRootPath = resolveLocalNodeStorageRoot();
  const [settings, bagFiles, bags, health, deliveryWorker, swarmData] = await Promise.all([
    getDesktopLocalNodeSettings(),
    listStorageBagFiles(),
    listStorageBags(),
    buildLocalNodeHealthState(),
    buildLocalDeliveryWorkerState(),
    buildLocalNodeSwarmData(),
  ]);
  const bagCount = preflight?.cliKnownBagCount ?? 0;
  const daemonReady = preflight?.cliOk ?? false;
  const gatewayReady = preflight?.gatewayOk ?? false;
  const overallReady = preflight?.overallReady ?? false;
  const tone: C3kDesktopLocalNodeRuntime["tone"] = overallReady ? "live" : daemonReady || gatewayReady ? "relay" : "ready";
  const storageDataBytes = storageRootPath ? measurePathBytes(storageRootPath) : 0;
  const storageSpace = readFilesystemSpace(storageRootPath);
  const verifiedBagCount = bags.filter((entry) => entry.runtimeFetchStatus === "verified").length;
  const participation = buildLocalNodeParticipationPreview({
    daemonReady,
    gatewayReady,
    overallReady,
    bagCount,
    verifiedBagCount,
    storageDataBytes,
    health,
  });

  const nextAction = overallReady
    ? verifiedBagCount > 0
      ? "Локальная нода уже близка к настоящему participant-режиму. Дальше можно подключать reward-layer и публичные peers."
      : "Локальная нода готова к реальному storage retrieval. Следующий шаг: накопить verified pointer-сигналы и delivery из живого runtime."
    : daemonReady && !gatewayReady
      ? "Daemon уже поднят. Следующий шаг: проверить local gateway и desktop retrieval path."
      : !daemonReady && runtimeStatus.mode === "tonstorage_testnet"
        ? "Подними storage-daemon и подключи CLI-аргументы, чтобы превратить устройство в реальную storage-ноду."
        : "Пока это desktop beta scaffold. Дальше нужно включить живой storage runtime contour.";

  const notes = [
    preflight?.notes ?? [],
    preflight?.nextActions ?? [],
  ]
    .flat()
    .filter(Boolean)
    .slice(0, 6);

  const localNodeBase: Omit<C3kDesktopLocalNodeRuntime, "registryNodeId"> = {
    checkedAt,
    deviceLabel: os.hostname() || "Local device",
    platformLabel: toPlatformLabel(),
    storageRuntimeLabel: runtimeStatus.label,
    uploadMode: preflight?.uploadMode ?? "simulated",
    daemonReady,
    gatewayReady,
    overallReady,
    workerSecretConfigured: preflight?.workerSecretConfigured ?? false,
    bagCount,
    tone,
    gatewayUrl: preflight?.gatewayBase,
    storage: {
      rootPath: storageRootPath,
      dataBytes: storageDataBytes,
      freeBytes: storageSpace.freeBytes,
      totalBytes: storageSpace.totalBytes,
      targetBytes: settings.storageQuotaBytes,
      bagFileCount: bagFiles.length,
      verifiedBagCount,
    },
    health,
    participation,
    deliveryWorker,
    settings,
    ingestQueue: swarmData.ingestQueue,
    transferSessions: swarmData.transferSessions,
    bagInventory: swarmData.bagInventory,
    nextAction,
    notes,
  };

  const registryNodeId = await syncLocalNodeHeartbeat(localNodeBase);

  return {
    ...localNodeBase,
    registryNodeId,
  };
};

const buildDesktopNodeMapFallback = (
  features: ReturnType<typeof getC3kStorageConfig>,
  localNode: C3kDesktopLocalNodeRuntime,
) => {
  const nodes: C3kDesktopNodeMapNode[] = [
    {
      id: "desktop-home",
      city: localNode.deviceLabel,
      role: `Локальная нода · ${localNode.platformLabel}`,
      health: localNode.overallReady ? "Runtime ready" : localNode.daemonReady ? "Daemon online" : "Desktop beta",
      bags: localNode.bagCount > 0 ? `${localNode.bagCount} bags` : features.desktopClientEnabled ? "0 bags" : "Target 6 bags",
      tone: localNode.tone,
      coordinates: [37.6176, 55.7558],
    },
    {
      id: "gateway-core",
      city: "Amsterdam gateway",
      role: "c3k.ton и runtime handoff",
      health: features.tonSiteDesktopGatewayEnabled ? "Gateway ready" : "Gateway pending",
      bags: `${getDefaultDesktopGatewayConfig().host}:${getDefaultDesktopGatewayConfig().port}`,
      tone: features.tonSiteDesktopGatewayEnabled ? "relay" : "ready",
      coordinates: [4.9041, 52.3676],
    },
    {
      id: "archive-helsinki",
      city: "Helsinki archive",
      role: "Lossless release mirror",
      health: "Healthy",
      bags: "18 peers",
      tone: "live",
      coordinates: [24.9384, 60.1699],
    },
    {
      id: "collector-almaty",
      city: "Almaty collector",
      role: "NFT media + booklet",
      health: "Replicating",
      bags: "9 peers",
      tone: "ready",
      coordinates: [76.886, 43.2389],
    },
    {
      id: "site-belgrade",
      city: "Belgrade site cache",
      role: "Desktop site bundle",
      health: features.enabled ? "Standby" : "Preview",
      bags: "4 peers",
      tone: "relay",
      coordinates: [20.4489, 44.7866],
    },
  ];

  return {
    nodes,
    bounds: [
      [0, 35],
      [85, 62],
    ] as [[number, number], [number, number]],
  };
};

const toDesktopNodeTone = (status: "candidate" | "active" | "degraded" | "suspended"): C3kDesktopNodeMapNode["tone"] => {
  switch (status) {
    case "active":
      return "live";
    case "degraded":
      return "relay";
    default:
      return "ready";
  }
};

const buildBoundsFromNodes = (nodes: C3kDesktopNodeMapNode[]): [[number, number], [number, number]] => {
  const lons = nodes.map((entry) => entry.coordinates[0]);
  const lats = nodes.map((entry) => entry.coordinates[1]);
  const minLon = Math.min(...lons) - 8;
  const maxLon = Math.max(...lons) + 8;
  const minLat = Math.min(...lats) - 4;
  const maxLat = Math.max(...lats) + 4;
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
};

const buildDesktopNodeMap = async (features: ReturnType<typeof getC3kStorageConfig>) => {
  const localNode = await buildLocalNodeRuntimeStatus();
  const gateway = getDefaultDesktopGatewayConfig();
  const registryNodes = await listStorageNodes();
  const localRegistryNode = localNode.registryNodeId
    ? registryNodes.find((entry) => entry.id === localNode.registryNodeId) ?? null
    : null;
  const publicNodes: C3kDesktopNodeMapNode[] = registryNodes
    .filter((entry) => entry.id !== localRegistryNode?.id)
    .filter((entry) => typeof entry.latitude === "number" && typeof entry.longitude === "number")
    .filter((entry) => entry.status !== "suspended")
    .slice(0, 6)
    .map((entry) => ({
      id: entry.id,
      city: entry.publicLabel || entry.city || entry.nodeLabel,
      role: entry.nodeType === "owned_provider" ? "Owned provider" : entry.nodeType === "partner_provider" ? "Partner provider" : "Community node",
      health: entry.status === "active" ? "Healthy" : entry.status === "degraded" ? "Degraded" : "Ready",
      bags:
        entry.diskAllocatedBytes > 0
          ? `${Math.max(1, Math.round(entry.diskUsedBytes / Math.max(entry.diskAllocatedBytes / 12, 1)))} bags`
          : `${Math.max(1, Math.round(entry.bandwidthLimitKbps / 1000) || 1)} peers`,
      tone: toDesktopNodeTone(entry.status),
      coordinates: [entry.longitude!, entry.latitude!],
    }));

  const localNodeCoordinates =
    typeof localRegistryNode?.latitude === "number" && typeof localRegistryNode?.longitude === "number"
      ? ([localRegistryNode.longitude, localRegistryNode.latitude] as [number, number])
      : null;

  if (publicNodes.length === 0 && !localNodeCoordinates) {
    return {
      localNode,
      ...buildDesktopNodeMapFallback(features, localNode),
    };
  }

  const localNodeMapEntry: C3kDesktopNodeMapNode = {
    id: localRegistryNode?.id ?? "desktop-home",
    city: localRegistryNode?.publicLabel || localRegistryNode?.city || localNode.deviceLabel,
    role: `Локальная нода · ${localNode.platformLabel}`,
    health: localNode.overallReady ? "Runtime ready" : localNode.daemonReady ? "Daemon online" : "Desktop beta",
    bags: localNode.bagCount > 0 ? `${localNode.bagCount} bags` : "0 bags",
    tone: localNode.tone,
    coordinates: localNodeCoordinates ?? [37.6176, 55.7558],
  };

  const gatewayNode: C3kDesktopNodeMapNode = {
    id: "gateway-core",
    city: "Desktop gateway",
    role: "c3k.ton и runtime handoff",
    health: features.tonSiteDesktopGatewayEnabled ? "Gateway ready" : "Gateway pending",
    bags: `${gateway.host}:${gateway.port}`,
    tone: features.tonSiteDesktopGatewayEnabled ? "relay" : "ready",
    coordinates: [4.9041, 52.3676],
  };

  const fallbackNetworkNodes =
    publicNodes.length === 0
      ? buildDesktopNodeMapFallback(features, localNode).nodes.filter(
          (entry) => entry.id !== "desktop-home" && entry.id !== "gateway-core",
        )
      : [];
  const nodes = [localNodeMapEntry, gatewayNode, ...publicNodes, ...fallbackNetworkNodes];
  return {
    localNode,
    nodes,
    bounds: buildBoundsFromNodes(nodes),
  };
};

const readAppVersion = (): string => {
  try {
    const packageJsonPath = path.join(process.cwd(), "package.json");
    const raw = readFileSync(packageJsonPath, "utf8");
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === "string" && parsed.version.trim()
      ? parsed.version.trim()
      : "0.1.0";
  } catch {
    return "0.1.0";
  }
};

const stripTrailingSlash = (value: string | null): string | null => {
  if (!value) {
    return null;
  }

  return value.replace(/\/+$/, "");
};

export const getC3kDesktopRuntimeContract = async (options?: {
  webAppOrigin?: string | null;
}): Promise<C3kDesktopRuntimeContract> => {
  const features = getC3kStorageConfig();
  const gateway = getDefaultDesktopGatewayConfig();
  const appScheme = getDefaultDesktopAppScheme();
  const webAppOrigin = stripTrailingSlash(options?.webAppOrigin ?? null);
  const startUrl =
    stripTrailingSlash(process.env.C3K_DESKTOP_START_URL ?? null) ??
    (webAppOrigin ? `${webAppOrigin}/storage/desktop` : null);
  const storageProgramUrl = webAppOrigin ? `${webAppOrigin}/storage` : null;
  const downloadsUrl = webAppOrigin ? `${webAppOrigin}/downloads` : null;
  const runtimeUrl = webAppOrigin ? `${webAppOrigin}/api/desktop/runtime` : null;

  const nodeMap = await buildDesktopNodeMap(features);

  return {
    appId: "culture3k.desktop",
    appName: "C3K Desktop Client",
    appScheme,
    version: readAppVersion(),
    webAppOrigin,
    startUrl,
    storageProgramUrl,
    downloadsUrl,
    runtimeUrl,
    features: {
      storageProgramEnabled: features.enabled,
      desktopClientEnabled: features.desktopClientEnabled,
      tonSiteDesktopGatewayEnabled: features.tonSiteDesktopGatewayEnabled,
      telegramBotDeliveryEnabled: features.telegramBotDeliveryEnabled,
      testModeIngestEnabled: features.testModeIngestEnabled,
    },
    gateway,
    localNode: nodeMap.localNode,
    onboarding: {
      minRecommendedDiskGb: 20,
      targetDiskGb: 50,
      supportedPlatforms: ["macOS", "Windows", "Linux"],
      steps: [
        {
          id: "install",
          title: "Установить C3K Desktop",
          description: "Desktop-клиент даёт локальный runtime для node mode и открытия c3k.ton.",
        },
        {
          id: "sign-in",
          title: "Войти тем же аккаунтом",
          description: "Desktop должен использовать тот же C3K account и TON wallet identity, что и web.",
        },
        {
          id: "disk",
          title: "Выделить место под storage",
          description: "На beta-этапе достаточно 20-50 GB для bags, cache и future replication.",
        },
        {
          id: "gateway",
          title: "Включить gateway для c3k.ton",
          description: "Локальный gateway открывает TON Site без стороннего browser и ручного proxy.",
        },
      ],
    },
    nodeMap,
    deepLinks: {
      openTonSite: buildDesktopTonSiteOpenUrl({ gateway, appScheme }).deepLink,
      openStorageExample: buildDesktopStorageOpenUrl(
        {
          requestId: "example",
          releaseSlug: "example-release",
          storagePointer: "tonstorage://example",
        },
        { gateway, appScheme },
      ).deepLink,
    },
  };
};
