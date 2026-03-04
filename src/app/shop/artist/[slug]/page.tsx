import { ShopArtistPageClient } from "./shop-artist-page-client";

export const dynamic = "force-dynamic";

export default async function ShopArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <ShopArtistPageClient slug={slug} />;
}
