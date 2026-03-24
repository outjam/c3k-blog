import { Suspense } from "react";

import DesktopTelegramPageClient from "./desktop-telegram-page-client";

export const dynamic = "force-dynamic";

function DesktopTelegramPageFallback() {
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
        <p style={{ margin: 0, fontSize: "12px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#8fb4ff" }}>
          C3K Desktop Login
        </p>
        <h1 style={{ margin: 0, fontSize: "32px", lineHeight: 1.05 }}>Подготавливаем desktop login…</h1>
      </section>
    </main>
  );
}

export default function DesktopTelegramAuthPage() {
  return (
    <Suspense fallback={<DesktopTelegramPageFallback />}>
      <DesktopTelegramPageClient />
    </Suspense>
  );
}
