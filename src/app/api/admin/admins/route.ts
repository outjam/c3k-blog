import { NextResponse } from "next/server";

import { DEFAULT_ADMIN_TELEGRAM_ID } from "@/lib/shop-admin";
import { isShopAdminRole } from "@/lib/shop-admin-roles";
import {
  forbiddenResponse,
  getShopApiAccess,
  hasAdminPermission,
  requireJsonRequest,
  unauthorizedResponse,
} from "@/lib/server/shop-api-auth";
import { mutateShopAdminConfig, readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ShopAdminMember, ShopAdminRole } from "@/types/shop";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface AdminUpsertBody {
  telegramUserId?: number;
  role?: ShopAdminRole;
  username?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  disabled?: boolean;
}

interface AdminDeleteBody {
  telegramUserId?: number;
}

const normalizeTelegramUserId = (value: unknown): number => {
  const normalized = Math.round(Number(value ?? 0));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
};

const normalizeString = (value: unknown, maxLength: number): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
};

const sanitizeMember = (
  source: ShopAdminMember,
  actorTelegramUserId: number,
  nowIso: string,
  incoming?: AdminUpsertBody,
): ShopAdminMember => {
  const next: ShopAdminMember = {
    ...source,
    role: source.telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? "owner" : source.role,
    disabled: source.telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? false : source.disabled,
    updatedAt: nowIso,
  };

  if (incoming) {
    const incomingRole = typeof incoming.role === "string" ? incoming.role : "";
    const nextRole: ShopAdminRole = isShopAdminRole(incomingRole) ? incomingRole : source.role;
    next.role = source.telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? "owner" : nextRole;
    next.username = normalizeString(incoming.username, 64)?.replace(/^@/, "") ?? source.username;
    next.firstName = normalizeString(incoming.firstName, 80) ?? source.firstName;
    next.lastName = normalizeString(incoming.lastName, 80) ?? source.lastName;
    next.disabled = source.telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID ? false : Boolean(incoming.disabled);
  }

  if (!next.addedByTelegramId) {
    next.addedByTelegramId = actorTelegramUserId;
  }

  if (!next.addedAt) {
    next.addedAt = nowIso;
  }

  return next;
};

export async function GET(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "admins:view")) {
    return forbiddenResponse();
  }

  const config = await readShopAdminConfig();
  return NextResponse.json({ admins: config.adminMembers });
}

export async function PUT(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "admins:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: AdminUpsertBody;

  try {
    payload = (await request.json()) as AdminUpsertBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = normalizeTelegramUserId(payload.telegramUserId);

  if (!telegramUserId) {
    return NextResponse.json({ error: "Invalid telegramUserId" }, { status: 400 });
  }

  if (!isShopAdminRole(String(payload.role ?? ""))) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const config = await mutateShopAdminConfig((current) => {
    const admins = [...current.adminMembers];
    const index = admins.findIndex((member) => member.telegramUserId === telegramUserId);

    if (index >= 0) {
      admins[index] = sanitizeMember(admins[index] as ShopAdminMember, auth.telegramUserId, now, payload);
    } else {
      const created: ShopAdminMember = sanitizeMember(
        {
          telegramUserId,
          role: payload.role as ShopAdminRole,
          username: normalizeString(payload.username, 64)?.replace(/^@/, ""),
          firstName: normalizeString(payload.firstName, 80),
          lastName: normalizeString(payload.lastName, 80),
          disabled: Boolean(payload.disabled),
          addedByTelegramId: auth.telegramUserId,
          addedAt: now,
          updatedAt: now,
        },
        auth.telegramUserId,
        now,
      );
      admins.unshift(created);
    }

    return {
      ...current,
      adminMembers: admins,
      updatedAt: now,
    };
  });

  return NextResponse.json({ admins: config.adminMembers });
}

export async function DELETE(request: Request) {
  const auth = await getShopApiAccess(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  if (!hasAdminPermission(auth, "admins:manage")) {
    return forbiddenResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  let payload: AdminDeleteBody;

  try {
    payload = (await request.json()) as AdminDeleteBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const telegramUserId = normalizeTelegramUserId(payload.telegramUserId);

  if (!telegramUserId) {
    return NextResponse.json({ error: "Invalid telegramUserId" }, { status: 400 });
  }

  if (telegramUserId === DEFAULT_ADMIN_TELEGRAM_ID) {
    return NextResponse.json({ error: "Default owner cannot be removed" }, { status: 409 });
  }

  if (telegramUserId === auth.telegramUserId) {
    return NextResponse.json({ error: "You cannot remove yourself" }, { status: 409 });
  }

  const now = new Date().toISOString();
  const config = await mutateShopAdminConfig((current) => ({
    ...current,
    adminMembers: current.adminMembers.filter((member) => member.telegramUserId !== telegramUserId),
    updatedAt: now,
  }));

  return NextResponse.json({ admins: config.adminMembers });
}
