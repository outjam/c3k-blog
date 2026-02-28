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
      const bottomBarColor = webApp.themeParams.bottom_bar_bg_color ?? webApp.themeParams.secondary_bg_color ?? bgColor;

      if (headerColor) {
        webApp.setHeaderColor(headerColor);
      }

      if (bgColor) {
        webApp.setBackgroundColor(bgColor);
      }

      if (bottomBarColor) {
        webApp.setBottomBarColor?.(bottomBarColor);
      }
    };

    webApp.ready();
    webApp.expand();
    webApp.disableVerticalSwipes?.();
    webApp.lockOrientation?.();
    syncTheme();

    webApp.onEvent?.("themeChanged", syncTheme);

    return () => {
      webApp.offEvent?.("themeChanged", syncTheme);
    };
  }, []);

  return <>{children}</>;
}
