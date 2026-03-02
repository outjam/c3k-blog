import { notFound } from "next/navigation";

import { getShopProductBySlug, SHOP_PRODUCTS } from "@/data/shop-products";

import { ShopProductPageClient } from "./shop-product-page-client";

export function generateStaticParams() {
  return SHOP_PRODUCTS.map((product) => ({ slug: product.slug }));
}

export default async function ShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = getShopProductBySlug(slug);

  if (!product) {
    notFound();
  }

  return <ShopProductPageClient product={product} />;
}
