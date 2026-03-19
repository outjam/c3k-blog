import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import type { ArtistProfile, ArtistTrack, ShopAdminConfig } from "@/types/shop";

interface ArtistProfileRow {
  telegram_user_id?: unknown;
  slug?: unknown;
  display_name?: unknown;
  bio?: unknown;
  avatar_url?: unknown;
  cover_url?: unknown;
  ton_wallet_address?: unknown;
  status?: unknown;
  moderation_note?: unknown;
  donation_enabled?: unknown;
  subscription_enabled?: unknown;
  subscription_price_stars_cents?: unknown;
  balance_stars_cents?: unknown;
  lifetime_earnings_stars_cents?: unknown;
  followers_count?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
}

interface ArtistTrackRow {
  id?: unknown;
  slug?: unknown;
  artist_telegram_user_id?: unknown;
  title?: unknown;
  release_type?: unknown;
  subtitle?: unknown;
  description?: unknown;
  cover_image?: unknown;
  formats?: unknown;
  release_tracklist?: unknown;
  audio_file_id?: unknown;
  preview_url?: unknown;
  duration_sec?: unknown;
  genre?: unknown;
  tags?: unknown;
  price_stars_cents?: unknown;
  is_mintable?: unknown;
  status?: unknown;
  moderation_note?: unknown;
  plays_count?: unknown;
  sales_count?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  published_at?: unknown;
}

interface ArtistTrackLookupRow {
  artist_telegram_user_id?: unknown;
}

const isConfigured = (): boolean => Boolean(getPostgresHttpConfig());

const normalizeTelegramUserId = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
};

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = normalizeText(value, maxLength);
  return normalized || undefined;
};

const normalizeMoney = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const normalizePositiveMoney = (value: unknown, fallback = 1): number => {
  const parsed = Math.round(Number(value ?? fallback));
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
};

const normalizeBool = (value: unknown, fallback = false): boolean => {
  return typeof value === "boolean" ? value : fallback;
};

const normalizeIso = (value: unknown, fallback: string): string => {
  const date = new Date(String(value ?? "").trim());
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
};

const normalizeProfileStatus = (value: unknown): ArtistProfile["status"] => {
  return value === "approved" || value === "rejected" || value === "suspended" ? value : "pending";
};

const normalizeTrackStatus = (value: unknown): ArtistTrack["status"] => {
  return value === "pending_moderation" || value === "published" || value === "rejected" ? value : "draft";
};

const normalizeReleaseType = (value: unknown): ArtistTrack["releaseType"] => {
  return value === "ep" || value === "album" ? value : "single";
};

const normalizeFormat = (value: unknown): ArtistTrack["formats"][number]["format"] => {
  return value === "aac" || value === "flac" || value === "wav" || value === "alac" || value === "ogg" ? value : "mp3";
};

const normalizeTags = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeText(entry, 32))
    .filter(Boolean)
    .slice(0, 20);
};

const normalizeTrackFormats = (
  value: unknown,
  fallbackAudioFileId: string,
  fallbackPriceStarsCents: number,
): ArtistTrack["formats"] => {
  const fromArray = Array.isArray(value)
    ? value
        .map((entry) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const source = entry as Partial<ArtistTrack["formats"][number]>;
          const audioFileId = normalizeText(source.audioFileId, 1024);

          if (!audioFileId) {
            return null;
          }

          return {
            format: normalizeFormat(source.format),
            audioFileId,
            priceStarsCents: normalizePositiveMoney(source.priceStarsCents, fallbackPriceStarsCents),
            label: normalizeOptionalText(source.label, 64),
            isDefault: Boolean(source.isDefault),
          } satisfies ArtistTrack["formats"][number];
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .slice(0, 8)
    : [];

  const uniqueByFormat = new Map<string, ArtistTrack["formats"][number]>();
  for (const entry of fromArray) {
    uniqueByFormat.set(entry.format, entry);
  }

  const normalized = Array.from(uniqueByFormat.values());
  if (normalized.length === 0) {
    return [
      {
        format: "mp3",
        audioFileId: fallbackAudioFileId,
        priceStarsCents: fallbackPriceStarsCents,
        label: "MP3",
        isDefault: true,
      },
    ];
  }

  if (!normalized.some((entry) => entry.isDefault)) {
    normalized[0] = {
      ...normalized[0],
      isDefault: true,
    };
  }

  return normalized;
};

const normalizeReleaseTracklist = (value: unknown, fallbackTitle: string): ArtistTrack["releaseTracklist"] => {
  const fromArray = Array.isArray(value)
    ? value
        .map((entry, index) => {
          if (!entry || typeof entry !== "object") {
            return null;
          }

          const source = entry as Partial<ArtistTrack["releaseTracklist"][number]>;
          const title = normalizeText(source.title, 180);
          if (!title) {
            return null;
          }

          const id = normalizeText(source.id ?? `track-${index + 1}`, 80) || `track-${index + 1}`;
          const durationSec = Math.round(Number(source.durationSec ?? 0));
          const priceStarsCents = Math.round(Number(source.priceStarsCents ?? 0));
          const position = Math.round(Number(source.position ?? index + 1));

          return {
            id,
            title,
            durationSec: Number.isFinite(durationSec) && durationSec > 0 ? durationSec : undefined,
            previewUrl: normalizeOptionalText(source.previewUrl, 3000),
            priceStarsCents: Number.isFinite(priceStarsCents) && priceStarsCents > 0 ? priceStarsCents : undefined,
            position: Number.isFinite(position) && position > 0 ? position : index + 1,
          } satisfies ArtistTrack["releaseTracklist"][number];
        })
        .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
        .slice(0, 50)
    : [];

  if (fromArray.length > 0) {
    return fromArray
      .sort((a, b) => a.position - b.position || a.title.localeCompare(b.title, "ru-RU"))
      .map((entry, index) => ({ ...entry, position: index + 1 }));
  }

  return [
    {
      id: "track-1",
      title: fallbackTitle,
      position: 1,
    },
  ];
};

const toArtistProfile = (row: ArtistProfileRow): ArtistProfile | null => {
  const telegramUserId = normalizeTelegramUserId(row.telegram_user_id);
  const slug = normalizeText(row.slug, 120);
  const displayName = normalizeText(row.display_name, 120);
  const now = new Date().toISOString();

  if (!telegramUserId || !slug || !displayName) {
    return null;
  }

  const createdAt = normalizeIso(row.created_at, now);

  return {
    telegramUserId,
    slug,
    displayName,
    bio: normalizeText(row.bio, 1200),
    avatarUrl: normalizeOptionalText(row.avatar_url, 3000),
    coverUrl: normalizeOptionalText(row.cover_url, 3000),
    tonWalletAddress: normalizeOptionalText(row.ton_wallet_address, 128),
    status: normalizeProfileStatus(row.status),
    moderationNote: normalizeOptionalText(row.moderation_note, 240),
    donationEnabled: normalizeBool(row.donation_enabled, true),
    subscriptionEnabled: normalizeBool(row.subscription_enabled, false),
    subscriptionPriceStarsCents: normalizePositiveMoney(row.subscription_price_stars_cents, 100),
    balanceStarsCents: normalizeMoney(row.balance_stars_cents),
    lifetimeEarningsStarsCents: normalizeMoney(row.lifetime_earnings_stars_cents),
    followersCount: normalizeMoney(row.followers_count),
    createdAt,
    updatedAt: normalizeIso(row.updated_at, createdAt),
  };
};

const toArtistTrack = (row: ArtistTrackRow): ArtistTrack | null => {
  const id = normalizeText(row.id, 80);
  const slug = normalizeText(row.slug, 120);
  const artistTelegramUserId = normalizeTelegramUserId(row.artist_telegram_user_id);
  const title = normalizeText(row.title, 160);
  const audioFileId = normalizeText(row.audio_file_id, 1024);
  const now = new Date().toISOString();

  if (!id || !slug || !artistTelegramUserId || !title || !audioFileId) {
    return null;
  }

  const fallbackPrice = normalizePositiveMoney(row.price_stars_cents, 1);
  const formats = normalizeTrackFormats(row.formats, audioFileId, fallbackPrice);
  const defaultFormat = formats.find((entry) => entry.isDefault) ?? formats[0];
  const createdAt = normalizeIso(row.created_at, now);

  return {
    id,
    slug,
    artistTelegramUserId,
    title,
    releaseType: normalizeReleaseType(row.release_type),
    subtitle: normalizeText(row.subtitle, 220),
    description: normalizeText(row.description, 5000),
    coverImage: normalizeText(row.cover_image, 3000) || "/posts/cover-pattern.svg",
    formats,
    releaseTracklist: normalizeReleaseTracklist(row.release_tracklist, title),
    audioFileId: defaultFormat.audioFileId,
    previewUrl: normalizeOptionalText(row.preview_url, 3000),
    durationSec: normalizeMoney(row.duration_sec),
    genre: normalizeOptionalText(row.genre, 64),
    tags: normalizeTags(row.tags),
    priceStarsCents: defaultFormat.priceStarsCents,
    isMintable: normalizeBool(row.is_mintable, true),
    status: normalizeTrackStatus(row.status),
    moderationNote: normalizeOptionalText(row.moderation_note, 240),
    playsCount: normalizeMoney(row.plays_count),
    salesCount: normalizeMoney(row.sales_count),
    createdAt,
    updatedAt: normalizeIso(row.updated_at, createdAt),
    publishedAt: normalizeOptionalText(row.published_at, 64),
  };
};

const sortProfiles = (entries: ArtistProfile[]): ArtistProfile[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left || b.telegramUserId - a.telegramUserId;
  });
};

const sortTracks = (entries: ArtistTrack[]): ArtistTrack[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left || b.id.localeCompare(a.id);
  });
};

const filterLegacyProfiles = (
  config: ShopAdminConfig,
  options: {
    artistTelegramUserId?: number;
    profileSlug?: string;
    onlyApprovedProfiles?: boolean;
  },
): ArtistProfile[] => {
  return sortProfiles(
    Object.values(config.artistProfiles).filter((entry) => {
      if (typeof options.artistTelegramUserId === "number" && entry.telegramUserId !== options.artistTelegramUserId) {
        return false;
      }
      if (options.profileSlug && entry.slug !== options.profileSlug) {
        return false;
      }
      if (options.onlyApprovedProfiles && entry.status !== "approved") {
        return false;
      }
      return true;
    }),
  );
};

const filterLegacyTracks = (
  config: ShopAdminConfig,
  options: {
    trackId?: string;
    artistTelegramUserId?: number;
    onlyPublishedTracks?: boolean;
  },
): ArtistTrack[] => {
  return sortTracks(
    Object.values(config.artistTracks).filter((entry) => {
      if (options.trackId && entry.id !== options.trackId) {
        return false;
      }
      if (typeof options.artistTelegramUserId === "number" && entry.artistTelegramUserId !== options.artistTelegramUserId) {
        return false;
      }
      if (options.onlyPublishedTracks && entry.status !== "published") {
        return false;
      }
      return true;
    }),
  );
};

const mergeProfiles = (primary: ArtistProfile[], fallback: ArtistProfile[]): ArtistProfile[] => {
  const map = new Map<number, ArtistProfile>();
  [...primary, ...fallback].forEach((entry) => {
    if (!map.has(entry.telegramUserId)) {
      map.set(entry.telegramUserId, entry);
    }
  });
  return sortProfiles(Array.from(map.values()));
};

const mergeTracks = (primary: ArtistTrack[], fallback: ArtistTrack[]): ArtistTrack[] => {
  const map = new Map<string, ArtistTrack>();
  [...primary, ...fallback].forEach((entry) => {
    if (!map.has(entry.id)) {
      map.set(entry.id, entry);
    }
  });
  return sortTracks(Array.from(map.values()));
};

export const readArtistCatalogSnapshot = async (options: {
  config: ShopAdminConfig;
  trackId?: string;
  artistTelegramUserId?: number;
  profileSlug?: string;
  onlyApprovedProfiles?: boolean;
  onlyPublishedTracks?: boolean;
  profileLimit?: number;
  trackLimit?: number;
}): Promise<{
  profiles: ArtistProfile[];
  tracks: ArtistTrack[];
  source: "postgres" | "legacy";
}> => {
  if (!isConfigured()) {
    const profiles = filterLegacyProfiles(options.config, options);
    const artistTelegramUserId =
      typeof options.artistTelegramUserId === "number"
        ? options.artistTelegramUserId
        : (options.trackId
            ? filterLegacyTracks(options.config, { trackId: options.trackId })[0]?.artistTelegramUserId
            : (options.profileSlug ? profiles[0]?.telegramUserId : undefined));

    return {
      profiles,
      tracks:
        options.profileSlug && typeof artistTelegramUserId !== "number"
          ? []
          : filterLegacyTracks(options.config, {
              trackId: options.trackId,
              artistTelegramUserId,
              onlyPublishedTracks: options.onlyPublishedTracks,
            }),
      source: "legacy",
    };
  }

  let trackArtistLookupTelegramUserId: number | undefined;
  if (options.trackId && typeof options.artistTelegramUserId !== "number" && !options.profileSlug) {
    const trackLookupQuery = new URLSearchParams();
    trackLookupQuery.set("select", "artist_telegram_user_id");
    trackLookupQuery.set("id", `eq.${options.trackId}`);
    trackLookupQuery.set("limit", "1");

    const trackLookupRows = await postgresTableRequest<ArtistTrackLookupRow[]>({
      method: "GET",
      path: "/artist_tracks",
      query: trackLookupQuery,
    });

    const lookedUpArtistTelegramUserId = normalizeTelegramUserId(trackLookupRows?.[0]?.artist_telegram_user_id);
    trackArtistLookupTelegramUserId = lookedUpArtistTelegramUserId || undefined;
  }

  const profileQuery = new URLSearchParams();
  profileQuery.set(
    "select",
    "telegram_user_id,slug,display_name,bio,avatar_url,cover_url,ton_wallet_address,status,moderation_note,donation_enabled,subscription_enabled,subscription_price_stars_cents,balance_stars_cents,lifetime_earnings_stars_cents,followers_count,created_at,updated_at",
  );
  profileQuery.set("order", "updated_at.desc");
  profileQuery.set("limit", String(Math.max(1, Math.min(options.profileLimit ?? 1000, 5000))));
  if (typeof options.artistTelegramUserId === "number") {
    profileQuery.set("telegram_user_id", `eq.${options.artistTelegramUserId}`);
  } else if (typeof trackArtistLookupTelegramUserId === "number") {
    profileQuery.set("telegram_user_id", `eq.${trackArtistLookupTelegramUserId}`);
  }
  if (options.profileSlug) {
    profileQuery.set("slug", `eq.${options.profileSlug}`);
  }
  if (options.onlyApprovedProfiles) {
    profileQuery.set("status", "eq.approved");
  }

  const profileRows = await postgresTableRequest<ArtistProfileRow[]>({
    method: "GET",
    path: "/artist_profiles",
    query: profileQuery,
  });

  if (!profileRows) {
    const profiles = filterLegacyProfiles(options.config, options);
    const artistTelegramUserId =
      typeof options.artistTelegramUserId === "number"
        ? options.artistTelegramUserId
        : (options.trackId
            ? filterLegacyTracks(options.config, { trackId: options.trackId })[0]?.artistTelegramUserId
            : (options.profileSlug ? profiles[0]?.telegramUserId : undefined));

    return {
      profiles,
      tracks:
        options.profileSlug && typeof artistTelegramUserId !== "number"
          ? []
          : filterLegacyTracks(options.config, {
              trackId: options.trackId,
              artistTelegramUserId,
              onlyPublishedTracks: options.onlyPublishedTracks,
            }),
      source: "legacy",
    };
  }

  const profiles = mergeProfiles(
    profileRows
      .map((row) => toArtistProfile(row))
      .filter((entry): entry is ArtistProfile => Boolean(entry)),
    filterLegacyProfiles(options.config, options),
  );

  const trackQuery = new URLSearchParams();
  trackQuery.set(
    "select",
    "id,slug,artist_telegram_user_id,title,release_type,subtitle,description,cover_image,formats,release_tracklist,audio_file_id,preview_url,duration_sec,genre,tags,price_stars_cents,is_mintable,status,moderation_note,plays_count,sales_count,created_at,updated_at,published_at",
  );
  trackQuery.set("order", "updated_at.desc");
  trackQuery.set("limit", String(Math.max(1, Math.min(options.trackLimit ?? 2000, 10000))));

  const trackArtistTelegramUserId =
    typeof options.artistTelegramUserId === "number"
      ? options.artistTelegramUserId
      : (options.trackId
          ? trackArtistLookupTelegramUserId ?? filterLegacyTracks(options.config, { trackId: options.trackId })[0]?.artistTelegramUserId
          : (options.profileSlug ? profiles[0]?.telegramUserId : undefined));

  if (options.profileSlug && typeof trackArtistTelegramUserId !== "number") {
    return {
      profiles,
      tracks: [],
      source: "postgres",
    };
  }

  if (options.trackId) {
    trackQuery.set("id", `eq.${options.trackId}`);
  }
  if (typeof trackArtistTelegramUserId === "number") {
    trackQuery.set("artist_telegram_user_id", `eq.${trackArtistTelegramUserId}`);
  }
  if (options.onlyPublishedTracks) {
    trackQuery.set("status", "eq.published");
  }

  const trackRows = await postgresTableRequest<ArtistTrackRow[]>({
    method: "GET",
    path: "/artist_tracks",
    query: trackQuery,
  });

  if (!trackRows) {
    return {
      profiles,
      tracks: filterLegacyTracks(options.config, {
        trackId: options.trackId,
        artistTelegramUserId: trackArtistTelegramUserId,
        onlyPublishedTracks: options.onlyPublishedTracks,
      }),
      source: "legacy",
    };
  }

  return {
    profiles,
    tracks: mergeTracks(
      trackRows
        .map((row) => toArtistTrack(row))
        .filter((entry): entry is ArtistTrack => Boolean(entry)),
      filterLegacyTracks(options.config, {
        trackId: options.trackId,
        artistTelegramUserId: trackArtistTelegramUserId,
        onlyPublishedTracks: options.onlyPublishedTracks,
      }),
    ),
    source: "postgres",
  };
};

export const upsertArtistProfiles = async (profiles: ArtistProfile[]): Promise<boolean> => {
  if (!isConfigured() || profiles.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "telegram_user_id");

  const body = profiles.map((profile) => ({
    telegram_user_id: normalizeTelegramUserId(profile.telegramUserId),
    slug: normalizeText(profile.slug, 120),
    display_name: normalizeText(profile.displayName, 120),
    bio: normalizeText(profile.bio, 1200),
    avatar_url: normalizeOptionalText(profile.avatarUrl, 3000) ?? null,
    cover_url: normalizeOptionalText(profile.coverUrl, 3000) ?? null,
    ton_wallet_address: normalizeOptionalText(profile.tonWalletAddress, 128) ?? null,
    status: normalizeProfileStatus(profile.status),
    moderation_note: normalizeOptionalText(profile.moderationNote, 240) ?? null,
    donation_enabled: Boolean(profile.donationEnabled),
    subscription_enabled: Boolean(profile.subscriptionEnabled),
    subscription_price_stars_cents: normalizePositiveMoney(profile.subscriptionPriceStarsCents, 100),
    balance_stars_cents: normalizeMoney(profile.balanceStarsCents),
    lifetime_earnings_stars_cents: normalizeMoney(profile.lifetimeEarningsStarsCents),
    followers_count: normalizeMoney(profile.followersCount),
    created_at: normalizeIso(profile.createdAt, new Date().toISOString()),
    updated_at: normalizeIso(profile.updatedAt, profile.createdAt),
  }));

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_profiles",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};

export const upsertArtistTracks = async (tracks: ArtistTrack[]): Promise<boolean> => {
  if (!isConfigured() || tracks.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "id");

  const body = tracks.map((track) => ({
    id: normalizeText(track.id, 80),
    slug: normalizeText(track.slug, 120),
    artist_telegram_user_id: normalizeTelegramUserId(track.artistTelegramUserId),
    title: normalizeText(track.title, 160),
    release_type: normalizeReleaseType(track.releaseType),
    subtitle: normalizeText(track.subtitle, 220),
    description: normalizeText(track.description, 5000),
    cover_image: normalizeText(track.coverImage, 3000),
    formats: track.formats.slice(0, 8),
    release_tracklist: track.releaseTracklist.slice(0, 50),
    audio_file_id: normalizeText(track.audioFileId, 1024),
    preview_url: normalizeOptionalText(track.previewUrl, 3000) ?? null,
    duration_sec: normalizeMoney(track.durationSec),
    genre: normalizeOptionalText(track.genre, 64) ?? null,
    tags: normalizeTags(track.tags),
    price_stars_cents: normalizePositiveMoney(track.priceStarsCents, 1),
    is_mintable: Boolean(track.isMintable),
    status: normalizeTrackStatus(track.status),
    moderation_note: normalizeOptionalText(track.moderationNote, 240) ?? null,
    plays_count: normalizeMoney(track.playsCount),
    sales_count: normalizeMoney(track.salesCount),
    created_at: normalizeIso(track.createdAt, new Date().toISOString()),
    updated_at: normalizeIso(track.updatedAt, track.createdAt),
    published_at: normalizeOptionalText(track.publishedAt, 64) ?? null,
  }));

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_tracks",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};
