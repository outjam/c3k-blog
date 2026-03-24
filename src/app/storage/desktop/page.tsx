"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";

import { BackButtonController } from "@/components/back-button-controller";
import {
  claimMyLocalStorageNode,
  fetchMyStorageNodeProfile,
  fetchStorageProgramSnapshot,
  joinMyStorageProgram,
  updateMyStorageNodeProfile,
} from "@/lib/admin-api";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  fetchDesktopRuntimeContract,
  openTonSiteInDesktop,
} from "@/lib/desktop-runtime-api";
import {
  completeDesktopStorageDeliveryRequestApi,
  fetchStorageDeliveryRequest,
} from "@/lib/storage-delivery-api";
import type { StorageDeliveryRequest, StorageNode, StorageProgramSnapshot } from "@/types/storage";
import type { C3kDesktopNodeMapNode, C3kDesktopRuntimeContract } from "@/types/desktop";

import styles from "./page.module.scss";

const NODE_MAP_STYLE = "https://demotiles.maplibre.org/style.json";

const buildDesktopNodeMapFallback = (): { nodes: C3kDesktopNodeMapNode[]; bounds: [[number, number], [number, number]] } => {
  return {
    nodes: [
      {
        id: "desktop-home",
        city: "Moscow desktop",
        role: "Локальная нода и storage cache",
        health: "Beta scaffold",
        bags: "Target 6 bags",
        tone: "ready",
        coordinates: [37.6176, 55.7558],
      },
      {
        id: "gateway-core",
        city: "Amsterdam gateway",
        role: "c3k.ton и runtime handoff",
        health: "Gateway pending",
        bags: "127.0.0.1:3467",
        tone: "ready",
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
        health: "Preview",
        bags: "4 peers",
        tone: "relay",
        coordinates: [20.4489, 44.7866],
      },
    ],
    bounds: [
      [0, 35],
      [85, 62],
    ],
  };
};

function DesktopRuntimeSkeleton() {
  return (
    <div className={styles.skeletonStack} aria-hidden="true">
      <section className={styles.skeletonHero} />
      <section className={styles.skeletonGrid}>
        <span />
        <span />
        <span />
      </section>
      <section className={styles.skeletonList}>
        <span />
        <span />
        <span />
        <span />
      </section>
    </div>
  );
}

interface ActiveDesktopRequest {
  requestId?: string;
  releaseSlug?: string;
  trackId?: string;
  storagePointer?: string;
  fileName?: string;
  deliveryUrl?: string;
  sourceMode?: string;
  targetUrl?: string;
  openedAt?: string;
}

interface DesktopDownloadState {
  state: string;
  fileName?: string;
  url?: string;
  totalBytes?: number;
  receivedBytes?: number;
  at?: string;
}

interface NodeProfileDraft {
  publicLabel: string;
  city: string;
  countryCode: string;
  latitude: string;
  longitude: string;
}

const parseDesktopRequestFromSearch = (search: string): ActiveDesktopRequest | null => {
  const params = new URLSearchParams(search);
  const requestId = params.get("desktopRequestId") || "";
  const releaseSlug = params.get("desktopReleaseSlug") || "";
  const trackId = params.get("desktopTrackId") || "";
  const storagePointer = params.get("desktopStoragePointer") || "";
  const fileName = params.get("desktopFileName") || "";
  const deliveryUrl = params.get("desktopDeliveryUrl") || "";
  const sourceMode = params.get("desktopSourceMode") || "";

  if (!requestId && !storagePointer && !deliveryUrl) {
    return null;
  }

  return {
    requestId: requestId || undefined,
    releaseSlug: releaseSlug || undefined,
    trackId: trackId || undefined,
    storagePointer: storagePointer || undefined,
    fileName: fileName || undefined,
    deliveryUrl: deliveryUrl || undefined,
    sourceMode: sourceMode || undefined,
  };
};

const formatDesktopSourceMode = (value: string | undefined): string => {
  switch (value) {
    case "local_node":
      return "Локальная нода";
    case "remote_fallback":
      return "Удалённый fallback";
    case "unresolved":
      return "Источник не найден";
    default:
      return "Ожидает handoff";
  }
};

const formatDownloadState = (value: string | undefined): string => {
  switch (value) {
    case "started":
      return "Загрузка запущена";
    case "progressing":
      return "Идёт загрузка";
    case "interrupted":
      return "Загрузка прервана";
    case "completed":
      return "Файл получен";
    case "cancelled":
      return "Загрузка отменена";
    default:
      return value ? `Состояние: ${value}` : "Загрузка ещё не стартовала";
  }
};

const formatBytes = (value: number | undefined): string => {
  if (!value || value <= 0) {
    return "0 B";
  }

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

const formatPercent = (value: number | undefined): string => {
  if (!Number.isFinite(value) || (value ?? 0) <= 0) {
    return "0%";
  }

  return `${Math.max(0, Math.min(100, Math.round(value ?? 0)))}%`;
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

const buildNodeProfileDraft = (node: StorageNode | null): NodeProfileDraft => ({
  publicLabel: node?.publicLabel ?? "",
  city: node?.city ?? "",
  countryCode: node?.countryCode ?? "",
  latitude: node?.latitude === undefined ? "" : String(node.latitude),
  longitude: node?.longitude === undefined ? "" : String(node.longitude),
});

export default function StorageDesktopPage() {
  const router = useRouter();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [runtime, setRuntime] = useState<C3kDesktopRuntimeContract | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [activeDesktopRequest, setActiveDesktopRequest] = useState<ActiveDesktopRequest | null>(() =>
    typeof window === "undefined" ? null : parseDesktopRequestFromSearch(window.location.search),
  );
  const [downloadState, setDownloadState] = useState<DesktopDownloadState | null>(null);
  const [resolvedRequest, setResolvedRequest] = useState<StorageDeliveryRequest | null>(null);
  const [programSnapshot, setProgramSnapshot] = useState<StorageProgramSnapshot | null>(null);
  const [programLoading, setProgramLoading] = useState(false);
  const [joiningProgram, setJoiningProgram] = useState(false);
  const [claimingNode, setClaimingNode] = useState(false);
  const [nodeProfile, setNodeProfile] = useState<StorageNode | null>(null);
  const [nodeProfileDraft, setNodeProfileDraft] = useState<NodeProfileDraft>(() => buildNodeProfileDraft(null));
  const [nodeProfileLoading, setNodeProfileLoading] = useState(false);
  const [savingNodeProfile, setSavingNodeProfile] = useState(false);
  const nodeMap = useMemo(() => runtime?.nodeMap ?? buildDesktopNodeMapFallback(), [runtime]);
  const storageUsagePercent = runtime?.localNode.storage.totalBytes
    ? (runtime.localNode.storage.dataBytes / runtime.localNode.storage.totalBytes) * 100
    : runtime?.localNode.storage.targetBytes
      ? (runtime.localNode.storage.dataBytes / runtime.localNode.storage.targetBytes) * 100
      : 0;
  const localNodeStatusLabel = runtime
    ? runtime.localNode.overallReady
      ? "Live node"
      : runtime.localNode.daemonReady
        ? "Daemon online"
        : runtime.features.desktopClientEnabled
          ? "Desktop beta"
          : "Scaffold"
    : "—";
  const localNodeClaimed = Boolean(
    runtime?.localNode.registryNodeId &&
      programSnapshot?.nodeIds?.includes(runtime.localNode.registryNodeId),
  );
  const localRegistryNodeId = runtime?.localNode.registryNodeId ?? "";
  const nodeProfileMapReady = Boolean(
    nodeProfile?.publicLabel &&
      nodeProfile?.city &&
      nodeProfile?.latitude !== undefined &&
      nodeProfile?.longitude !== undefined,
  );

  const loadProgramSnapshot = useCallback(async () => {
    if (!user?.id) {
      setProgramSnapshot(null);
      return;
    }

    setProgramLoading(true);
    const response = await fetchStorageProgramSnapshot();
    setProgramLoading(false);

    if (response.error) {
      setError(response.error);
      return;
    }

    setProgramSnapshot(response.snapshot);
  }, [user?.id]);

  const loadNodeProfile = useCallback(async () => {
    if (!user?.id || !localRegistryNodeId || !localNodeClaimed) {
      setNodeProfile(null);
      setNodeProfileDraft(buildNodeProfileDraft(null));
      return;
    }

    setNodeProfileLoading(true);
    const response = await fetchMyStorageNodeProfile(localRegistryNodeId);
    setNodeProfileLoading(false);

    if (response.error) {
      setError(response.error);
      return;
    }

    setNodeProfile(response.node);
    setNodeProfileDraft(buildNodeProfileDraft(response.node));
  }, [localNodeClaimed, localRegistryNodeId, user?.id]);

  useEffect(() => {
    let mounted = true;
    const timerId = window.setTimeout(() => {
      void fetchDesktopRuntimeContract().then((response) => {
        if (!mounted) {
          return;
        }

        setRuntime(response.runtime);
        setError(response.error ?? "");
        setBootLoading(false);
      });
    }, 0);

    return () => {
      mounted = false;
      window.clearTimeout(timerId);
    };
  }, []);

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void loadProgramSnapshot();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isSessionLoading, loadProgramSnapshot]);

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void loadNodeProfile();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isSessionLoading, loadNodeProfile]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleStorageOpen = (event: Event) => {
      const detail = (event as CustomEvent<ActiveDesktopRequest>).detail;
      setActiveDesktopRequest(detail ?? null);
      setResolvedRequest(null);
      setMessage(
        detail?.targetUrl
          ? `Desktop handoff принят. Источник: ${formatDesktopSourceMode(detail.sourceMode)}.`
          : "Desktop handoff принят, но источник файла пока не найден.",
      );
    };

    const handleDownloadState = (event: Event) => {
      const detail = (event as CustomEvent<DesktopDownloadState>).detail;
      setDownloadState(detail ?? null);
    };

    window.addEventListener("c3k-desktop-storage-open", handleStorageOpen as EventListener);
    window.addEventListener("c3k-desktop-download-state", handleDownloadState as EventListener);

    return () => {
      window.removeEventListener("c3k-desktop-storage-open", handleStorageOpen as EventListener);
      window.removeEventListener("c3k-desktop-download-state", handleDownloadState as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!activeDesktopRequest?.requestId) {
      return;
    }

    let cancelled = false;
    void fetchStorageDeliveryRequest(activeDesktopRequest.requestId).then((result) => {
      if (cancelled) {
        return;
      }

      setResolvedRequest(result.request ?? null);
    });

    return () => {
      cancelled = true;
    };
  }, [activeDesktopRequest?.requestId]);

  useEffect(() => {
    if (
      downloadState?.state !== "completed" ||
      activeDesktopRequest?.sourceMode !== "local_node" ||
      !activeDesktopRequest.requestId
    ) {
      return;
    }

    let cancelled = false;
    void completeDesktopStorageDeliveryRequestApi(activeDesktopRequest.requestId, {
      sourceUrl: activeDesktopRequest.targetUrl,
    }).then((result) => {
      if (cancelled || !result.request) {
        return;
      }

      setResolvedRequest(result.request);
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeDesktopRequest?.requestId,
    activeDesktopRequest?.sourceMode,
    activeDesktopRequest?.targetUrl,
    downloadState?.state,
  ]);

  const visibleResolvedRequest = activeDesktopRequest?.requestId ? resolvedRequest : null;

  useEffect(() => {
    if (!mapContainerRef.current || bootLoading || !runtime) {
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
      map.fitBounds(nodeMap.bounds, {
        padding: 44,
        duration: 0,
      });

      map.resize();

      map.addSource("c3k-node-links", {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [nodeMap.nodes[0].coordinates, nodeMap.nodes[1].coordinates, nodeMap.nodes[2].coordinates],
              },
            },
            {
              type: "Feature",
              properties: {},
              geometry: {
                type: "LineString",
                coordinates: [nodeMap.nodes[1].coordinates, nodeMap.nodes[4].coordinates, nodeMap.nodes[3].coordinates],
              },
            },
          ],
        },
      });

      map.addLayer({
        id: "c3k-node-links-layer",
        type: "line",
        source: "c3k-node-links",
        paint: {
          "line-color": "#2f7df6",
          "line-width": 2,
          "line-opacity": 0.62,
          "line-dasharray": [2, 2],
        },
      });

      nodeMap.nodes.forEach((node) => {
        const markerEl = document.createElement("div");
        markerEl.className = `${styles.mapMarker} ${styles[`mapMarker${node.tone.charAt(0).toUpperCase()}${node.tone.slice(1)}`]}`;
        markerEl.innerHTML = `<span class="${styles.mapMarkerDot}"></span><div class="${styles.mapMarkerLabel}"><strong>${node.city}</strong><small>${node.health}</small></div>`;

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
            }).setHTML(`<strong>${node.city}</strong><br/>${node.role}<br/>${node.health} · ${node.bags}`),
          )
          .addTo(map);
      });
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [bootLoading, runtime, nodeMap]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/storage");
  };

  const handleOpenTonSite = () => {
    const target = openTonSiteInDesktop(runtime);
    setMessage(`Пытаемся открыть c3k.ton через ${target.deepLink}`);
  };

  const handleJoinProgram = async () => {
    setJoiningProgram(true);
    setError("");
    setMessage("");

    const response = await joinMyStorageProgram({});
    setJoiningProgram(false);

    if (response.error || !response.membership) {
      setError(response.error ?? "Не удалось вступить в storage program.");
      return;
    }

    setMessage("Заявка в storage program отправлена.");
    await loadProgramSnapshot();
  };

  const handleClaimLocalNode = async () => {
    if (!runtime?.localNode.registryNodeId) {
      setError("Локальная нода ещё не получила registry node id.");
      return;
    }

    setClaimingNode(true);
    setError("");
    setMessage("");

    const response = await claimMyLocalStorageNode({
      nodeId: runtime.localNode.registryNodeId,
    });

    setClaimingNode(false);

    if (!response.ok) {
      setError(response.error ?? "Не удалось привязать локальную ноду к аккаунту.");
      return;
    }

    setMessage("Локальная desktop-нода привязана к вашему storage account.");
    await loadProgramSnapshot();
  };

  const handleNodeProfileDraftChange = (
    field: keyof NodeProfileDraft,
    value: string,
  ) => {
    setNodeProfileDraft((current) => ({
      ...current,
      [field]: field === "countryCode" ? value.toUpperCase() : value,
    }));
  };

  const handleSaveNodeProfile = async () => {
    if (!runtime?.localNode.registryNodeId) {
      setError("У локальной ноды ещё нет registry node id.");
      return;
    }

    setSavingNodeProfile(true);
    setError("");
    setMessage("");

    const response = await updateMyStorageNodeProfile({
      nodeId: runtime.localNode.registryNodeId,
      publicLabel: nodeProfileDraft.publicLabel.trim() || null,
      city: nodeProfileDraft.city.trim() || null,
      countryCode: nodeProfileDraft.countryCode.trim() || null,
      latitude: nodeProfileDraft.latitude.trim() || null,
      longitude: nodeProfileDraft.longitude.trim() || null,
    });

    setSavingNodeProfile(false);

    if (response.error || !response.node) {
      setError(response.error ?? "Не удалось обновить публичный профиль ноды.");
      return;
    }

    setNodeProfile(response.node);
    setNodeProfileDraft(buildNodeProfileDraft(response.node));
    setMessage("Публичный профиль ноды сохранён.");

    const runtimeResponse = await fetchDesktopRuntimeContract();
    setRuntime(runtimeResponse.runtime);
    if (runtimeResponse.error) {
      setError(runtimeResponse.error);
    }
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
            <span className={styles.heroChip}>Desktop beta</span>
          </div>

          <div className={styles.heroBody}>
            <div className={styles.heroMeta}>
              <h1>C3K Desktop Client</h1>
              <p>
                Единый desktop runtime для storage node, локального gateway и
                открытия <code>c3k.ton</code>.
              </p>
            </div>

            <div className={styles.heroStats}>
              <article>
                <span>Локальная нода</span>
                <strong>{runtime?.localNode.deviceLabel ?? "—"}</strong>
              </article>
              <article>
                <span>Runtime</span>
                <strong>{runtime?.localNode.storageRuntimeLabel ?? "—"}</strong>
              </article>
              <article>
                <span>Bags</span>
                <strong>{runtime ? String(runtime.localNode.bagCount) : "—"}</strong>
              </article>
              <article>
                <span>Статус</span>
                <strong>{localNodeStatusLabel}</strong>
              </article>
            </div>
          </div>
        </section>

        {bootLoading ? <DesktopRuntimeSkeleton /> : null}
        {error ? <div className={styles.noticeError}>{error}</div> : null}
        {message ? <div className={styles.noticeSuccess}>{message}</div> : null}

        {!bootLoading && runtime ? (
          <>
            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Что уже зафиксировано</h2>
                <p>
                  Это первый runtime contract для desktop-клиента. Он нужен, чтобы
                  web, Electron shell и local gateway смотрели в одну конфигурацию.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <article className={styles.infoCard}>
                  <span>App scheme</span>
                  <strong>{runtime.appScheme}://</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Runtime API</span>
                  <strong>{runtime.runtimeUrl ?? "pending public origin"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Storage program</span>
                  <strong>{runtime.storageProgramUrl ?? "/storage"}</strong>
                </article>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Storage program account</h2>
                <p>
                  Здесь desktop-нода связывается уже не просто с устройством, а с вашим участием в
                  программе: membership, число нод и привязка именно этого клиента к аккаунту.
                </p>
              </div>

              {isSessionLoading ? (
                <div className={styles.runtimeNotes}>
                  <strong>Проверяем desktop session…</strong>
                  <span>После авторизации здесь появится статус участия и связь локальной ноды с аккаунтом.</span>
                </div>
              ) : !user?.id ? (
                <div className={styles.stepList}>
                  <article className={styles.stepCard}>
                    <span className={styles.stepIndex}>1</span>
                    <div>
                      <strong>Войти в desktop через Telegram</strong>
                      <p>
                        Для привязки ноды к участнику сети нужен Telegram-login внутри desktop-клиента.
                      </p>
                    </div>
                  </article>
                  <TelegramLoginWidget onAuthorized={() => void refreshSession()} />
                </div>
              ) : (
                <>
                  <div className={styles.infoGrid}>
                    <article className={styles.infoCard}>
                      <span>Аккаунт</span>
                      <strong>{user.username ? `@${user.username}` : user.first_name ?? String(user.id)}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Membership</span>
                      <strong>{programSnapshot?.membership ? programSnapshot.membership.status : "not joined"}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Tier</span>
                      <strong>{programSnapshot?.membership?.tier ?? "supporter"}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Claimed nodes</span>
                      <strong>{String(programSnapshot?.nodeCount ?? 0)}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Эта нода</span>
                      <strong>{localNodeClaimed ? "Привязана" : "Ещё не привязана"}</strong>
                    </article>
                  </div>

                  <div className={styles.runtimeNotes}>
                    <strong>
                      {programSnapshot?.membership
                        ? localNodeClaimed
                          ? "Эта desktop-нода уже закреплена за вашим storage account."
                          : "Аккаунт уже в программе. Следующий шаг — привязать именно эту desktop-ноду."
                        : "Аккаунт ещё не вступил в storage program. Сначала создаём membership, потом привязываем ноду."}
                    </strong>
                    <span>
                      {programSnapshot?.membership
                        ? programLoading
                          ? "Обновляем program snapshot…"
                          : `Registry nodes: ${(programSnapshot.nodeIds ?? []).join(", ") || "пока нет привязанных нод"}.`
                        : "После вступления программа начнёт видеть эту машину как отдельную storage-ноду участника."}
                    </span>
                  </div>

                  <div className={styles.actions}>
                    {!programSnapshot?.membership ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => void handleJoinProgram()}
                        disabled={joiningProgram || programLoading}
                      >
                        {joiningProgram ? "Отправляем заявку..." : "Вступить в storage program"}
                      </button>
                    ) : !localNodeClaimed ? (
                      <button
                        type="button"
                        className={styles.primaryButton}
                        onClick={() => void handleClaimLocalNode()}
                        disabled={claimingNode || programLoading || !runtime?.localNode.registryNodeId}
                      >
                        {claimingNode ? "Привязываем ноду..." : "Привязать эту ноду к аккаунту"}
                      </button>
                    ) : null}

                    <button
                      type="button"
                      className={styles.secondaryLink}
                      onClick={() => void loadProgramSnapshot()}
                    >
                      Обновить статус программы
                    </button>
                    <Link href="/storage" className={styles.secondaryLink}>
                      Storage program
                    </Link>
                  </div>
                </>
              )}
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Локальная нода</h2>
                <p>
                  Этот блок уже показывает не только product preview, а реальное состояние
                  локального storage runtime на устройстве.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <article className={styles.infoCard}>
                  <span>Устройство</span>
                  <strong>{runtime.localNode.deviceLabel}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Платформа</span>
                  <strong>{runtime.localNode.platformLabel}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Daemon</span>
                  <strong>{runtime.localNode.daemonReady ? "Connected" : "Not ready"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Gateway</span>
                  <strong>{runtime.localNode.gatewayReady ? "Reachable" : "Pending"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Upload mode</span>
                  <strong>{runtime.localNode.uploadMode}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Worker secret</span>
                  <strong>{runtime.localNode.workerSecretConfigured ? "Configured" : "Missing"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Registry node</span>
                  <strong>{runtime.localNode.registryNodeId ?? "Локальный heartbeat pending"}</strong>
                </article>
              </div>

              <div className={styles.runtimeNotes}>
                <strong>{runtime.localNode.nextAction}</strong>
                {runtime.localNode.notes.map((note) => (
                  <span key={note}>{note}</span>
                ))}
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Публичный профиль ноды</h2>
                <p>
                  Этот блок управляет тем, как ваша desktop-нода будет выглядеть в сети: на карте,
                  в desktop client и в будущей публичной витрине storage-узлов.
                </p>
              </div>

              {!user?.id ? (
                <div className={styles.runtimeNotes}>
                  <strong>Сначала войдите в desktop через Telegram.</strong>
                  <span>После авторизации здесь появится профиль именно вашей локальной ноды.</span>
                </div>
              ) : !programSnapshot?.membership ? (
                <div className={styles.runtimeNotes}>
                  <strong>Сначала вступите в storage program.</strong>
                  <span>Публичный профиль доступен только для нод, связанных с участником программы.</span>
                </div>
              ) : !localNodeClaimed ? (
                <div className={styles.runtimeNotes}>
                  <strong>Сначала привяжите эту ноду к своему аккаунту.</strong>
                  <span>
                    Как только локальная нода будет закреплена за вашим storage account, здесь
                    можно будет указать публичное имя, город и координаты.
                  </span>
                </div>
              ) : nodeProfileLoading ? (
                <div className={styles.runtimeNotes}>
                  <strong>Загружаем профиль ноды…</strong>
                  <span>Подтягиваем текущие публичные поля из storage registry.</span>
                </div>
              ) : (
                <>
                  <div className={styles.infoGrid}>
                    <article className={styles.infoCard}>
                      <span>Registry node</span>
                      <strong>{nodeProfile?.id ?? runtime.localNode.registryNodeId ?? "—"}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Публичное имя</span>
                      <strong>{nodeProfile?.publicLabel ?? nodeProfile?.nodeLabel ?? "Пока не задано"}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Гео-статус</span>
                      <strong>{nodeProfileMapReady ? "Готова для карты" : "Нужно заполнить профиль"}</strong>
                    </article>
                    <article className={styles.infoCard}>
                      <span>Последнее обновление</span>
                      <strong>{formatDateTime(nodeProfile?.updatedAt)}</strong>
                    </article>
                  </div>

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Публичное имя</span>
                      <input
                        type="text"
                        value={nodeProfileDraft.publicLabel}
                        onChange={(event) => handleNodeProfileDraftChange("publicLabel", event.target.value)}
                        placeholder="Roman desktop node"
                        maxLength={120}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Город</span>
                      <input
                        type="text"
                        value={nodeProfileDraft.city}
                        onChange={(event) => handleNodeProfileDraftChange("city", event.target.value)}
                        placeholder="Moscow"
                        maxLength={120}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Код страны</span>
                      <input
                        type="text"
                        value={nodeProfileDraft.countryCode}
                        onChange={(event) => handleNodeProfileDraftChange("countryCode", event.target.value)}
                        placeholder="RU"
                        maxLength={8}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Широта</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={nodeProfileDraft.latitude}
                        onChange={(event) => handleNodeProfileDraftChange("latitude", event.target.value)}
                        placeholder="55.7558"
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Долгота</span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={nodeProfileDraft.longitude}
                        onChange={(event) => handleNodeProfileDraftChange("longitude", event.target.value)}
                        placeholder="37.6176"
                      />
                    </label>
                  </div>

                  <div className={styles.runtimeNotes}>
                    <strong>
                      {nodeProfileMapReady
                        ? "Профиль уже готов для реальной точки на карте нод."
                        : "Чтобы нода появилась на карте как реальная точка, добавьте публичное имя, город и координаты."}
                    </strong>
                    <span>
                      После сохранения desktop runtime перечитает registry, и карта в этом окне
                      сможет перейти с preview-точки на вашу реальную ноду.
                    </span>
                  </div>

                  <div className={styles.actions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void handleSaveNodeProfile()}
                      disabled={savingNodeProfile}
                    >
                      {savingNodeProfile ? "Сохраняем профиль..." : "Сохранить профиль ноды"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryLink}
                      onClick={() => void loadNodeProfile()}
                    >
                      Обновить профиль ноды
                    </button>
                  </div>
                </>
              )}
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Выделенное место и health</h2>
                <p>
                  Здесь уже не продуктовый placeholder, а реальная сводка по локальному storage root,
                  bag-файлам и последним runtime-сигналам ноды.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <article className={styles.infoCard}>
                  <span>Storage data</span>
                  <strong>{formatBytes(runtime.localNode.storage.dataBytes)}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Свободно на диске</span>
                  <strong>{formatBytes(runtime.localNode.storage.freeBytes)}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Bag files</span>
                  <strong>{String(runtime.localNode.storage.bagFileCount)}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Verified bags</span>
                  <strong>{String(runtime.localNode.storage.verifiedBagCount)}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Info / warning / critical</span>
                  <strong>
                    {runtime.localNode.health.infoCount} / {runtime.localNode.health.warningCount} / {runtime.localNode.health.criticalCount}
                  </strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Последний сигнал</span>
                  <strong>{formatDateTime(runtime.localNode.health.lastEventAt)}</strong>
                </article>
              </div>

              <div className={styles.metricCallout}>
                <div className={styles.metricCalloutHead}>
                  <strong>Использование storage root</strong>
                  <span>
                    {formatPercent(storageUsagePercent)} · {formatBytes(runtime.localNode.storage.dataBytes)} из{" "}
                    {formatBytes(runtime.localNode.storage.totalBytes ?? runtime.localNode.storage.targetBytes)}
                  </span>
                </div>
                <div className={styles.downloadProgressTrack}>
                  <span
                    style={{
                      width: `${Math.max(4, Math.min(100, Math.round(storageUsagePercent || 0)))}%`,
                    }}
                  />
                </div>
                {runtime.localNode.storage.rootPath ? (
                  <code className={styles.metricCode}>{runtime.localNode.storage.rootPath}</code>
                ) : null}
                {runtime.localNode.health.lastEventMessage ? (
                  <span className={styles.metricNote}>{runtime.localNode.health.lastEventMessage}</span>
                ) : null}
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Участие и reward preview</h2>
                <p>
                  Это ещё не реальный баланс, а beta-preview будущего reward-layer. Но расчёт уже
                  опирается на живой runtime: bags, verified pointers, объём данных и health.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <article className={styles.infoCard}>
                  <span>Роль ноды</span>
                  <strong>{runtime.localNode.participation.label}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Preview в день</span>
                  <strong>{runtime.localNode.participation.estimatedDailyCredits} C3K Credit</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Preview в неделю</span>
                  <strong>{runtime.localNode.participation.estimatedWeeklyCredits} C3K Credit</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Цель по storage</span>
                  <strong>{formatBytes(runtime.localNode.storage.targetBytes)}</strong>
                </article>
              </div>

              <div className={styles.runtimeNotes}>
                <strong>{runtime.localNode.participation.summary}</strong>
                <span>
                  Награды пока не начисляются автоматически. Этот блок нужен, чтобы уже сейчас
                  видеть, к какому node-state мы идём и как потом будет выглядеть reward-layer.
                </span>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Telegram delivery loop</h2>
                <p>
                  Этот блок показывает, обслуживает ли локальная нода общую Telegram-очередь выдачи,
                  а не только desktop-download внутри Electron.
                </p>
              </div>

              <div className={styles.infoGrid}>
                <article className={styles.infoCard}>
                  <span>Loop</span>
                  <strong>{runtime.localNode.deliveryWorker.enabled ? "Enabled" : "Disabled"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Bot token</span>
                  <strong>{runtime.localNode.deliveryWorker.tokenConfigured ? "Configured" : "Missing"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Queue size</span>
                  <strong>{String(runtime.localNode.deliveryWorker.queueSize)}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Last run</span>
                  <strong>{formatDateTime(runtime.localNode.deliveryWorker.lastRunAt)}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Last status</span>
                  <strong>{runtime.localNode.deliveryWorker.lastRunStatus ?? "—"}</strong>
                </article>
                <article className={styles.infoCard}>
                  <span>Delivered / processed</span>
                  <strong>
                    {runtime.localNode.deliveryWorker.lastRunDelivered ?? 0} / {runtime.localNode.deliveryWorker.lastRunProcessed ?? 0}
                  </strong>
                </article>
              </div>

              <div className={styles.runtimeNotes}>
                <strong>{runtime.localNode.deliveryWorker.summary}</strong>
                <span>
                  Когда loop активен, локальная нода может сама забирать общую очередь и отправлять
                  пользователю купленные файлы в Telegram через реальный storage runtime.
                </span>
              </div>
            </section>

            {activeDesktopRequest ? (
              <section className={styles.group}>
                <div className={styles.groupHeading}>
                  <h2>Последний desktop handoff</h2>
                  <p>
                    Этот блок показывает, какой файл был передан из web в desktop и откуда он сейчас
                    забирается: с локальной ноды или через fallback-контур.
                  </p>
                </div>

                <div className={styles.infoGrid}>
                  <article className={styles.infoCard}>
                    <span>Источник</span>
                    <strong>{formatDesktopSourceMode(activeDesktopRequest.sourceMode)}</strong>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Релиз</span>
                    <strong>{activeDesktopRequest.releaseSlug ?? "—"}</strong>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Трек</span>
                    <strong>{activeDesktopRequest.trackId ?? "Полный релиз"}</strong>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Файл</span>
                    <strong>{visibleResolvedRequest?.fileName ?? activeDesktopRequest.fileName ?? "—"}</strong>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Request</span>
                    <strong>{activeDesktopRequest.requestId ?? "Без request id"}</strong>
                  </article>
                  <article className={styles.infoCard}>
                    <span>Статус выдачи</span>
                    <strong>{visibleResolvedRequest?.status ?? "Desktop handoff"}</strong>
                  </article>
                </div>

                {activeDesktopRequest.storagePointer ? (
                  <div className={styles.runtimeNotes}>
                    <strong>Storage pointer</strong>
                    <span>{activeDesktopRequest.storagePointer}</span>
                  </div>
                ) : null}

                {downloadState ? (
                  <div className={styles.downloadCard}>
                    <div className={styles.downloadCardHead}>
                      <strong>{formatDownloadState(downloadState.state)}</strong>
                      <span>{downloadState.fileName ?? "desktop-download"}</span>
                    </div>
                    <div className={styles.downloadProgressMeta}>
                      <span>{formatBytes(downloadState.receivedBytes)} получено</span>
                      <span>{formatBytes(downloadState.totalBytes)} всего</span>
                    </div>
                    <div className={styles.downloadProgressTrack}>
                      <span
                        style={{
                          width:
                            downloadState.totalBytes && downloadState.totalBytes > 0
                              ? `${Math.max(
                                  4,
                                  Math.min(100, Math.round(((downloadState.receivedBytes ?? 0) / downloadState.totalBytes) * 100)),
                                )}%`
                              : "12%",
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </section>
            ) : null}

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Onboarding node</h2>
                <p>
                  На beta-этапе мы не запускаем реальный paid runtime. Здесь фиксируется
                  user path и локальная конфигурация для следующего desktop slice.
                </p>
              </div>

              <div className={styles.stepList}>
                {runtime.onboarding.steps.map((step, index) => (
                  <article key={step.id} className={styles.stepCard}>
                    <span className={styles.stepIndex}>{index + 1}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Карта нод</h2>
                <p>
                  Первая точка на карте уже отражает локальную ноду этого устройства. Остальные точки
                  показывают gateway и storage peers, которые будут участвовать в runtime и раздаче.
                </p>
              </div>

              <div className={styles.nodeMap}>
                <div ref={mapContainerRef} className={styles.nodeMapCanvas} />

                <div className={styles.nodeLegend}>
                  {nodeMap.nodes.map((node) => (
                    <article key={`${node.id}-legend`} className={styles.nodeLegendCard}>
                      <div className={styles.nodeLegendHead}>
                        <span className={`${styles.nodeLegendTone} ${styles[`nodeLegendTone${node.tone.charAt(0).toUpperCase()}${node.tone.slice(1)}`]}`} />
                        <strong>{node.city}</strong>
                      </div>
                      <span>{node.role}</span>
                      <b>{node.health}</b>
                      <small>{node.bags}</small>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Действия</h2>
                <p>
                  Это первые тестовые entry points для будущего desktop-клиента и local
                  gateway.
                </p>
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={handleOpenTonSite}
                >
                  Открыть c3k.ton
                </button>
                <a
                  className={styles.secondaryLink}
                  href={runtime.runtimeUrl ?? "/api/desktop/runtime"}
                  target="_blank"
                  rel="noreferrer"
                >
                  Runtime JSON
                </a>
                <a
                  className={styles.secondaryLink}
                  href={runtime.localNode.gatewayUrl ?? `${runtime.gateway.baseUrl}/health`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Gateway health
                </a>
                <Link href="/storage" className={styles.secondaryLink}>
                  Вернуться в Storage
                </Link>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Режим beta</h2>
                <p>
                  Сейчас это test-first контур без обязательного реального TON Storage
                  runtime и без production-сети.
                </p>
              </div>

              <div className={styles.statusList}>
                <article className={styles.statusCard}>
                  <span>Поддержка ОС</span>
                  <strong>{runtime.onboarding.supportedPlatforms.join(" · ")}</strong>
                </article>
                <article className={styles.statusCard}>
                  <span>Минимум диска</span>
                  <strong>{runtime.onboarding.minRecommendedDiskGb} GB</strong>
                </article>
                <article className={styles.statusCard}>
                  <span>Цель для beta</span>
                  <strong>{runtime.onboarding.targetDiskGb} GB</strong>
                </article>
              </div>
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
