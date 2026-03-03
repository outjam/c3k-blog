import { NextResponse } from "next/server";

import { isShopAdminTelegramUser } from "@/lib/shop-admin";
import { extractTelegramInitDataFromRequest, verifyTelegramInitData } from "@/lib/server/telegram-init-data";

export interface ShopApiAuth {
  telegramUserId: number;
  firstName: string;
  lastName: string;
  username: string;
  isAdmin: boolean;
}

export const getShopApiAuth = (request: Request): ShopApiAuth | null => {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;

  if (!botToken) {
    return null;
  }

  const initData = extractTelegramInitDataFromRequest(request);

  if (!initData) {
    return null;
  }

  const verified = verifyTelegramInitData(initData, botToken);

  if (!verified) {
    return null;
  }

  return {
    telegramUserId: verified.user.id,
    firstName: verified.user.first_name ?? "",
    lastName: verified.user.last_name ?? "",
    username: verified.user.username ?? "",
    isAdmin: isShopAdminTelegramUser(verified.user.id),
  };
};

export const unauthorizedResponse = (message = "Unauthorized") => {
  return NextResponse.json({ error: message }, { status: 401 });
};

export const forbiddenResponse = (message = "Forbidden") => {
  return NextResponse.json({ error: message }, { status: 403 });
};
