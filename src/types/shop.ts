export type ShopCategory = string;
export type DeliveryMethod = "digital_download" | "yandex_go" | "cdek";
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
  | "admins:manage"
  | "artists:view"
  | "artists:manage"
  | "showcase:view"
  | "showcase:manage"
  | "storage:view"
  | "storage:manage";
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

export type ArtistProfileStatus = "pending" | "approved" | "rejected" | "suspended";
export type ArtistApplicationStatus = "pending" | "needs_info" | "approved" | "rejected";
export type ArtistTrackStatus = "draft" | "pending_moderation" | "published" | "rejected";
export type ArtistSubscriptionStatus = "active" | "paused" | "cancelled";
export type ArtistReleaseType = "single" | "ep" | "album";
export type ArtistAudioFormat = "mp3" | "aac" | "flac" | "wav" | "alac" | "ogg";
export type ArtistPayoutRequestStatus = "pending_review" | "approved" | "rejected" | "paid";
export type ArtistEarningSource = "release_sale" | "donation" | "subscription";
export type ArtistPayoutAuditActor = "artist" | "admin" | "system";
export type ArtistPayoutAuditAction = "requested" | "status_changed" | "note_updated";

export interface ArtistTrackFormat {
  format: ArtistAudioFormat;
  audioFileId: string;
  priceStarsCents: number;
  label?: string;
  isDefault?: boolean;
}

export interface ArtistReleaseTrackItem {
  id: string;
  title: string;
  durationSec?: number;
  previewUrl?: string;
  priceStarsCents?: number;
  position: number;
}

export interface ArtistProfile {
  telegramUserId: number;
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  coverUrl?: string;
  tonWalletAddress?: string;
  status: ArtistProfileStatus;
  moderationNote?: string;
  donationEnabled: boolean;
  subscriptionEnabled: boolean;
  subscriptionPriceStarsCents: number;
  balanceStarsCents: number;
  lifetimeEarningsStarsCents: number;
  followersCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ArtistApplication {
  id: string;
  telegramUserId: number;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  coverUrl?: string;
  tonWalletAddress?: string;
  referenceLinks: string[];
  note?: string;
  status: ArtistApplicationStatus;
  moderationNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
}

export interface ArtistEarningLedgerEntry {
  id: string;
  artistTelegramUserId: number;
  source: ArtistEarningSource;
  sourceId: string;
  orderId?: string;
  buyerTelegramUserId?: number;
  amountStarsCents: number;
  earnedAt: string;
  holdUntil: string;
}

export interface ArtistPayoutRequest {
  id: string;
  artistTelegramUserId: number;
  tonWalletAddress: string;
  amountStarsCents: number;
  note?: string;
  status: ArtistPayoutRequestStatus;
  adminNote?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string;
  reviewedByTelegramUserId?: number;
  paidAt?: string;
}

export interface ArtistPayoutAuditEntry {
  id: string;
  payoutRequestId: string;
  artistTelegramUserId: number;
  actor: ArtistPayoutAuditActor;
  actorTelegramUserId?: number;
  action: ArtistPayoutAuditAction;
  statusBefore?: ArtistPayoutRequestStatus;
  statusAfter?: ArtistPayoutRequestStatus;
  note?: string;
  createdAt: string;
}

export interface ArtistPayoutSummary {
  availableStarsCents: number;
  pendingHoldStarsCents: number;
  requestedStarsCents: number;
  paidOutStarsCents: number;
  minimumRequestStarsCents: number;
  canRequest: boolean;
  nextHoldReleaseAt?: string;
}

export interface ArtistStudioStats {
  releasesCount: number;
  publishedReleasesCount: number;
  pendingReleasesCount: number;
  draftReleasesCount: number;
  salesCount: number;
  playsCount: number;
  reactionsCount: number;
  commentsCount: number;
  donationsCount: number;
  activeSubscriptionsCount: number;
}

export interface ArtistTrack {
  id: string;
  slug: string;
  artistTelegramUserId: number;
  title: string;
  releaseType: ArtistReleaseType;
  subtitle: string;
  description: string;
  coverImage: string;
  formats: ArtistTrackFormat[];
  releaseTracklist: ArtistReleaseTrackItem[];
  audioFileId: string;
  previewUrl?: string;
  durationSec: number;
  genre?: string;
  tags: string[];
  priceStarsCents: number;
  isMintable?: boolean;
  status: ArtistTrackStatus;
  moderationNote?: string;
  playsCount: number;
  salesCount: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

export interface ArtistDonation {
  id: string;
  artistTelegramUserId: number;
  fromTelegramUserId: number;
  amountStarsCents: number;
  message?: string;
  createdAt: string;
}

export interface ArtistSubscription {
  id: string;
  artistTelegramUserId: number;
  subscriberTelegramUserId: number;
  amountStarsCents: number;
  status: ArtistSubscriptionStatus;
  startedAt: string;
  updatedAt: string;
}

export interface ShowcaseCollection {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverImage?: string;
  productIds: string[];
  trackIds: string[];
  order: number;
  isPublished: boolean;
}

export interface ShopCatalogArtist {
  telegramUserId: number;
  slug: string;
  displayName: string;
  bio: string;
  avatarUrl?: string;
  coverUrl?: string;
  followersCount: number;
  tracksCount: number;
  totalSalesCount: number;
  subscriptionEnabled: boolean;
  subscriptionPriceStarsCents: number;
}

export interface ShopAdminConfig {
  adminMembers: ShopAdminMember[];
  productRecords: Record<string, ShopProduct>;
  productOverrides: Record<string, ShopProductOverride>;
  productCategories: ShopProductCategory[];
  artistApplications: Record<string, ArtistApplication>;
  artistProfiles: Record<string, ArtistProfile>;
  artistTracks: Record<string, ArtistTrack>;
  showcaseCollections: ShowcaseCollection[];
  artistDonations: ArtistDonation[];
  artistSubscriptions: ArtistSubscription[];
  artistEarningsLedger: ArtistEarningLedgerEntry[];
  artistPayoutRequests: ArtistPayoutRequest[];
  artistPayoutAuditLog: ArtistPayoutAuditEntry[];
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
  kind?: "physical" | "digital_track";
  artistTelegramUserId?: number;
  artistName?: string;
  artistSlug?: string;
  releaseType?: ArtistReleaseType;
  formats?: ArtistTrackFormat[];
  releaseTracklist?: ArtistReleaseTrackItem[];
  isMintable?: boolean;
  audioFileId?: string;
  previewUrl?: string;
  publishedAt?: string;
  attributes: ShopProductAttribute;
}

export interface ShopShowcaseCollectionView {
  id: string;
  title: string;
  subtitle?: string;
  description?: string;
  coverImage?: string;
  order: number;
  products: ShopProduct[];
}

export interface CartItem {
  productId: string;
  quantity: number;
  selectedFormat?: ArtistAudioFormat;
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
