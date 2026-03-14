"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { fetchMyArtistProfile } from "@/lib/admin-api";
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
import type { ProfileMode } from "@/types/social";

import styles from "./page.module.scss";

const formatShortTonAddress = (value: string | undefined): string => {
  const normalized = String(value ?? "").trim();

  if (normalized.length <= 14) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
};

export default function ProfileEditPage() {
  const tonWallet = useTonWallet();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const fullName = useMemo(() => resolveViewerName(user), [user]);

  const [mode, setMode] = useState<ProfileMode>("listener");
  const [walletCents, setWalletCents] = useState(0);
  const [purchasesVisible, setPurchasesVisible] = useState(true);
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [canEnableArtistMode, setCanEnableArtistMode] = useState(false);

  const [profileSaving, setProfileSaving] = useState(false);
  const [modeSaving, setModeSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [warning, setWarning] = useState("");
  const resolvedTonWalletAddress = useMemo(
    () => String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
    [tonWallet?.account?.address, tonWalletAddress],
  );

  const [userDraft, setUserDraft] = useState<UserProfileEditorPayload>(() => ({
    displayName: fullName,
    username: user?.username || "",
    avatarUrl: user?.photo_url || "",
    coverUrl: "",
    bio: "",
  }));

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
        connectedTonWalletAddress,
        artistResult,
      ] = await Promise.all([
        fetchMyUserProfile(),
        readProfileMode(viewerKey),
        readWalletBalanceCents(viewerKey),
        readPurchasesVisibility(viewerKey),
        readTonWalletAddress(viewerKey),
        fetchMyArtistProfile(),
      ]);

      if (!mounted) {
        return;
      }

      setMode(savedMode);
      setWalletCents(balance);
      setPurchasesVisible(visibility);
      setTonWalletAddress(connectedTonWalletAddress);
      setCanEnableArtistMode(Boolean(artistResult.profile));

      if (profileResult.profile) {
        setUserDraft({
          displayName: profileResult.profile.displayName || fullName,
          username: profileResult.profile.username || user.username || "",
          avatarUrl: profileResult.profile.avatarUrl || user.photo_url || "",
          coverUrl: profileResult.profile.coverUrl || "",
          bio: profileResult.profile.bio || "",
        });
      } else {
        setUserDraft({
          displayName: fullName,
          username: user.username || "",
          avatarUrl: user.photo_url || "",
          coverUrl: "",
          bio: "",
        });
      }
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

  const submitUserProfile = async () => {
    if (!user?.id) {
      setWarning("Для редактирования профиля требуется вход через Telegram.");
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
    setMessage("");
    setWarning("");

    const result = await updateMyUserProfile(payload);
    setProfileSaving(false);

    if (result.error || !result.profile) {
      setWarning(result.error ?? "Не удалось сохранить профиль.");
      return;
    }

    setUserDraft({
      displayName: result.profile.displayName,
      username: result.profile.username || "",
      avatarUrl: result.profile.avatarUrl || "",
      coverUrl: result.profile.coverUrl || "",
      bio: result.profile.bio || "",
    });
    setMessage("Изменения сохранены.");
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
      setWarning("Войдите через Telegram, чтобы менять настройки профиля.");
      return;
    }

    if (nextEnabled && !canEnableArtistMode) {
      setWarning(
        "Чтобы включить режим артиста, сначала подайте заявку команде Culture3k.",
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

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.topBar}>
          <Link href="/profile" className={styles.backLink}>
            Назад
          </Link>
          <div>
            <h1>Редактирование профиля</h1>
            <p>Настройки профиля, приватности и режима артиста.</p>
          </div>
        </header>

        {!user?.id && !isSessionLoading ? (
          <section className={styles.section}>
            <h2>Вход через Telegram</h2>
            <TelegramLoginWidget
              onAuthorized={() => {
                void refreshSession();
              }}
            />
            <p className={styles.hint}>
              После входа откроются настройки профиля и кошелька.
            </p>
          </section>
        ) : null}

        {user?.id ? (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Основное</h2>
                <p>{message || "Публичные данные профиля"}</p>
              </div>

              <div className={styles.fieldGrid}>
                <label className={styles.field}>
                  <span>Отображаемое имя</span>
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
                <label className={styles.field}>
                  <span>Ссылка на аватар</span>
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
                  <span>Ссылка на обложку</span>
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

              <div className={styles.actions}>
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

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Коллекция</h2>
                <p>Видимость в публичном профиле</p>
              </div>

              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <strong>Показывать коллекцию публично</strong>
                  <small>
                    {purchasesVisible
                      ? "Сейчас покупки видны в публичном профиле."
                      : "Сейчас покупки видны только вам."}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={purchasesVisible}
                  onChange={() => void handleTogglePurchasesVisibility()}
                />
              </label>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Режим артиста</h2>
                <p>
                  {mode === "artist" ? "Студия включена" : "Студия выключена"}
                </p>
              </div>

              <label className={styles.toggleRow}>
                <span className={styles.toggleCopy}>
                  <strong>Показывать вкладку «Студия»</strong>
                  <small>
                    {canEnableArtistMode
                      ? "Если вы уже подтверждённый артист, вкладку можно включать и выключать."
                      : "Чтобы включить режим артиста, сначала подайте заявку команде Culture3k."}
                  </small>
                </span>
                <input
                  type="checkbox"
                  checked={mode === "artist"}
                  disabled={
                    modeSaving || (!canEnableArtistMode && mode !== "artist")
                  }
                  onChange={(event) =>
                    void handleArtistModeChange(event.target.checked)
                  }
                />
              </label>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <h2>Баланс и кошелёк</h2>
                <p>{formatStarsFromCents(walletCents)} ⭐</p>
              </div>

              <div className={styles.walletRow}>
                <div>
                  <strong>{formatStarsFromCents(walletCents)} ⭐</strong>
                  <small>
                    {resolvedTonWalletAddress
                      ? `TON: ${formatShortTonAddress(resolvedTonWalletAddress)}`
                      : "TON-кошелёк не подключен"}
                  </small>
                </div>

                <div className={styles.walletActions}>
                  <Link href="/balance" className={styles.secondaryLink}>
                    Пополнить
                  </Link>
                  <TonConnectButton className={styles.tonConnectButton} />
                </div>
              </div>
            </section>
          </>
        ) : null}

        {warning ? <p className={styles.warning}>{warning}</p> : null}
        {isSessionLoading ? (
          <p className={styles.hint}>Загружаем настройки...</p>
        ) : null}
      </main>
    </div>
  );
}
