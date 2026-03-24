import Link from "next/link";
import { notFound } from "next/navigation";

import { buildPublicStorageNodeSnapshot } from "@/lib/server/storage-registry-store";

import styles from "./page.module.scss";

export const dynamic = "force-dynamic";

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

const formatReliabilityLabel = (value: "stable" | "warming" | "attention"): string => {
  switch (value) {
    case "stable":
      return "Stable";
    case "warming":
      return "Warming";
    default:
      return "Needs attention";
  }
};

const formatRewardLabel = (value: "strong" | "building" | "low"): string => {
  switch (value) {
    case "strong":
      return "Strong";
    case "building":
      return "Building";
    default:
      return "Low";
  }
};

const formatPlatform = (value: "macos" | "windows" | "linux"): string => {
  switch (value) {
    case "macos":
      return "macOS";
    case "windows":
      return "Windows";
    default:
      return "Linux";
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

export default async function StorageNodePublicPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const snapshot = await buildPublicStorageNodeSnapshot(id);

  if (!snapshot) {
    notFound();
  }

  const { node, recentHealthEvents, otherPublicNodes, networkSummary, peerAssignments } = snapshot;

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroTop}>
            <Link href="/storage" className={styles.backLink}>
              Назад в Storage
            </Link>
            <span className={styles.heroChip}>{formatNodeType(node.nodeType)}</span>
          </div>

          <div className={styles.heroBody}>
            <div className={styles.heroMeta}>
              <h1>{node.publicLabel || node.city || node.nodeLabel}</h1>
              <p>
                Публичная точка сети C3K Storage. Здесь видно, как выглядит отдельная нода для
                пользователя: её статус, роль, ресурс и место в общей peer-сети.
              </p>
            </div>

            <div className={styles.heroStats}>
              <article>
                <span>Статус</span>
                <strong>{formatNodeStatus(node.status)}</strong>
              </article>
              <article>
                <span>Reliability</span>
                <strong>{formatReliabilityLabel(node.reliabilityLabel)}</strong>
              </article>
              <article>
                <span>Reward</span>
                <strong>{formatRewardLabel(node.rewardLabel)}</strong>
              </article>
              <article>
                <span>Город</span>
                <strong>{node.city || "Не указан"}</strong>
              </article>
              <article>
                <span>Платформа</span>
                <strong>{formatPlatform(node.platform)}</strong>
              </article>
              <article>
                <span>Последний heartbeat</span>
                <strong>{formatDateTime(node.lastSeenAt)}</strong>
              </article>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Профиль ноды</h2>
            <p>Базовая сводка по ресурсам, каналу связи и текущему состоянию этой точки сети.</p>
          </div>

          <div className={styles.metricGrid}>
            <article className={styles.metricCard}>
              <span>Reliability score</span>
              <strong>{node.reliabilityScore}/100</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Storage</span>
              <strong>
                {formatStorageSize(node.diskUsedBytes)} / {formatStorageSize(node.diskAllocatedBytes)}
              </strong>
            </article>
            <article className={styles.metricCard}>
              <span>Bandwidth</span>
              <strong>{node.bandwidthLimitKbps > 0 ? `${Math.round(node.bandwidthLimitKbps / 1000)} Mbps` : "—"}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Координаты</span>
              <strong>
                {typeof node.latitude === "number" && typeof node.longitude === "number"
                  ? `${node.latitude.toFixed(3)}, ${node.longitude.toFixed(3)}`
                  : "—"}
              </strong>
            </article>
            <article className={styles.metricCard}>
              <span>Сеть вокруг</span>
              <strong>{networkSummary.totalNodes} публичных нод</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Signals</span>
              <strong>{node.recentWarningCount} warning / {node.recentCriticalCount} critical</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Reward preview</span>
              <strong>{node.weeklyCreditsPreview} C3K / неделя</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Peer links</span>
              <strong>{node.peerLinkCount}</strong>
            </article>
            <article className={styles.metricCard}>
              <span>Network health</span>
              <strong>{formatReliabilityLabel(networkSummary.overallReliabilityLabel)}</strong>
            </article>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Место этой ноды в swarm</h2>
            <p>
              Здесь видно, с какими peer-точками эта нода лучше всего сочетается прямо сейчас,
              где у неё сильный network contour, а где ещё нужен резервный peer.
            </p>
          </div>

          {peerAssignments.length ? (
            <div className={styles.peerGrid}>
              {peerAssignments.map((assignment) => {
                const isSource = assignment.sourceNodeId === node.id;
                const peerLabel = isSource ? assignment.targetLabel : assignment.sourceLabel;
                const peerId = isSource ? assignment.targetNodeId : assignment.sourceNodeId;

                return (
                  <article key={assignment.id} className={styles.peerCard}>
                    <div>
                      <strong>{peerLabel}</strong>
                      <p>{assignment.reason}</p>
                    </div>
                    <span>
                      {assignment.status === "ready" ? "Ready" : assignment.status === "watch" ? "Watch" : "Risk"}
                    </span>
                    <span>{assignment.distanceKm ? `${assignment.distanceKm} km` : "distance pending"}</span>
                    <Link href={`/storage/nodes/${peerId}`} className={styles.peerLink}>
                      Открыть peer
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className={styles.emptyState}>
              Для этой ноды пока не собрано достаточно peer-links. Как только сеть расширится,
              здесь появятся первые swarm-ready связи и резервные маршруты.
            </div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Сигналы и состояние</h2>
            <p>Последние health-события по этой ноде. Если список пуст, критичных сигналов пока не было.</p>
          </div>

          {recentHealthEvents.length ? (
            <div className={styles.eventList}>
              {recentHealthEvents.map((event) => (
                <article key={event.id} className={styles.eventCard}>
                  <div className={styles.eventTop}>
                    <strong>{event.code}</strong>
                    <span>{event.severity}</span>
                  </div>
                  <p>{event.message}</p>
                  <small>{formatDateTime(event.createdAt)}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>У этой ноды пока нет сохранённых health-сигналов.</div>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHead}>
            <h2>Другие публичные peers</h2>
            <p>Соседние точки сети, которые уже можно открыть как самостоятельные public node pages.</p>
          </div>

          {otherPublicNodes.length ? (
            <div className={styles.peerGrid}>
              {otherPublicNodes.map((peer) => (
                <article key={peer.id} className={styles.peerCard}>
                  <div>
                    <strong>{peer.publicLabel || peer.city || peer.nodeLabel}</strong>
                    <p>{formatNodeType(peer.nodeType)}</p>
                  </div>
                  <span>{peer.city || "Unknown city"}</span>
                  <span>{formatReliabilityLabel(peer.reliabilityLabel)} · {peer.reliabilityScore}</span>
                  <Link href={`/storage/nodes/${peer.id}`} className={styles.peerLink}>
                    Открыть ноду
                  </Link>
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>Пока рядом нет других публичных peers для этой страницы.</div>
          )}
        </section>
      </div>
    </main>
  );
}
