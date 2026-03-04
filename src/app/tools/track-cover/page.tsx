"use client";

import { useEffect, useMemo, useState } from "react";

import { hapticNotification, hapticSelection } from "@/lib/telegram";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";

import styles from "./page.module.scss";

interface TrackCoverItem {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl: string;
  previewUrl: string;
  trackUrl: string;
  durationSec: number;
  source: "itunes";
}

interface SearchResponse {
  query?: string;
  total?: number;
  source?: string;
  items?: TrackCoverItem[];
  error?: string;
}

interface TelegramProfileAudio {
  id: string;
  fileId: string;
  title: string;
  artist: string;
  durationSec: number;
  fileName: string;
  mimeType: string;
  fileSize: number;
  searchQuery: string;
}

interface ProfileAudiosResponse {
  items?: TelegramProfileAudio[];
  totalCount?: number;
  error?: string;
}

interface SendToChatResponse {
  ok?: boolean;
  coverApplied?: boolean;
  error?: string;
}

const toDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return "—";
  }

  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins}:${String(rest).padStart(2, "0")}`;
};

const sanitizeFileToken = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
};

const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "—";
  }

  if (value < 1024 * 1024) {
    return `${Math.round(value / 1024)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

const downloadMetadata = (item: TrackCoverItem) => {
  const payload = {
    title: item.title,
    artist: item.artist,
    album: item.album || null,
    artworkUrl: item.artworkUrl,
    previewUrl: item.previewUrl || null,
    trackUrl: item.trackUrl || null,
    source: item.source,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const fileName = `${sanitizeFileToken(item.artist)}-${sanitizeFileToken(item.title)}.json`;
  anchor.href = url;
  anchor.download = fileName || "track-metadata.json";
  anchor.click();
  URL.revokeObjectURL(url);
};

export default function TrackCoverPage() {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<TrackCoverItem[]>([]);
  const [profileAudios, setProfileAudios] = useState<TelegramProfileAudio[]>([]);
  const [profileAudiosTotal, setProfileAudiosTotal] = useState(0);
  const [selectedAudioId, setSelectedAudioId] = useState("");
  const [selectedCoverId, setSelectedCoverId] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProfileAudios, setLoadingProfileAudios] = useState(false);
  const [sendingToChat, setSendingToChat] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");
  const [sendStatus, setSendStatus] = useState("");

  const canSearch = query.trim().length >= 2;
  const selectedAudio = useMemo(
    () => profileAudios.find((audio) => audio.id === selectedAudioId) ?? null,
    [profileAudios, selectedAudioId],
  );
  const selectedCover = useMemo(() => items.find((item) => item.id === selectedCoverId) ?? null, [items, selectedCoverId]);

  const summaryText = useMemo(() => {
    if (loading) {
      return "Ищем варианты обложек...";
    }

    if (error) {
      return error;
    }

    if (items.length === 0) {
      return "Выберите трек из профиля или выполните поиск вручную.";
    }

    return `Найдено ${items.length} вариантов обложек`;
  }, [error, items.length, loading]);

  const runSearch = async (inputQuery: string, autoSelectFirst = true) => {
    const normalizedQuery = inputQuery.trim();

    if (normalizedQuery.length < 2 || loading) {
      return;
    }

    setLoading(true);
    setError("");
    setSendStatus("");
    hapticSelection();

    try {
      const response = await fetch(`/api/tools/track-cover/search?q=${encodeURIComponent(normalizedQuery)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        setItems([]);
        setSelectedCoverId("");
        setError(payload.error ?? "Ошибка поиска.");
        hapticNotification("error");
        return;
      }

      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setItems(nextItems);

      if (!selectedCoverId || autoSelectFirst) {
        setSelectedCoverId(nextItems[0]?.id ?? "");
      }
    } catch {
      setItems([]);
      setSelectedCoverId("");
      setError("Сеть недоступна. Повторите запрос.");
      hapticNotification("error");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    await runSearch(query, true);
  };

  const loadProfileAudios = async (silent = false) => {
    if (loadingProfileAudios) {
      return;
    }

    setLoadingProfileAudios(true);
    setProfileError("");

    try {
      const response = await fetch("/api/tools/track-cover/profile-audios?limit=50", {
        cache: "no-store",
        headers: getTelegramAuthHeaders(),
      });
      const payload = (await response.json()) as ProfileAudiosResponse;

      if (!response.ok) {
        setProfileAudios([]);
        setProfileAudiosTotal(0);
        setProfileError(payload.error ?? "Не удалось загрузить аудио из Telegram профиля.");
        if (!silent) {
          hapticNotification("error");
        }
        return;
      }

      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setProfileAudios(nextItems);
      setProfileAudiosTotal(Number(payload.totalCount ?? nextItems.length));

      const preferredAudio = nextItems[0];

      if (!preferredAudio) {
        return;
      }

      setSelectedAudioId((prev) => prev || preferredAudio.id);
      setQuery((prev) => prev || preferredAudio.searchQuery);

      if (!items.length) {
        void runSearch(preferredAudio.searchQuery, true);
      }
    } catch {
      setProfileAudios([]);
      setProfileAudiosTotal(0);
      setProfileError("Сетевая ошибка загрузки аудио профиля.");
      if (!silent) {
        hapticNotification("error");
      }
    } finally {
      setLoadingProfileAudios(false);
    }
  };

  useEffect(() => {
    void loadProfileAudios(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSelectAudio = (audio: TelegramProfileAudio) => {
    hapticSelection();
    setSelectedAudioId(audio.id);
    setQuery(audio.searchQuery);
    setSendStatus("");
    void runSearch(audio.searchQuery, true);
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      hapticSelection();
    } catch {
      // noop
    }
  };

  const sendTrackToChat = async () => {
    if (!selectedAudio || !selectedCover || sendingToChat) {
      return;
    }

    setSendingToChat(true);
    setSendStatus("");

    try {
      const response = await fetch("/api/tools/track-cover/send-to-chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({
          audioFileId: selectedAudio.fileId,
          title: selectedAudio.title || selectedCover.title,
          artist: selectedAudio.artist || selectedCover.artist,
          coverUrl: selectedCover.artworkUrl,
          query: selectedAudio.searchQuery,
        }),
      });
      const payload = (await response.json()) as SendToChatResponse;

      if (!response.ok || !payload.ok) {
        setSendStatus(payload.error ?? "Не удалось отправить файл в чат.");
        hapticNotification("error");
        return;
      }

      if (payload.coverApplied) {
        setSendStatus("Трек отправлен в чат с примененной обложкой. Добавьте его в профиль вручную.");
      } else {
        setSendStatus(
          "Трек отправлен, но Telegram не применил обложку к файлу. Обложка отправлена отдельным сообщением в чат.",
        );
      }
      hapticNotification("success");
    } catch {
      setSendStatus("Сетевая ошибка отправки в чат.");
      hapticNotification("error");
    } finally {
      setSendingToChat(false);
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>Track Cover Finder</h1>
        <p>Автоматически забирает ваши Profile Audio из Telegram, ищет обложки и отправляет готовый трек в чат.</p>
      </section>

      <section className={styles.profileAudios}>
        <div className={styles.profileHeader}>
          <div>
            <h2>Треки профиля Telegram</h2>
            <p>Загрузка происходит автоматически при открытии экрана</p>
          </div>
          <button type="button" onClick={() => void loadProfileAudios(false)} disabled={loadingProfileAudios}>
            {loadingProfileAudios ? "Обновляем..." : "Обновить"}
          </button>
        </div>

        {profileError ? <p className={styles.profileError}>{profileError}</p> : null}

        {profileAudios.length > 0 ? (
          <>
            <p className={styles.profileCount}>Доступно треков: {profileAudiosTotal}</p>
            <div className={styles.profileList}>
              {profileAudios.map((audio) => {
                const isActive = audio.id === selectedAudioId;

                return (
                  <button
                    key={audio.id}
                    type="button"
                    className={`${styles.profileCard} ${isActive ? styles.profileCardActive : ""}`}
                    onClick={() => handleSelectAudio(audio)}
                  >
                    <h3>{audio.title || "Без названия"}</h3>
                    <p>{audio.artist || "Неизвестный артист"}</p>
                    <small>
                      {toDuration(audio.durationSec)} · {formatBytes(audio.fileSize)}
                    </small>
                    <span>{isActive ? "Выбрано" : "Выбрать"}</span>
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className={styles.profileHint}>Треки профиля не найдены.</p>
        )}
      </section>

      <section className={styles.search}>
        <label htmlFor="track-query">Ручной поиск обложек</label>
        <div className={styles.searchRow}>
          <input
            id="track-query"
            type="search"
            placeholder="Например: The Weeknd Blinding Lights"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                void handleSearch();
              }
            }}
          />
          <button type="button" onClick={() => void handleSearch()} disabled={!canSearch || loading}>
            Искать
          </button>
        </div>
        <p className={styles.summary}>{summaryText}</p>
      </section>

      <section className={styles.list}>
        {items.map((item) => {
          const isSelected = selectedCoverId === item.id;

          return (
            <article key={item.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`}>
              <img src={item.artworkUrl} alt={`${item.title} cover`} loading="lazy" />
              <div className={styles.meta}>
                <h2>{item.title}</h2>
                <p>{item.artist}</p>
                <dl>
                  <div>
                    <dt>Альбом</dt>
                    <dd>{item.album || "—"}</dd>
                  </div>
                  <div>
                    <dt>Длительность</dt>
                    <dd>{toDuration(item.durationSec)}</dd>
                  </div>
                  <div>
                    <dt>Источник</dt>
                    <dd>iTunes Search API</dd>
                  </div>
                </dl>
                {item.previewUrl ? <audio src={item.previewUrl} controls preload="none" /> : null}
                <div className={styles.actions}>
                  <button
                    type="button"
                    onClick={() => {
                      hapticSelection();
                      setSelectedCoverId(item.id);
                    }}
                  >
                    {isSelected ? "Обложка выбрана" : "Выбрать обложку"}
                  </button>
                  <button type="button" onClick={() => handleCopy(item.artworkUrl)}>
                    Копировать URL
                  </button>
                  <button type="button" onClick={() => downloadMetadata(item)}>
                    Экспорт JSON
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className={styles.scope}>
        <h2>Экспорт в Telegram</h2>
        <ul>
          <li>1. Выберите трек из профиля.</li>
          <li>2. Выберите подходящую обложку из найденных вариантов.</li>
          <li>3. Отправьте готовый файл в чат и добавьте его в профиль вручную.</li>
        </ul>
        <button
          type="button"
          className={styles.sendButton}
          onClick={sendTrackToChat}
          disabled={!selectedAudio || !selectedCover || sendingToChat}
        >
          {sendingToChat ? "Отправляем..." : "Отправить трек в Telegram"}
        </button>
        {sendStatus ? <p className={styles.sendStatus}>{sendStatus}</p> : null}
      </section>
    </div>
  );
}
