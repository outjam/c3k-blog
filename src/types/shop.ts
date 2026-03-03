export type ShopCategory = string;
export type DeliveryMethod = "yandex_go" | "cdek";
export type PromoDiscountType = "percent" | "fixed";
export type ShopAdminRole = "owner" | "admin" | "orders" | "catalog" | "support";
export type ShopAdminPermission =
  | "dashboard:view"
  | "orders:view"
  | "orders:manage"
  | "customers:view"
  | "blog:view"
  | "blog:manage"
  | "products:view"
  | "products:manage"
  | "promos:view"
  | "promos:manage"
  | "settings:view"
  | "settings:manage"
  | "admins:view"
  | "admins:manage";
export type ShopOrderStatus =
  | "created"
  | "pending_payment"
  | "awaiting_payment"
  | "payment_pending"
  | "paid"
  | "processing"
  | "confirmed"
  | "packed"
  | "ready_to_ship"
  | "shipped"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "completed"
  | "cancel_requested"
  | "cancelled_by_user"
  | "cancelled_by_admin"
  | "refund_requested"
  | "refunded"
  | "payment_failed"
  | "failed";

export type ShopOrderHistoryActor = "user" | "admin" | "system" | "bot";

export type ShopOrderPaymentStatus = "created" | "pending_payment" | "paid" | "failed";

export interface ShopOrderPaymentMeta {
  currency: string;
  amount: number;
  invoicePayloadHash: string;
  invoicePayload?: string;
  telegramPaymentChargeId?: string;
  providerPaymentChargeId?: string;
  status: ShopOrderPaymentStatus;
  updatedAt: string;
}

export interface ShopOrderHistoryItem {
  id: string;
  at: string;
  fromStatus: ShopOrderStatus | null;
  toStatus: ShopOrderStatus;
  actor: ShopOrderHistoryActor;
  actorTelegramId?: number;
  note?: string;
}

export interface ShopProductOverride {
  productId: string;
  priceStarsCents?: number;
  stock?: number;
  isPublished?: boolean;
  isFeatured?: boolean;
  badge?: string;
  categoryId?: string;
  subcategoryId?: string;
  updatedAt: string;
}

export interface ShopProductSubcategory {
  id: string;
  label: string;
  description?: string;
  order: number;
}

export interface ShopProductCategory {
  id: string;
  label: string;
  emoji?: string;
  description?: string;
  order: number;
  subcategories: ShopProductSubcategory[];
}

export interface ShopPromoCode {
  code: string;
  label: string;
  discountType: PromoDiscountType;
  discountValue: number;
  minSubtotalStarsCents: number;
  active: boolean;
  usageLimit?: number;
  usedCount: number;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShopAppSettings {
  shopEnabled: boolean;
  checkoutEnabled: boolean;
  maintenanceMode: boolean;
  defaultDeliveryFeeStarsCents: number;
  freeDeliveryThresholdStarsCents: number;
  updatedAt: string;
}

export interface ShopAdminMember {
  telegramUserId: number;
  role: ShopAdminRole;
  username?: string;
  firstName?: string;
  lastName?: string;
  disabled?: boolean;
  addedByTelegramId?: number;
  addedAt: string;
  updatedAt: string;
}

export interface ShopAdminConfig {
  adminMembers: ShopAdminMember[];
  productRecords: Record<string, ShopProduct>;
  productOverrides: Record<string, ShopProductOverride>;
  productCategories: ShopProductCategory[];
  blogPostRecords: Record<string, import("@/types/blog").BlogPost>;
  hiddenPostSlugs: string[];
  promoCodes: ShopPromoCode[];
  settings: ShopAppSettings;
  updatedAt: string;
}

export interface ShopProductAttribute {
  material: string;
  technique: string;
  color: string;
  heightCm: number;
  widthCm: number;
  weightGr: number;
  collection: string;
  sku: string;
  stock: number;
}

export interface ShopProduct {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  category: ShopCategory;
  categoryId?: string;
  subcategoryId?: string;
  categoryLabel?: string;
  subcategoryLabel?: string;
  image: string;
  priceStarsCents: number;
  oldPriceStarsCents?: number;
  rating: number;
  reviewsCount: number;
  isNew: boolean;
  isHit: boolean;
  tags: string[];
  attributes: ShopProductAttribute;
}

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface CartState {
  items: CartItem[];
  promoCode: string;
}

export interface ShopOrderItem {
  productId: string;
  title: string;
  quantity: number;
  priceStarsCents: number;
}

export interface ShopOrder {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: ShopOrderStatus;
  invoiceStars: number;
  totalStarsCents: number;
  deliveryFeeStarsCents: number;
  discountStarsCents: number;
  delivery: DeliveryMethod;
  promoCode?: string;
  address: string;
  customerName: string;
  phone: string;
  email?: string;
  comment: string;
  telegramUserId: number;
  telegramUsername?: string;
  telegramFirstName?: string;
  telegramLastName?: string;
  payment?: ShopOrderPaymentMeta;
  items: ShopOrderItem[];
  history: ShopOrderHistoryItem[];
}

export interface CheckoutFormValues {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  comment: string;
  delivery: DeliveryMethod;
}

export type ProductSort = "popular" | "price_asc" | "price_desc" | "rating" | "new";
