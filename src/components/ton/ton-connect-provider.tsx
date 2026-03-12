"use client";

import { TonConnectUIProvider } from "@tonconnect/ui-react";

const resolveManifestUrl = (): string => {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const fallback = configured ? configured.replace(/\/+$/, "") : "http://localhost:3000";

  if (typeof window === "undefined") {
    return `${fallback}/api/tonconnect/manifest`;
  }

  const origin = window.location.origin.replace(/\/+$/, "") || fallback;
  return `${origin}/api/tonconnect/manifest`;
};

export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  const manifestUrl = resolveManifestUrl();

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      {children}
    </TonConnectUIProvider>
  );
}
