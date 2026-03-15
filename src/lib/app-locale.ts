import { getTelegramWebApp } from "@/lib/telegram";
import type { TelegramWebApp } from "@/types/telegram";

export type AppLocale = "ru" | "en" | "kk";

export const APP_LOCALE_STORAGE_KEY = "c3k-app-locale";

export const APP_LOCALE_OPTIONS: Array<{ value: AppLocale; label: string }> = [
  { value: "ru", label: "Русский" },
  { value: "en", label: "English" },
  { value: "kk", label: "Qazaqsha" },
];

export const isAppLocale = (value: string | null | undefined): value is AppLocale => {
  return value === "ru" || value === "en" || value === "kk";
};

const canUseCloudStorage = (webApp: TelegramWebApp | null): boolean => {
  return Boolean(webApp?.CloudStorage);
};

const readFromTelegramStorage = (webApp: TelegramWebApp | null): Promise<AppLocale | null> => {
  if (!canUseCloudStorage(webApp)) {
    return Promise.resolve(null);
  }

  return new Promise((resolve) => {
    const storage = webApp?.CloudStorage;

    if (!storage) {
      resolve(null);
      return;
    }

    try {
      storage.getItem(APP_LOCALE_STORAGE_KEY, (_error, value) => {
        const normalizedValue = value ?? null;
        resolve(isAppLocale(normalizedValue) ? normalizedValue : null);
      });
    } catch {
      resolve(null);
    }
  });
};

const writeToTelegramStorage = (webApp: TelegramWebApp | null, locale: AppLocale): Promise<void> => {
  if (!canUseCloudStorage(webApp)) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const storage = webApp?.CloudStorage;

    if (!storage) {
      resolve();
      return;
    }

    try {
      storage.setItem(APP_LOCALE_STORAGE_KEY, locale, () => resolve());
    } catch {
      resolve();
    }
  });
};

export const resolveAutoLocale = (): AppLocale => {
  const webApp = getTelegramWebApp();
  const fromTelegram = webApp?.initDataUnsafe?.user?.language_code;

  if (isAppLocale(fromTelegram)) {
    return fromTelegram;
  }

  const browserLanguage = window.navigator.language.slice(0, 2).toLowerCase();
  return isAppLocale(browserLanguage) ? browserLanguage : "ru";
};

export const applyAppLocale = (locale: AppLocale): void => {
  document.documentElement.setAttribute("lang", locale);
  document.documentElement.setAttribute("data-app-locale", locale);
};

export const readLocalePreference = async (): Promise<AppLocale | null> => {
  const webApp = getTelegramWebApp();
  const fromTelegram = await readFromTelegramStorage(webApp);

  if (fromTelegram) {
    return fromTelegram;
  }

  const local = window.localStorage.getItem(APP_LOCALE_STORAGE_KEY);
  return isAppLocale(local) ? local : null;
};

export const saveLocalePreference = async (locale: AppLocale): Promise<void> => {
  const webApp = getTelegramWebApp();
  await writeToTelegramStorage(webApp, locale);
  window.localStorage.setItem(APP_LOCALE_STORAGE_KEY, locale);
};
