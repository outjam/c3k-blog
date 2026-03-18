"use client";

import { useEffect, useState } from "react";

import styles from "./telegram-login-widget.module.scss";

interface TelegramLoginSdkCallbackPayload {
  id_token?: string;
  user?: {
    id?: number;
    name?: string;
    preferred_username?: string;
    picture?: string;
    phone_number?: string;
  };
  error?: string;
}

interface TelegramLoginWidgetProps {
  onAuthorized?: () => void;
}

const TELEGRAM_LOGIN_SDK_URL = "https://oauth.telegram.org/js/telegram-login.js?3";

let telegramLoginScriptPromise: Promise<void> | null = null;

const ensureTelegramLoginSdk = (): Promise<void> => {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("window is not available"));
  }

  if (window.Telegram?.Login?.auth) {
    return Promise.resolve();
  }

  if (telegramLoginScriptPromise) {
    return telegramLoginScriptPromise;
  }

  telegramLoginScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_LOGIN_SDK_URL}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Telegram Login SDK")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = TELEGRAM_LOGIN_SDK_URL;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Telegram Login SDK"));
    document.head.appendChild(script);
  });

  return telegramLoginScriptPromise;
};

const normalizeLanguage = (): string => {
  const fromDocument = document.documentElement.lang?.trim().slice(0, 2).toLowerCase();
  return fromDocument || "ru";
};

export function TelegramLoginWidget({ onAuthorized }: TelegramLoginWidgetProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [clientId, setClientId] = useState("");
  const [isConfigLoading, setIsConfigLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadConfig = async () => {
      setIsConfigLoading(true);

      try {
        const response = await fetch("/api/auth/telegram/widget", {
          method: "GET",
          cache: "no-store",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          if (!cancelled) {
            setClientId("");
            setError(payload.error ?? `HTTP ${response.status}`);
            setIsConfigLoading(false);
          }
          return;
        }

        const payload = (await response.json()) as { clientId?: string };
        if (!cancelled) {
          setClientId(String(payload.clientId ?? "").trim());
          setError("");
          setIsConfigLoading(false);
        }
      } catch {
        if (!cancelled) {
          setClientId("");
          setError("Не удалось загрузить конфигурацию Telegram Login.");
          setIsConfigLoading(false);
        }
      }
    };

    void loadConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  const startLogin = async () => {
    if (isSubmitting || isConfigLoading) {
      return;
    }

    if (!clientId || !/^\d+$/.test(clientId)) {
      setError("Не настроен Telegram Login client ID.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      await ensureTelegramLoginSdk();

      const result = await new Promise<TelegramLoginSdkCallbackPayload>((resolve) => {
        window.Telegram?.Login?.auth(
          {
            client_id: Number(clientId),
            request_access: ["write"],
            lang: normalizeLanguage(),
          },
          (payload: TelegramLoginSdkCallbackPayload) => resolve(payload),
        );
      });

      if (result.error || !result.id_token) {
        setError(result.error || "Telegram не вернул id_token.");
        setIsSubmitting(false);
        return;
      }

      const response = await fetch("/api/auth/telegram/widget", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(result),
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? `HTTP ${response.status}`);
        setIsSubmitting(false);
        return;
      }

      setIsSubmitting(false);
      onAuthorized?.();
    } catch {
      setError("Не удалось открыть Telegram Login.");
      setIsSubmitting(false);
    }
  };

  return (
    <section className={styles.card}>
      <p className={styles.title}>Вход через Telegram</p>
      <p className={styles.subtitle}>
        Авторизация нужна для заказов, комментариев, избранного и кабинета артиста в браузере.
      </p>
      <button
        type="button"
        className={styles.loginButton}
        onClick={() => void startLogin()}
        disabled={isSubmitting || isConfigLoading}
      >
        {isSubmitting ? "Подтверждаем вход..." : isConfigLoading ? "Загружаем Telegram Login..." : "Авторизоваться через Telegram"}
      </button>
      <p className={styles.note}>Используется актуальный Telegram Login flow для браузера.</p>
      {error ? <p className={styles.error}>Ошибка входа: {error}</p> : null}
    </section>
  );
}
