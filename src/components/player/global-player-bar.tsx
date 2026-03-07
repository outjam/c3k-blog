"use client";

import { useMemo } from "react";

import { useGlobalPlayer } from "@/components/player/global-player-provider";

import styles from "./global-player-bar.module.scss";

interface GlobalPlayerBarProps {
  desktop?: boolean;
}

const formatTime = (value: number): string => {
  const seconds = Math.max(0, Math.floor(Number.isFinite(value) ? value : 0));
  const mm = Math.floor(seconds / 60);
  const ss = seconds % 60;
  return `${mm}:${String(ss).padStart(2, "0")}`;
};

export function GlobalPlayerBar({ desktop: _desktop = false }: GlobalPlayerBarProps) {
  const {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTimeSec,
    durationSec,
    togglePlayback,
    playNext,
    playPrev,
    seekTo,
  } = useGlobalPlayer();

  const hasNext = currentIndex >= 0 && currentIndex < queue.length - 1;
  const hasPrev = currentIndex > 0 || currentTimeSec > 0;
  const resolvedDuration = useMemo(() => {
    if (durationSec > 0) {
      return durationSec;
    }

    return currentTrack?.durationSec ?? 0;
  }, [currentTrack?.durationSec, durationSec]);

  if (!currentTrack) {
    return null;
  }

  return (
    <div className={styles.wrap}>
      <article className={styles.card}>
        <div className={styles.row}>
          <div className={styles.trackMeta}>
            <strong>{currentTrack.title}</strong>
            <span>{currentTrack.artist || "Culture3k"}</span>
          </div>

          <div className={styles.controls}>
            <button type="button" onClick={playPrev} disabled={!hasPrev}>
              ◀◀
            </button>
            <button type="button" onClick={togglePlayback}>
              {isPlaying ? "Пауза" : "Плей"}
            </button>
            <button type="button" onClick={playNext} disabled={!hasNext}>
              ▶▶
            </button>
          </div>
        </div>

        <div className={styles.progressRow}>
          <span>{formatTime(currentTimeSec)}</span>
          <input
            type="range"
            min={0}
            max={Math.max(0, resolvedDuration || 0)}
            step={1}
            value={Math.min(Math.max(0, currentTimeSec), Math.max(0, resolvedDuration || 0))}
            onChange={(event) => seekTo(Number(event.target.value))}
          />
          <span>{formatTime(resolvedDuration)}</span>
        </div>
      </article>
    </div>
  );
}
