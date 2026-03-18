"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { BackButtonController } from "@/components/back-button-controller";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { StarsIcon } from "@/components/stars-icon";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { fetchMyArtistProfile, submitMyArtistApplication } from "@/lib/admin-api";
import {
  APP_LOCALE_OPTIONS,
  applyAppLocale,
  readLocalePreference,
  resolveAutoLocale,
  saveLocalePreference,
  type AppLocale,
} from "@/lib/app-locale";
import {
  applyAppTheme,
  readThemePreference,
  resolveAutoTheme,
  saveThemePreference,
  type AppTheme,
} from "@/lib/app-theme";
import { SHOP_ORDER_STATUS_LABELS } from "@/lib/shop-order-status";
import { fetchMyShopOrders } from "@/lib/shop-orders-api";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  fetchMyUserProfile,
  readProfileMode,
  readPurchasesVisibility,
  readTonWalletAddress,
  readWalletBalanceCents,
  resolveViewerKey,
  resolveViewerName,
  updateMyUserProfile,
  writeProfileMode,
  writePurchasesVisibility,
  writeTonWalletAddress,
  type UserProfileEditorPayload,
} from "@/lib/social-hub";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ArtistApplication, ShopOrder } from "@/types/shop";
import type { ProfileMode } from "@/types/social";

import styles from "./page.module.scss";

type SettingsTab = "profile" | "personal" | "history" | "access";

const formatShortTonAddress = (value: string | undefined): string => {
  const normalized = String(value ?? "").trim();

  if (normalized.length <= 14) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
};

const formatOrderDate = (value: string): string => {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "Без даты";
  }

  return new Date(timestamp).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
};

const formatOrderTime = (value: string): string => {
  const timestamp = new Date(value).getTime();

  if (!Number.isFinite(timestamp)) {
    return "";
  }

  return new Date(timestamp).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

export default function ProfileEditPage() {
  const router = useRouter();
  const tonWallet = useTonWallet();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const fullName = useMemo(() => resolveViewerName(user), [user]);

  const [currentTab, setCurrentTab] = useState<SettingsTab>("profile");
  const [mode, setMode] = useState<ProfileMode>("listener");
  const [walletCents, setWalletCents] = useState(0);
  const [purchasesVisible, setPurchasesVisible] = useState(true);
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [canEnableArtistMode, setCanEnableArtistMode] = useState(false);
  const [artistApplication, setArtistApplication] = useState<ArtistApplication | null>(null);
  const [artistProfileName, setArtistProfileName] = useState("");
  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [themePreference, setThemePreference] = useState<AppTheme>("light");
  const [localePreference, setLocalePreference] = useState<AppLocale>("ru");

  const [profileSaving, setProfileSaving] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [applicationSaving, setApplicationSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const [userDraft, setUserDraft] = useState<UserProfileEditorPayload>(() => ({
    displayName: fullName,
    username: user?.username || "",
    avatarUrl: user?.photo_url || "",
    coverUrl: "",
    bio: "",
  }));
  const [applicationDraft, setApplicationDraft] = useState(() => ({
    displayName: fullName,
    bio: "",
    avatarUrl: user?.photo_url || "",
    coverUrl: "",
    tonWalletAddress: "",
    note: "",
  }));

  const resolvedTonWalletAddress = useMemo(
    () => String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
    [tonWallet?.account?.address, tonWalletAddress],
  );
  const previewName = userDraft.displayName?.trim() || fullName || "Профиль";
  const previewUsername = (userDraft.username || user?.username || "").trim();

  useEffect(() => {
    if (!user?.id) {
      return;
    }

    let mounted = true;

    void (async () => {
      const [
        profileResult,
        savedMode,
        balance,
        visibility,
        persistedTonWalletAddress,
        artistResult,
        ordersResult,
      ] = await Promise.all([
        fetchMyUserProfile(),
        readProfileMode(viewerKey),
        readWalletBalanceCents(viewerKey),
        readPurchasesVisibility(viewerKey),
        readTonWalletAddress(viewerKey),
        fetchMyArtistProfile(),
        fetchMyShopOrders(),
      ]);

      if (!mounted) {
        return;
      }

      setMode(savedMode);
      setWalletCents(balance);
      setPurchasesVisible(visibility);
      setTonWalletAddress(persistedTonWalletAddress);
      setArtistApplication(artistResult.application);
      setCanEnableArtistMode(artistResult.profile?.status === "approved");
      setArtistProfileName(artistResult.profile?.displayName ?? "");
      setOrders(ordersResult.orders ?? []);
      setOrdersLoading(false);
      setApplicationDraft({
        displayName:
          artistResult.application?.displayName ||
          artistResult.profile?.displayName ||
          fullName,
        bio: artistResult.application?.bio || artistResult.profile?.bio || "",
        avatarUrl:
          artistResult.application?.avatarUrl ||
          artistResult.profile?.avatarUrl ||
          user.photo_url ||
          "",
        coverUrl:
          artistResult.application?.coverUrl ||
          artistResult.profile?.coverUrl ||
          "",
        tonWalletAddress:
          artistResult.application?.tonWalletAddress ||
          artistResult.profile?.tonWalletAddress ||
          persistedTonWalletAddress,
        note: artistResult.application?.note || "",
      });

      if (profileResult.profile) {
        setUserDraft({
          displayName: profileResult.profile.displayName || fullName,
          username: profileResult.profile.username || user.username || "",
          avatarUrl: profileResult.profile.avatarUrl || user.photo_url || "",
          coverUrl: profileResult.profile.coverUrl || "",
          bio: profileResult.profile.bio || "",
        });
        return;
      }

      setUserDraft({
        displayName: fullName,
        username: user.username || "",
        avatarUrl: user.photo_url || "",
        coverUrl: "",
        bio: "",
      });
    })();

    return () => {
      mounted = false;
    };
  }, [fullName, user?.id, user?.photo_url, user?.username, viewerKey]);

  useEffect(() => {
    const connectedAddress = String(tonWallet?.account?.address ?? "").trim();

    if (!connectedAddress || connectedAddress === tonWalletAddress) {
      return;
    }

    void writeTonWalletAddress(viewerKey, connectedAddress);
  }, [tonWallet?.account?.address, tonWalletAddress, viewerKey]);

  useEffect(() => {
    let mounted = true;

    void readThemePreference().then((savedTheme) => {
      if (!mounted) {
        return;
      }

      setThemePreference(savedTheme ?? resolveAutoTheme());
    });

    void readLocalePreference().then((savedLocale) => {
      if (!mounted) {
        return;
      }

      setLocalePreference(savedLocale ?? resolveAutoLocale());
    });

    return () => {
      mounted = false;
    };
  }, []);

  const settingsTabs = useMemo(
    () => [
      { id: "profile", label: "Профиль" },
      { id: "personal", label: "Данные" },
      { id: "history", label: "История", badge: orders.length },
      { id: "access", label: "Доступ" },
    ],
    [orders.length],
  );

  const activeTabIndex = Math.max(
    0,
    settingsTabs.findIndex((tab) => tab.id === currentTab),
  );

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/profile");
  };

  const submitUserProfile = async () => {
    if (!user?.id) {
      setWarning("Для настройки профиля требуется вход через Telegram.");
      return;
    }

    const payload: UserProfileEditorPayload = {
      displayName: userDraft.displayName?.trim(),
      username: userDraft.username?.trim() || undefined,
      avatarUrl: userDraft.avatarUrl?.trim() || undefined,
      coverUrl: userDraft.coverUrl?.trim() || undefined,
      bio: userDraft.bio?.trim() || undefined,
    };

    if (!payload.displayName) {
      setWarning("Имя профиля не может быть пустым.");
      return;
    }

    setProfileSaving(true);
    setWarning("");
    setMessage("");

    const result = await updateMyUserProfile(payload);
    setProfileSaving(false);

    if (result.error || !result.profile) {
      setWarning(result.error ?? "Не удалось сохранить изменения.");
      return;
    }

    setUserDraft({
      displayName: result.profile.displayName,
      username: result.profile.username || "",
      avatarUrl: result.profile.avatarUrl || "",
      coverUrl: result.profile.coverUrl || "",
      bio: result.profile.bio || "",
    });
    setMessage("Настройки профиля сохранены.");
  };

  const handleTogglePurchasesVisibility = async () => {
    if (!user?.id) {
      return;
    }

    const next = await writePurchasesVisibility(viewerKey, !purchasesVisible);
    setPurchasesVisible(next);
  };

  const handleArtistModeChange = async (nextEnabled: boolean) => {
    if (!user?.id) {
      setWarning("Войдите через Telegram, чтобы менять режим профиля.");
      return;
    }

    if (nextEnabled && !canEnableArtistMode) {
      setWarning(
        "Чтобы включить режим артиста, сначала нужно получить подтверждение команды Culture3k.",
      );
      return;
    }

    setModeSaving(true);
    setWarning("");
    const nextMode: ProfileMode = nextEnabled ? "artist" : "listener";
    const savedMode = await writeProfileMode(viewerKey, nextMode);
    setMode(savedMode);
    setModeSaving(false);
  };

  const handleSubmitArtistApplication = async () => {
    if (!user?.id) {
      setWarning("Войдите через Telegram, чтобы подать заявку на артиста.");
      return;
    }

    if (!applicationDraft.displayName.trim()) {
      setWarning("Укажите имя артиста для заявки.");
      return;
    }

    if (!applicationDraft.tonWalletAddress.trim()) {
      setWarning("Укажите TON-кошелёк для будущих выплат.");
      return;
    }

    setApplicationSaving(true);
    setWarning("");
    setMessage("");

    const result = await submitMyArtistApplication({
      displayName: applicationDraft.displayName.trim(),
      bio: applicationDraft.bio.trim() || undefined,
      avatarUrl: applicationDraft.avatarUrl.trim() || undefined,
      coverUrl: applicationDraft.coverUrl.trim() || undefined,
      tonWalletAddress: applicationDraft.tonWalletAddress.trim(),
      note: applicationDraft.note.trim() || undefined,
    });

    setApplicationSaving(false);

    if (result.error || !result.application) {
      setWarning(result.error ?? "Не удалось отправить заявку.");
      return;
    }

    setArtistApplication(result.application);
    setMessage("Заявка на артиста отправлена в модерацию.");
  };

  const handleThemeChange = async (theme: AppTheme) => {
    setThemePreference(theme);
    applyAppTheme(theme);
    await saveThemePreference(theme);
    setMessage("Тема интерфейса обновлена.");
  };

  const handleLocaleChange = async (locale: AppLocale) => {
    setLocalePreference(locale);
    applyAppLocale(locale);
    await saveLocalePreference(locale);
    setMessage("Язык интерфейса сохранён. Переводы можно расширять без изменения модели настроек.");
  };

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <main className={styles.container}>
        <header className={styles.hero}>
          <div className={styles.heroTop}>
            <button
              type="button"
              className={styles.backButton}
              onClick={handleBack}
            >
              Профиль
            </button>
            <span className={styles.heroChip}>Настройки</span>
          </div>

          <div className={styles.heroMain}>
            <div className={styles.identityCard}>
              <div className={styles.avatarWrap}>
                {userDraft.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={userDraft.avatarUrl}
                    alt={previewName}
                    className={styles.avatarImage}
                  />
                ) : (
                  <div className={styles.avatarFallback}>
                    {previewName.slice(0, 2).toUpperCase()}
                  </div>
                )}
              </div>

              <div className={styles.identityMeta}>
                <h1>Настройки</h1>
                <strong>{previewName}</strong>
                <span>
                  {previewUsername ? `@${previewUsername}` : "Имя пользователя не задано"}
                </span>
                <small>
                  Управление профилем, доступом, кошельком и историей операций.
                </small>
              </div>
            </div>

            <div className={styles.balanceCard}>
              <span className={styles.balanceCardLabel}>Баланс</span>
              <strong className={styles.balanceCardValue}>
                <StarsIcon className={styles.balanceCardIcon} />
                {formatStarsFromCents(walletCents)}
              </strong>
              <Link href="/balance" className={styles.balanceCardLink}>
                Пополнить
              </Link>
            </div>
          </div>
        </header>

        {warning ? <div className={styles.noticeError}>{warning}</div> : null}
        {message ? <div className={styles.noticeSuccess}>{message}</div> : null}

        {!user?.id && !isSessionLoading ? (
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <h2>Вход через Telegram</h2>
              <p>После входа откроются все персональные настройки и история.</p>
            </div>

            <TelegramLoginWidget
              onAuthorized={() => {
                void refreshSession();
              }}
            />
          </section>
        ) : null}

        {user?.id ? (
          <>
            <section className={styles.tabsWrap}>
              <SegmentedTabs
                activeIndex={activeTabIndex}
                items={settingsTabs}
                onChange={(index) =>
                  setCurrentTab(settingsTabs[index]?.id as SettingsTab)
                }
                ariaLabel="Разделы настроек"
              />
            </section>

            {currentTab === "profile" ? (
              <section className={styles.panel}>
                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Публичный профиль</h2>
                    <p>То, как вас видят в ленте, профиле и коллекции.</p>
                  </div>

                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      <span>Имя профиля</span>
                      <input
                        value={userDraft.displayName ?? ""}
                        onChange={(event) =>
                          setUserDraft((prev) => ({
                            ...prev,
                            displayName: event.target.value,
                          }))
                        }
                        maxLength={120}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Юзернейм</span>
                      <input
                        value={userDraft.username ?? ""}
                        onChange={(event) =>
                          setUserDraft((prev) => ({
                            ...prev,
                            username: event.target.value,
                          }))
                        }
                        maxLength={64}
                      />
                    </label>

                    <label className={`${styles.field} ${styles.fieldWide}`}>
                      <span>Описание</span>
                      <textarea
                        value={userDraft.bio ?? ""}
                        onChange={(event) =>
                          setUserDraft((prev) => ({
                            ...prev,
                            bio: event.target.value,
                          }))
                        }
                        maxLength={500}
                      />
                    </label>
                  </div>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Оформление</h2>
                    <p>Ссылки на аватар и обложку профиля.</p>
                  </div>

                  <div className={styles.fieldGrid}>
                    <label className={styles.field}>
                      <span>Аватар</span>
                      <input
                        value={userDraft.avatarUrl ?? ""}
                        onChange={(event) =>
                          setUserDraft((prev) => ({
                            ...prev,
                            avatarUrl: event.target.value,
                          }))
                        }
                        maxLength={3000}
                      />
                    </label>

                    <label className={styles.field}>
                      <span>Обложка</span>
                      <input
                        value={userDraft.coverUrl ?? ""}
                        onChange={(event) =>
                          setUserDraft((prev) => ({
                            ...prev,
                            coverUrl: event.target.value,
                          }))
                        }
                        maxLength={3000}
                      />
                    </label>
                  </div>
                </div>

                <div className={styles.panelActions}>
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={() => void submitUserProfile()}
                    disabled={profileSaving}
                  >
                    {profileSaving ? "Сохраняем..." : "Сохранить"}
                  </button>
                  <Link href="/profile" className={styles.secondaryLink}>
                    Вернуться в профиль
                  </Link>
                </div>
              </section>
            ) : null}

            {currentTab === "personal" ? (
              <section className={styles.panel}>
                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Персональные данные</h2>
                    <p>Основная информация о вашем Telegram-аккаунте.</p>
                  </div>

                  <div className={styles.rowList}>
                    <div className={styles.infoRow}>
                      <span>Telegram</span>
                      <strong>{fullName}</strong>
                    </div>
                    <div className={styles.infoRow}>
                      <span>Username</span>
                      <strong>{user.username ? `@${user.username}` : "Не указан"}</strong>
                    </div>
                    <div className={styles.infoRow}>
                      <span>TON-кошелёк</span>
                      <strong>
                        {resolvedTonWalletAddress
                          ? formatShortTonAddress(resolvedTonWalletAddress)
                          : "Не подключён"}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Приватность</h2>
                    <p>Контроль того, что видно в публичном профиле.</p>
                  </div>

                  <label className={styles.toggleRow}>
                    <span className={styles.toggleCopy}>
                      <strong>Показывать коллекцию</strong>
                      <small>
                        {purchasesVisible
                          ? "Покупки и NFT видны в публичном профиле."
                          : "Коллекция скрыта от других пользователей."}
                      </small>
                    </span>
                    <input
                      type="checkbox"
                      checked={purchasesVisible}
                      onChange={() => void handleTogglePurchasesVisibility()}
                    />
                  </label>
                </div>

                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Тема и язык</h2>
                    <p>Локальные настройки интерфейса приложения.</p>
                  </div>

                  <div className={styles.rowList}>
                    <div className={styles.infoRow}>
                      <span>Тема</span>
                      <div className={styles.choiceRow}>
                        <button
                          type="button"
                          className={`${styles.choiceButton} ${themePreference === "light" ? styles.choiceButtonActive : ""}`}
                          onClick={() => void handleThemeChange("light")}
                        >
                          Светлая
                        </button>
                        <button
                          type="button"
                          className={`${styles.choiceButton} ${themePreference === "dark" ? styles.choiceButtonActive : ""}`}
                          onClick={() => void handleThemeChange("dark")}
                        >
                          Тёмная
                        </button>
                      </div>
                    </div>

                    <div className={styles.infoRow}>
                      <span>Язык</span>
                      <div className={styles.choiceRow}>
                        {APP_LOCALE_OPTIONS.map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            className={`${styles.choiceButton} ${localePreference === option.value ? styles.choiceButtonActive : ""}`}
                            onClick={() => void handleLocaleChange(option.value)}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {currentTab === "history" ? (
              <section className={styles.panel}>
                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>История операций</h2>
                    <p>Последние покупки и состояния заказов.</p>
                  </div>

                  {ordersLoading ? (
                    <div className={styles.emptyState}>Загружаем историю...</div>
                  ) : orders.length > 0 ? (
                    <div className={styles.historyList}>
                      {orders.slice(0, 12).map((order) => (
                        <Link
                          key={order.id}
                          href={`/orders/${encodeURIComponent(order.id)}`}
                          className={styles.orderRow}
                        >
                          <div className={styles.orderMeta}>
                            <strong>{order.id}</strong>
                            <span>
                              {formatOrderDate(order.createdAt)}
                              {formatOrderTime(order.createdAt)
                                ? ` · ${formatOrderTime(order.createdAt)}`
                                : ""}
                            </span>
                          </div>
                          <div className={styles.orderSide}>
                            <span className={styles.orderStatus}>
                              {SHOP_ORDER_STATUS_LABELS[order.status] ?? order.status}
                            </span>
                            <strong className={styles.inlineAmount}>
                              <StarsIcon className={styles.inlineAmountIcon} />
                              {formatStarsFromCents(order.totalStarsCents)}
                            </strong>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyState}>
                      Здесь появятся ваши покупки и дальнейшие операции.
                    </div>
                  )}
                </div>
              </section>
            ) : null}

            {currentTab === "access" ? (
              <section className={styles.panel}>
                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Заявка на артиста</h2>
                    <p>Сначала создаётся заявка, после одобрения откроется отдельная студия артиста.</p>
                  </div>

                  <div className={styles.infoRow}>
                    <span>Статус</span>
                    <strong>
                      {canEnableArtistMode
                        ? "Одобрено"
                        : artistApplication?.status === "pending"
                          ? "На модерации"
                          : artistApplication?.status === "needs_info"
                            ? "Нужны уточнения"
                            : artistApplication?.status === "rejected"
                              ? "Отклонено"
                              : "Не подана"}
                    </strong>
                  </div>

                  {artistApplication?.moderationNote ? (
                    <div className={styles.noticeError}>{artistApplication.moderationNote}</div>
                  ) : null}

                  {!canEnableArtistMode ? (
                    <>
                      <div className={styles.fieldGrid}>
                        <label className={styles.field}>
                          <span>Имя артиста</span>
                          <input
                            value={applicationDraft.displayName}
                            onChange={(event) =>
                              setApplicationDraft((current) => ({
                                ...current,
                                displayName: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          <span>TON-кошелёк</span>
                          <input
                            value={applicationDraft.tonWalletAddress}
                            onChange={(event) =>
                              setApplicationDraft((current) => ({
                                ...current,
                                tonWalletAddress: event.target.value,
                              }))
                            }
                            placeholder="EQ..."
                          />
                        </label>

                        <label className={`${styles.field} ${styles.fieldWide}`}>
                          <span>Описание</span>
                          <textarea
                            value={applicationDraft.bio}
                            onChange={(event) =>
                              setApplicationDraft((current) => ({
                                ...current,
                                bio: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          <span>Аватар</span>
                          <input
                            value={applicationDraft.avatarUrl}
                            onChange={(event) =>
                              setApplicationDraft((current) => ({
                                ...current,
                                avatarUrl: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <label className={styles.field}>
                          <span>Обложка</span>
                          <input
                            value={applicationDraft.coverUrl}
                            onChange={(event) =>
                              setApplicationDraft((current) => ({
                                ...current,
                                coverUrl: event.target.value,
                              }))
                            }
                          />
                        </label>

                        <label className={`${styles.field} ${styles.fieldWide}`}>
                          <span>Комментарий к заявке</span>
                          <textarea
                            value={applicationDraft.note}
                            onChange={(event) =>
                              setApplicationDraft((current) => ({
                                ...current,
                                note: event.target.value,
                              }))
                            }
                          />
                        </label>
                      </div>

                      <div className={styles.panelActions}>
                        <button
                          type="button"
                          className={styles.primaryButton}
                          onClick={() => void handleSubmitArtistApplication()}
                          disabled={applicationSaving}
                        >
                          {applicationSaving ? "Отправляем..." : "Подать заявку"}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={styles.infoRow}>
                        <span>Профиль артиста</span>
                        <strong>{artistProfileName || "Подтверждён"}</strong>
                      </div>

                      <label className={styles.toggleRow}>
                        <span className={styles.toggleCopy}>
                          <strong>Показывать вкладку «Студия»</strong>
                          <small>
                            Одобренный артист может включать и выключать studio dashboard в профиле.
                          </small>
                        </span>
                        <input
                          type="checkbox"
                          checked={mode === "artist"}
                          disabled={modeSaving}
                          onChange={(event) =>
                            void handleArtistModeChange(event.target.checked)
                          }
                        />
                      </label>

                      <div className={styles.panelActions}>
                        <Link href="/studio" className={styles.primaryButton}>
                          Перейти в студию
                        </Link>
                      </div>
                    </>
                  )}
                </div>

                <div className={styles.group}>
                  <div className={styles.groupHeading}>
                    <h2>Кошелёк и пополнение</h2>
                    <p>Внутренний баланс и подключение TON-кошелька.</p>
                  </div>

                  <div className={styles.walletCard}>
                    <div className={styles.walletMeta}>
                      <span>Баланс приложения</span>
                      <strong className={styles.inlineAmount}>
                        <StarsIcon className={styles.inlineAmountIcon} />
                        {formatStarsFromCents(walletCents)}
                      </strong>
                      <small>
                        {resolvedTonWalletAddress
                          ? `TON: ${formatShortTonAddress(resolvedTonWalletAddress)}`
                          : "TON-кошелёк пока не подключён"}
                      </small>
                    </div>

                    <div className={styles.walletActions}>
                      <Link href="/balance" className={styles.primaryButton}>
                        Пополнить
                      </Link>
                      <Link href="/storage" className={styles.secondaryLink}>
                        C3K Storage
                      </Link>
                      <TonConnectButton className={styles.tonConnectButton} />
                    </div>
                  </div>
                </div>
              </section>
            ) : null}
          </>
        ) : null}

        {isSessionLoading ? (
          <div className={styles.loadingState}>Загружаем настройки...</div>
        ) : null}
      </main>
    </div>
  );
}
