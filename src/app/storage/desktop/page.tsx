"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import maplibregl from "maplibre-gl";
import { useEffect, useMemo, useRef, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import {
  fetchDesktopRuntimeContract,
  openTonSiteInDesktop,
} from "@/lib/desktop-runtime-api";
import {
  completeDesktopStorageDeliveryRequestApi,
  fetchStorageDeliveryRequest,
} from "@/lib/storage-delivery-api";
import type { StorageDeliveryRequest } from "@/types/storage";
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

export default function StorageDesktopPage() {
  const router = useRouter();
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
