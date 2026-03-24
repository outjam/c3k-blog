"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";

const normalizeReturnTo = (value: string | null): string => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return "http://127.0.0.1:3467/auth/telegram/callback";
  }

  try {
    const parsed = new URL(normalized);
    const isLocalHost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    if ((parsed.protocol === "http:" || parsed.protocol === "https:") && isLocalHost) {
      return parsed.toString();
    }
  } catch {
    return "http://127.0.0.1:3467/auth/telegram/callback";
  }

  return "http://127.0.0.1:3467/auth/telegram/callback";
};

const appendBridgeToken = (returnTo: string, bridgeToken: string): string => {
  const url = new URL(returnTo);
  url.searchParams.set("bridge", bridgeToken);
  return url.toString();
};

export default function DesktopTelegramPageClient() {
  const searchParams = useSearchParams();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const [status, setStatus] = useState("Подготавливаем desktop login…");
  const [error, setError] = useState("");
  const redirectStartedRef = useRef(false);
  const returnTo = normalizeReturnTo(searchParams.get("return_to"));

  useEffect(() => {
    if (isSessionLoading || !user || redirectStartedRef.current) {
      return;
    }

    redirectStartedRef.current = true;

    const bridgeDesktopSession = async () => {
      setStatus("Связываем браузерную сессию с C3K Desktop…");
      setError("");

      const response = await fetch("/api/auth/telegram/desktop/bridge", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        cache: "no-store",
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        setError(payload.error ?? `HTTP ${response.status}`);
        redirectStartedRef.current = false;
        return;
      }

      const payload = (await response.json()) as { bridgeToken?: string };
      const bridgeToken = String(payload.bridgeToken ?? "").trim();
      if (!bridgeToken) {
        setError("Desktop bridge token is missing.");
        redirectStartedRef.current = false;
        return;
      }

      setStatus("Возвращаем авторизацию обратно в C3K Desktop…");
      window.location.replace(appendBridgeToken(returnTo, bridgeToken));
    };

    void bridgeDesktopSession();
  }, [isSessionLoading, returnTo, user]);

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background:
          "radial-gradient(circle at top, rgba(47,125,246,0.18), transparent 40%), linear-gradient(180deg, #0d1017 0%, #121a28 100%)",
        padding: "32px 16px",
        color: "#f3f6fb",
      }}
    >
      <section
        style={{
          width: "min(100%, 520px)",
          borderRadius: "28px",
          background: "rgba(10,14,22,0.88)",
          border: "1px solid rgba(160,186,233,0.16)",
          boxShadow: "0 24px 80px rgba(0,0,0,0.38)",
          padding: "28px",
          display: "grid",
          gap: "16px",
        }}
      >
        <div style={{ display: "grid", gap: "8px" }}>
          <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#8fb4ff" }}>
            C3K Desktop Login
          </p>
          <h1 style={{ margin: 0, fontSize: "32px", lineHeight: 1.05 }}>Вход через Telegram для desktop</h1>
          <p style={{ margin: 0, color: "rgba(243,246,251,0.78)", lineHeight: 1.55 }}>
            Вход идёт в обычном браузере. После подтверждения браузер сам вернёт готовую авторизацию обратно в C3K Desktop.
          </p>
        </div>

        <div
          style={{
            borderRadius: "18px",
            padding: "14px 16px",
            background: "rgba(143,180,255,0.08)",
            border: "1px solid rgba(143,180,255,0.16)",
            color: "#d7e6ff",
            lineHeight: 1.5,
          }}
        >
          {status}
        </div>

        {error ? (
          <div
            style={{
              borderRadius: "18px",
              padding: "14px 16px",
              background: "rgba(255,102,102,0.12)",
              border: "1px solid rgba(255,102,102,0.2)",
              color: "#ffd1d1",
              lineHeight: 1.5,
            }}
          >
            Ошибка: {error}
          </div>
        ) : null}

        {!user ? (
          <TelegramLoginWidget
            onAuthorized={() => {
              setStatus("Telegram вход подтверждён. Проверяем сессию…");
              void refreshSession();
            }}
          />
        ) : (
          <div
            style={{
              borderRadius: "18px",
              padding: "14px 16px",
              background: "rgba(75,214,152,0.12)",
              border: "1px solid rgba(75,214,152,0.2)",
              color: "#d5ffe9",
              lineHeight: 1.5,
            }}
          >
            Вход подтверждён для @{user.username || user.first_name || user.id}. Возвращаемся в C3K Desktop…
          </div>
        )}
      </section>
    </main>
  );
}
