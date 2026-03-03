import { getTelegramWebApp } from "@/lib/telegram";

export const getTelegramInitData = (): string => {
  return getTelegramWebApp()?.initData?.trim() ?? "";
};

export const getTelegramAuthHeaders = (): HeadersInit => {
  const initData = getTelegramInitData();

  if (!initData) {
    return {};
  }

  return {
    "x-telegram-init-data": initData,
  };
};
