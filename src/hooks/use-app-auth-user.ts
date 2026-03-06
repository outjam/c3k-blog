"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { TelegramUser } from "@/types/telegram";

import { useTelegramWebApp } from "./useTelegramWebApp";

export interface AppAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  is_premium?: boolean;
}

const normalizeAuthUser = (value: unknown): AppAuthUser | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = Math.round(Number(raw.id ?? 0));

  if (!Number.isFinite(id) || id < 1) {
    return null;
  }

  return {
    id,
    first_name: typeof raw.first_name === "string" ? raw.first_name : undefined,
    last_name: typeof raw.last_name === "string" ? raw.last_name : undefined,
    username: typeof raw.username === "string" ? raw.username : undefined,
    photo_url: typeof raw.photo_url === "string" ? raw.photo_url : undefined,
    is_premium: typeof raw.is_premium === "boolean" ? raw.is_premium : undefined,
  };
};

const mapTelegramUser = (user: TelegramUser | undefined): AppAuthUser | null => {
  if (!user?.id) {
    return null;
  }

  return {
    id: user.id,
    first_name: user.first_name,
    last_name: user.last_name,
    username: user.username,
    photo_url: user.photo_url,
    is_premium: user.is_premium,
  };
};

export function useAppAuthUser() {
  const webApp = useTelegramWebApp();
  const webAppUser = mapTelegramUser(webApp?.initDataUnsafe?.user);
  const [sessionUser, setSessionUser] = useState<AppAuthUser | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(true);

  const refreshSession = useCallback(async () => {
    setIsSessionLoading(true);

    try {
      const response = await fetch("/api/auth/session", {
        method: "GET",
        headers: getTelegramAuthHeaders(),
        cache: "no-store",
      });

      if (!response.ok) {
        setSessionUser(null);
        setIsSessionLoading(false);
        return;
      }

      const payload = (await response.json()) as { user?: unknown };
      setSessionUser(normalizeAuthUser(payload.user));
      setIsSessionLoading(false);
    } catch {
      setSessionUser(null);
      setIsSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void refreshSession();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [refreshSession]);

  const user = useMemo(() => webAppUser ?? sessionUser, [sessionUser, webAppUser]);
  const source = webAppUser ? "telegram-webapp" : sessionUser ? "browser-widget" : "anonymous";

  return {
    user,
    source,
    webApp,
    isSessionLoading,
    refreshSession,
  } as const;
}
