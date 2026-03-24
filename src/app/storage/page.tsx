"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { BackButtonController } from "@/components/back-button-controller";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchStorageProgramSnapshot, joinMyStorageProgram } from "@/lib/admin-api";
import { openStorageDeliveryInDesktop } from "@/lib/desktop-runtime-api";
import {
  downloadStorageDeliveryRequestFile,
  fetchMyStorageDeliveryRequests,
  retryStorageDeliveryRequestApi,
} from "@/lib/storage-delivery-api";
import type { StorageDeliveryRequest, StorageProgramMembership, StorageProgramSnapshot } from "@/types/storage";

import styles from "./page.module.scss";

const NODE_MAP_STYLE = "https://demotiles.maplibre.org/style.json";

type TierMeta = {
  label: string;
  targetDiskGb: number;
  targetBags: number;
  weeklyCredits: number;
  healthGoal: string;
  nextTier: string | null;
};

type NodeStateTone = "live" | "ready" | "pending" | "locked";

interface NodeState {
  label: string;
  description: string;
  tone: NodeStateTone;
}

interface SeedPreviewItem {
  id: string;
  title: string;
  subtitle: string;
  health: string;
  peers: string;
  payout: string;
}

interface StoragePeerMapNode {
  id: string;
  label: string;
  role: string;
  health: string;
  tone: "live" | "ready" | "pending";
  coordinates: [number, number];
}

const TIER_META: Record<StorageProgramMembership["tier"], TierMeta> = {
  supporter: {
    label: "Supporter",
    targetDiskGb: 25,
    targetBags: 3,
    weeklyCredits: 120,
    healthGoal: "4+ часа онлайн в день",
    nextTier: "Keeper",
  },
  keeper: {
    label: "Keeper",
    targetDiskGb: 80,
    targetBags: 8,
    weeklyCredits: 340,
    healthGoal: "8+ часов онлайн в день",
    nextTier: "Core",
  },
  core: {
    label: "Core",
    targetDiskGb: 180,
    targetBags: 18,
    weeklyCredits: 760,
    healthGoal: "Почти постоянная раздача",
    nextTier: "Guardian",
  },
  guardian: {
    label: "Guardian",
    targetDiskGb: 400,
    targetBags: 36,
    weeklyCredits: 1480,
    healthGoal: "24/7 node health",
    nextTier: null,
  },
};

const formatTier = (value: StorageProgramMembership["tier"] | undefined): string => {
  return value ? TIER_META[value].label : "Supporter";
};

const formatStatus = (value: StorageProgramMembership["status"] | undefined): string => {
  switch (value) {
    case "approved":
      return "Одобрено";
    case "rejected":
      return "Отклонено";
    case "suspended":
      return "Отключено";
    default:
      return "На рассмотрении";
  }
};

const formatDeliveryStatus = (value: StorageDeliveryRequest["status"]): string => {
  switch (value) {
    case "processing":
      return "Обрабатывается";
    case "pending_asset_mapping":
      return "Ждёт storage mapping";
    case "ready":
      return "Готово";
    case "delivered":
      return "Доставлено";
    case "failed":
      return "Ошибка";
    default:
      return "Запрошено";
  }
};

const formatDeliveryTarget = (request: StorageDeliveryRequest): string => {
  if (request.targetType === "track") {
    return request.trackId ? `Трек · ${request.trackId}` : "Трек";
  }

  return "Полный релиз";
};

const formatDeliveryChannel = (value: StorageDeliveryRequest["channel"]): string => {
  switch (value) {
    case "telegram_bot":
      return "Telegram";
    case "desktop_download":
      return "Desktop";
    default:
      return "Web";
  }
};

const formatDeliveryVia = (value: StorageDeliveryRequest["lastDeliveredVia"]): string | null => {
  switch (value) {
    case "tonstorage_gateway":
      return "TON Storage gateway";
    case "bag_meta":
      return "Bag meta";
    case "asset_source":
      return "Asset source";
    case "resolved_source":
      return "Resolved source";
    case "delivery_url":
      return "Direct delivery";
    case "bag_http_pointer":
      return "Bag HTTP pointer";
    default:
      return null;
  }
};

const formatShortWallet = (value: string | undefined): string => {
  const normalized = String(value ?? "").trim();

  if (normalized.length < 13) {
    return normalized || "Не привязан";
  }

  return `${normalized.slice(0, 5)}…${normalized.slice(-5)}`;
};

const formatNodePlatform = (value: "macos" | "windows" | "linux"): string => {
  switch (value) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    default:
      return "Linux";
  }
};

const formatNodeStatus = (value: "candidate" | "active" | "degraded" | "suspended"): string => {
  switch (value) {
    case "active":
      return "Active";
    case "degraded":
      return "Degraded";
    case "suspended":
      return "Suspended";
    default:
      return "Candidate";
  }
};

const formatNodeType = (value: "owned_provider" | "partner_provider" | "community_node"): string => {
  switch (value) {
    case "owned_provider":
      return "Owned provider";
    case "partner_provider":
      return "Partner provider";
    default:
      return "Community node";
  }
};

const formatDateTime = (value: string | undefined): string => {
  if (!value) {
    return "—";
  }

  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return "—";
  }

  return new Date(timestamp).toLocaleString("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  });
};

const formatStorageSize = (value: number): string => {
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }

  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${value} B`;
};

const toPeerTone = (status: "candidate" | "active" | "degraded" | "suspended"): StoragePeerMapNode["tone"] => {
  switch (status) {
    case "active":
      return "live";
    case "degraded":
      return "ready";
    default:
      return "pending";
  }
};

const buildPeerMapNodes = (snapshot: StorageProgramSnapshot | null): StoragePeerMapNode[] => {
  if (!snapshot) {
    return [];
  }

  const nodes = [
    ...snapshot.nodes.map((entry) => ({
      ...entry,
      rolePrefix: "Моя нода",
    })),
    ...snapshot.publicNodes.map((entry) => ({
      ...entry,
      rolePrefix: entry.nodeType === "community_node" ? "Community node" : "Provider node",
    })),
  ];

  const deduped = new Map<string, StoragePeerMapNode>();

  nodes.forEach((entry) => {
    if (typeof entry.latitude !== "number" || typeof entry.longitude !== "number") {
      return;
    }

    deduped.set(entry.id, {
      id: entry.id,
      label: entry.publicLabel || entry.city || entry.nodeLabel,
      role: `${entry.rolePrefix} · ${formatNodeType(entry.nodeType)}`,
      health: formatNodeStatus(entry.status),
      tone: toPeerTone(entry.status),
      coordinates: [entry.longitude, entry.latitude],
    });
  });

  return Array.from(deduped.values()).slice(0, 12);
};

const buildBoundsFromMapNodes = (nodes: StoragePeerMapNode[]): [[number, number], [number, number]] | null => {
  if (nodes.length === 0) {
    return null;
  }

  const lons = nodes.map((entry) => entry.coordinates[0]);
  const lats = nodes.map((entry) => entry.coordinates[1]);

  return [
    [Math.min(...lons) - 8, Math.min(...lats) - 4],
    [Math.max(...lons) + 8, Math.max(...lats) + 4],
  ];
};

const resolveNodeState = (
  membership: StorageProgramMembership | null,
  snapshot: StorageProgramSnapshot | null,
): NodeState => {
  if (!membership) {
    return {
      label: "Ещё не активна",
      description: "Сначала нужно вступить в программу и получить доступ к desktop-клиенту.",
      tone: "locked",
    };
  }

  if (membership.status === "approved" && snapshot?.desktopClientEnabled && snapshot.nodeCount > 0) {
    return {
      label: "Нода подключена",
      description: "Можно держать bags в раздаче, следить за health и накапливать C3K Credit.",
      tone: "live",
    };
  }

  if (membership.status === "approved") {
    return {
      label: "Готова к запуску",
      description: "Аккаунт одобрен. Следующий шаг — поднять C3K Desktop Client и включить раздачу.",
      tone: "ready",
    };
  }

  return {
    label: "Ожидает допуска",
    description: "Заявка уже есть, но нода и награды откроются после модерации.",
    tone: "pending",
  };
};

const buildSeedPreview = (
  history: StorageDeliveryRequest[],
  membership: StorageProgramMembership | null,
): SeedPreviewItem[] => {
  const uniqueReleases = Array.from(new Set(history.map((entry) => entry.releaseSlug))).slice(0, 3);
  const tier = membership?.tier ?? "supporter";
  const basePeers = tier === "guardian" ? 36 : tier === "core" ? 22 : tier === "keeper" ? 12 : 6;
  const basePayout = TIER_META[tier].weeklyCredits;

  if (uniqueReleases.length === 0) {
    return [
      {
        id: "preview-release-1",
        title: "collector-archive",
        subtitle: "lossless release bag · priority",
        health: "Healthy",
        peers: `${basePeers} peers`,
        payout: `+${Math.round(basePayout * 0.18)} C3K / неделя`,
      },
      {
        id: "preview-release-2",
        title: "nft-media-bundle",
        subtitle: "NFT media + booklet",
        health: membership?.status === "approved" ? "Replicating" : "Ждёт допуска",
        peers: `${Math.max(3, basePeers - 4)} peers`,
        payout: `+${Math.round(basePayout * 0.12)} C3K / неделя`,
      },
      {
        id: "preview-release-3",
        title: "desktop-site-cache",
        subtitle: "c3k.ton bundle cache",
        health: snapshotEnabledHealth(membership),
        peers: `${Math.max(2, basePeers - 6)} peers`,
        payout: `+${Math.round(basePayout * 0.09)} C3K / неделя`,
      },
    ];
  }

  return uniqueReleases.map((slug, index) => ({
    id: `${slug}-${index + 1}`,
    title: slug,
    subtitle: index === 0 ? "release bag" : index === 1 ? "collector archive" : "desktop mirror",
    health: index === 0 ? "Healthy" : index === 1 ? "Replicating" : "Queued",
    peers: `${Math.max(2, basePeers - index * 3)} peers`,
    payout: `+${Math.max(12, Math.round(basePayout * (0.18 - index * 0.04)))} C3K / неделя`,
  }));
};

function snapshotEnabledHealth(membership: StorageProgramMembership | null): string {
  if (membership?.status === "approved") {
    return "Ready";
  }

  return "Preview";
}

export default function StorageProgramPage() {
  const router = useRouter();
  const tonWallet = useTonWallet();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [joining, setJoining] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<StorageDeliveryRequest[]>([]);
  const [retryingRequestId, setRetryingRequestId] = useState("");
  const [snapshot, setSnapshot] = useState<Awaited<ReturnType<typeof fetchStorageProgramSnapshot>>["snapshot"]>(null);

  const connectedWalletAddress = useMemo(
    () => String(tonWallet?.account?.address ?? "").trim(),
    [tonWallet?.account?.address],
  );

  const membership = snapshot?.membership ?? null;
  const tierMeta = membership ? TIER_META[membership.tier] : TIER_META.supporter;
  const nodeState = useMemo(() => resolveNodeState(membership, snapshot), [membership, snapshot]);
  const seedPreview = useMemo(
    () => buildSeedPreview(deliveryHistory, membership),
    [deliveryHistory, membership],
  );

  const liveRewards = membership?.status === "approved" ? tierMeta.weeklyCredits : Math.round(tierMeta.weeklyCredits * 0.55);
  const tokenBalancePreview = membership?.status === "approved" ? tierMeta.weeklyCredits * 3 + 84 : 0;
  const bagsInFocus = membership?.status === "approved" ? Math.max(seedPreview.length, tierMeta.targetBags) : tierMeta.targetBags;
  const nodeCountLabel = snapshot?.nodeCount && snapshot.nodeCount > 0 ? `${snapshot.nodeCount}` : "Подключите desktop";
  const desktopModeLabel = snapshot?.desktopClientEnabled ? "Готов к запуску" : "Beta waiting";
  const runtimeModeLabel =
    snapshot?.runtimeStatus.mode === "tonstorage_testnet" ? "TON Storage testnet" : "Local test prepare";
  const runtimePointerLabel = snapshot?.runtimeStatus.supportsRealPointers ? "Real pointers" : "Placeholder only";
  const networkNodeCountLabel = snapshot?.publicNodeCount ? String(snapshot.publicNodeCount) : "preview";
  const networkSummary = snapshot?.networkSummary;
  const peerMapNodes = useMemo(() => buildPeerMapNodes(snapshot), [snapshot]);

  useEffect(() => {
    if (!mapContainerRef.current || peerMapNodes.length === 0) {
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: NODE_MAP_STYLE,
      attributionControl: false,
      dragRotate: false,
      touchPitch: false,
      pitchWithRotate: false,
      cooperativeGestures: true,
    });

    mapRef.current = map;
    map.on("load", () => {
      const bounds = buildBoundsFromMapNodes(peerMapNodes);

      if (bounds) {
        map.fitBounds(bounds, {
          padding: 42,
          duration: 0,
        });
      }

      map.resize();

      peerMapNodes.forEach((node) => {
        const markerEl = document.createElement("div");
        markerEl.className = `${styles.mapMarker} ${styles[`mapMarker${node.tone.charAt(0).toUpperCase()}${node.tone.slice(1)}`]}`;
        markerEl.innerHTML = `<span class="${styles.mapMarkerDot}"></span><div class="${styles.mapMarkerLabel}"><strong>${node.label}</strong><small>${node.health}</small></div>`;

        new maplibregl.Marker({
          element: markerEl,
          anchor: "bottom",
        })
          .setLngLat(node.coordinates)
          .setPopup(
            new maplibregl.Popup({
              offset: 20,
              closeButton: false,
              className: styles.mapPopup,
            }).setHTML(`<strong>${node.label}</strong><br/>${node.role}<br/>${node.health}`),
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [peerMapNodes]);

  useEffect(() => {
    if (!connectedWalletAddress || connectedWalletAddress === walletAddress) {
      return;
    }

    const timerId = window.setTimeout(() => {
      setWalletAddress(connectedWalletAddress);
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [connectedWalletAddress, walletAddress]);

  const load = async () => {
    setLoading(true);
    setError("");

    const [programResponse, historyResponse] = await Promise.all([
      fetchStorageProgramSnapshot(),
      fetchMyStorageDeliveryRequests(20),
    ]);

    if (programResponse.error) {
      setError(programResponse.error);
      setSnapshot(null);
      setDeliveryHistory([]);
      setLoading(false);
      return;
    }

    if (historyResponse.error) {
      setError(historyResponse.error);
    }

    setSnapshot(programResponse.snapshot);
    setDeliveryHistory(historyResponse.requests);
    setLoading(false);
  };

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!user?.id) {
      const timerId = window.setTimeout(() => {
        setLoading(false);
      }, 0);

      return () => {
        window.clearTimeout(timerId);
      };
    }

    const timerId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isSessionLoading, user?.id]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/profile/edit");
  };

  const handleJoin = async () => {
    setJoining(true);
    setError("");
    setMessage("");

    const response = await joinMyStorageProgram({
      walletAddress: walletAddress.trim() || undefined,
      note: note.trim() || undefined,
    });

    setJoining(false);

    if (response.error || !response.membership) {
      setError(response.error ?? "Не удалось отправить заявку в программу C3K Storage.");
      return;
    }

    setMessage("Заявка в программу C3K Storage отправлена.");
    await load();
  };

  const openDelivery = (request: StorageDeliveryRequest) => {
    if (request.channel === "desktop_download" && (request.storagePointer || request.deliveryUrl)) {
      openStorageDeliveryInDesktop(request);
      return;
    }

    void downloadStorageDeliveryRequestFile(request).then((result) => {
      if (!result.ok) {
        setError(result.error ?? "Не удалось скачать файл через storage runtime.");
        return;
      }

      if (result.request) {
        updateDeliveryRequest(result.request);
      }
    });
  };

  const updateDeliveryRequest = (nextRequest: StorageDeliveryRequest) => {
    setDeliveryHistory((current) => {
      const next = current.filter((entry) => entry.id !== nextRequest.id);
      return [nextRequest, ...next].slice(0, 20);
    });
  };

  const retryDelivery = async (request: StorageDeliveryRequest) => {
    setRetryingRequestId(request.id);
    setError("");
    setMessage("");

    const response = await retryStorageDeliveryRequestApi(request.id);

    setRetryingRequestId("");

    if (!response.ok || !response.request) {
      setError(response.error ?? response.message ?? "Не удалось повторить выдачу файла.");
      return;
    }

    updateDeliveryRequest(response.request);
    setMessage(response.message ?? "Запрос на выдачу обновлён.");
  };

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} />

      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <button type="button" className={styles.backButton} onClick={handleBack}>
              Назад
            </button>
            <span className={styles.heroChip}>Sprint 10 · Storage</span>
          </div>

          <div className={styles.heroMain}>
            <div className={styles.identityCard}>
              <div className={styles.identityMeta}>
                <p className={styles.kicker}>C3K Storage Node</p>
                <h1>Раздавайте контент сети и копите C3K Credit</h1>
                <span>
                  Это уже не просто форма вступления. Это целевой интерфейс вашей storage-ноды: здоровье раздачи, вклад в
                  сеть, bags в работе и будущая монета за участие.
                </span>
              </div>

              <div className={styles.heroPills}>
                <span className={`${styles.statusPill} ${styles[`statusPill${nodeState.tone.charAt(0).toUpperCase()}${nodeState.tone.slice(1)}`]}`}>
                  {nodeState.label}
                </span>
                <span className={styles.statusPill}>{formatTier(membership?.tier)}</span>
                <span className={styles.statusPill}>{runtimeModeLabel}</span>
                <span className={styles.statusPill}>{runtimePointerLabel}</span>
              </div>

              <div className={styles.heroStats}>
                <article className={styles.metricTile}>
                  <span>Desktop runtime</span>
                  <strong>{desktopModeLabel}</strong>
                  <small>{snapshot?.desktopClientEnabled ? "Electron node + c3k.ton gateway" : "Откроется после desktop slice"}</small>
                </article>
                <article className={styles.metricTile}>
                  <span>Ноды</span>
                  <strong>{nodeCountLabel}</strong>
                  <small>{snapshot?.nodeCount ? "Активные runtime точки" : "Пока ни одна нода не подключена"}</small>
                </article>
                <article className={styles.metricTile}>
                  <span>Storage bags</span>
                  <strong>{bagsInFocus}</strong>
                  <small>Целевой пул раздачи для вашего tier</small>
                </article>
                <article className={styles.metricTile}>
                  <span>Сеть</span>
                  <strong>{networkNodeCountLabel}</strong>
                  <small>{snapshot?.publicNodeCount ? "Публичные точки на карте" : "Пока сеть ещё в preview-режиме"}</small>
                </article>
              </div>
            </div>

            <aside className={styles.walletCard}>
              <div className={styles.walletBadge}>C3K Credit</div>
              <strong className={styles.walletValue}>{tokenBalancePreview}</strong>
              <span className={styles.walletCaption}>Баланс монеты за вклад в сеть</span>
              <div className={styles.walletRows}>
                <div>
                  <span>Эта неделя</span>
                  <b>+{liveRewards}</b>
                </div>
                <div>
                  <span>Следующий апгрейд</span>
                  <b>{tierMeta.nextTier ?? "Максимальный tier"}</b>
                </div>
                <div>
                  <span>Кошелёк</span>
                  <b>{formatShortWallet(membership?.walletAddress || connectedWalletAddress)}</b>
                </div>
              </div>
              <small className={styles.walletHint}>
                Пока это target UI для reward-layer. Следующий этап — реальный test-only runtime и начисление за uptime,
                storage bags и peer-to-peer раздачу.
              </small>
            </aside>
          </div>
        </section>

        {isSessionLoading || loading ? (
          <section className={styles.sectionCard}>
            <div className={styles.loadingState}>Загружаем статус программы и storage dashboard...</div>
          </section>
        ) : null}

        {!isSessionLoading && !user?.id ? (
          <section className={styles.sectionCard}>
            <div className={styles.sectionHead}>
              <h2>Вход в программу</h2>
              <p>Для участия в `C3K Storage` нужен аккаунт приложения и Telegram-авторизация.</p>
            </div>
            <TelegramLoginWidget onAuthorized={() => void refreshSession()} />
          </section>
        ) : null}

        {error ? <div className={styles.noticeError}>{error}</div> : null}
        {message ? <div className={styles.noticeSuccess}>{message}</div> : null}

        {user?.id ? (
          <>
            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Node control center</h2>
                <p>{nodeState.description}</p>
              </div>

              <div className={styles.controlGrid}>
                <article className={styles.controlPanel}>
                  <div className={styles.controlHead}>
                    <div>
                      <strong>Раздача и здоровье</strong>
                      <p>Как пользователь будет видеть рабочую ноду и peer-to-peer контур прямо в приложении.</p>
                    </div>
                    <span className={styles.controlPill}>Target state</span>
                  </div>
                  <div className={styles.controlMetrics}>
                    <div>
                      <span>Выделено под storage</span>
                      <b>{tierMeta.targetDiskGb} GB</b>
                    </div>
                    <div>
                      <span>Цель по bags</span>
                      <b>{tierMeta.targetBags}</b>
                    </div>
                    <div>
                      <span>Health target</span>
                      <b>{tierMeta.healthGoal}</b>
                    </div>
                    <div>
                      <span>Storage runtime</span>
                      <b>{snapshot?.runtimeStatus.label || runtimeModeLabel}</b>
                    </div>
                  </div>
                </article>

                <article className={styles.controlPanel}>
                  <div className={styles.controlHead}>
                    <div>
                      <strong>Участие в программе</strong>
                      <p>Здесь считываются moderation state, tier, кошелёк и readiness desktop-клиента.</p>
                    </div>
                  </div>
                  <div className={styles.controlMetrics}>
                    <div>
                      <span>Статус</span>
                      <b>{formatStatus(membership?.status)}</b>
                    </div>
                    <div>
                      <span>Tier</span>
                      <b>{formatTier(membership?.tier)}</b>
                    </div>
                    <div>
                      <span>TON gateway</span>
                      <b>{snapshot?.tonSiteDesktopGatewayEnabled ? "Запланирован" : "Дальше по roadmap"}</b>
                    </div>
                    <div>
                      <span>Upload worker</span>
                      <b>{snapshot?.runtimeStatus.requiresExternalUploadWorker ? "Нужен" : "Не нужен"}</b>
                    </div>
                    <div>
                      <span>Кошелёк</span>
                      <b>{membership?.walletAddress ? "Привязан" : "Пока не указан"}</b>
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Что раздаётся через ноду</h2>
                <p>
                  Это целевой вид swarm-экрана: релизные bags, архивы, NFT media и desktop cache будут видны как живые
                  сущности с peers и доходностью. Ниже уже отражён активный runtime-контур, в который целимся сейчас.
                </p>
              </div>
              {snapshot?.runtimeStatus.notes?.length ? (
                <div className={styles.heroPills}>
                  {snapshot.runtimeStatus.notes.slice(0, 2).map((note) => (
                    <span key={note} className={styles.controlPill}>
                      {note}
                    </span>
                  ))}
                </div>
              ) : null}

              <div className={styles.seedGrid}>
                {seedPreview.map((item) => (
                  <article key={item.id} className={styles.seedCard}>
                    <div className={styles.seedCardHead}>
                      <div>
                        <strong>{item.title}</strong>
                        <p>{item.subtitle}</p>
                      </div>
                      <span className={styles.seedHealthPill}>{item.health}</span>
                    </div>
                    <div className={styles.seedMeta}>
                      <span>{item.peers}</span>
                      <span>{item.payout}</span>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Состояние сети сейчас</h2>
                <p>
                  Это уже не абстрактная идея storage-сети. Здесь видно, сколько публичных точек
                  реально есть сейчас, сколько из них активны и как выглядит география первых peers.
                </p>
              </div>

              <div className={styles.networkGrid}>
                <article className={styles.networkCard}>
                  <span>Публичные ноды</span>
                  <strong>{networkSummary?.totalNodes ?? 0}</strong>
                  <small>Точки, которые уже можно показывать пользователю вне desktop.</small>
                </article>
                <article className={styles.networkCard}>
                  <span>Active / degraded</span>
                  <strong>
                    {networkSummary?.activeNodes ?? 0} / {networkSummary?.degradedNodes ?? 0}
                  </strong>
                  <small>Живые runtime-точки и ноды, которым ещё нужен recovery.</small>
                </article>
                <article className={styles.networkCard}>
                  <span>Community / provider</span>
                  <strong>
                    {networkSummary?.communityNodes ?? 0} / {networkSummary?.providerNodes ?? 0}
                  </strong>
                  <small>Баланс между пользовательскими нодами и инфраструктурными точками.</small>
                </article>
              </div>

              {networkSummary?.countries?.length || networkSummary?.cities?.length ? (
                <div className={styles.networkMeta}>
                  {networkSummary.countries.length ? (
                    <div className={styles.networkMetaBlock}>
                      <span>Страны</span>
                      <div className={styles.heroPills}>
                        {networkSummary.countries.map((country) => (
                          <span key={country} className={styles.controlPill}>
                            {country}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {networkSummary.cities.length ? (
                    <div className={styles.networkMetaBlock}>
                      <span>Города</span>
                      <div className={styles.heroPills}>
                        {networkSummary.cities.map((city) => (
                          <span key={city} className={styles.controlPill}>
                            {city}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  География сети ещё не собрана. Как только ноды начнут получать публичный профиль и
                  координаты, здесь появится уже живая карта городов и стран.
                </div>
              )}
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Карта peer-сети</h2>
                <p>
                  Здесь уже видно, как выглядит живая география storage-сети: ваши ноды и первые
                  публичные peers на одной карте, а не только в списке.
                </p>
              </div>

              {peerMapNodes.length ? (
                <div className={styles.peerMapLayout}>
                  <div ref={mapContainerRef} className={styles.peerMapCanvas} />
                  <div className={styles.peerMapLegend}>
                    {peerMapNodes.map((node) => (
                      <article key={`${node.id}-legend`} className={styles.peerMapLegendCard}>
                        <div className={styles.peerMapLegendHead}>
                          <span
                            className={`${styles.peerMapLegendTone} ${styles[`peerMapLegendTone${node.tone.charAt(0).toUpperCase()}${node.tone.slice(1)}`]}`}
                          />
                          <strong>{node.label}</strong>
                        </div>
                        <span>{node.role}</span>
                        <b>{node.health}</b>
                      </article>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Для карты пока не хватает нод с координатами. Как только у desktop-ноды появится
                  публичный профиль с геоточкой, сеть начнёт появляться здесь автоматически.
                </div>
              )}
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Как начисляется C3K Credit</h2>
                <p>Будущая reward-логика уже заложена в интерфейсе, чтобы было видно, к чему идём в следующем storage sprint.</p>
              </div>

              <div className={styles.rewardRuleGrid}>
                <article className={styles.rewardRuleCard}>
                  <strong>Uptime</strong>
                  <span>Чем стабильнее node online, тем выше доля еженедельного C3K Credit.</span>
                </article>
                <article className={styles.rewardRuleCard}>
                  <strong>Bags в раздаче</strong>
                  <span>Редкие релизы, lossless архивы и коллекционные bundles дают больший вес в программе.</span>
                </article>
                <article className={styles.rewardRuleCard}>
                  <strong>Peer contribution</strong>
                  <span>Раздача в пиковые моменты и здоровый swarm будут повышать reward multiplier и tier progress.</span>
                </article>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Участие и запуск</h2>
                <p>Этот блок остаётся рабочим уже сейчас: здесь заявка, кошелёк, moderation note и вход в desktop-контур.</p>
              </div>

              <div className={styles.membershipGrid}>
                <article className={styles.membershipPanel}>
                  <div className={styles.membershipRows}>
                    <div>
                      <span>Статус</span>
                      <b>{formatStatus(membership?.status)}</b>
                    </div>
                    <div>
                      <span>Tier</span>
                      <b>{formatTier(membership?.tier)}</b>
                    </div>
                    <div>
                      <span>TON-кошелёк</span>
                      <b>{membership?.walletAddress || connectedWalletAddress || "Пока не указан"}</b>
                    </div>
                  </div>
                  {membership?.moderationNote ? <div className={styles.noticeError}>{membership.moderationNote}</div> : null}
                  <div className={styles.panelActions}>
                    <Link href="/storage/desktop" className={styles.primaryButton}>
                      Открыть desktop-контур
                    </Link>
                    <Link href="/downloads" className={styles.secondaryLink}>
                      Файлы и delivery
                    </Link>
                    <Link href="/profile/edit" className={styles.secondaryLink}>
                      Настройки
                    </Link>
                  </div>
                </article>

                <article className={styles.joinPanel}>
                  <div className={styles.joinPanelHead}>
                    <strong>{membership ? "Обновить участие" : "Подать заявку"}</strong>
                    <p>
                      На текущем этапе программа запускается постепенно. Укажите TON-кошелёк и кратко опишите, какой объём
                      storage вы готовы выделить.
                    </p>
                  </div>

                  <div className={styles.joinGrid}>
                    <label className={styles.field}>
                      <span>TON-кошелёк</span>
                      <input
                        value={walletAddress}
                        onChange={(event) => setWalletAddress(event.target.value)}
                        placeholder="EQ..."
                      />
                    </label>

                    <div className={styles.walletTools}>
                      <TonConnectButton className={styles.tonConnectButton} />
                    </div>

                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Что хотите выделить под ноду</span>
                      <textarea
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                        placeholder="Например: готов держать 120 GB, хочу раздавать архивы релизов и участвовать в C3K Storage beta."
                      />
                    </label>
                  </div>

                  <div className={styles.panelActions}>
                    <button type="button" className={styles.primaryButton} onClick={() => void handleJoin()} disabled={joining}>
                      {joining ? "Отправляем..." : membership ? "Обновить заявку" : "Подать заявку"}
                    </button>
                  </div>
                </article>
              </div>
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Мои ноды в сети</h2>
                <p>
                  Здесь уже не только membership, а сами runtime-точки, которые принадлежат вашему
                  аккаунту. Это мост между desktop-клиентом и будущей публичной storage-сетью.
                </p>
              </div>

              {snapshot?.nodes?.length ? (
                <div className={styles.nodeGrid}>
                  {snapshot.nodes.map((node) => (
                    <article key={node.id} className={styles.nodeCard}>
                      <div className={styles.nodeCardHead}>
                        <div>
                          <strong>{node.publicLabel || node.city || node.nodeLabel}</strong>
                          <p>{formatNodeType(node.nodeType)}</p>
                        </div>
                        <span
                          className={`${styles.statusPill} ${styles[`statusPill${(node.status === "active" ? "Live" : node.status === "degraded" ? "Ready" : node.status === "suspended" ? "Locked" : "Pending")}`]}`}
                        >
                          {formatNodeStatus(node.status)}
                        </span>
                      </div>

                      <div className={styles.nodeMeta}>
                        <span>{formatNodePlatform(node.platform)}</span>
                        <span>{node.city || "Город не указан"}</span>
                        <span>{node.mapReady ? "Есть координаты" : "Нужны координаты"}</span>
                      </div>

                      <div className={styles.nodeRows}>
                        <div>
                          <span>Storage</span>
                          <b>{formatStorageSize(node.diskUsedBytes)} / {formatStorageSize(node.diskAllocatedBytes)}</b>
                        </div>
                        <div>
                          <span>Bandwidth</span>
                          <b>{node.bandwidthLimitKbps > 0 ? `${Math.round(node.bandwidthLimitKbps / 1000)} Mbps` : "—"}</b>
                        </div>
                        <div>
                          <span>Последний heartbeat</span>
                          <b>{formatDateTime(node.lastSeenAt)}</b>
                        </div>
                      </div>

                      <div className={styles.panelActions}>
                        <Link href="/storage/desktop" className={styles.secondaryLink}>
                          Открыть desktop-ноду
                        </Link>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Пока у аккаунта нет ни одной привязанной ноды. Откройте desktop-клиент, привяжите
                  локальную ноду к аккаунту и задайте ей публичный профиль.
                </div>
              )}
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Публичные точки сети</h2>
                <p>
                  Это уже не только ваша нода, а первые реальные точки будущей storage-сети, которые
                  можно показать пользователю вне desktop-клиента.
                </p>
              </div>

              {snapshot?.publicNodes?.length ? (
                <div className={styles.peerGrid}>
                  {snapshot.publicNodes.map((node) => (
                    <article key={`public-${node.id}`} className={styles.peerCard}>
                      <div className={styles.nodeCardHead}>
                        <div>
                          <strong>{node.publicLabel || node.city || node.nodeLabel}</strong>
                          <p>{formatNodeType(node.nodeType)}</p>
                        </div>
                        <span
                          className={`${styles.statusPill} ${styles[`statusPill${(node.status === "active" ? "Live" : node.status === "degraded" ? "Ready" : node.status === "suspended" ? "Locked" : "Pending")}`]}`}
                        >
                          {formatNodeStatus(node.status)}
                        </span>
                      </div>
                      <div className={styles.nodeMeta}>
                        <span>{node.city || "Unknown city"}</span>
                        <span>{node.countryCode || "—"}</span>
                        <span>{formatNodePlatform(node.platform)}</span>
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Публичных точек сети пока нет. Как только ноды начнут получать координаты и heartbeat,
                  здесь появится уже живая peer-картина, а не только preview.
                </div>
              )}
            </section>

            <section className={styles.sectionCard}>
              <div className={styles.sectionHead}>
                <h2>Последние выдачи</h2>
                <p>Здесь уже живой слой: файлы, desktop handoff, Telegram delivery и retry после ошибок.</p>
              </div>

              {deliveryHistory.length > 0 ? (
                <div className={styles.deliveryList}>
                  {deliveryHistory.map((request) => (
                    <article key={request.id} className={styles.deliveryCard}>
                      <div className={styles.deliveryTopline}>
                        <strong>{request.releaseSlug}</strong>
                        <span>{formatDeliveryStatus(request.status)}</span>
                      </div>
                      <div className={styles.deliveryMeta}>
                        <span>{formatDeliveryTarget(request)}</span>
                        <span>{formatDeliveryChannel(request.channel)}</span>
                        <span>{request.resolvedFormat || request.requestedFormat || "no format"}</span>
                        {request.lastDeliveredVia ? <span>{formatDeliveryVia(request.lastDeliveredVia)}</span> : null}
                      </div>
                      {request.failureMessage ? <p className={styles.deliveryMessage}>{request.failureMessage}</p> : null}
                      {request.status === "ready" && (request.deliveryUrl || request.storagePointer) ? (
                        <div className={styles.deliveryActions}>
                          <button type="button" className={styles.primaryButton} onClick={() => openDelivery(request)}>
                            {request.channel === "desktop_download" ? "Открыть в Desktop" : "Открыть файл"}
                          </button>
                        </div>
                      ) : null}
                      {(request.status === "failed" || request.status === "pending_asset_mapping") ? (
                        <div className={styles.deliveryActions}>
                          <button
                            type="button"
                            className={styles.secondaryAction}
                            onClick={() => void retryDelivery(request)}
                            disabled={retryingRequestId === request.id}
                          >
                            {retryingRequestId === request.id ? "Повторяем..." : "Повторить"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  История выдач пока пустая. После покупки релиза или трека здесь останется уже живой post-purchase слой, а
                  сверху будет отдельный node dashboard.
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
