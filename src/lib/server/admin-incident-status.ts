import { readArtistFinanceSnapshot } from "@/lib/server/artist-finance-store";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { listShopOrders } from "@/lib/server/shop-orders-store";
import { getStorageDeliveryState } from "@/lib/server/storage-delivery-store";
import { listStorageIngestJobs } from "@/lib/server/storage-ingest-store";
import { getTonRuntimeConfig } from "@/lib/server/ton-runtime-config-store";
import { formatStarsFromCents } from "@/lib/stars-format";
import {
  isTonOnchainNftMintEnabled,
  resolveTonNftCollectionAddress,
} from "@/lib/server/ton-nft-reference";
import type { ShopOrder, ArtistPayoutRequest } from "@/types/shop";
import type {
  AdminIncidentEntry,
  AdminIncidentSection,
  AdminIncidentSectionState,
  AdminIncidentSeverity,
  AdminIncidentStatusSnapshot,
} from "@/types/admin";
import type { StorageDeliveryRequest, StorageIngestJob } from "@/types/storage";

const RECENT_PAYMENT_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const PAYMENT_PENDING_STALE_MS = 2 * 60 * 60 * 1000;
const PAYOUT_STALE_MS = 3 * 24 * 60 * 60 * 1000;
const DELIVERY_STALE_MS = 30 * 60 * 1000;
const DELIVERY_CRITICAL_STALE_MS = 2 * 60 * 60 * 1000;
const INGEST_STALE_MS = 2 * 60 * 60 * 1000;
const RECENT_INGEST_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

const PAYMENT_PENDING_STATUSES = new Set([
  "pending_payment",
  "awaiting_payment",
  "payment_pending",
  "processing",
]);

const formatAgeLabel = (timestamp: string, nowMs: number): string | undefined => {
  const time = Date.parse(timestamp);

  if (!Number.isFinite(time)) {
    return undefined;
  }

  const diff = Math.max(0, nowMs - time);
  const minutes = Math.round(diff / (60 * 1000));

  if (minutes < 60) {
    return `${minutes} мин`;
  }

  const hours = Math.round(minutes / 60);

  if (hours < 48) {
    return `${hours} ч`;
  }

  const days = Math.round(hours / 24);
  return `${days} д`;
};

const severityRank: Record<AdminIncidentSeverity, number> = {
  critical: 3,
  warning: 2,
  info: 1,
};

const sectionStateRank: Record<AdminIncidentSectionState, number> = {
  critical: 3,
  warning: 2,
  ok: 1,
};

const compareBySeverityAndTime = (left: AdminIncidentEntry, right: AdminIncidentEntry): number => {
  const severityDiff = severityRank[right.severity] - severityRank[left.severity];

  if (severityDiff !== 0) {
    return severityDiff;
  }

  return Date.parse(right.timestamp) - Date.parse(left.timestamp);
};

const resolveSectionState = (
  entries: AdminIncidentEntry[],
  sourceState: AdminIncidentSection["sourceState"],
): AdminIncidentSectionState => {
  if (entries.some((entry) => entry.severity === "critical")) {
    return "critical";
  }

  if (entries.some((entry) => entry.severity === "warning") || sourceState === "degraded") {
    return "warning";
  }

  return "ok";
};

const summarizeSection = (
  entries: AdminIncidentEntry[],
  okText: string,
  attentionText: string,
): string => {
  return entries.length > 0 ? attentionText : okText;
};

const buildUnavailableSection = (
  input: Pick<AdminIncidentSection, "id" | "label" | "actionHint"> & {
    summary: string;
    sourceNote: string;
  },
): AdminIncidentSection => {
  return {
    id: input.id,
    label: input.label,
    state: "warning",
    count: 0,
    summary: input.summary,
    actionHint: input.actionHint,
    sourceState: "degraded",
    sourceNote: input.sourceNote,
    entries: [],
  };
};

const toOrderCustomerLabel = (order: ShopOrder): string => {
  if (order.telegramUsername) {
    return `@${order.telegramUsername}`;
  }

  if (order.customerName.trim()) {
    return order.customerName.trim();
  }

  return `user #${order.telegramUserId}`;
};

const buildPaymentSection = (orders: ShopOrder[], nowMs: number): AdminIncidentSection => {
  const recentFailedOrders = orders.filter((order) => {
    const updatedAt = Date.parse(order.updatedAt || order.createdAt);
    return (
      Number.isFinite(updatedAt) &&
      nowMs - updatedAt <= RECENT_PAYMENT_WINDOW_MS &&
      (order.status === "payment_failed" ||
        order.status === "failed" ||
        order.payment?.status === "failed")
    );
  });

  const stuckPaymentOrders = orders.filter((order) => {
    const updatedAt = Date.parse(order.updatedAt || order.createdAt);
    return (
      Number.isFinite(updatedAt) &&
      nowMs - updatedAt >= PAYMENT_PENDING_STALE_MS &&
      (PAYMENT_PENDING_STATUSES.has(order.status) || order.payment?.status === "pending_payment")
    );
  });

  const entries = [
    ...recentFailedOrders.map<AdminIncidentEntry>((order) => ({
      id: `payment-failed:${order.id}`,
      severity: "critical",
      title: `Заказ ${order.id} завершился ошибкой оплаты`,
      description: `${toOrderCustomerLabel(order)} · ${formatStarsFromCents(order.totalStarsCents)} STARS`,
      timestamp: order.updatedAt || order.createdAt,
      ageLabel: formatAgeLabel(order.updatedAt || order.createdAt, nowMs),
    })),
    ...stuckPaymentOrders.map<AdminIncidentEntry>((order) => ({
      id: `payment-stuck:${order.id}`,
      severity: "warning",
      title: `Заказ ${order.id} завис в оплате`,
      description: `${toOrderCustomerLabel(order)} · статус ${order.status}`,
      timestamp: order.updatedAt || order.createdAt,
      ageLabel: formatAgeLabel(order.updatedAt || order.createdAt, nowMs),
    })),
  ]
    .sort(compareBySeverityAndTime)
    .slice(0, 6);

  return {
    id: "payments",
    label: "Оплаты и checkout",
    state: resolveSectionState(entries, "ok"),
    count: recentFailedOrders.length + stuckPaymentOrders.length,
    summary: summarizeSection(
      entries,
      "Платежный контур выглядит стабильно.",
      "Есть сбои оплаты или зависшие заказы, которые стоит разобрать вручную.",
    ),
    actionHint: "Проверьте вкладку «Заказы», историю статусов и сценарий оплаты в Telegram.",
    windowLabel: "Окно: ошибки за 7 дней и pending-платежи старше 2 часов",
    sourceState: "ok",
    entries,
  };
};

const buildPayoutSection = (payoutRequests: ArtistPayoutRequest[], nowMs: number): AdminIncidentSection => {
  const openRequests = payoutRequests.filter(
    (request) => request.status === "pending_review" || request.status === "approved",
  );

  const entries = openRequests
    .map<AdminIncidentEntry>((request) => {
      const ageMs = Math.max(0, nowMs - Date.parse(request.updatedAt || request.createdAt));
      const isCritical =
        request.status === "approved" || ageMs >= PAYOUT_STALE_MS;

      return {
        id: `payout:${request.id}`,
        severity: isCritical ? "critical" : "warning",
        title:
          request.status === "approved"
            ? `Выплата ${request.id} ждёт ручной отправки`
            : `Запрос ${request.id} ждёт решения`,
        description: `Artist #${request.artistTelegramUserId} · ${formatStarsFromCents(request.amountStarsCents)} STARS`,
        timestamp: request.updatedAt || request.createdAt,
        ageLabel: formatAgeLabel(request.updatedAt || request.createdAt, nowMs),
      };
    })
    .sort((left, right) => {
      const severityDiff = severityRank[right.severity] - severityRank[left.severity];

      if (severityDiff !== 0) {
        return severityDiff;
      }

      return Date.parse(left.timestamp) - Date.parse(right.timestamp);
    })
    .slice(0, 6);

  return {
    id: "payouts",
    label: "Выплаты артистам",
    state: resolveSectionState(entries, "ok"),
    count: openRequests.length,
    summary: summarizeSection(
      entries,
      "Открытых payout-задач нет.",
      "Есть payout requests, которые требуют review или ручной выплаты.",
    ),
    actionHint: "Проверьте модерацию выплат в «Артисты» и сверьте студию конкретного артиста.",
    windowLabel: "Критичны approved payout и pending requests старше 3 дней",
    sourceState: "ok",
    entries,
  };
};

const deliveryTargetLabel = (request: StorageDeliveryRequest): string => {
  return request.targetType === "track" ? `трек ${request.trackId}` : `релиз ${request.releaseSlug}`;
};

const deliveryChannelLabel = (channel: StorageDeliveryRequest["channel"]): string => {
  if (channel === "telegram_bot") {
    return "Telegram";
  }

  if (channel === "desktop_download") {
    return "Desktop";
  }

  return "Web";
};

const buildDeliverySection = (
  requests: StorageDeliveryRequest[],
  nowMs: number,
): AdminIncidentSection => {
  const failedRequests = requests.filter((request) => {
    const updatedAt = Date.parse(request.updatedAt || request.createdAt);
    return (
      request.status === "failed" &&
      Number.isFinite(updatedAt) &&
      nowMs - updatedAt <= RECENT_PAYMENT_WINDOW_MS
    );
  });

  const stuckRequests = requests.filter((request) => {
    const updatedAt = Date.parse(request.updatedAt || request.createdAt);

    if (!Number.isFinite(updatedAt)) {
      return false;
    }

    const ageMs = nowMs - updatedAt;

    if (request.status === "pending_asset_mapping") {
      return ageMs >= DELIVERY_STALE_MS;
    }

    if (request.status === "requested" || request.status === "processing") {
      return ageMs >= DELIVERY_STALE_MS;
    }

    return false;
  });

  const entries = [
    ...failedRequests.map<AdminIncidentEntry>((request) => ({
      id: `delivery-failed:${request.id}`,
      severity: "critical",
      title: `Delivery ${request.id} завершился ошибкой`,
      description: `${deliveryTargetLabel(request)} · ${deliveryChannelLabel(request.channel)} · ${request.failureMessage || request.failureCode || "без детали"}`,
      timestamp: request.updatedAt || request.createdAt,
      ageLabel: formatAgeLabel(request.updatedAt || request.createdAt, nowMs),
    })),
    ...stuckRequests.map<AdminIncidentEntry>((request) => {
      const ageMs = Math.max(0, nowMs - Date.parse(request.updatedAt || request.createdAt));
      const severity: AdminIncidentSeverity =
        ageMs >= DELIVERY_CRITICAL_STALE_MS ? "critical" : "warning";

      return {
        id: `delivery-stuck:${request.id}`,
        severity,
        title:
          request.status === "pending_asset_mapping"
            ? `Delivery ${request.id} ждёт asset mapping`
            : `Delivery ${request.id} завис в обработке`,
        description: `${deliveryTargetLabel(request)} · ${deliveryChannelLabel(request.channel)} · статус ${request.status}`,
        timestamp: request.updatedAt || request.createdAt,
        ageLabel: formatAgeLabel(request.updatedAt || request.createdAt, nowMs),
      };
    }),
  ]
    .sort(compareBySeverityAndTime)
    .slice(0, 6);

  return {
    id: "deliveries",
    label: "Файлы и delivery",
    state: resolveSectionState(entries, "ok"),
    count: failedRequests.length + stuckRequests.length,
    summary: summarizeSection(
      entries,
      "Delivery requests без явных проблем.",
      "Есть failed или зависшие выдачи файлов, которые требуют retry или проверки mapping.",
    ),
    actionHint: "Откройте storage/downloads, проверьте mapping, retry и канал выдачи.",
    windowLabel: "Критичны failed deliveries и pending/processing старше 30 минут",
    sourceState: "ok",
    entries,
  };
};

const buildIngestSection = (jobs: StorageIngestJob[], nowMs: number): AdminIncidentSection => {
  const failedJobs = jobs.filter((job) => {
    const updatedAt = Date.parse(job.updatedAt || job.createdAt);
    return job.status === "failed" && Number.isFinite(updatedAt) && nowMs - updatedAt <= RECENT_INGEST_WINDOW_MS;
  });

  const staleJobs = jobs.filter((job) => {
    const updatedAt = Date.parse(job.updatedAt || job.createdAt);
    return job.status === "processing" && Number.isFinite(updatedAt) && nowMs - updatedAt >= INGEST_STALE_MS;
  });

  const entries = [
    ...failedJobs.map<AdminIncidentEntry>((job) => ({
      id: `ingest-failed:${job.id}`,
      severity: "warning",
      title: `Ingest job ${job.id} завершился ошибкой`,
      description: `${job.assetId} · ${job.failureMessage || job.failureCode || "без детали"}`,
      timestamp: job.updatedAt || job.createdAt,
      ageLabel: formatAgeLabel(job.updatedAt || job.createdAt, nowMs),
    })),
    ...staleJobs.map<AdminIncidentEntry>((job) => ({
      id: `ingest-stuck:${job.id}`,
      severity: "warning",
      title: `Ingest job ${job.id} завис в обработке`,
      description: `${job.assetId} · mode ${job.mode}`,
      timestamp: job.updatedAt || job.createdAt,
      ageLabel: formatAgeLabel(job.updatedAt || job.createdAt, nowMs),
    })),
  ]
    .sort(compareBySeverityAndTime)
    .slice(0, 6);

  return {
    id: "ingest",
    label: "Storage ingest",
    state: resolveSectionState(entries, "ok"),
    count: failedJobs.length + staleJobs.length,
    summary: summarizeSection(
      entries,
      "Test ingest выглядит спокойно.",
      "Есть failed/stuck ingest jobs, из-за которых bags или pointers могли не подготовиться.",
    ),
    actionHint: "Проверьте Storage dashboard: sync релизов, test bags и ingest jobs.",
    windowLabel: "Окно: failed jobs за 7 дней и processing старше 2 часов",
    sourceState: "ok",
    entries,
  };
};

const buildNftRuntimeSection = async (): Promise<AdminIncidentSection> => {
  const nowMs = Date.now();
  const runtimeConfig = await getTonRuntimeConfig();
  const onchainMintEnabled = isTonOnchainNftMintEnabled();
  const configuredCollectionAddress = runtimeConfig?.collectionAddress || resolveTonNftCollectionAddress();
  const sponsorMnemonicWords = String(
    process.env.TON_SPONSOR_WALLET_MNEMONIC ?? process.env.TON_TESTNET_WALLET_MNEMONIC ?? "",
  )
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  const entries: AdminIncidentEntry[] = [];

  if (onchainMintEnabled && !configuredCollectionAddress) {
    entries.push({
      id: "nft-runtime:collection-missing",
      severity: "critical",
      title: "On-chain mint включён, но NFT collection не настроена",
      description: "Проверьте TON runtime config или env-переменные коллекции.",
      timestamp: runtimeConfig?.updatedAt ?? new Date().toISOString(),
      ageLabel: formatAgeLabel(runtimeConfig?.updatedAt ?? new Date().toISOString(), nowMs),
    });
  }

  if (onchainMintEnabled && sponsorMnemonicWords.length < 12) {
    entries.push({
      id: "nft-runtime:sponsor-missing",
      severity: "critical",
      title: "On-chain mint включён, но sponsor wallet не настроен",
      description: "Для sponsored mint нужен TON sponsor mnemonic в env.",
      timestamp: runtimeConfig?.updatedAt ?? new Date().toISOString(),
      ageLabel: formatAgeLabel(runtimeConfig?.updatedAt ?? new Date().toISOString(), nowMs),
    });
  }

  if (!onchainMintEnabled) {
    entries.push({
      id: "nft-runtime:disabled",
      severity: "info",
      title: "NFT mint сейчас выключен",
      description: "Это нормально для test-only режима, если вы не тестируете sponsored mint.",
      timestamp: runtimeConfig?.updatedAt ?? new Date().toISOString(),
      ageLabel: formatAgeLabel(runtimeConfig?.updatedAt ?? new Date().toISOString(), nowMs),
    });
  }

  return {
    id: "nft_runtime",
    label: "NFT runtime",
    state: resolveSectionState(entries.filter((entry) => entry.severity !== "info"), "ok"),
    count: entries.filter((entry) => entry.severity !== "info").length,
    summary:
      entries.some((entry) => entry.severity === "critical")
        ? "NFT runtime требует настройки перед боевым mint."
        : onchainMintEnabled
          ? "NFT runtime выглядит готовым к testnet mint."
          : "NFT mint сейчас выключен и не создаёт operational risk.",
    actionHint: "Проверьте TON collection, sponsor wallet и runtime config перед тестом mint.",
    sourceState: runtimeConfig ? "ok" : "degraded",
    sourceNote: runtimeConfig ? undefined : "TON runtime config пока не читается из Postgres.",
    entries: entries.slice(0, 4),
  };
};

export const readAdminIncidentStatus = async (): Promise<AdminIncidentStatusSnapshot> => {
  const now = new Date();
  const nowMs = now.getTime();

  const [ordersResult, configResult, deliveryStateResult, ingestJobsResult, nftRuntimeSectionResult] =
    await Promise.allSettled([
      listShopOrders(),
      readShopAdminConfig(),
      getStorageDeliveryState(),
      listStorageIngestJobs(),
      buildNftRuntimeSection(),
    ]);

  const paymentsSection =
    ordersResult.status === "fulfilled"
      ? buildPaymentSection(ordersResult.value, nowMs)
      : buildUnavailableSection({
          id: "payments",
          label: "Оплаты и checkout",
          summary: "Сигналы по оплатам временно недоступны.",
          actionHint: "Проверьте Postgres order snapshots и webhook flows.",
          sourceNote: ordersResult.reason instanceof Error ? ordersResult.reason.message : "orders source unavailable",
        });

  let payoutsSection: AdminIncidentSection;

  if (configResult.status === "fulfilled") {
    const financeResult = await readArtistFinanceSnapshot({
      config: configResult.value,
      payoutRequestsLimit: 5000,
      earningsLimit: 1,
      payoutAuditEntriesLimit: 1,
    }).then(
      (value) => ({ ok: true as const, value }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    payoutsSection = financeResult.ok
      ? buildPayoutSection(financeResult.value.payoutRequests, nowMs)
      : buildUnavailableSection({
          id: "payouts",
          label: "Выплаты артистам",
          summary: "Сигналы по payout requests временно недоступны.",
          actionHint: "Проверьте finance snapshot и artist payout tables.",
          sourceNote:
            financeResult.error instanceof Error ? financeResult.error.message : "finance source unavailable",
        });
  } else {
    payoutsSection = buildUnavailableSection({
      id: "payouts",
      label: "Выплаты артистам",
      summary: "Сигналы по payout requests временно недоступны.",
      actionHint: "Проверьте чтение shop admin config перед payout snapshot.",
      sourceNote: configResult.reason instanceof Error ? configResult.reason.message : "config source unavailable",
    });
  }

  const deliveriesSection =
    deliveryStateResult.status === "fulfilled"
      ? buildDeliverySection(Object.values(deliveryStateResult.value?.requests ?? {}), nowMs)
      : buildUnavailableSection({
          id: "deliveries",
          label: "Файлы и delivery",
          summary: "Сигналы по delivery requests временно недоступны.",
          actionHint: "Проверьте storage delivery state и worker routes.",
          sourceNote:
            deliveryStateResult.reason instanceof Error
              ? deliveryStateResult.reason.message
              : "delivery source unavailable",
        });

  const ingestSection =
    ingestJobsResult.status === "fulfilled"
      ? buildIngestSection(ingestJobsResult.value, nowMs)
      : buildUnavailableSection({
          id: "ingest",
          label: "Storage ingest",
          summary: "Сигналы по ingest jobs временно недоступны.",
          actionHint: "Проверьте storage ingest state и admin ingest route.",
          sourceNote:
            ingestJobsResult.reason instanceof Error
              ? ingestJobsResult.reason.message
              : "ingest source unavailable",
        });

  const nftRuntimeSection =
    nftRuntimeSectionResult.status === "fulfilled"
      ? nftRuntimeSectionResult.value
      : buildUnavailableSection({
          id: "nft_runtime",
          label: "NFT runtime",
          summary: "Сигналы по NFT runtime временно недоступны.",
          actionHint: "Проверьте TON runtime config и mint env.",
          sourceNote:
            nftRuntimeSectionResult.reason instanceof Error
              ? nftRuntimeSectionResult.reason.message
              : "nft runtime source unavailable",
        });

  const sections = [
    paymentsSection,
    payoutsSection,
    deliveriesSection,
    ingestSection,
    nftRuntimeSection,
  ];

  return {
    updatedAt: now.toISOString(),
    openIncidents: sections.reduce((acc, section) => acc + section.count, 0),
    criticalIncidents: sections.reduce(
      (acc, section) =>
        acc + section.entries.filter((entry) => entry.severity === "critical").length,
      0,
    ),
    warningIncidents: sections.reduce(
      (acc, section) =>
        acc + section.entries.filter((entry) => entry.severity === "warning").length,
      0,
    ),
    sections: sections.sort((left, right) => {
      const stateDiff = sectionStateRank[right.state] - sectionStateRank[left.state];

      if (stateDiff !== 0) {
        return stateDiff;
      }

      return right.count - left.count;
    }),
  };
};
