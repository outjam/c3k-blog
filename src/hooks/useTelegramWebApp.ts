"use client";

import { useEffect, useState } from "react";

import { getTelegramWebApp } from "@/lib/telegram";
import type { TelegramWebApp } from "@/types/telegram";

export const useTelegramWebApp = (): TelegramWebApp | null => {
  const [webApp, setWebApp] = useState<TelegramWebApp | null>(null);

  useEffect(() => {
    const rafId = window.requestAnimationFrame(() => {
      setWebApp(getTelegramWebApp());
    });

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, []);

  return webApp;
};
