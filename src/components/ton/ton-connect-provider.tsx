"use client";

import { useEffect } from "react";
import { TonConnectUIProvider, useTonConnectUI } from "@tonconnect/ui-react";

import { TON_NETWORK_LABEL, TON_REQUIRED_CHAIN } from "@/lib/ton-network";

const resolveManifestUrl = (): string => {
  const configured = (process.env.NEXT_PUBLIC_APP_URL ?? "").trim();
  const fallback = configured ? configured.replace(/\/+$/, "") : "http://localhost:3000";

  if (typeof window === "undefined") {
    return `${fallback}/api/tonconnect/manifest`;
  }

  const origin = window.location.origin.replace(/\/+$/, "") || fallback;
  return `${origin}/api/tonconnect/manifest`;
};

function TonNetworkController() {
  const [tonConnectUI] = useTonConnectUI();

  useEffect(() => {
    try {
      tonConnectUI.setConnectionNetwork(TON_REQUIRED_CHAIN);
    } catch {
      if (process.env.NODE_ENV !== "production") {
        console.warn(`TonConnect network guard failed, expected ${TON_NETWORK_LABEL}`);
      }
    }
  }, [tonConnectUI]);

  return null;
}

export function TonConnectProvider({ children }: { children: React.ReactNode }) {
  const manifestUrl = resolveManifestUrl();

  return (
    <TonConnectUIProvider manifestUrl={manifestUrl}>
      <TonNetworkController />
      {children}
    </TonConnectUIProvider>
  );
}
