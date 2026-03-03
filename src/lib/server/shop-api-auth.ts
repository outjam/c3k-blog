import { NextResponse } from "next/server";

import { isShopAdminTelegramUser } from "@/lib/shop-admin";
import { canAccessAdminPermission, resolveShopAdminAccess } from "@/lib/server/shop-admin-access";
import { extractTelegramInitDataFromRequest, verifyTelegramInitData } from "@/lib/server/telegram-init-data";
import type { ShopAdminPermission, ShopAdminRole } from "@/types/shop";

export interface ShopApiAuth {
  telegramUserId: number;
  firstName: string;
  lastName: string;
  username: string;
  isAdmin: boolean;
}

export interface ShopApiAccess extends ShopApiAuth {
  adminRole: ShopAdminRole | null;
  adminPermissions: ShopAdminPermission[];
}

const SHOP_AUTH_DEBUG = process.env.SHOP_AUTH_DEBUG === "1";

const logShopAuthDebug = (message: string, request?: Request) => {
  if (!SHOP_AUTH_DEBUG) {
    return;
  }

  const url = request ? new URL(request.url).pathname : "";
  console.warn(`[shop-auth] ${message}${url ? ` (${url})` : ""}`);
};

export const getShopApiAuth = (request: Request): ShopApiAuth | null => {
  const botToken = (process.env.TELEGRAM_BOT_TOKEN ?? process.env.BOT_TOKEN ?? "").trim();

  if (!botToken) {
    logShopAuthDebug("missing bot token env", request);
    return null;
  }

  const initData = extractTelegramInitDataFromRequest(request);

  if (!initData) {
    logShopAuthDebug("missing x-telegram-init-data header", request);
    return null;
  }

  const verified = verifyTelegramInitData(initData, botToken);

  if (!verified) {
    logShopAuthDebug("invalid telegram initData signature/hash", request);
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

export const getShopApiAccess = async (request: Request): Promise<ShopApiAccess | null> => {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return null;
  }

  const adminAccess = await resolveShopAdminAccess(auth.telegramUserId);

  return {
    ...auth,
    isAdmin: Boolean(adminAccess),
    adminRole: adminAccess?.role ?? null,
    adminPermissions: adminAccess?.permissions ?? [],
  };
};

export const hasAdminPermission = (auth: ShopApiAccess, permission: ShopAdminPermission): boolean => {
  if (!auth.isAdmin || !auth.adminRole) {
    return false;
  }

  return canAccessAdminPermission(auth.adminRole, permission);
};

export const unauthorizedResponse = (message = "Unauthorized") => {
  return NextResponse.json({ error: message }, { status: 401 });
};

export const forbiddenResponse = (message = "Forbidden") => {
  return NextResponse.json({ error: message }, { status: 403 });
};
