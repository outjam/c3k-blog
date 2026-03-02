export type ShopCategory = "figurine" | "vase" | "mug" | "lamp" | "plate";
export type DeliveryMethod = "yandex_go" | "cdek";
export type ShopOrderStatus = "processing" | "delivering" | "completed" | "payment_failed";

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
  image: string;
  priceStars: number;
  oldPriceStars?: number;
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
  priceStars: number;
}

export interface ShopOrder {
  id: string;
  createdAt: string;
  status: ShopOrderStatus;
  totalStars: number;
  deliveryFeeStars: number;
  discountStars: number;
  delivery: DeliveryMethod;
  address: string;
  customerName: string;
  phone: string;
  comment: string;
  items: ShopOrderItem[];
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
