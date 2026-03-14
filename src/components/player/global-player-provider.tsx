"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

export interface GlobalPlayerTrack {
  id: string;
  title: string;
  artist?: string;
  coverUrl?: string;
  sourceUrl: string;
  releaseSlug?: string;
  durationSec?: number;
}

interface GlobalPlayerContextValue {
  queue: GlobalPlayerTrack[];
  currentIndex: number;
  currentTrack: GlobalPlayerTrack | null;
  isPlaying: boolean;
  currentTimeSec: number;
  durationSec: number;
  volume: number;
  playQueue: (tracks: GlobalPlayerTrack[], startIndex?: number) => void;
  enqueueTracks: (tracks: GlobalPlayerTrack[], playNow?: boolean) => void;
  togglePlayback: () => void;
  playNext: () => void;
  playPrev: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (volume: number) => void;
  clearQueue: () => void;
}

const GlobalPlayerContext = createContext<GlobalPlayerContextValue | null>(
  null,
);

const clamp = (value: number, min: number, max: number): number => {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.max(min, Math.min(max, value));
};

const resolveTrackSourceUrl = (value: string): string => {
  const normalized = String(value || "").trim();

  if (!normalized || typeof window === "undefined") {
    return normalized;
  }

  try {
    return new URL(normalized, window.location.href).toString();
  } catch {
    return normalized;
  }
};

export function GlobalPlayerProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const shouldAutoplayRef = useRef(false);

  const [queue, setQueue] = useState<GlobalPlayerTrack[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTimeSec, setCurrentTimeSec] = useState(0);
  const [durationSec, setDurationSec] = useState(0);
  const [volume, setVolumeState] = useState(1);

  const currentTrack = useMemo(() => {
    if (currentIndex < 0 || currentIndex >= queue.length) {
      return null;
    }

    return queue[currentIndex] ?? null;
  }, [currentIndex, queue]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTimeUpdate = () => {
      setCurrentTimeSec(audio.currentTime || 0);
    };

    const onLoadedMetadata = () => {
      setDurationSec(
        Number.isFinite(audio.duration) ? Math.max(0, audio.duration) : 0,
      );
    };

    const onPlay = () => {
      setIsPlaying(true);
    };

    const onPause = () => {
      setIsPlaying(false);
    };

    const onEnded = () => {
      setCurrentIndex((prev) => {
        const next = prev + 1;

        if (next < queue.length) {
          shouldAutoplayRef.current = true;
          return next;
        }

        shouldAutoplayRef.current = false;
        return prev;
      });
      setIsPlaying(false);
    };

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("durationchange", onLoadedMetadata);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);

    return () => {
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("durationchange", onLoadedMetadata);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [queue.length]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = clamp(volume, 0, 1);
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentTrack) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      shouldAutoplayRef.current = false;
      return;
    }

    const resolvedSourceUrl = resolveTrackSourceUrl(currentTrack.sourceUrl);

    if (audio.src !== resolvedSourceUrl) {
      audio.src = resolvedSourceUrl;
      audio.load();
    }

    if (shouldAutoplayRef.current) {
      shouldAutoplayRef.current = false;
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
    }
  }, [currentTrack]);

  const startPlayback = (
    tracks: GlobalPlayerTrack[],
    index: number,
    immediate = true,
  ) => {
    const nextTrack = tracks[index];
    if (!nextTrack) {
      return;
    }

    setQueue(tracks);
    setCurrentIndex(index);
    setCurrentTimeSec(0);
    setDurationSec(nextTrack.durationSec ?? 0);
    setIsPlaying(true);

    const audio = audioRef.current;
    if (!audio || !immediate) {
      shouldAutoplayRef.current = true;
      return;
    }

    shouldAutoplayRef.current = false;

    const resolvedSourceUrl = resolveTrackSourceUrl(nextTrack.sourceUrl);
    if (audio.src !== resolvedSourceUrl) {
      audio.src = resolvedSourceUrl;
      audio.load();
    }

    void audio.play().catch(() => {
      setIsPlaying(false);
    });
  };

  const playQueue = (tracks: GlobalPlayerTrack[], startIndex = 0) => {
    const normalizedTracks = tracks.filter((track) =>
      Boolean(track?.sourceUrl),
    );
    if (normalizedTracks.length === 0) {
      return;
    }

    const nextIndex = clamp(startIndex, 0, normalizedTracks.length - 1);
    startPlayback(normalizedTracks, nextIndex);
  };

  const enqueueTracks = (tracks: GlobalPlayerTrack[], playNow = false) => {
    const normalizedTracks = tracks.filter((track) =>
      Boolean(track?.sourceUrl),
    );
    if (normalizedTracks.length === 0) {
      return;
    }

    const merged = [...queue, ...normalizedTracks];

    if (playNow) {
      startPlayback(merged, queue.length);
      return;
    }

    if (currentIndex < 0) {
      startPlayback(merged, 0);
      return;
    }

    setQueue(merged);
  };

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    if (!currentTrack && queue.length > 0) {
      startPlayback(queue, 0);
      return;
    }

    if (audio.paused) {
      void audio.play().catch(() => {
        setIsPlaying(false);
      });
      return;
    }

    audio.pause();
  };

  const playNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length) {
      return;
    }

    startPlayback(queue, nextIndex);
  };

  const playPrev = () => {
    const audio = audioRef.current;

    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      setCurrentTimeSec(0);
      return;
    }

    const nextIndex = currentIndex - 1;
    if (nextIndex < 0) {
      return;
    }

    startPlayback(queue, nextIndex);
  };

  const seekTo = (seconds: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const clamped = clamp(
      seconds,
      0,
      Number.isFinite(audio.duration) ? audio.duration : 0,
    );
    audio.currentTime = clamped;
    setCurrentTimeSec(clamped);
  };

  const setVolume = (nextVolume: number) => {
    setVolumeState(clamp(nextVolume, 0, 1));
  };

  const clearQueue = () => {
    setQueue([]);
    setCurrentIndex(-1);
    setCurrentTimeSec(0);
    setDurationSec(0);
    setIsPlaying(false);
    shouldAutoplayRef.current = false;

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
  };

  const value: GlobalPlayerContextValue = {
    queue,
    currentIndex,
    currentTrack,
    isPlaying,
    currentTimeSec,
    durationSec,
    volume,
    playQueue,
    enqueueTracks,
    togglePlayback,
    playNext,
    playPrev,
    seekTo,
    setVolume,
    clearQueue,
  };

  return (
    <GlobalPlayerContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="metadata" style={{ display: "none" }} />
    </GlobalPlayerContext.Provider>
  );
}

export const useGlobalPlayer = (): GlobalPlayerContextValue => {
  const context = useContext(GlobalPlayerContext);

  if (!context) {
    throw new Error("useGlobalPlayer must be used within GlobalPlayerProvider");
  }

  return context;
};
