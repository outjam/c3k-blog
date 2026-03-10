"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

const resolveManifestBaseUrl = (): string => {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const fallback = configured ? configured.replace(/\/+$/, "") : "https://localhost:3000";

  if (typeof window === "undefined") {
    return fallback;
  }

  return window.location.origin.replace(/\/+$/, "") || fallback;
};

export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  const manifestUrl = `${resolveManifestBaseUrl()}/tonconnect-manifest.json`;

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}

