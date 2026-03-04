import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ITunesSearchTrack {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  trackViewUrl?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  artworkUrl60?: string;
  trackTimeMillis?: number;
}

interface ITunesSearchResponse {
  resultCount?: number;
  results?: ITunesSearchTrack[];
}

const MAX_QUERY_LENGTH = 120;

const toArtworkHd = (value?: string): string => {
  if (!value) {
    return "";
  }

  return value
    .replace("/100x100bb.jpg", "/1000x1000bb.jpg")
    .replace("/100x100bb.png", "/1000x1000bb.png")
    .replace("/60x60bb.jpg", "/1000x1000bb.jpg")
    .replace("/60x60bb.png", "/1000x1000bb.png");
};

const normalizeDuration = (milliseconds?: number): number => {
  if (!Number.isFinite(milliseconds)) {
    return 0;
  }

  return Math.max(0, Math.round((milliseconds as number) / 1000));
};

export async function GET(request: Request) {
  const url = new URL(request.url);
  const rawQuery = (url.searchParams.get("q") ?? "").trim();
  const query = rawQuery.slice(0, MAX_QUERY_LENGTH);
  const limit = Math.max(1, Math.min(30, Math.round(Number(url.searchParams.get("limit") ?? 20))));

  if (!query) {
    return NextResponse.json({ error: "Missing query parameter q" }, { status: 400 });
  }

  const iTunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}`;

  try {
    const response = await fetch(iTunesUrl, {
      method: "GET",
      headers: {
        "accept": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return NextResponse.json({ error: `iTunes API HTTP ${response.status}` }, { status: 502 });
    }

    const payload = (await response.json()) as ITunesSearchResponse;
    const rawItems = Array.isArray(payload.results) ? payload.results : [];

    const items = rawItems
      .map((item) => {
        const title = (item.trackName ?? "").trim();
        const artist = (item.artistName ?? "").trim();
        const artwork = toArtworkHd(item.artworkUrl100 ?? item.artworkUrl60);

        if (!title || !artist || !artwork) {
          return null;
        }

        return {
          id: String(item.trackId ?? `${title}-${artist}`).slice(0, 120),
          title,
          artist,
          album: (item.collectionName ?? "").trim(),
          artworkUrl: artwork,
          previewUrl: item.previewUrl ?? "",
          trackUrl: item.trackViewUrl ?? "",
          durationSec: normalizeDuration(item.trackTimeMillis),
          source: "itunes",
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return NextResponse.json({
      query,
      total: items.length,
      source: "itunes",
      items,
    });
  } catch {
    return NextResponse.json({ error: "Failed to reach iTunes Search API" }, { status: 502 });
  }
}
