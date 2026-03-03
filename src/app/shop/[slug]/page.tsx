import { notFound } from "next/navigation";

import { getCatalogSnapshot } from "@/lib/server/shop-catalog";

import { ShopProductPageClient } from "./shop-product-page-client";

export const dynamic = "force-dynamic";

export default async function ShopProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const snapshot = await getCatalogSnapshot();
  const product = snapshot.products.find((item) => item.slug === slug);

  if (!product) {
    notFound();
  }

  return <ShopProductPageClient product={product} />;
}
