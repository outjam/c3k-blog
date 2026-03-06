"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./telegram-login-widget.module.scss";

interface TelegramWidgetAuthPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginWidgetProps {
  onAuthorized?: () => void;
}

declare global {
  interface Window {
    onTelegramLoginWidgetAuth?: (user: TelegramWidgetAuthPayload) => void;
  }
}

export function TelegramLoginWidget({ onAuthorized }: TelegramLoginWidgetProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME?.trim() ?? "";

  useEffect(() => {
    window.onTelegramLoginWidgetAuth = async (user: TelegramWidgetAuthPayload) => {
      setIsSubmitting(true);
      setError("");

      try {
        const response = await fetch("/api/auth/telegram/widget", {
          method: "POST",
          headers: {
            "content-type": "application/json",
          },
          body: JSON.stringify(user),
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
        setError("Ошибка сети");
        setIsSubmitting(false);
      }
    };

    return () => {
      delete window.onTelegramLoginWidgetAuth;
    };
  }, [onAuthorized]);

  useEffect(() => {
    if (!botUsername || !containerRef.current) {
      return;
    }

    containerRef.current.innerHTML = "";

    const script = document.createElement("script");
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.async = true;
    script.setAttribute("data-telegram-login", botUsername);
    script.setAttribute("data-size", "large");
    script.setAttribute("data-userpic", "true");
    script.setAttribute("data-request-access", "write");
    script.setAttribute("data-onauth", "onTelegramLoginWidgetAuth(user)");
    script.setAttribute("data-radius", "12");
    containerRef.current.appendChild(script);
  }, [botUsername]);

  if (!botUsername) {
    return (
      <section className={styles.card}>
        <p className={styles.error}>
          Не задан `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`. Добавьте его в `.env` и перезапустите приложение.
        </p>
      </section>
    );
  }

  return (
    <section className={styles.card}>
      <p className={styles.title}>Вход через Telegram</p>
      <p className={styles.subtitle}>Авторизация нужна для заказов, комментариев, избранного и кабинета артиста в браузере.</p>
      <div ref={containerRef} className={styles.widgetSlot} />
      {isSubmitting ? <p className={styles.note}>Подтверждаем вход...</p> : null}
      {error ? <p className={styles.error}>Ошибка входа: {error}</p> : null}
    </section>
  );
}
