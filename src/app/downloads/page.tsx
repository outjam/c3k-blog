"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { openStorageDeliveryInDesktop } from "@/lib/desktop-runtime-api";
import {
  downloadStorageDeliveryRequestFile,
  fetchMyStorageDeliveryRequests,
  retryStorageDeliveryRequestApi,
} from "@/lib/storage-delivery-api";
import type { StorageDeliveryRequest } from "@/types/storage";
import type { ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

type DownloadsFilter = "all" | "ready" | "active" | "failed";

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

const isRuntimeBackedRequest = (request: StorageDeliveryRequest): boolean => {
  return (
    request.lastDeliveredVia === "tonstorage_gateway" ||
    request.lastDeliveredVia === "bag_http_pointer" ||
    request.lastDeliveredVia === "bag_meta"
  );
};

const formatRequestHint = (request: StorageDeliveryRequest): string => {
  switch (request.status) {
    case "delivered":
      return request.channel === "telegram_bot"
        ? "Файл уже отправлен в Telegram."
        : request.channel === "desktop_download"
          ? "Файл уже передан в C3K Desktop."
          : "Файл уже был открыт или скачан.";
    case "ready":
      return request.channel === "desktop_download"
        ? "Можно сразу открыть в desktop-нode."
        : "Файл уже готов к открытию.";
    case "pending_asset_mapping":
      return "Storage runtime ещё сопоставляет нужный asset.";
    case "processing":
      return "Запрос уже обрабатывается worker-слоем.";
    case "failed":
      return "Нужно повторить выдачу или проверить route.";
    default:
      return "Запрос на выдачу уже создан.";
  }
};

const formatActionLabel = (request: StorageDeliveryRequest): string => {
  if (request.channel === "desktop_download") {
    return "Открыть в Desktop";
  }

  if (request.channel === "telegram_bot") {
    return request.status === "delivered" ? "Открыть в Telegram" : "Открыть файл";
  }

  return "Открыть файл";
};

const getDeliveryTone = (
  value: StorageDeliveryRequest["status"],
): "success" | "warning" | "danger" | "default" => {
  switch (value) {
    case "ready":
    case "delivered":
      return "success";
    case "processing":
    case "pending_asset_mapping":
    case "requested":
      return "warning";
    case "failed":
      return "danger";
    default:
      return "default";
  }
};

const toneClassName = (
  stylesMap: Record<string, string>,
  value: "success" | "warning" | "danger" | "default",
): string => {
  switch (value) {
    case "success":
      return stylesMap.toneSuccess;
    case "warning":
      return stylesMap.toneWarning;
    case "danger":
      return stylesMap.toneDanger;
    default:
      return stylesMap.toneDefault;
  }
};

const isReadyRequest = (request: StorageDeliveryRequest): boolean => {
  return request.status === "ready" || request.status === "delivered";
};

const isActiveRequest = (request: StorageDeliveryRequest): boolean => {
  return (
    request.status === "requested" ||
    request.status === "processing" ||
    request.status === "pending_asset_mapping"
  );
};

const formatRequestTarget = (
  request: StorageDeliveryRequest,
  release: ShopProduct | null,
): string => {
  if (request.targetType !== "track") {
    return "Полный релиз";
  }

  const trackTitle =
    release?.releaseTracklist?.find((entry) => entry.id === request.trackId)?.title ??
    request.trackId;

  return trackTitle ? `Трек · ${trackTitle}` : "Трек";
};

const formatStorageReleaseHint = (release: ShopProduct | null): string => {
  if (!release?.storageSummary) {
    return "Релиз ещё может выдаваться через обычный route без archive-runtime слоя.";
  }

  switch (release.storageSummary.status) {
    case "verified":
      return "Архив релиза уже подтверждён в storage runtime.";
    case "archived":
      return "Релиз уже упакован в archive contour и ждёт дальнейшей раздачи.";
    case "prepared":
      return "Archive bag уже подготовлен, но часть выдач ещё может идти через fallback.";
    case "syncing":
      return "Storage pipeline ещё собирает archive и runtime mapping.";
    case "attention":
      return "У archive contour есть сигнал внимания, поэтому route может переключаться.";
    default:
      return "Storage archive для релиза ещё не синхронизирован.";
  }
};

function DownloadsPageSkeleton() {
  return (
    <div className={styles.skeletonStack} aria-hidden="true">
      <section className={styles.skeletonHero} />
      <section className={styles.skeletonMetrics}>
        <span />
        <span />
        <span />
      </section>
      <section className={styles.skeletonList}>
        {Array.from({ length: 5 }).map((_, index) => (
          <article key={index} className={styles.skeletonCard} />
        ))}
      </section>
    </div>
  );
}

export default function DownloadsPage() {
  const router = useRouter();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();

  const [catalog, setCatalog] = useState<ShopProduct[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<StorageDeliveryRequest[]>([]);
  const [bootLoading, setBootLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retryingRequestId, setRetryingRequestId] = useState("");
  const [activeFilter, setActiveFilter] = useState<DownloadsFilter>("all");

  const releaseBySlug = useMemo(
    () => new Map(catalog.map((entry) => [entry.slug, entry])),
    [catalog],
  );

  const filterItems = useMemo(
    () => [
      { id: "all", label: "Все", badge: deliveryHistory.length },
      {
        id: "ready",
        label: "Готово",
        badge: deliveryHistory.filter((entry) => isReadyRequest(entry)).length,
      },
      {
        id: "active",
        label: "В работе",
        badge: deliveryHistory.filter((entry) => isActiveRequest(entry)).length,
      },
      {
        id: "failed",
        label: "Ошибки",
        badge: deliveryHistory.filter((entry) => entry.status === "failed").length,
      },
    ] as Array<{ id: DownloadsFilter; label: string; badge: number }>,
    [deliveryHistory],
  );

  const filteredRequests = useMemo(() => {
    switch (activeFilter) {
      case "ready":
        return deliveryHistory.filter((entry) => isReadyRequest(entry));
      case "active":
        return deliveryHistory.filter((entry) => isActiveRequest(entry));
      case "failed":
        return deliveryHistory.filter((entry) => entry.status === "failed");
      default:
        return deliveryHistory;
    }
  }, [activeFilter, deliveryHistory]);

  const summary = useMemo(
    () => ({
      ready: deliveryHistory.filter((entry) => isReadyRequest(entry)).length,
      active: deliveryHistory.filter((entry) => isActiveRequest(entry)).length,
      failed: deliveryHistory.filter((entry) => entry.status === "failed").length,
      runtime: deliveryHistory.filter((entry) => isRuntimeBackedRequest(entry)).length,
      desktop: deliveryHistory.filter((entry) => entry.channel === "desktop_download").length,
      telegram: deliveryHistory.filter((entry) => entry.channel === "telegram_bot").length,
      web: deliveryHistory.filter((entry) => entry.channel === "web_download").length,
    }),
    [deliveryHistory],
  );

  const load = async () => {
    setBootLoading(true);
    setError("");

    const [historyResponse, catalogResponse] = await Promise.all([
      fetchMyStorageDeliveryRequests(60),
      fetchPublicCatalog(),
    ]);

    if (historyResponse.error) {
      setError(historyResponse.error);
    }

    setDeliveryHistory(historyResponse.requests);
    setCatalog(catalogResponse.products);
    setBootLoading(false);
  };

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!user?.id) {
      const timerId = window.setTimeout(() => {
        setBootLoading(false);
      }, 0);

      return () => window.clearTimeout(timerId);
    }

    const timerId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [isSessionLoading, user?.id]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/profile");
  };

  const openDelivery = (request: StorageDeliveryRequest) => {
    if (
      request.channel === "desktop_download" &&
      request.storagePointer
    ) {
      openStorageDeliveryInDesktop(request);
      return;
    }

    void downloadStorageDeliveryRequestFile(request).then((result) => {
      if (!result.ok) {
        setError(result.error ?? "Не удалось скачать файл через storage runtime.");
        return;
      }

      if (result.request) {
        updateRequest(result.request);
      }
    });
  };

  const updateRequest = (request: StorageDeliveryRequest) => {
    setDeliveryHistory((current) => {
      const next = current.filter((entry) => entry.id !== request.id);
      return [request, ...next];
    });
  };

  const retryRequest = async (request: StorageDeliveryRequest) => {
    setRetryingRequestId(request.id);
    setError("");
    setMessage("");

    const response = await retryStorageDeliveryRequestApi(request.id);

    setRetryingRequestId("");

    if (!response.ok || !response.request) {
      setError(response.error ?? response.message ?? "Не удалось повторить выдачу файла.");
      return;
    }

    updateRequest(response.request);
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
            <span className={styles.heroChip}>Файлы</span>
          </div>
          <div className={styles.heroBody}>
            <div className={styles.heroMeta}>
              <h1>Библиотека загрузок</h1>
              <p>
                Здесь собраны купленные релизы, треки и весь маршрут выдачи:
                браузер, Telegram, Desktop и storage runtime.
              </p>
            </div>

            <div className={styles.heroStats}>
              <article>
                <span>Готово</span>
                <strong>{summary.ready}</strong>
              </article>
              <article>
                <span>В работе</span>
                <strong>{summary.active}</strong>
              </article>
              <article>
                <span>Ошибки</span>
                <strong>{summary.failed}</strong>
              </article>
              <article>
                <span>Через storage</span>
                <strong>{summary.runtime}</strong>
              </article>
            </div>

            <div className={styles.heroSignals}>
              <span className={styles.signalPill}>{summary.runtime} через runtime</span>
              <span className={styles.signalPill}>{summary.desktop} desktop</span>
              <span className={styles.signalPill}>{summary.telegram} telegram</span>
              <span className={styles.signalPill}>{summary.web} web</span>
            </div>
          </div>
        </section>

        {isSessionLoading || bootLoading ? <DownloadsPageSkeleton /> : null}

        {!isSessionLoading && !user?.id ? (
          <section className={styles.group}>
            <div className={styles.groupHeading}>
              <h2>Войти в библиотеку</h2>
              <p>Для доступа к купленным файлам нужен аккаунт C3K.</p>
            </div>
            <TelegramLoginWidget onAuthorized={() => void refreshSession()} />
          </section>
        ) : null}

        {error ? <div className={styles.noticeError}>{error}</div> : null}
        {message ? <div className={styles.noticeSuccess}>{message}</div> : null}

        {user?.id && !bootLoading ? (
          <>
            <section className={styles.filters}>
              <SegmentedTabs
                activeIndex={Math.max(
                  0,
                  filterItems.findIndex((entry) => entry.id === activeFilter),
                )}
                items={filterItems}
                onChange={(index) => setActiveFilter(filterItems[index]?.id ?? "all")}
                ariaLabel="Фильтры выдачи файлов"
              />
            </section>

            {filteredRequests.length > 0 ? (
              <section className={styles.list}>
                <div className={styles.groupTopline}>
                  <div className={styles.groupHeading}>
                    <h2>Post-purchase выдача</h2>
                    <p>
                      Для каждого файла видно, готов ли он уже к открытию, через какой
                      route был доставлен и нужен ли ещё retry.
                    </p>
                  </div>
                  <span className={styles.heroChip}>
                    {filteredRequests.length} {filteredRequests.length === 1 ? "запрос" : "запросов"}
                  </span>
                </div>
                {filteredRequests.map((request) => {
                  const release = releaseBySlug.get(request.releaseSlug) ?? null;
                  const routeLabel = request.lastDeliveredVia ? formatDeliveryVia(request.lastDeliveredVia) : null;
                  const hasRuntimeRoute = isRuntimeBackedRequest(request);
                  const routeSummary = routeLabel
                    ? `Маршрут: ${routeLabel}`
                    : request.storagePointer
                      ? "Маршрут: storage pointer уже подготовлен"
                      : "Маршрут: delivery ещё собирается";

                  return (
                    <article key={request.id} className={styles.card}>
                      <div className={styles.cardShell}>
                        <div className={styles.cardMediaWrap}>
                          {release?.image ? (
                            <Image
                              src={release.image}
                              alt={release.title}
                              width={120}
                              height={120}
                              className={styles.cardMedia}
                            />
                          ) : (
                            <div className={styles.cardMediaFallback}>
                              <span>{request.targetType === "track" ? "TRACK" : "RELEASE"}</span>
                            </div>
                          )}
                        </div>

                        <div className={styles.cardContent}>
                          <div className={styles.cardEyebrow}>
                            <span>{release?.artistName || "C3K release"}</span>
                            <span>{request.channel === "desktop_download" ? "Node handoff" : "Digital delivery"}</span>
                          </div>

                          <div className={styles.cardTopline}>
                            <div className={styles.cardHeading}>
                              <strong>{release?.title || request.releaseSlug}</strong>
                              <span>{formatRequestTarget(request, release)}</span>
                            </div>
                            <span
                              className={`${styles.statusPill} ${toneClassName(styles, getDeliveryTone(request.status))}`}
                            >
                              {formatDeliveryStatus(request.status)}
                            </span>
                          </div>

                          <div className={styles.cardPills}>
                            <span className={styles.metaPill}>{formatDeliveryChannel(request.channel)}</span>
                            <span className={styles.metaPill}>
                              {request.resolvedFormat || request.requestedFormat || "Формат уточняется"}
                            </span>
                            <span className={styles.metaPill}>{request.fileName || "Файл готовится"}</span>
                            {release?.storageSummary ? (
                              <span className={styles.metaPill}>{release.storageSummary.label}</span>
                            ) : null}
                            {hasRuntimeRoute ? (
                              <span className={`${styles.metaPill} ${styles.metaPillRuntime}`}>Storage runtime</span>
                            ) : null}
                          </div>

                          <div className={styles.cardMeta}>
                            <span>{new Date(request.updatedAt || request.createdAt).toLocaleString("ru-RU")}</span>
                            <span>{routeSummary}</span>
                            {request.storagePointer ? <span>Storage pointer готов</span> : null}
                            {request.deliveryUrl ? <span>Есть прямая выдача</span> : null}
                          </div>

                          <div className={styles.cardNarrative}>
                            <strong>{formatRequestHint(request)}</strong>
                            <span>
                              {hasRuntimeRoute
                                ? "Эта выдача уже использовала storage runtime contour."
                                : request.storagePointer
                                  ? "Pointer уже есть, но финальный route ещё может идти через fallback."
                                  : "Если route ещё не готов, worker продолжит обработку автоматически."}
                            </span>
                            <span>{formatStorageReleaseHint(release)}</span>
                          </div>

                          {request.failureMessage ? (
                            <p className={styles.cardMessage}>{request.failureMessage}</p>
                          ) : null}

                          <div className={styles.cardActions}>
                            {isReadyRequest(request) &&
                            (request.channel === "desktop_download"
                              ? Boolean(request.storagePointer)
                              : Boolean(request.deliveryUrl || request.storagePointer)) ? (
                              <button
                                type="button"
                                className={styles.primaryButton}
                                onClick={() => openDelivery(request)}
                              >
                                {formatActionLabel(request)}
                              </button>
                            ) : null}
                            {(request.status === "failed" ||
                              request.status === "pending_asset_mapping") ? (
                              <button
                                type="button"
                                className={styles.secondaryButton}
                                onClick={() => void retryRequest(request)}
                                disabled={retryingRequestId === request.id}
                              >
                                {retryingRequestId === request.id ? "Повторяем..." : "Повторить"}
                              </button>
                            ) : null}
                            {release ? (
                              <Link href={`/shop/${release.slug}`} className={styles.secondaryLink}>
                                К релизу
                              </Link>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </section>
            ) : (
              <section className={styles.group}>
                <div className={styles.emptyState}>
                  История выдач пока пустая. После покупки релиза или трека здесь
                  появятся готовые файлы и запросы на доставку.
                </div>
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
