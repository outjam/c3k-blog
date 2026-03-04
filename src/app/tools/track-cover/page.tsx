"use client";

import { useMemo, useState } from "react";

import { hapticSelection } from "@/lib/telegram";
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
  const [loading, setLoading] = useState(false);
  const [loadingProfileAudios, setLoadingProfileAudios] = useState(false);
  const [error, setError] = useState("");
  const [profileError, setProfileError] = useState("");

  const canSearch = query.trim().length >= 2;
  const summaryText = useMemo(() => {
    if (loading) {
      return "Ищем треки...";
    }

    if (error) {
      return error;
    }

    if (items.length === 0) {
      return "Введите название трека или артиста.";
    }

    return `Найдено ${items.length} результатов`;
  }, [error, items.length, loading]);

  const runSearch = async (inputQuery: string) => {
    const normalizedQuery = inputQuery.trim();

    if (normalizedQuery.length < 2 || loading) {
      return;
    }

    setLoading(true);
    setError("");
    hapticSelection();

    try {
      const response = await fetch(`/api/tools/track-cover/search?q=${encodeURIComponent(normalizedQuery)}`, {
        cache: "no-store",
      });
      const payload = (await response.json()) as SearchResponse;

      if (!response.ok) {
        setItems([]);
        setError(payload.error ?? "Ошибка поиска.");
        return;
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch {
      setItems([]);
      setError("Сеть недоступна. Повторите запрос.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    await runSearch(query);
  };

  const loadProfileAudios = async () => {
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
        return;
      }

      const nextItems = Array.isArray(payload.items) ? payload.items : [];
      setProfileAudios(nextItems);
      setProfileAudiosTotal(Number(payload.totalCount ?? nextItems.length));
    } catch {
      setProfileAudios([]);
      setProfileAudiosTotal(0);
      setProfileError("Сетевая ошибка загрузки аудио профиля.");
    } finally {
      setLoadingProfileAudios(false);
    }
  };

  const handleCopy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      hapticSelection();
    } catch {
      // noop
    }
  };

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>Track Cover Finder</h1>
        <p>Поиск обложек треков + экспорт метаданных и импорт треков из Telegram Profile Audio.</p>
      </section>

      <section className={styles.profileAudios}>
        <div className={styles.profileHeader}>
          <div>
            <h2>Аудио из профиля Telegram</h2>
            <p>Источник: Bot API `getUserProfileAudios`</p>
          </div>
          <button type="button" onClick={loadProfileAudios} disabled={loadingProfileAudios}>
            {loadingProfileAudios ? "Загрузка..." : "Получить треки"}
          </button>
        </div>

        {profileError ? <p className={styles.profileError}>{profileError}</p> : null}

        {profileAudios.length > 0 ? (
          <>
            <p className={styles.profileCount}>Треков в профиле: {profileAudiosTotal}</p>
            <div className={styles.profileList}>
              {profileAudios.map((audio) => (
                <article key={audio.id} className={styles.profileCard}>
                  <h3>{audio.title || "Без названия"}</h3>
                  <p>{audio.artist || "Неизвестный артист"}</p>
                  <small>
                    {toDuration(audio.durationSec)} · {formatBytes(audio.fileSize)}
                  </small>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery(audio.searchQuery);
                      void runSearch(audio.searchQuery);
                    }}
                  >
                    Найти обложку
                  </button>
                </article>
              ))}
            </div>
          </>
        ) : (
          <p className={styles.profileHint}>Нажмите кнопку, чтобы запросить список треков из Telegram-профиля.</p>
        )}
      </section>

      <section className={styles.search}>
        <label htmlFor="track-query">Запрос</label>
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
          <button type="button" onClick={handleSearch} disabled={!canSearch || loading}>
            Искать
          </button>
        </div>
        <p className={styles.summary}>{summaryText}</p>
      </section>

      <section className={styles.list}>
        {items.map((item) => (
          <article key={item.id} className={styles.card}>
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
                <button type="button" onClick={() => handleCopy(item.artworkUrl)}>
                  Копировать URL
                </button>
                <button type="button" onClick={() => downloadMetadata(item)}>
                  Экспорт JSON
                </button>
                <a href={item.artworkUrl} target="_blank" rel="noreferrer">
                  Открыть обложку
                </a>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className={styles.scope}>
        <h2>Текущий scope инструмента</h2>
        <ul>
          <li>Поиск обложки и карточки трека: готово.</li>
          <li>Экспорт метаданных для пайплайна: готово (JSON).</li>
          <li>Вшивание обложки в файл трека: следующий этап через backend job.</li>
        </ul>
      </section>
    </div>
  );
}
