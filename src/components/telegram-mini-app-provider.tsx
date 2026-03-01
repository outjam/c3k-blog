"use client";

import { useEffect } from "react";

import { applyTelegramChromeColorsFromCssVars, getTelegramWebApp } from "@/lib/telegram";
import { applyAppTheme, readThemePreference, resolveAutoTheme } from "@/lib/app-theme";

export function TelegramMiniAppProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const webApp = getTelegramWebApp();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    let hasManualTheme = false;

    const syncAutoTheme = () => {
      if (!hasManualTheme) {
        applyAppTheme(resolveAutoTheme());
      }
    };

    const syncTelegramChrome = () => {
      if (webApp) {
        applyTelegramChromeColorsFromCssVars(webApp);
      }
    };

    applyAppTheme(resolveAutoTheme());

    void readThemePreference().then((savedTheme) => {
      if (savedTheme) {
        hasManualTheme = true;
        applyAppTheme(savedTheme);
      }
    });

    mediaQuery.addEventListener("change", syncAutoTheme);

    if (!webApp) {
      return () => {
        mediaQuery.removeEventListener("change", syncAutoTheme);
      };
    }

    const syncTheme = () => {
      syncAutoTheme();
      syncTelegramChrome();
    };

    webApp.ready();
    webApp.expand();
    webApp.disableVerticalSwipes?.();
    webApp.lockOrientation?.();
    syncTheme();

    webApp.onEvent?.("themeChanged", syncTheme);

    return () => {
      mediaQuery.removeEventListener("change", syncAutoTheme);
      webApp.offEvent?.("themeChanged", syncTheme);
    };
  }, []);

  return <>{children}</>;
}
