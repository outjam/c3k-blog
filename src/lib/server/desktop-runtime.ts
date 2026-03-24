import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildDesktopStorageOpenUrl,
  buildDesktopTonSiteOpenUrl,
  getDefaultDesktopAppScheme,
  getDefaultDesktopGatewayConfig,
} from "@/lib/desktop-runtime";
import { getC3kStorageConfig } from "@/lib/storage-config";
import { getStorageRuntimeStatus } from "@/lib/server/storage-runtime";
import { listStorageNodes } from "@/lib/server/storage-registry-store";
import { runTonStorageRuntimePreflight } from "@/lib/server/storage-ton-runtime-preflight";
import type { C3kDesktopLocalNodeRuntime, C3kDesktopNodeMapNode, C3kDesktopRuntimeContract } from "@/types/desktop";

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

const buildLocalNodeRuntimeStatus = async (): Promise<C3kDesktopLocalNodeRuntime> => {
  const checkedAt = new Date().toISOString();
  const runtimeStatus = getStorageRuntimeStatus();
  const preflight = await runTonStorageRuntimePreflight({ logHealthEvent: false }).catch(() => null);
  const bagCount = preflight?.cliKnownBagCount ?? 0;
  const daemonReady = preflight?.cliOk ?? false;
  const gatewayReady = preflight?.gatewayOk ?? false;
  const overallReady = preflight?.overallReady ?? false;
  const tone: C3kDesktopLocalNodeRuntime["tone"] = overallReady ? "live" : daemonReady || gatewayReady ? "relay" : "ready";

  const nextAction = overallReady
    ? "Локальная нода готова к реальному storage retrieval и может обслуживать desktop/runtime flow."
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

  return {
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
    nextAction,
    notes,
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
  const publicNodes: C3kDesktopNodeMapNode[] = registryNodes
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

  if (publicNodes.length === 0) {
    return {
      localNode,
      ...buildDesktopNodeMapFallback(features, localNode),
    };
  }

  const localNodeMapEntry: C3kDesktopNodeMapNode = {
    id: "desktop-home",
    city: localNode.deviceLabel,
    role: `Локальная нода · ${localNode.platformLabel}`,
    health: localNode.overallReady ? "Runtime ready" : localNode.daemonReady ? "Daemon online" : "Desktop beta",
    bags: localNode.bagCount > 0 ? `${localNode.bagCount} bags` : "0 bags",
    tone: localNode.tone,
    coordinates: publicNodes[0]?.coordinates ?? [37.6176, 55.7558],
  };

  const gatewayNode: C3kDesktopNodeMapNode = {
    id: "gateway-core",
    city: "Desktop gateway",
    role: "c3k.ton и runtime handoff",
    health: features.tonSiteDesktopGatewayEnabled ? "Gateway ready" : "Gateway pending",
    bags: `${gateway.host}:${gateway.port}`,
    tone: features.tonSiteDesktopGatewayEnabled ? "relay" : "ready",
    coordinates: publicNodes[0]?.coordinates ?? [4.9041, 52.3676],
  };

  const nodes = [localNodeMapEntry, gatewayNode, ...publicNodes];
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
