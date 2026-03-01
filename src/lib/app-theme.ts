import { applyTelegramChromeColorsFromCssVars, getTelegramWebApp } from "@/lib/telegram";
import type { TelegramWebApp } from "@/types/telegram";

export type AppTheme = "light" | "dark";

export const APP_THEME_STORAGE_KEY = "c3k-app-theme";

export const isAppTheme = (value: string | null | undefined): value is AppTheme => {
  return value === "light" || value === "dark";
};

const parseVersion = (value: string | undefined): number[] => {
  if (!value) {
    return [0];
  }

  return value
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isNaN(part) ? 0 : part));
};

const isVersionGte = (value: string | undefined, target: string): boolean => {
  const left = parseVersion(value);
  const right = parseVersion(target);
  const max = Math.max(left.length, right.length);

  for (let index = 0; index < max; index += 1) {
    const l = left[index] ?? 0;
    const r = right[index] ?? 0;

    if (l > r) {
      return true;
    }

    if (l < r) {
      return false;
    }
  }

  return true;
};

const canUseCloudStorage = (webApp: TelegramWebApp | null): boolean => {
  return Boolean(webApp?.CloudStorage) && isVersionGte(webApp?.version, "6.9");
};

const readFromTelegramStorage = (webApp: TelegramWebApp | null): Promise<AppTheme | null> => {
  if (!canUseCloudStorage(webApp)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    try {
      webApp.CloudStorage?.getItem(APP_THEME_STORAGE_KEY, (_error, value) => {
        resolve(isAppTheme(value ?? null) ? value : null);
      });
    } catch {
      resolve(null);
    }
  });
};

const writeToTelegramStorage = (webApp: TelegramWebApp | null, theme: AppTheme): Promise<void> => {
  if (!canUseCloudStorage(webApp)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    try {
      webApp.CloudStorage?.setItem(APP_THEME_STORAGE_KEY, theme, () => resolve());
    } catch {
      resolve();
    }
  });
};

export const resolveSystemTheme = (): AppTheme => {
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

export const resolveAutoTheme = (): AppTheme => {
  const webApp = getTelegramWebApp();

  if (webApp?.colorScheme === "light" || webApp?.colorScheme === "dark") {
    return webApp.colorScheme;
  }

  return resolveSystemTheme();
};

export const applyAppTheme = (theme: AppTheme): void => {
  const root = document.documentElement;
  root.setAttribute("data-app-theme", theme);
  root.style.colorScheme = theme;

  const webApp = getTelegramWebApp();

  if (webApp) {
    applyTelegramChromeColorsFromCssVars(webApp);
  }
};

export const readThemePreference = async (): Promise<AppTheme | null> => {
  const webApp = getTelegramWebApp();
  const fromTelegram = await readFromTelegramStorage(webApp);

  if (fromTelegram) {
    return fromTelegram;
  }

  const local = window.localStorage.getItem(APP_THEME_STORAGE_KEY);
  return isAppTheme(local) ? local : null;
};

export const saveThemePreference = async (theme: AppTheme): Promise<void> => {
  const webApp = getTelegramWebApp();
  await writeToTelegramStorage(webApp, theme);
  window.localStorage.setItem(APP_THEME_STORAGE_KEY, theme);
};
