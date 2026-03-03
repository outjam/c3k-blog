const DEFAULT_ADMIN_ID = 1693883;

const parseAdminIds = (): number[] => {
  const raw = process.env.NEXT_PUBLIC_SHOP_ADMIN_TELEGRAM_IDS;

  if (!raw) {
    return [DEFAULT_ADMIN_ID];
  }

  const parsed = raw
    .split(",")
    .map((item) => Number.parseInt(item.trim(), 10))
    .filter((value) => Number.isFinite(value) && value > 0);

  if (!parsed.includes(DEFAULT_ADMIN_ID)) {
    parsed.push(DEFAULT_ADMIN_ID);
  }

  return Array.from(new Set(parsed));
};

export const isShopAdminUserClient = (telegramUserId: number | undefined): boolean => {
  if (!telegramUserId) {
    return false;
  }

  return parseAdminIds().includes(telegramUserId);
};
