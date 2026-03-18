"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { BackButtonController } from "@/components/back-button-controller";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  fetchStorageProgramSnapshot,
  joinMyStorageProgram,
} from "@/lib/admin-api";
import { fetchMyStorageDeliveryRequests } from "@/lib/storage-delivery-api";
import type { StorageDeliveryRequest } from "@/types/storage";

import styles from "./page.module.scss";

const formatTier = (value: string | undefined): string => {
  switch (value) {
    case "keeper":
      return "Keeper";
    case "core":
      return "Core";
    case "guardian":
      return "Guardian";
    default:
      return "Supporter";
  }
};

const formatStatus = (value: string | undefined): string => {
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
    return request.trackId ? `Трек: ${request.trackId}` : "Трек";
  }

  return "Полный релиз";
};

export default function StorageProgramPage() {
  const router = useRouter();
  const tonWallet = useTonWallet();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [note, setNote] = useState("");
  const [joining, setJoining] = useState(false);
  const [deliveryHistory, setDeliveryHistory] = useState<StorageDeliveryRequest[]>([]);
  const [snapshot, setSnapshot] = useState<Awaited<
    ReturnType<typeof fetchStorageProgramSnapshot>
  >["snapshot"]>(null);

  const connectedWalletAddress = useMemo(
    () => String(tonWallet?.account?.address ?? "").trim(),
    [tonWallet?.account?.address],
  );

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
    if (!request.deliveryUrl) {
      return;
    }

    window.open(request.deliveryUrl, "_blank", "noopener,noreferrer");
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
            <span className={styles.heroChip}>C3K Storage</span>
          </div>
          <div className={styles.heroMain}>
            <div className={styles.identityCard}>
              <div className={styles.identityMeta}>
                <h1>Программа хранения и раздачи</h1>
                <strong>C3K Storage</strong>
                <span>
                  Участники программы помогают хранить bags, раздавать релизы и
                  получают статус внутри экосистемы.
                </span>
              </div>
            </div>

            <div className={styles.balanceCard}>
              <span className={styles.balanceCardLabel}>Desktop stack</span>
              <strong className={styles.balanceCardValue}>Electron + TON</strong>
              <small className={styles.balanceCardHint}>
                Desktop-клиент совмещает node, gateway для <code>c3k.ton</code> и
                storage runtime.
              </small>
            </div>
          </div>
        </section>

        {isSessionLoading || loading ? (
          <section className={styles.group}>
            <div className={styles.loadingState}>Загружаем статус программы...</div>
          </section>
        ) : null}

        {!isSessionLoading && !user?.id ? (
          <section className={styles.group}>
            <div className={styles.groupHeading}>
              <h2>Вход в программу</h2>
              <p>Для участия нужен аккаунт C3K и Telegram-авторизация.</p>
            </div>
            <TelegramLoginWidget onAuthorized={() => void refreshSession()} />
          </section>
        ) : null}

        {error ? <div className={styles.noticeError}>{error}</div> : null}
        {message ? <div className={styles.noticeSuccess}>{message}</div> : null}

        {user?.id ? (
          <>
            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Статус участия</h2>
                <p>Текущее состояние программы C3K Storage для вашего аккаунта.</p>
              </div>

              <div className={styles.statsGrid}>
                <article className={styles.metricCard}>
                  <span>Программа</span>
                  <strong>{snapshot?.enabled ? "Включена" : "Выключена"}</strong>
                </article>
                <article className={styles.metricCard}>
                  <span>Desktop client</span>
                  <strong>
                    {snapshot?.desktopClientEnabled ? "Доступен" : "Ещё не открыт"}
                  </strong>
                </article>
                <article className={styles.metricCard}>
                  <span>TON Site gateway</span>
                  <strong>
                    {snapshot?.tonSiteDesktopGatewayEnabled
                      ? "Запланирован"
                      : "Не включён"}
                  </strong>
                </article>
                <article className={styles.metricCard}>
                  <span>Ваши ноды</span>
                  <strong>{snapshot?.nodeCount ?? 0}</strong>
                </article>
              </div>

              {snapshot?.membership ? (
                <div className={styles.membershipCard}>
                  <div className={styles.infoRow}>
                    <span>Статус</span>
                    <strong>{formatStatus(snapshot.membership.status)}</strong>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Tier</span>
                    <strong>{formatTier(snapshot.membership.tier)}</strong>
                  </div>
                  <div className={styles.infoRow}>
                    <span>Кошелёк</span>
                    <strong>
                      {snapshot.membership.walletAddress || "Пока не указан"}
                    </strong>
                  </div>
                  {snapshot.membership.moderationNote ? (
                    <div className={styles.noticeError}>
                      {snapshot.membership.moderationNote}
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  Вы ещё не вступили в программу. Ниже можно подать заявку на участие.
                </div>
              )}
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Подать заявку</h2>
                <p>
                  На первом этапе программа запускается постепенно. Укажите TON-кошелёк
                  и кратко опишите, зачем вы хотите участвовать.
                </p>
              </div>

              <div className={styles.formGrid}>
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
                  <span>Заметка к заявке</span>
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    placeholder="Например: готов выделить 50 GB и хочу участвовать в C3K Storage beta."
                  />
                </label>
              </div>

              <div className={styles.panelActions}>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void handleJoin()}
                  disabled={joining}
                >
                  {joining ? "Отправляем..." : "Подать заявку"}
                </button>
                <Link href="/profile/edit" className={styles.secondaryLink}>
                  Вернуться в настройки
                </Link>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Что входит в программу</h2>
                <p>
                  Это не просто storage node, а единый desktop-клиент для C3K
                  ecosystem.
                </p>
              </div>

              <div className={styles.featureList}>
                <article className={styles.featureCard}>
                  <strong>Storage Node</strong>
                  <span>Хранение и раздача bags с релизами и архивами.</span>
                </article>
                <article className={styles.featureCard}>
                  <strong>c3k.ton gateway</strong>
                  <span>Локальное открытие TON Site через ваш C3K desktop client.</span>
                </article>
                <article className={styles.featureCard}>
                  <strong>Collector status</strong>
                  <span>Badge, tier и доступ к special drops и будущим perks.</span>
                </article>
              </div>
            </section>

            <section className={styles.group}>
              <div className={styles.groupHeading}>
                <h2>Последние выдачи</h2>
                <p>
                  Здесь видны ваши последние запросы на скачивание и отправку
                  файлов через C3K Storage.
                </p>
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
                        <span>{request.channel}</span>
                        <span>{request.resolvedFormat || request.requestedFormat || "no format"}</span>
                      </div>
                      {request.failureMessage ? (
                        <p className={styles.deliveryMessage}>{request.failureMessage}</p>
                      ) : null}
                      {request.status === "ready" && request.deliveryUrl ? (
                        <div className={styles.panelActions}>
                          <button
                            type="button"
                            className={styles.primaryButton}
                            onClick={() => openDelivery(request)}
                          >
                            Открыть файл
                          </button>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>
                  История выдач пока пустая. После покупки релиза или трека здесь
                  появятся download и Telegram delivery requests.
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
