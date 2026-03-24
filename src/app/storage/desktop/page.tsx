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

export default function StorageDesktopPage() {
  const router = useRouter();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  const [runtime, setRuntime] = useState<C3kDesktopRuntimeContract | null>(null);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const nodeMap = useMemo(() => runtime?.nodeMap ?? buildDesktopNodeMapFallback(), [runtime]);

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
                <span>Gateway</span>
                <strong>
                  {runtime ? `${runtime.gateway.host}:${runtime.gateway.port}` : "—"}
                </strong>
              </article>
              <article>
                <span>TON Site</span>
                <strong>{runtime?.gateway.tonSiteHost ?? "c3k.ton"}</strong>
              </article>
              <article>
                <span>Статус</span>
                <strong>
                  {runtime?.features.desktopClientEnabled ? "Enabled" : "Scaffold"}
                </strong>
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
                  Так будет выглядеть живая сеть раздачи в desktop-клиенте: ваша нода, gateway для <code>c3k.ton</code>,
                  archive bags и соседние точки, которые держат реплики рядом с пользователем.
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
                  href={`${runtime.gateway.baseUrl}/health`}
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
