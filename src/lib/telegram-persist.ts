import { getTelegramWebApp } from "@/lib/telegram";

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

    if (l > r) return true;
    if (l < r) return false;
  }

  return true;
};

const canUseCloudStorage = (): boolean => {
  const webApp = getTelegramWebApp();
  return Boolean(webApp?.CloudStorage) && isVersionGte(webApp?.version, "6.9");
};

export const readPersistedString = async (key: string): Promise<string | null> => {
  const webApp = getTelegramWebApp();

  if (canUseCloudStorage()) {
    return new Promise((resolve) => {
      try {
        webApp?.CloudStorage?.getItem(key, (_error, value) => resolve(value ?? null));
      } catch {
        resolve(null);
      }
    });
  }

  return window.localStorage.getItem(key);
};

export const writePersistedString = async (key: string, value: string): Promise<void> => {
  const webApp = getTelegramWebApp();

  if (canUseCloudStorage()) {
    await new Promise<void>((resolve) => {
      try {
        webApp?.CloudStorage?.setItem(key, value, () => resolve());
      } catch {
        resolve();
      }
    });
  }

  window.localStorage.setItem(key, value);
};
