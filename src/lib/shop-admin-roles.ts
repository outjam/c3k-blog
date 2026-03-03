import type { ShopAdminPermission, ShopAdminRole } from "@/types/shop";

export const SHOP_ADMIN_ROLE_LABELS: Record<ShopAdminRole, string> = {
  owner: "Владелец",
  admin: "Администратор",
  orders: "Менеджер заказов",
  catalog: "Контент-менеджер",
  support: "Поддержка",
};

const ALL_PERMISSIONS: ShopAdminPermission[] = [
  "dashboard:view",
  "orders:view",
  "orders:manage",
  "customers:view",
  "blog:view",
  "blog:manage",
  "products:view",
  "products:manage",
  "promos:view",
  "promos:manage",
  "settings:view",
  "settings:manage",
  "admins:view",
  "admins:manage",
];

const ROLE_PERMISSIONS: Record<ShopAdminRole, ShopAdminPermission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS.filter((permission) => permission !== "admins:manage"),
  orders: ["dashboard:view", "orders:view", "orders:manage", "customers:view"],
  catalog: [
    "dashboard:view",
    "blog:view",
    "blog:manage",
    "products:view",
    "products:manage",
    "promos:view",
    "promos:manage",
    "settings:view",
  ],
  support: ["dashboard:view", "orders:view", "customers:view", "blog:view"],
};

export const getRolePermissions = (role: ShopAdminRole): ShopAdminPermission[] => {
  return ROLE_PERMISSIONS[role] ?? [];
};

export const hasRolePermission = (role: ShopAdminRole, permission: ShopAdminPermission): boolean => {
  return getRolePermissions(role).includes(permission);
};

export const isShopAdminRole = (value: string): value is ShopAdminRole => {
  return value === "owner" || value === "admin" || value === "orders" || value === "catalog" || value === "support";
};
