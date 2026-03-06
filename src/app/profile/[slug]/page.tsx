import { PublicProfilePageClient } from "./public-profile-page-client";

export const dynamic = "force-dynamic";

export default async function PublicProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PublicProfilePageClient slug={slug} />;
}
