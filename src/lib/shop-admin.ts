const parseAdminIds = (raw: string | undefined): number[] => {
  if (!raw) {
    return [];
  }

  const parsed = raw
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  return Array.from(new Set(parsed));
};

export const getShopAdminTelegramIds = (): number[] => {
  return parseAdminIds(process.env.SHOP_ADMIN_TELEGRAM_IDS || process.env.NEXT_PUBLIC_SHOP_ADMIN_TELEGRAM_IDS);
};

export const getShopAdminOwnerTelegramId = (): number | null => {
  const ids = getShopAdminTelegramIds();
  return ids.length > 0 ? (ids[0] as number) : null;
};

export const isShopAdminTelegramUser = (telegramUserId: number): boolean => {
  return getShopAdminTelegramIds().includes(telegramUserId);
};
