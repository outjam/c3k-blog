const DEFAULT_ADMIN_TELEGRAM_ID = 1693883;

const parseAdminIds = (raw: string | undefined): number[] => {
  if (!raw) {
    return [DEFAULT_ADMIN_TELEGRAM_ID];
  }

  const parsed = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!parsed.includes(DEFAULT_ADMIN_TELEGRAM_ID)) {
    parsed.push(DEFAULT_ADMIN_TELEGRAM_ID);
  }

  return Array.from(new Set(parsed));
};

export const getShopAdminTelegramIds = (): number[] => {
  return parseAdminIds(process.env.SHOP_ADMIN_TELEGRAM_IDS || process.env.NEXT_PUBLIC_SHOP_ADMIN_TELEGRAM_IDS);
};

export const isShopAdminTelegramUser = (telegramUserId: number): boolean => {
  return getShopAdminTelegramIds().includes(telegramUserId);
};
