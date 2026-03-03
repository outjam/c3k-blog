const parseAdminIds = (): number[] => {
  const raw = process.env.NEXT_PUBLIC_SHOP_ADMIN_TELEGRAM_IDS;

  if (!raw) {
    return [];
  }

  const parsed = raw
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  return Array.from(new Set(parsed));
};

export const isShopAdminUserClient = (telegramUserId: number | undefined): boolean => {
  if (!telegramUserId) {
    return false;
  }

  return parseAdminIds().includes(telegramUserId);
};
