import { NextResponse } from "next/server";

import { readShopAdminConfig } from "@/lib/server/shop-admin-config-store";
import { toArtistTrackProduct } from "@/lib/server/shop-artist-market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const config = await readShopAdminConfig();
  const profile = Object.values(config.artistProfiles).find((item) => item.slug === slug && item.status === "approved");

  if (!profile) {
    return NextResponse.json({ error: "Artist not found" }, { status: 404 });
  }

  const tracks = Object.values(config.artistTracks)
    .filter((track) => track.artistTelegramUserId === profile.telegramUserId && track.status === "published")
    .sort((a, b) => new Date(b.publishedAt ?? b.updatedAt).getTime() - new Date(a.publishedAt ?? a.updatedAt).getTime())
    .map((track) => toArtistTrackProduct(track, profile));

  const donationsTotal = config.artistDonations
    .filter((entry) => entry.artistTelegramUserId === profile.telegramUserId)
    .reduce((acc, entry) => acc + entry.amountStarsCents, 0);
  const activeSubscribers = config.artistSubscriptions.filter(
    (entry) => entry.artistTelegramUserId === profile.telegramUserId && entry.status === "active",
  ).length;

  return NextResponse.json({
    artist: profile,
    tracks,
    stats: {
      donationsTotal,
      activeSubscribers,
    },
  });
}
