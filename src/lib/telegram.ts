import type { HapticImpactStyle, HapticNotificationType, TelegramWebApp, TelegramWindow } from "@/types/telegram";

const toRgba = (hexColor: string | undefined, alpha: number, fallback: string): string => {
  if (!hexColor || !hexColor.startsWith("#")) {
    return fallback;
  }

  const normalized = hexColor.length === 4
    ? `#${hexColor[1]}${hexColor[1]}${hexColor[2]}${hexColor[2]}${hexColor[3]}${hexColor[3]}`
    : hexColor;

  const r = Number.parseInt(normalized.slice(1, 3), 16);
  const g = Number.parseInt(normalized.slice(3, 5), 16);
  const b = Number.parseInt(normalized.slice(5, 7), 16);

  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return fallback;
  }

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const getTelegramWebApp = (): TelegramWebApp | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const tgWindow = window as typeof window & TelegramWindow;
  return tgWindow.Telegram?.WebApp ?? null;
};

export const applyTelegramThemeToCssVars = (webApp: TelegramWebApp): void => {
  const root = document.documentElement;
  const params = webApp.themeParams;

  const map: Array<[string, string | undefined]> = [
    ["--tg-bg", params.bg_color],
    ["--tg-text", params.text_color],
    ["--tg-hint", params.hint_color],
    ["--tg-link", params.link_color],
    ["--tg-btn", params.button_color],
    ["--tg-btn-text", params.button_text_color],
    ["--tg-secondary-bg", params.secondary_bg_color],
    ["--tg-header-bg", params.header_bg_color],
    ["--tg-bottom-bar-bg", params.bottom_bar_bg_color],
    ["--tg-section-bg", params.section_bg_color],
    ["--tg-section-header-text", params.section_header_text_color],
    ["--tg-subtitle-text", params.subtitle_text_color],
    ["--tg-destructive-text", params.destructive_text_color],
    ["--tg-section-separator", params.section_separator_color],
    ["--tg-accent", params.accent_text_color],
  ];

  map.forEach(([name, value]) => {
    if (value) {
      root.style.setProperty(name, value);
    }
  });

  const baseBg = params.bg_color;
  const secondaryBg = params.section_bg_color ?? params.secondary_bg_color ?? params.bg_color;
  const accent = params.accent_text_color ?? params.link_color;
  const subtitle = params.subtitle_text_color ?? params.hint_color;
  const sectionSeparator = params.section_separator_color ?? params.hint_color;
  const sectionHeader = params.section_header_text_color ?? params.text_color;

  root.style.setProperty("--surface", `linear-gradient(160deg, ${secondaryBg ?? "#151a23"} 0%, ${baseBg ?? "#0d0f14"} 100%)`);
  root.style.setProperty("--card-bg", toRgba(secondaryBg, 0.66, "rgba(255, 255, 255, 0.04)"));
  root.style.setProperty("--card-border", toRgba(sectionSeparator, 0.34, "rgba(255, 255, 255, 0.08)"));
  root.style.setProperty("--tag-bg", toRgba(accent, 0.18, "rgba(107, 208, 255, 0.1)"));
  root.style.setProperty("--tag-border", toRgba(accent, 0.38, "rgba(107, 208, 255, 0.38)"));
  root.style.setProperty("--muted-text", subtitle ?? "#c2cada");
  root.style.setProperty("--subtle-text", toRgba(subtitle, 0.82, "#95a2ba"));
  root.style.setProperty("--section-heading-text", sectionHeader ?? "#f0f3fa");
  root.setAttribute("data-tg-scheme", webApp.colorScheme);
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
