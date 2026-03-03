import { getRolePermissions, hasRolePermission } from "@/lib/shop-admin-roles";
import { getShopAdminOwnerTelegramId, getShopAdminTelegramIds } from "@/lib/shop-admin";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import type { ShopAdminMember, ShopAdminPermission, ShopAdminRole } from "@/types/shop";

export interface ResolvedShopAdminAccess {
  role: ShopAdminRole;
  member: ShopAdminMember;
  permissions: ShopAdminPermission[];
}

const findStaticRole = (telegramUserId: number): ShopAdminRole | null => {
  const ownerId = getShopAdminOwnerTelegramId();

  if (ownerId && telegramUserId === ownerId) {
    return "owner";
  }

  return getShopAdminTelegramIds().includes(telegramUserId) ? "admin" : null;
};

export const resolveShopAdminAccess = async (telegramUserId: number): Promise<ResolvedShopAdminAccess | null> => {
  const config = await readShopAdminConfig();
  const member = config.adminMembers.find((candidate) => candidate.telegramUserId === telegramUserId);
  const staticRole = findStaticRole(telegramUserId);
  const now = new Date().toISOString();

  if (member) {
    if (member.disabled && staticRole !== "owner") {
      return null;
    }

    const role = staticRole === "owner" ? "owner" : member.role;
    const normalizedMember: ShopAdminMember = {
      ...member,
      role,
      disabled: role === "owner" ? false : member.disabled,
      updatedAt: member.updatedAt || now,
      addedAt: member.addedAt || now,
    };

    return {
      role,
      member: normalizedMember,
      permissions: getRolePermissions(role),
    };
  }

  if (!staticRole) {
    return null;
  }

  const fallbackMember: ShopAdminMember = {
    telegramUserId,
    role: staticRole,
    disabled: false,
    addedAt: now,
    updatedAt: now,
  };

  return {
    role: staticRole,
    member: fallbackMember,
    permissions: getRolePermissions(staticRole),
  };
};

export const canAccessAdminPermission = (role: ShopAdminRole, permission: ShopAdminPermission): boolean => {
  return hasRolePermission(role, permission);
};
