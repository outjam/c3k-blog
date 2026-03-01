import type { HapticImpactStyle, HapticNotificationType, TelegramWebApp, TelegramWindow } from "@/types/telegram";

export const getTelegramWebApp = (): TelegramWebApp | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const tgWindow = window as typeof window & TelegramWindow;
  return tgWindow.Telegram?.WebApp ?? null;
};

const getCssVarValue = (root: HTMLElement, name: string): string => {
  return getComputedStyle(root).getPropertyValue(name).trim();
};

export const applyTelegramChromeColorsFromCssVars = (webApp: TelegramWebApp): void => {
  const root = document.documentElement;
  const headerColor = getCssVarValue(root, "--tg-header-bg") || getCssVarValue(root, "--tg-bg");
  const bgColor = getCssVarValue(root, "--tg-bg");
  const bottomBarColor = getCssVarValue(root, "--tg-bottom-bar-bg") || getCssVarValue(root, "--tg-bg");

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

export const hapticImpact = (style: HapticImpactStyle = "light"): void => {
  getTelegramWebApp()?.HapticFeedback.impactOccurred(style);
};

export const hapticSelection = (): void => {
  getTelegramWebApp()?.HapticFeedback.selectionChanged();
};

export const hapticNotification = (type: HapticNotificationType = "success"): void => {
  getTelegramWebApp()?.HapticFeedback.notificationOccurred(type);
};
