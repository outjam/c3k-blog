import { NextResponse } from "next/server";

import { readArtistCatalogSnapshot } from "@/lib/server/artist-catalog-store";
import { readArtistSupportSnapshot } from "@/lib/server/artist-support-store";
import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { toArtistTrackProduct } from "@/lib/server/shop-artist-market";
import { listFollowStatsBySlugs } from "@/lib/server/social-follow-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const config = await readShopAdminConfig();
  const artistCatalog = await readArtistCatalogSnapshot({
    config,
    profileSlug: slug,
    onlyApprovedProfiles: true,
    onlyPublishedTracks: true,
  });
  const profile = artistCatalog.profiles[0] ?? null;

  if (!profile) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  const tracks = artistCatalog.tracks
    .filter((track) => track.artistTelegramUserId === profile.telegramUserId && track.status === "published")
    .sort((a, b) => new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime())
    .map((track) => toArtistTrackProduct(track, profile));

  const [support, followStats] = await Promise.all([
    readArtistSupportSnapshot({
      config,
      artistTelegramUserId: profile.telegramUserId,
      donationsLimit: 10000,
      subscriptionsLimit: 10000,
    }),
    listFollowStatsBySlugs([profile.slug]),
  ]);
  const donationsTotal = support.donations.reduce((acc, entry) => acc + entry.amountStarsCents, 0);
  const activeSubscribers = support.subscriptions.filter((entry) => entry.status === "active").length;
  const dynamicFollowersCount = followStats[profile.slug]?.followersCount ?? profile.followersCount;

  return NextResponse.json({
    artist: {
      ...profile,
      followersCount: dynamicFollowersCount,
    },
    tracks,
    stats: {
      donationsTotal,
      activeSubscribers,
    },
    supportSource: support.source,
  });
}
