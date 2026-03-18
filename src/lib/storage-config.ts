const parseBooleanFlag = (value: string | undefined, fallback = false): boolean => {
  if (typeof value !== "string") {
    return fallback;
  }

  switch (value.trim().toLowerCase()) {
    case "1":
    case "true":
    case "yes":
    case "on":
      return true;
    case "0":
    case "false":
    case "no":
    case "off":
      return false;
    default:
      return fallback;
  }
};

export const C3K_STORAGE_ENABLED = parseBooleanFlag(
  process.env.NEXT_PUBLIC_C3K_STORAGE_ENABLED ?? process.env.C3K_STORAGE_ENABLED,
  false,
);

export const C3K_STORAGE_DESKTOP_CLIENT_ENABLED = parseBooleanFlag(
  process.env.NEXT_PUBLIC_C3K_STORAGE_DESKTOP_CLIENT_ENABLED ?? process.env.C3K_STORAGE_DESKTOP_CLIENT_ENABLED,
  false,
);

export const C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED = parseBooleanFlag(
  process.env.NEXT_PUBLIC_C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED ?? process.env.C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED,
  false,
);

export const C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED = parseBooleanFlag(
  process.env.C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED,
  false,
);

export const getC3kStorageConfig = () => {
  return {
    enabled: C3K_STORAGE_ENABLED,
    desktopClientEnabled: C3K_STORAGE_DESKTOP_CLIENT_ENABLED,
    tonSiteDesktopGatewayEnabled: C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED,
    telegramBotDeliveryEnabled: C3K_STORAGE_TELEGRAM_BOT_DELIVERY_ENABLED,
  };
};
