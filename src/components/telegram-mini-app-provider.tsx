"use client";

import { useEffect } from "react";

import { applyTelegramThemeToCssVars, getTelegramWebApp } from "@/lib/telegram";

export function TelegramMiniAppProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const webApp = getTelegramWebApp();

    if (!webApp) {
      return;
    }

    const syncTheme = () => {
      applyTelegramThemeToCssVars(webApp);

      const headerColor = webApp.themeParams.header_bg_color ?? webApp.themeParams.bg_color;
      const bgColor = webApp.themeParams.bg_color;

      if (headerColor) {
        webApp.setHeaderColor(headerColor);
      }

      if (bgColor) {
        webApp.setBackgroundColor(bgColor);
      }
    };

    webApp.ready();
    webApp.expand();
    webApp.disableVerticalSwipes?.();
    syncTheme();

    webApp.onEvent?.("themeChanged", syncTheme);

    return () => {
      webApp.offEvent?.("themeChanged", syncTheme);
    };
  }, []);

  return <>{children}</>;
}
