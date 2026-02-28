"use client";

import { useMemo } from "react";

import { getTelegramWebApp } from "@/lib/telegram";
import type { TelegramWebApp } from "@/types/telegram";

export const useTelegramWebApp = (): TelegramWebApp | null => {
  return useMemo(() => getTelegramWebApp(), []);
};
