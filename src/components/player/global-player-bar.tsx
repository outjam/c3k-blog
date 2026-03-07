"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

import { useGlobalPlayer } from "@/components/player/global-player-provider";

import styles from "./global-player-bar.module.scss";

const formatTime = (value: number): string => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
};

export function GlobalPlayerBar() {
  const {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTimeSec,
    durationSec,
    volume,
    playQueue,
    togglePlayback,
    playNext,
    playPrev,
    seekTo,
    setVolume,
    clearQueue,
  } = useGlobalPlayer();
  const [expanded, setExpanded] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);

  const hasNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const hasPrev = currentIndex > 0 || currentTimeSec > 0;
  const resolvedDuration = useMemo(() => {
    if (durationSec > 0) {
      return durationSec;
    }

    return currentTrack?.durationSec ?? 0;
  }, [currentTrack?.durationSec, durationSec]);
  const safeCurrentTime = Math.min(Math.max(0, currentTimeSec), Math.max(0, resolvedDuration));
  const progressPercent = resolvedDuration > 0 ? (safeCurrentTime / resolvedDuration) * 100 : 0;

  if (!currentTrack) {
    return null;
  }

  return (
    <>
      <div className={styles.miniWrap}>
        <article className={styles.miniCard}>
          <button type="button" className={styles.miniMain} onClick={() => setExpanded(true)}>
            {currentTrack.coverUrl ? (
              <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={48} height={48} className={styles.coverSmall} />
            ) : (
              <div className={styles.coverSmallFallback}>♪</div>
            )}

            <span className={styles.miniMeta}>
              <strong>{currentTrack.title}</strong>
              <small>{currentTrack.artist || "Culture3k"}</small>
              <span className={styles.miniTimeline}>
                {formatTime(safeCurrentTime)} / {formatTime(resolvedDuration)}
              </span>
            </span>

            <span className={styles.miniProgress} aria-hidden>
              <span style={{ width: `${progressPercent}%` }} />
            </span>
          </button>

          <div className={styles.miniActions}>
            <button type="button" onClick={playPrev} disabled={!hasPrev} aria-label="Предыдущий трек">
              ◀◀
            </button>
            <button type="button" onClick={togglePlayback} aria-label={isPlaying ? "Пауза" : "Воспроизвести"}>
              {isPlaying ? "❚❚" : "▶"}
            </button>
            <button type="button" onClick={playNext} disabled={!hasNext} aria-label="Следующий трек">
              ▶▶
            </button>
            <button type="button" onClick={() => setExpanded(true)} aria-label="Открыть полный плеер">
              ⌃
            </button>
          </div>
        </article>
      </div>

      {expanded ? (
        <div className={styles.fullOverlay}>
          <button type="button" className={styles.backdrop} onClick={() => setExpanded(false)} aria-label="Закрыть полный плеер" />

          <section className={styles.fullSheet}>
            <button type="button" className={styles.handleButton} onClick={() => setExpanded(false)} aria-label="Свернуть плеер">
              <span />
            </button>

            <div className={styles.fullCoverWrap}>
              {currentTrack.coverUrl ? (
                <Image src={currentTrack.coverUrl} alt={currentTrack.title} width={360} height={360} className={styles.coverLarge} />
              ) : (
                <div className={styles.coverLargeFallback}>♪</div>
              )}
            </div>

            <div className={styles.fullMeta}>
              <strong>{currentTrack.title}</strong>
              <span>{currentTrack.artist || "Culture3k"}</span>
              <small>
                {currentIndex + 1} / {queue.length}
              </small>
            </div>

            <div className={styles.progressRow}>
              <span>{formatTime(safeCurrentTime)}</span>
              <input
                type="range"
                min={0}
                max={Math.max(0, resolvedDuration)}
                step={1}
                value={safeCurrentTime}
                onChange={(event) => seekTo(Number(event.target.value))}
              />
              <span>{formatTime(resolvedDuration)}</span>
            </div>

            <div className={styles.mainControls}>
              <button type="button" onClick={playPrev} disabled={!hasPrev}>
                ◀◀
              </button>
              <button type="button" className={styles.mainPlay} onClick={togglePlayback}>
                {isPlaying ? "Пауза" : "Плей"}
              </button>
              <button type="button" onClick={playNext} disabled={!hasNext}>
                ▶▶
              </button>
            </div>

            <div className={styles.secondaryRow}>
              <label className={styles.volume}>
                <span>Громкость</span>
                <input type="range" min={0} max={1} step={0.01} value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
              </label>

              <div className={styles.secondaryActions}>
                <button type="button" onClick={() => setQueueOpen((prev) => !prev)}>
                  Очередь ({queue.length})
                </button>
                <button type="button" onClick={clearQueue}>
                  Очистить
                </button>
              </div>
            </div>

            {queueOpen ? (
              <div className={styles.queuePanel}>
                {queue.map((track, index) => (
                  <button
                    key={`${track.id}-${index}`}
                    type="button"
                    className={`${styles.queueItem} ${index === currentIndex ? styles.queueItemActive : ""}`}
                    onClick={() => playQueue(queue, index)}
                  >
                    <span>{index + 1}</span>
                    <strong>{track.title}</strong>
                    <small>{track.artist || "Culture3k"}</small>
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </>
  );
}
