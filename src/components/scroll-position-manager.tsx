"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

const STORAGE_KEY = "c3k-scroll-positions-v1";
const MAX_ENTRIES = 120;

type ScrollMap = Record<string, number>;

const readPositions = (): ScrollMap => {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([key, value]) => key.length > 0 && Number.isFinite(Number(value)))
        .map(([key, value]) => [key, Math.max(0, Math.round(Number(value)))]),
    );
  } catch {
    return {};
  }
};

const writePositions = (positions: ScrollMap) => {
  try {
    const entries = Object.entries(positions);
    const limited = entries.slice(Math.max(entries.length - MAX_ENTRIES, 0));
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(limited)));
  } catch {
    // no-op
  }
};

export function ScrollPositionManager() {
  const pathname = usePathname();
  const routeKey = pathname;

  const positionsRef = useRef<ScrollMap>({});
  const currentRouteRef = useRef<string>(routeKey);
  const writeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    positionsRef.current = readPositions();

    if ("scrollRestoration" in window.history) {
      window.history.scrollRestoration = "manual";
    }

    return () => {
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "auto";
      }
    };
  }, []);

  useEffect(() => {
    const saveCurrentPosition = () => {
      const key = currentRouteRef.current;
      if (!key) {
        return;
      }

      positionsRef.current[key] = Math.max(0, Math.round(window.scrollY));

      if (writeTimerRef.current) {
        window.clearTimeout(writeTimerRef.current);
      }

      writeTimerRef.current = window.setTimeout(() => {
        writePositions(positionsRef.current);
      }, 120);
    };

    const onScroll = () => saveCurrentPosition();
    const onPageHide = () => {
      saveCurrentPosition();
      writePositions(positionsRef.current);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", onPageHide);

    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", onPageHide);

      if (writeTimerRef.current) {
        window.clearTimeout(writeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousKey = currentRouteRef.current;
    positionsRef.current[previousKey] = Math.max(0, Math.round(window.scrollY));
    currentRouteRef.current = routeKey;
    writePositions(positionsRef.current);

    const nextY = positionsRef.current[routeKey] ?? 0;
    const rafId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: nextY, left: 0, behavior: "auto" });
    });

    return () => window.cancelAnimationFrame(rafId);
  }, [routeKey]);

  return null;
}
