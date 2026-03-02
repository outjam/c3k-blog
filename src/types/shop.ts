export type ShopCategory = "figurine" | "vase" | "mug" | "lamp" | "plate";
export type DeliveryMethod = "yandex_go" | "cdek";

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
  priceRub: number;
  priceStars: number;
  oldPriceRub?: number;
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
