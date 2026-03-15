import { readPersistedString, writePersistedString } from "@/lib/telegram-persist";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { BlogPost } from "@/types/blog";
import type { ShopCatalogArtist, ShopProduct } from "@/types/shop";
import type {
  ProfileAward,
  ProfileMode,
  PublicProfile,
  SearchBundle,
  UnifiedFeedItem,
} from "@/types/social";

const SOCIAL_HUB_KEY = "c3k-social-hub-v1";

type ViewerIdentity = {
  id?: number | null;
  username?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  photo_url?: string | null;
};

interface SocialHubState {
  followingSlugs: string[];
  profileModeByUser: Record<string, ProfileMode>;
  walletCentsByUser: Record<string, number>;
  purchasesVisibleByUser: Record<string, boolean>;
  purchasedReleaseSlugsByUser: Record<string, string[]>;
  purchasedReleaseFormatKeysByUser: Record<string, string[]>;
  purchasedTrackKeysByUser: Record<string, string[]>;
  redeemedTopupPromoCodesByUser: Record<string, string[]>;
  tonWalletAddressByUser: Record<string, string>;
  mintedReleaseNftsByUser: Record<string, MintedReleaseNft[]>;
}

export interface MintedReleaseNft {
  id: string;
  releaseSlug: string;
  ownerAddress: string;
  collectionAddress?: string;
  itemAddress?: string;
  itemIndex?: string;
  txHash?: string;
  mintedAt: string;
  status: "minted";
}

export interface FollowStatsEntry {
  followersCount: number;
  followingCount: number;
}

export interface FollowProfileEntry {
  slug: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  coverUrl?: string;
  bio?: string;
}

export interface FollowOverview {
  selfSlug: string;
  followingSlugs: string[];
  followerSlugs: string[];
  statsBySlug: Record<string, FollowStatsEntry>;
  profilesBySlug: Record<string, FollowProfileEntry>;
}

export interface FollowRelationsSnapshot {
  slug: string;
  followersSlugs: string[];
  followingSlugs: string[];
  stats: FollowStatsEntry;
  profilesBySlug: Record<string, FollowProfileEntry>;
}

const DEFAULT_STATE: SocialHubState = {
  followingSlugs: [],
  profileModeByUser: {},
  walletCentsByUser: {},
  purchasesVisibleByUser: {},
  purchasedReleaseSlugsByUser: {},
  purchasedReleaseFormatKeysByUser: {},
  purchasedTrackKeysByUser: {},
  redeemedTopupPromoCodesByUser: {},
  tonWalletAddressByUser: {},
  mintedReleaseNftsByUser: {},
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

const normalizeStarsCents = (value: unknown): number => {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) {
    return 0;
  }

  return Math.max(0, next);
};

const normalizeStringList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeSlug(entry))
    .filter(Boolean);
};

const normalizeNonNegativeInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.max(0, parsed);
};

const normalizeFollowStatsMap = (value: unknown): Record<string, FollowStatsEntry> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([rawSlug, rawStats]) => {
      const slug = normalizeSlug(rawSlug);
      if (!slug || !rawStats || typeof rawStats !== "object") {
        return [];
      }

      const source = rawStats as Record<string, unknown>;
      return [
        [
          slug,
          {
            followersCount: normalizeNonNegativeInt(source.followersCount),
            followingCount: normalizeNonNegativeInt(source.followingCount),
          } satisfies FollowStatsEntry,
        ],
      ];
    }),
  );
};

const normalizeFollowProfilesMap = (value: unknown): Record<string, FollowProfileEntry> => {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).flatMap(([rawSlug, rawProfile]) => {
      const slug = normalizeSlug(rawSlug);
      if (!slug || !rawProfile || typeof rawProfile !== "object") {
        return [];
      }

      const source = rawProfile as Record<string, unknown>;
      const displayName = String(source.displayName ?? "").trim().slice(0, 120);
      if (!displayName) {
        return [];
      }

      return [
        [
          slug,
          {
            slug,
            displayName,
            username: normalizeSlug(source.username) || undefined,
            avatarUrl: typeof source.avatarUrl === "string" ? source.avatarUrl : undefined,
            coverUrl: typeof source.coverUrl === "string" ? source.coverUrl : undefined,
            bio: typeof source.bio === "string" ? source.bio.slice(0, 500) : undefined,
          } satisfies FollowProfileEntry,
        ],
      ];
    }),
  );
};

const normalizeTrackId = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const normalizeReleaseFormat = (value: unknown): string => {
  switch (String(value ?? "").trim().toLowerCase()) {
    case "aac":
    case "alac":
    case "flac":
    case "mp3":
    case "ogg":
    case "wav":
      return String(value).trim().toLowerCase();
    default:
      return "";
  }
};

const toTrackPurchaseKey = (releaseSlug: unknown, trackId: unknown): string => {
  const release = normalizeSlug(releaseSlug);
  const track = normalizeTrackId(trackId);

  if (!release || !track) {
    return "";
  }

  return `${release}::${track}`;
};

const toReleaseFormatPurchaseKey = (releaseSlug: unknown, format: unknown): string => {
  const release = normalizeSlug(releaseSlug);
  const normalizedFormat = normalizeReleaseFormat(format);

  if (!release || !normalizedFormat) {
    return "";
  }

  return `${release}::${normalizedFormat}`;
};

const normalizeTrackPurchaseKey = (value: unknown): string => {
  const [releaseSlug = "", trackId = ""] = String(value ?? "").split("::", 2);
  return toTrackPurchaseKey(releaseSlug, trackId);
};

const normalizeReleaseFormatPurchaseKey = (value: unknown): string => {
  const [releaseSlug = "", format = ""] = String(value ?? "").split("::", 2);
  return toReleaseFormatPurchaseKey(releaseSlug, format);
};

const normalizeTrackPurchaseKeyList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeTrackPurchaseKey(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const normalizeReleaseFormatPurchaseKeyList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeReleaseFormatPurchaseKey(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const normalizePromoCode = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = String(value ?? "").trim().slice(0, maxLength);
  return normalized || undefined;
};

const normalizeOptionalBigIntString = (value: unknown): string | undefined => {
  const normalized = String(value ?? "").trim().slice(0, 40);

  if (!normalized) {
    return undefined;
  }

  try {
    const parsed = BigInt(normalized);
    return parsed >= BigInt(0) ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
};

const normalizeIsoDate = (value: unknown, fallbackIso: string): string => {
  const normalized = String(value ?? "").trim().slice(0, 120);
  const timestamp = Date.parse(normalized);

  if (normalized && Number.isFinite(timestamp)) {
    return new Date(timestamp).toISOString();
  }

  return fallbackIso;
};

const normalizeMintedNftId = (value: unknown, fallback: string): string => {
  const normalized = String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 96);

  return normalized || fallback;
};

const normalizeMintedReleaseNft = (value: unknown): MintedReleaseNft | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const releaseSlug = normalizeSlug(source.releaseSlug);
  const ownerAddress = normalizeTonAddress(source.ownerAddress);

  if (!releaseSlug || !ownerAddress) {
    return null;
  }

  const mintedAt = normalizeIsoDate(source.mintedAt, new Date().toISOString());
  const fallbackId = `nft:${releaseSlug}:${mintedAt}`;

  return {
    id: normalizeMintedNftId(source.id, fallbackId),
    releaseSlug,
    ownerAddress,
    collectionAddress: normalizeOptionalText(normalizeTonAddress(source.collectionAddress), 160),
    itemAddress: normalizeOptionalText(normalizeTonAddress(source.itemAddress), 160),
    itemIndex: normalizeOptionalBigIntString(source.itemIndex),
    txHash: normalizeOptionalText(source.txHash, 256),
    mintedAt,
    status: "minted",
  };
};

const normalizeMintedReleaseNftList = (value: unknown): MintedReleaseNft[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeMintedReleaseNft(entry))
    .filter((entry): entry is MintedReleaseNft => Boolean(entry))
    .filter((entry) => {
      if (seen.has(entry.releaseSlug)) {
        return false;
      }

      seen.add(entry.releaseSlug);
      return true;
    })
    .sort((a, b) => Date.parse(b.mintedAt) - Date.parse(a.mintedAt));
};

const normalizePromoCodeList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizePromoCode(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const normalizeMode = (value: unknown): ProfileMode => {
  return value === "artist" ? "artist" : "listener";
};

const normalizeAwardTier = (value: unknown): ProfileAward["tier"] => {
  return value === "diamond" || value === "gold" || value === "silver" || value === "bronze"
    ? value
    : "bronze";
};

const normalizeState = (value: unknown): SocialHubState => {
  if (!value || typeof value !== "object") {
    return DEFAULT_STATE;
  }

  const source = value as Record<string, unknown>;
  const walletCentsByUser =
    source.walletCentsByUser && typeof source.walletCentsByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.walletCentsByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizeStarsCents(item),
          ]),
        )
      : {};

  const profileModeByUser =
    source.profileModeByUser && typeof source.profileModeByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.profileModeByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizeMode(item),
          ]),
        )
      : {};

  const purchasesVisibleByUser =
    source.purchasesVisibleByUser && typeof source.purchasesVisibleByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasesVisibleByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            Boolean(item),
          ]),
        )
      : {};

  const purchasedReleaseSlugsByUser =
    source.purchasedReleaseSlugsByUser && typeof source.purchasedReleaseSlugsByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasedReleaseSlugsByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizeStringList(item),
          ]),
        )
      : {};

  const purchasedReleaseFormatKeysByUser =
    source.purchasedReleaseFormatKeysByUser && typeof source.purchasedReleaseFormatKeysByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasedReleaseFormatKeysByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizeReleaseFormatPurchaseKeyList(item),
          ]),
        )
      : {};

  const purchasedTrackKeysByUser =
    source.purchasedTrackKeysByUser && typeof source.purchasedTrackKeysByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.purchasedTrackKeysByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizeTrackPurchaseKeyList(item),
          ]),
        )
      : {};

  const redeemedTopupPromoCodesByUser =
    source.redeemedTopupPromoCodesByUser && typeof source.redeemedTopupPromoCodesByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.redeemedTopupPromoCodesByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizePromoCodeList(item),
          ]),
        )
      : {};

  const tonWalletAddressByUser =
    source.tonWalletAddressByUser && typeof source.tonWalletAddressByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.tonWalletAddressByUser as Record<string, unknown>)
            .map(([key, item]) => [String(key), normalizeTonAddress(item)] as const)
            .filter(([, item]) => Boolean(item)),
        )
      : {};

  const mintedReleaseNftsByUser =
    source.mintedReleaseNftsByUser && typeof source.mintedReleaseNftsByUser === "object"
      ? Object.fromEntries(
          Object.entries(source.mintedReleaseNftsByUser as Record<string, unknown>).map(([key, item]) => [
            String(key),
            normalizeMintedReleaseNftList(item),
          ]),
        )
      : {};

  return {
    followingSlugs: normalizeStringList(source.followingSlugs),
    profileModeByUser,
    walletCentsByUser,
    purchasesVisibleByUser,
    purchasedReleaseSlugsByUser,
    purchasedReleaseFormatKeysByUser,
    purchasedTrackKeysByUser,
    redeemedTopupPromoCodesByUser,
    tonWalletAddressByUser,
    mintedReleaseNftsByUser,
  };
};

const readState = async (): Promise<SocialHubState> => {
  const raw = await readPersistedString(SOCIAL_HUB_KEY);

  if (!raw) {
    return DEFAULT_STATE;
  }

  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return DEFAULT_STATE;
  }
};

const writeState = async (state: SocialHubState): Promise<void> => {
  await writePersistedString(SOCIAL_HUB_KEY, JSON.stringify(state));
};

const parseDate = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildListenerAwards = (purchasesCount: number, followersCount: number): ProfileAward[] => {
  const awards: ProfileAward[] = [];

  if (purchasesCount >= 5) {
    awards.push({
      id: "collector",
      icon: "💿",
      title: "Коллекционер релизов",
      description: "Куплено 5+ релизов.",
      tier: purchasesCount >= 14 ? "gold" : "silver",
    });
  }

  if (followersCount >= 300) {
    awards.push({
      id: "trendsetter",
      icon: "✨",
      title: "Трендсеттер",
      description: "Профиль активно смотрят и цитируют.",
      tier: followersCount >= 900 ? "diamond" : "gold",
    });
  }

  return awards;
};

const buildArtistAwards = (artist: ShopCatalogArtist, tracksCount: number): ProfileAward[] => {
  const awards: ProfileAward[] = [
    {
      id: `artist-${artist.slug}`,
      icon: "🎙️",
      title: "Проверенный артист",
      description: "Публикует официальные релизы на витрине.",
      tier: "silver",
    },
  ];

  if (tracksCount >= 3) {
    awards.push({
      id: `discography-${artist.slug}`,
      icon: "🏆",
      title: "Сильная дискография",
      description: "В профиле 3+ релиза.",
      tier: tracksCount >= 8 ? "diamond" : "gold",
    });
  }

  if (artist.totalSalesCount >= 50 || artist.followersCount >= 500) {
    awards.push({
      id: `star-power-${artist.slug}`,
      icon: "🌟",
      title: "Сила сцены",
      description: "Высокая вовлеченность и продажи.",
      tier: artist.totalSalesCount >= 120 ? "diamond" : "gold",
    });
  }

  return awards;
};

export const profileSlugFromIdentity = (input: {
  username?: string | null;
  telegramUserId?: number | null;
  fallback?: string;
}): string => {
  const byUsername = normalizeSlug(input.username);

  if (byUsername) {
    return byUsername;
  }

  const byFallback = normalizeSlug(input.fallback);

  if (byFallback) {
    return byFallback;
  }

  const userId = Math.max(1, Math.round(Number(input.telegramUserId ?? 0)));
  return Number.isFinite(userId) && userId > 0 ? `user-${userId}` : "guest";
};

export const resolveViewerKey = (viewer: ViewerIdentity | null | undefined): string => {
  const userId = Math.max(1, Math.round(Number(viewer?.id ?? 0)));

  if (Number.isFinite(userId) && userId > 0) {
    return `tg:${userId}`;
  }

  const slug = normalizeSlug(viewer?.username);
  return slug ? `u:${slug}` : "guest";
};

export const resolveViewerName = (viewer: ViewerIdentity | null | undefined): string => {
  const firstName = String(viewer?.first_name ?? "").trim();
  const lastName = String(viewer?.last_name ?? "").trim();
  const fullName = `${firstName} ${lastName}`.trim();

  if (fullName) {
    return fullName.slice(0, 120);
  }

  const username = normalizeSlug(viewer?.username);
  if (username) {
    return `@${username}`;
  }

  return "Пользователь";
};

export const readFollowOverview = async (subjectSlugs: string[] = []): Promise<FollowOverview> => {
  const requestedSlugs = Array.from(new Set(subjectSlugs.map((entry) => normalizeSlug(entry)).filter(Boolean))).slice(0, 120);
  const query = new URLSearchParams();
  if (requestedSlugs.length > 0) {
    query.set("slugs", requestedSlugs.join(","));
  }

  try {
    const response = await fetch(`/api/social/follows${query.toString() ? `?${query.toString()}` : ""}`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (response.ok) {
      const payload = (await response.json()) as {
        selfSlug?: unknown;
        followingSlugs?: unknown;
        followerSlugs?: unknown;
        statsBySlug?: unknown;
        profilesBySlug?: unknown;
      };
      const remoteFollowing = normalizeStringList(payload.followingSlugs);
      const followerSlugs = normalizeStringList(payload.followerSlugs);
      const statsBySlug = normalizeFollowStatsMap(payload.statsBySlug);
      const profilesBySlug = normalizeFollowProfilesMap(payload.profilesBySlug);
      const selfSlug = normalizeSlug(payload.selfSlug) || "";
      const local = await readState();

      if (JSON.stringify(local.followingSlugs) !== JSON.stringify(remoteFollowing)) {
        await writeState({
          ...local,
          followingSlugs: remoteFollowing,
        });
      }

      return {
        selfSlug,
        followingSlugs: remoteFollowing,
        followerSlugs,
        statsBySlug,
        profilesBySlug,
      };
    }
  } catch {
    // ignore network errors and fall back to local state
  }

  const state = await readState();
  return {
    selfSlug: "",
    followingSlugs: state.followingSlugs,
    followerSlugs: [],
    statsBySlug: {},
    profilesBySlug: {},
  };
};

export const readFollowingSlugs = async (): Promise<string[]> => {
  const overview = await readFollowOverview();
  return overview.followingSlugs;
};

export interface UserProfileEditorPayload {
  displayName: string;
  username?: string;
  avatarUrl?: string;
  coverUrl?: string;
  bio?: string;
}

export const fetchMyUserProfile = async (): Promise<{
  profile: UserProfileEditorPayload | null;
  slug: string;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/social/profile/me", {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { profile: null, slug: "", error: `HTTP ${response.status}` };
    }

    const payload = (await response.json()) as {
      slug?: unknown;
      profile?: {
        displayName?: unknown;
        username?: unknown;
        avatarUrl?: unknown;
        coverUrl?: unknown;
        bio?: unknown;
      } | null;
    };

    const profile = payload.profile
      ? {
          displayName: String(payload.profile.displayName ?? "").trim().slice(0, 120),
          username: normalizeSlug(payload.profile.username) || undefined,
          avatarUrl: typeof payload.profile.avatarUrl === "string" ? payload.profile.avatarUrl.slice(0, 3000) : undefined,
          coverUrl: typeof payload.profile.coverUrl === "string" ? payload.profile.coverUrl.slice(0, 3000) : undefined,
          bio: typeof payload.profile.bio === "string" ? payload.profile.bio.slice(0, 500) : undefined,
        }
      : null;

    return {
      profile: profile && profile.displayName ? profile : null,
      slug: normalizeSlug(payload.slug),
    };
  } catch {
    return { profile: null, slug: "", error: "Network error" };
  }
};

export const updateMyUserProfile = async (payload: UserProfileEditorPayload): Promise<{
  profile: UserProfileEditorPayload | null;
  slug: string;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/social/profile/me", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      cache: "no-store",
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return { profile: null, slug: "", error: `HTTP ${response.status}` };
    }

    const result = await fetchMyUserProfile();
    return result;
  } catch {
    return { profile: null, slug: "", error: "Network error" };
  }
};

export const fetchFollowRelations = async (
  slug: string,
  limit = 120,
): Promise<{ snapshot: FollowRelationsSnapshot | null; error?: string }> => {
  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    return { snapshot: null, error: "Invalid slug" };
  }

  try {
    const response = await fetch(
      `/api/social/follows/relations?slug=${encodeURIComponent(normalizedSlug)}&limit=${Math.max(1, Math.min(300, Math.round(limit)))}`,
      {
        method: "GET",
        headers: getTelegramAuthHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return { snapshot: null, error: `HTTP ${response.status}` };
    }

    const payload = (await response.json()) as {
      slug?: unknown;
      followersSlugs?: unknown;
      followingSlugs?: unknown;
      stats?: unknown;
      profilesBySlug?: unknown;
    };

    return {
      snapshot: {
        slug: normalizeSlug(payload.slug),
        followersSlugs: normalizeStringList(payload.followersSlugs),
        followingSlugs: normalizeStringList(payload.followingSlugs),
        stats: {
          followersCount: normalizeNonNegativeInt((payload.stats as Record<string, unknown> | undefined)?.followersCount),
          followingCount: normalizeNonNegativeInt((payload.stats as Record<string, unknown> | undefined)?.followingCount),
        },
        profilesBySlug: normalizeFollowProfilesMap(payload.profilesBySlug),
      },
    };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const toggleFollowingSlug = async (
  slug: string,
  targetProfile?: { displayName?: string; username?: string; avatarUrl?: string },
): Promise<string[]> => {
  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug || normalizedSlug === "guest") {
    return readFollowingSlugs();
  }

  try {
    const response = await fetch("/api/social/follows", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({
        targetSlug: normalizedSlug,
        targetDisplayName: targetProfile?.displayName,
        targetUsername: targetProfile?.username,
        targetAvatarUrl: targetProfile?.avatarUrl,
      }),
    });

    if (response.ok) {
      const payload = (await response.json()) as { followingSlugs?: unknown };
      const remoteFollowing = normalizeStringList(payload.followingSlugs);
      const local = await readState();

      await writeState({
        ...local,
        followingSlugs: remoteFollowing,
      });

      return remoteFollowing;
    }
  } catch {
    // ignore network errors and keep the last confirmed state
  }

  return readFollowingSlugs();
};

export const readProfileMode = async (viewerKey: string): Promise<ProfileMode> => {
  const state = await readState();
  return normalizeMode(state.profileModeByUser[viewerKey]);
};

export const writeProfileMode = async (viewerKey: string, mode: ProfileMode): Promise<ProfileMode> => {
  const state = await readState();
  const safeMode = normalizeMode(mode);

  await writeState({
    ...state,
    profileModeByUser: {
      ...state.profileModeByUser,
      [viewerKey]: safeMode,
    },
  });

  return safeMode;
};

const viewerTelegramUserIdFromKey = (viewerKey: string): number => {
  const match = /^tg:(\d+)$/.exec(String(viewerKey).trim());

  if (!match) {
    return 0;
  }

  const userId = Math.round(Number(match[1]));
  return Number.isFinite(userId) && userId > 0 ? userId : 0;
};

const isServerBackedViewerKey = (viewerKey: string): boolean => {
  return viewerTelegramUserIdFromKey(viewerKey) > 0;
};

interface SocialStateSnapshotPayload {
  walletCents?: unknown;
  purchasesVisible?: unknown;
  purchasedReleaseSlugs?: unknown;
  purchasedReleaseFormatKeys?: unknown;
  purchasedTrackKeys?: unknown;
  redeemedTopupPromoCodes?: unknown;
  tonWalletAddress?: unknown;
  mintedReleaseNfts?: unknown;
}

interface SocialPublicPurchasesPayload {
  slug?: unknown;
  purchasesVisible?: unknown;
  purchasedReleaseSlugs?: unknown;
}

const normalizeSocialStateSnapshotPayload = (payload: SocialStateSnapshotPayload) => {
  const purchasedReleaseFormatKeys = normalizeReleaseFormatPurchaseKeyList(payload.purchasedReleaseFormatKeys);
  const purchasedReleaseSlugs = Array.from(
    new Set([
      ...normalizeStringList(payload.purchasedReleaseSlugs),
      ...purchasedReleaseFormatKeys
        .map((entry) => entry.split("::", 1)[0] ?? "")
        .filter(Boolean),
    ]),
  );

  return {
    walletCents: normalizeStarsCents(payload.walletCents),
    purchasesVisible: typeof payload.purchasesVisible === "boolean" ? payload.purchasesVisible : true,
    purchasedReleaseSlugs,
    purchasedReleaseFormatKeys,
    purchasedTrackKeys: normalizeTrackPurchaseKeyList(payload.purchasedTrackKeys),
    redeemedTopupPromoCodes: normalizePromoCodeList(payload.redeemedTopupPromoCodes),
    tonWalletAddress: normalizeTonAddress(payload.tonWalletAddress) || undefined,
    mintedReleaseNfts: normalizeMintedReleaseNftList(payload.mintedReleaseNfts),
  };
};

const normalizeSocialPublicPurchasesPayload = (fallbackSlug: string, payload: SocialPublicPurchasesPayload) => {
  const purchasesVisible = typeof payload.purchasesVisible === "boolean" ? payload.purchasesVisible : false;
  const purchasedReleaseSlugs = purchasesVisible ? normalizeStringList(payload.purchasedReleaseSlugs) : [];

  return {
    slug: normalizeSlug(payload.slug) || fallbackSlug,
    purchasesVisible,
    purchasedReleaseSlugs,
  };
};

export const readPublicPurchasesBySlug = async (slug: string): Promise<{
  slug: string;
  purchasesVisible: boolean;
  purchasedReleaseSlugs: string[];
}> => {
  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    return {
      slug: "",
      purchasesVisible: false,
      purchasedReleaseSlugs: [],
    };
  }

  try {
    const response = await fetch(`/api/social/state?slug=${encodeURIComponent(normalizedSlug)}`, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return {
        slug: normalizedSlug,
        purchasesVisible: false,
        purchasedReleaseSlugs: [],
      };
    }

    const payload = (await response.json()) as SocialPublicPurchasesPayload;
    return normalizeSocialPublicPurchasesPayload(normalizedSlug, payload);
  } catch {
    return {
      slug: normalizedSlug,
      purchasesVisible: false,
      purchasedReleaseSlugs: [],
    };
  }
};

const readServerBackedSocialState = async (viewerKey: string) => {
  if (!isServerBackedViewerKey(viewerKey)) {
    return null;
  }

  try {
    const response = await fetch("/api/social/state", {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as SocialStateSnapshotPayload;
    return normalizeSocialStateSnapshotPayload(payload);
  } catch {
    return null;
  }
};

const mutateServerBackedSocialState = async (viewerKey: string, body: Record<string, unknown>) => {
  if (!isServerBackedViewerKey(viewerKey)) {
    return null;
  }

  try {
    const response = await fetch("/api/social/state", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      cache: "no-store",
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
};

export const readWalletBalanceCents = async (viewerKey: string): Promise<number> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.walletCents ?? 0;
  }

  const state = await readState();
  const existing = normalizeStarsCents(state.walletCentsByUser[viewerKey]);

  if (Object.prototype.hasOwnProperty.call(state.walletCentsByUser, viewerKey)) {
    return existing;
  }

  const initial = 0;

  await writeState({
    ...state,
    walletCentsByUser: {
      ...state.walletCentsByUser,
      [viewerKey]: initial,
    },
  });

  return initial;
};

export const topUpWalletBalanceCents = async (viewerKey: string, amountCents: number): Promise<number> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const amount = Math.max(1, normalizeStarsCents(amountCents));
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "wallet_topup",
      amountCents: amount,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "walletCents")) {
      return normalizeStarsCents(payload.walletCents);
    }

    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.walletCents ?? 0;
  }

  const state = await readState();
  const current = normalizeStarsCents(state.walletCentsByUser[viewerKey]);
  const amount = Math.max(1, normalizeStarsCents(amountCents));
  const next = current + amount;

  await writeState({
    ...state,
    walletCentsByUser: {
      ...state.walletCentsByUser,
      [viewerKey]: next,
    },
  });

  return next;
};

export const spendWalletBalanceCents = async (viewerKey: string, amountCents: number): Promise<{ ok: boolean; balanceCents: number }> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const amount = Math.max(1, normalizeStarsCents(amountCents));
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "wallet_spend",
      amountCents: amount,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      return {
        ok: Boolean(payload.ok),
        balanceCents: normalizeStarsCents(payload.balanceCents),
      };
    }

    const snapshot = await readServerBackedSocialState(viewerKey);
    return {
      ok: false,
      balanceCents: snapshot?.walletCents ?? 0,
    };
  }

  const state = await readState();
  const current = normalizeStarsCents(state.walletCentsByUser[viewerKey]);
  const amount = Math.max(1, normalizeStarsCents(amountCents));

  if (current < amount) {
    return { ok: false, balanceCents: current };
  }

  const next = current - amount;

  await writeState({
    ...state,
    walletCentsByUser: {
      ...state.walletCentsByUser,
      [viewerKey]: next,
    },
  });

  return { ok: true, balanceCents: next };
};

export const readTonWalletAddress = async (viewerKey: string): Promise<string> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.tonWalletAddress ?? "";
  }

  const state = await readState();
  return normalizeTonAddress(state.tonWalletAddressByUser[viewerKey]);
};

export const writeTonWalletAddress = async (viewerKey: string, address: string): Promise<string> => {
  const normalizedAddress = normalizeTonAddress(address);
  if (!normalizedAddress) {
    return "";
  }

  if (isServerBackedViewerKey(viewerKey)) {
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "ton_wallet_set",
      address: normalizedAddress,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "tonWalletAddress")) {
      return normalizeTonAddress(payload.tonWalletAddress);
    }

    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.tonWalletAddress ?? "";
  }

  const state = await readState();

  await writeState({
    ...state,
    tonWalletAddressByUser: {
      ...state.tonWalletAddressByUser,
      [viewerKey]: normalizedAddress,
    },
  });

  return normalizedAddress;
};

export const clearTonWalletAddress = async (viewerKey: string): Promise<void> => {
  if (isServerBackedViewerKey(viewerKey)) {
    await mutateServerBackedSocialState(viewerKey, {
      action: "ton_wallet_clear",
    });
    return;
  }

  const state = await readState();
  const next = { ...state.tonWalletAddressByUser };
  delete next[viewerKey];

  await writeState({
    ...state,
    tonWalletAddressByUser: next,
  });
};

export const topUpWalletBalanceFromTonCents = async (
  viewerKey: string,
  amountCents: number,
  txHash?: string,
): Promise<{ walletCents: number; creditedCents: number }> => {
  const amount = Math.max(1, normalizeStarsCents(amountCents));
  const normalizedTxHash = normalizeOptionalText(txHash, 256);

  if (isServerBackedViewerKey(viewerKey)) {
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "wallet_topup_ton",
      amountCents: amount,
      txHash: normalizedTxHash,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "walletCents")) {
      return {
        walletCents: normalizeStarsCents(payload.walletCents),
        creditedCents: normalizeStarsCents(payload.creditedCents ?? amount),
      };
    }

    return {
      walletCents: await readWalletBalanceCents(viewerKey),
      creditedCents: amount,
    };
  }

  const walletCents = await topUpWalletBalanceCents(viewerKey, amount);
  return {
    walletCents,
    creditedCents: amount,
  };
};

export const readPurchasesVisibility = async (viewerKey: string): Promise<boolean> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.purchasesVisible ?? true;
  }

  const state = await readState();

  if (typeof state.purchasesVisibleByUser[viewerKey] === "boolean") {
    return state.purchasesVisibleByUser[viewerKey];
  }

  return true;
};

export const writePurchasesVisibility = async (viewerKey: string, isVisible: boolean): Promise<boolean> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "purchases_visibility_set",
      isVisible: Boolean(isVisible),
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "purchasesVisible")) {
      return Boolean(payload.purchasesVisible);
    }

    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.purchasesVisible ?? true;
  }

  const state = await readState();

  await writeState({
    ...state,
    purchasesVisibleByUser: {
      ...state.purchasesVisibleByUser,
      [viewerKey]: Boolean(isVisible),
    },
  });

  return Boolean(isVisible);
};

const prependUniqueValues = (current: string[], values: string[]): string[] => {
  const next = [...current];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (!value || next.includes(value)) {
      continue;
    }

    next.unshift(value);
  }

  return next;
};

export const readPurchasedReleaseSlugs = async (viewerKey: string): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.purchasedReleaseSlugs ?? [];
  }

  const state = await readState();
  const releaseFormatKeys = normalizeReleaseFormatPurchaseKeyList(
    state.purchasedReleaseFormatKeysByUser[viewerKey],
  );

  return Array.from(
    new Set([
      ...normalizeStringList(state.purchasedReleaseSlugsByUser[viewerKey]),
      ...releaseFormatKeys
        .map((entry) => entry.split("::", 1)[0] ?? "")
        .filter(Boolean),
    ]),
  );
};

export const readPurchasedReleaseFormatKeys = async (viewerKey: string): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.purchasedReleaseFormatKeys ?? [];
  }

  const state = await readState();
  return normalizeReleaseFormatPurchaseKeyList(
    state.purchasedReleaseFormatKeysByUser[viewerKey],
  );
};

export const toPurchasedReleaseFormatKey = (releaseSlug: string, format: string): string => {
  return toReleaseFormatPurchaseKey(releaseSlug, format);
};

export const appendPurchasedReleaseSlug = async (viewerKey: string, releaseSlug: string): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const normalizedSlug = normalizeSlug(releaseSlug);

    if (!normalizedSlug) {
      return readPurchasedReleaseSlugs(viewerKey);
    }

    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "release_append",
      releaseSlug: normalizedSlug,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "purchasedReleaseSlugs")) {
      return normalizeStringList(payload.purchasedReleaseSlugs);
    }

    return readPurchasedReleaseSlugs(viewerKey);
  }

  const normalizedSlug = normalizeSlug(releaseSlug);

  if (!normalizedSlug) {
    return readPurchasedReleaseSlugs(viewerKey);
  }

  const state = await readState();
  const existing = normalizeStringList(state.purchasedReleaseSlugsByUser[viewerKey]);
  const next = existing.includes(normalizedSlug) ? existing : [normalizedSlug, ...existing];

  await writeState({
    ...state,
    purchasedReleaseSlugsByUser: {
      ...state.purchasedReleaseSlugsByUser,
      [viewerKey]: next,
    },
  });

  return next;
};

export const readPurchasedTrackKeys = async (viewerKey: string): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.purchasedTrackKeys ?? [];
  }

  const state = await readState();
  return normalizeTrackPurchaseKeyList(state.purchasedTrackKeysByUser[viewerKey]);
};

export const toPurchasedTrackKey = (releaseSlug: string, trackId: string): string => {
  return toTrackPurchaseKey(releaseSlug, trackId);
};

export const appendPurchasedTrackKey = async (
  viewerKey: string,
  releaseSlug: string,
  trackId: string,
): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const key = toTrackPurchaseKey(releaseSlug, trackId);

    if (!key) {
      return readPurchasedTrackKeys(viewerKey);
    }

    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "track_append",
      releaseSlug,
      trackId,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "purchasedTrackKeys")) {
      return normalizeTrackPurchaseKeyList(payload.purchasedTrackKeys);
    }

    return readPurchasedTrackKeys(viewerKey);
  }

  const key = toTrackPurchaseKey(releaseSlug, trackId);

  if (!key) {
    return readPurchasedTrackKeys(viewerKey);
  }

  const state = await readState();
  const existing = normalizeTrackPurchaseKeyList(state.purchasedTrackKeysByUser[viewerKey]);
  const next = existing.includes(key) ? existing : [key, ...existing];

  await writeState({
    ...state,
    purchasedTrackKeysByUser: {
      ...state.purchasedTrackKeysByUser,
      [viewerKey]: next,
    },
  });

  return next;
};

export const appendPurchasedTrackKeys = async (
  viewerKey: string,
  releaseSlug: string,
  trackIds: string[],
): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const normalizedKeys = trackIds
      .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
      .filter(Boolean);

    if (normalizedKeys.length === 0) {
      return readPurchasedTrackKeys(viewerKey);
    }

    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "tracks_append",
      releaseSlug,
      trackIds,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "purchasedTrackKeys")) {
      return normalizeTrackPurchaseKeyList(payload.purchasedTrackKeys);
    }

    return readPurchasedTrackKeys(viewerKey);
  }

  const normalizedKeys = trackIds
    .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
    .filter(Boolean);

  if (normalizedKeys.length === 0) {
    return readPurchasedTrackKeys(viewerKey);
  }

  const state = await readState();
  const existing = normalizeTrackPurchaseKeyList(state.purchasedTrackKeysByUser[viewerKey]);
  const next = prependUniqueValues(existing, normalizedKeys);

  await writeState({
    ...state,
    purchasedTrackKeysByUser: {
      ...state.purchasedTrackKeysByUser,
      [viewerKey]: next,
    },
  });

  return next;
};

export const appendPurchasedReleaseWithTracks = async (
  viewerKey: string,
  releaseSlug: string,
  trackIds: string[],
): Promise<{ releaseSlugs: string[]; trackKeys: string[] }> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const normalizedReleaseSlug = normalizeSlug(releaseSlug);
    const normalizedTrackKeys = trackIds
      .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
      .filter(Boolean);

    if (!normalizedReleaseSlug && normalizedTrackKeys.length === 0) {
      return {
        releaseSlugs: await readPurchasedReleaseSlugs(viewerKey),
        trackKeys: await readPurchasedTrackKeys(viewerKey),
      };
    }

    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "release_with_tracks_append",
      releaseSlug,
      trackIds,
    });

    if (
      payload &&
      Object.prototype.hasOwnProperty.call(payload, "releaseSlugs") &&
      Object.prototype.hasOwnProperty.call(payload, "trackKeys")
    ) {
      return {
        releaseSlugs: normalizeStringList(payload.releaseSlugs),
        trackKeys: normalizeTrackPurchaseKeyList(payload.trackKeys),
      };
    }

    return {
      releaseSlugs: await readPurchasedReleaseSlugs(viewerKey),
      trackKeys: await readPurchasedTrackKeys(viewerKey),
    };
  }

  const normalizedReleaseSlug = normalizeSlug(releaseSlug);
  const normalizedTrackKeys = trackIds
    .map((trackId) => toTrackPurchaseKey(releaseSlug, trackId))
    .filter(Boolean);

  if (!normalizedReleaseSlug && normalizedTrackKeys.length === 0) {
    return {
      releaseSlugs: await readPurchasedReleaseSlugs(viewerKey),
      trackKeys: await readPurchasedTrackKeys(viewerKey),
    };
  }

  const state = await readState();
  const existingReleaseSlugs = normalizeStringList(state.purchasedReleaseSlugsByUser[viewerKey]);
  const existingTrackKeys = normalizeTrackPurchaseKeyList(state.purchasedTrackKeysByUser[viewerKey]);
  const nextReleaseSlugs =
    normalizedReleaseSlug && !existingReleaseSlugs.includes(normalizedReleaseSlug)
      ? [normalizedReleaseSlug, ...existingReleaseSlugs]
      : existingReleaseSlugs;
  const nextTrackKeys = prependUniqueValues(existingTrackKeys, normalizedTrackKeys);

  await writeState({
    ...state,
    purchasedReleaseSlugsByUser: {
      ...state.purchasedReleaseSlugsByUser,
      [viewerKey]: nextReleaseSlugs,
    },
    purchasedTrackKeysByUser: {
      ...state.purchasedTrackKeysByUser,
      [viewerKey]: nextTrackKeys,
    },
  });

  return {
    releaseSlugs: nextReleaseSlugs,
    trackKeys: nextTrackKeys,
  };
};

export const purchaseReleaseWithWallet = async (
  viewerKey: string,
  input: {
    releaseSlug: string;
    trackIds: string[];
    amountCents: number;
    format: string;
  },
): Promise<
  | {
      ok: true;
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
  | {
      ok: false;
      reason: "already_owned" | "insufficient_funds";
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
> => {
  const normalizedReleaseSlug = normalizeSlug(input.releaseSlug);
  const normalizedFormat = normalizeReleaseFormat(input.format);
  const normalizedReleaseFormatKey = toReleaseFormatPurchaseKey(
    input.releaseSlug,
    input.format,
  );
  const normalizedAmount = Math.max(1, normalizeStarsCents(input.amountCents));
  const normalizedTrackIds = Array.isArray(input.trackIds) ? input.trackIds : [];

  if (!normalizedReleaseSlug || !normalizedFormat || !normalizedReleaseFormatKey) {
    return {
      ok: false,
      reason: "already_owned",
      balanceCents: await readWalletBalanceCents(viewerKey),
      releaseSlugs: await readPurchasedReleaseSlugs(viewerKey),
      releaseFormatKeys: await readPurchasedReleaseFormatKeys(viewerKey),
      trackKeys: await readPurchasedTrackKeys(viewerKey),
    };
  }

  if (isServerBackedViewerKey(viewerKey)) {
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "release_wallet_purchase",
      releaseSlug: normalizedReleaseSlug,
      trackIds: normalizedTrackIds,
      amountCents: normalizedAmount,
      format: normalizedFormat,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      const normalized = {
        balanceCents: normalizeStarsCents(payload.balanceCents),
        releaseSlugs: normalizeStringList(payload.releaseSlugs),
        releaseFormatKeys: normalizeReleaseFormatPurchaseKeyList(
          payload.releaseFormatKeys,
        ),
        trackKeys: normalizeTrackPurchaseKeyList(payload.trackKeys),
      };

      if (Boolean(payload.ok)) {
        return {
          ok: true,
          ...normalized,
        };
      }

      return {
        ok: false,
        reason: String(payload.reason ?? "") === "insufficient_funds" ? "insufficient_funds" : "already_owned",
        ...normalized,
      };
    }
  }

  const releaseSlugs = await readPurchasedReleaseSlugs(viewerKey);
  const releaseFormatKeys = await readPurchasedReleaseFormatKeys(viewerKey);
  const trackKeys = await readPurchasedTrackKeys(viewerKey);
  const balanceCents = await readWalletBalanceCents(viewerKey);

  if (releaseFormatKeys.includes(normalizedReleaseFormatKey)) {
    return {
      ok: false,
      reason: "already_owned",
      balanceCents,
      releaseSlugs,
      releaseFormatKeys,
      trackKeys,
    };
  }

  if (balanceCents < normalizedAmount) {
    return {
      ok: false,
      reason: "insufficient_funds",
      balanceCents,
      releaseSlugs,
      releaseFormatKeys,
      trackKeys,
    };
  }

  const payment = await spendWalletBalanceCents(viewerKey, normalizedAmount);
  if (!payment.ok) {
    return {
      ok: false,
      reason: "insufficient_funds",
      balanceCents: payment.balanceCents,
      releaseSlugs,
      releaseFormatKeys,
      trackKeys,
    };
  }

  const state = await readState();
  const existingReleaseSlugs = normalizeStringList(
    state.purchasedReleaseSlugsByUser[viewerKey],
  );
  const existingReleaseFormatKeys = normalizeReleaseFormatPurchaseKeyList(
    state.purchasedReleaseFormatKeysByUser[viewerKey],
  );
  const existingTrackKeys = normalizeTrackPurchaseKeyList(
    state.purchasedTrackKeysByUser[viewerKey],
  );
  const nextReleaseSlugs = existingReleaseSlugs.includes(normalizedReleaseSlug)
    ? existingReleaseSlugs
    : [normalizedReleaseSlug, ...existingReleaseSlugs];
  const nextReleaseFormatKeys = prependUniqueValues(existingReleaseFormatKeys, [
    normalizedReleaseFormatKey,
  ]);
  const nextTrackKeys = prependUniqueValues(
    existingTrackKeys,
    normalizedTrackIds
      .map((trackId) => toTrackPurchaseKey(normalizedReleaseSlug, trackId))
      .filter(Boolean),
  );

  await writeState({
    ...state,
    purchasedReleaseSlugsByUser: {
      ...state.purchasedReleaseSlugsByUser,
      [viewerKey]: nextReleaseSlugs,
    },
    purchasedReleaseFormatKeysByUser: {
      ...state.purchasedReleaseFormatKeysByUser,
      [viewerKey]: nextReleaseFormatKeys,
    },
    purchasedTrackKeysByUser: {
      ...state.purchasedTrackKeysByUser,
      [viewerKey]: nextTrackKeys,
    },
  });

  return {
    ok: true,
    balanceCents: payment.balanceCents,
    releaseSlugs: nextReleaseSlugs,
    releaseFormatKeys: nextReleaseFormatKeys,
    trackKeys: nextTrackKeys,
  };
};

export const purchaseTrackWithWallet = async (
  viewerKey: string,
  input: {
    releaseSlug: string;
    trackId: string;
    amountCents: number;
  },
): Promise<
  | {
      ok: true;
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
  | {
      ok: false;
      reason: "already_owned" | "insufficient_funds";
      balanceCents: number;
      releaseSlugs: string[];
      releaseFormatKeys: string[];
      trackKeys: string[];
    }
> => {
  const normalizedReleaseSlug = normalizeSlug(input.releaseSlug);
  const normalizedTrackKey = toTrackPurchaseKey(input.releaseSlug, input.trackId);
  const normalizedAmount = Math.max(1, normalizeStarsCents(input.amountCents));

  if (!normalizedReleaseSlug || !normalizedTrackKey) {
    return {
      ok: false,
      reason: "already_owned",
      balanceCents: await readWalletBalanceCents(viewerKey),
      releaseSlugs: await readPurchasedReleaseSlugs(viewerKey),
      releaseFormatKeys: await readPurchasedReleaseFormatKeys(viewerKey),
      trackKeys: await readPurchasedTrackKeys(viewerKey),
    };
  }

  if (isServerBackedViewerKey(viewerKey)) {
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "track_wallet_purchase",
      releaseSlug: normalizedReleaseSlug,
      trackId: input.trackId,
      amountCents: normalizedAmount,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      const normalized = {
        balanceCents: normalizeStarsCents(payload.balanceCents),
        releaseSlugs: normalizeStringList(payload.releaseSlugs),
        releaseFormatKeys: normalizeReleaseFormatPurchaseKeyList(
          payload.releaseFormatKeys,
        ),
        trackKeys: normalizeTrackPurchaseKeyList(payload.trackKeys),
      };

      if (Boolean(payload.ok)) {
        return {
          ok: true,
          ...normalized,
        };
      }

      return {
        ok: false,
        reason:
          String(payload.reason ?? "") === "insufficient_funds"
            ? "insufficient_funds"
            : "already_owned",
        ...normalized,
      };
    }
  }

  const releaseSlugs = await readPurchasedReleaseSlugs(viewerKey);
  const releaseFormatKeys = await readPurchasedReleaseFormatKeys(viewerKey);
  const trackKeys = await readPurchasedTrackKeys(viewerKey);
  const balanceCents = await readWalletBalanceCents(viewerKey);

  if (trackKeys.includes(normalizedTrackKey)) {
    return {
      ok: false,
      reason: "already_owned",
      balanceCents,
      releaseSlugs,
      releaseFormatKeys,
      trackKeys,
    };
  }

  if (balanceCents < normalizedAmount) {
    return {
      ok: false,
      reason: "insufficient_funds",
      balanceCents,
      releaseSlugs,
      releaseFormatKeys,
      trackKeys,
    };
  }

  const payment = await spendWalletBalanceCents(viewerKey, normalizedAmount);
  if (!payment.ok) {
    return {
      ok: false,
      reason: "insufficient_funds",
      balanceCents: payment.balanceCents,
      releaseSlugs,
      releaseFormatKeys,
      trackKeys,
    };
  }

  const state = await readState();
  const existingTrackKeys = normalizeTrackPurchaseKeyList(
    state.purchasedTrackKeysByUser[viewerKey],
  );
  const nextTrackKeys = prependUniqueValues(existingTrackKeys, [
    normalizedTrackKey,
  ]);

  await writeState({
    ...state,
    purchasedTrackKeysByUser: {
      ...state.purchasedTrackKeysByUser,
      [viewerKey]: nextTrackKeys,
    },
  });

  return {
    ok: true,
    balanceCents: payment.balanceCents,
    releaseSlugs,
    releaseFormatKeys,
    trackKeys: nextTrackKeys,
  };
};

export const readMintedReleaseNfts = async (viewerKey: string): Promise<MintedReleaseNft[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.mintedReleaseNfts ?? [];
  }

  const state = await readState();
  return normalizeMintedReleaseNftList(state.mintedReleaseNftsByUser[viewerKey]);
};

export const mintPurchasedReleaseNft = async (
  viewerKey: string,
  input: {
    releaseSlug: string;
    ownerAddress?: string;
    txHash?: string;
    collectionAddress?: string;
    itemAddress?: string;
    itemIndex?: string;
  },
): Promise<
  | {
      ok: true;
      alreadyMinted: boolean;
      nft: MintedReleaseNft;
      mintedReleaseNfts: MintedReleaseNft[];
    }
  | {
      ok: false;
      reason: "not_purchased" | "wallet_required";
      mintedReleaseNfts: MintedReleaseNft[];
    }
> => {
  const releaseSlug = normalizeSlug(input.releaseSlug);
  const ownerAddress = normalizeTonAddress(input.ownerAddress);
  const txHash = normalizeOptionalText(input.txHash, 256);
  const collectionAddress = normalizeOptionalText(normalizeTonAddress(input.collectionAddress), 160);
  const itemAddress = normalizeOptionalText(normalizeTonAddress(input.itemAddress), 160);
  const itemIndex = normalizeOptionalBigIntString(input.itemIndex);

  if (!releaseSlug) {
    return {
      ok: false,
      reason: "not_purchased",
      mintedReleaseNfts: await readMintedReleaseNfts(viewerKey),
    };
  }

  if (isServerBackedViewerKey(viewerKey)) {
    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "release_nft_mint",
      releaseSlug,
      ownerAddress,
      txHash,
      collectionAddress,
      itemAddress,
      itemIndex,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      if (Boolean(payload.ok)) {
        const nft = normalizeMintedReleaseNft(payload.nft);
        const mintedReleaseNfts = normalizeMintedReleaseNftList(payload.mintedReleaseNfts);

        if (nft) {
          return {
            ok: true,
            alreadyMinted: Boolean(payload.alreadyMinted),
            nft,
            mintedReleaseNfts,
          };
        }
      } else {
        return {
          ok: false,
          reason: String(payload.reason ?? "") === "wallet_required" ? "wallet_required" : "not_purchased",
          mintedReleaseNfts: normalizeMintedReleaseNftList(payload.mintedReleaseNfts),
        };
      }
    }
  }

  const walletAddress = ownerAddress || (await readTonWalletAddress(viewerKey));
  if (!walletAddress) {
    return {
      ok: false,
      reason: "wallet_required",
      mintedReleaseNfts: await readMintedReleaseNfts(viewerKey),
    };
  }

  const releaseSlugs = await readPurchasedReleaseSlugs(viewerKey);
  if (!releaseSlugs.includes(releaseSlug)) {
    return {
      ok: false,
      reason: "not_purchased",
      mintedReleaseNfts: await readMintedReleaseNfts(viewerKey),
    };
  }

  const state = await readState();
  const existing = normalizeMintedReleaseNftList(state.mintedReleaseNftsByUser[viewerKey]);
  const alreadyMinted = existing.find((entry) => entry.releaseSlug === releaseSlug);
  if (alreadyMinted) {
    return {
      ok: true,
      alreadyMinted: true,
      nft: alreadyMinted,
      mintedReleaseNfts: existing,
    };
  }

  const mintedAt = new Date().toISOString();
  const idSeed = `nft:${releaseSlug}:${mintedAt}`;
  const nft: MintedReleaseNft = {
    id: normalizeMintedNftId(idSeed, idSeed),
    releaseSlug,
    ownerAddress: walletAddress,
    collectionAddress,
    itemAddress,
    itemIndex,
    txHash,
    mintedAt,
    status: "minted",
  };
  const nextMinted = normalizeMintedReleaseNftList([nft, ...existing]);

  await writeState({
    ...state,
    tonWalletAddressByUser: {
      ...state.tonWalletAddressByUser,
      [viewerKey]: walletAddress,
    },
    mintedReleaseNftsByUser: {
      ...state.mintedReleaseNftsByUser,
      [viewerKey]: nextMinted,
    },
  });

  return {
    ok: true,
    alreadyMinted: false,
    nft,
    mintedReleaseNfts: nextMinted,
  };
};

export const readRedeemedTopupPromoCodes = async (viewerKey: string): Promise<string[]> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const snapshot = await readServerBackedSocialState(viewerKey);
    return snapshot?.redeemedTopupPromoCodes ?? [];
  }

  const state = await readState();
  return normalizePromoCodeList(state.redeemedTopupPromoCodesByUser[viewerKey]);
};

export const redeemTopupPromoCode = async (
  viewerKey: string,
  code: string,
): Promise<{ ok: boolean; normalizedCode: string; alreadyRedeemed: boolean; redeemedCodes: string[] }> => {
  if (isServerBackedViewerKey(viewerKey)) {
    const normalizedCode = normalizePromoCode(code);

    if (!normalizedCode) {
      return {
        ok: false,
        normalizedCode: "",
        alreadyRedeemed: false,
        redeemedCodes: await readRedeemedTopupPromoCodes(viewerKey),
      };
    }

    const payload = await mutateServerBackedSocialState(viewerKey, {
      action: "promo_redeem",
      code: normalizedCode,
    });

    if (payload && Object.prototype.hasOwnProperty.call(payload, "ok")) {
      return {
        ok: Boolean(payload.ok),
        normalizedCode: normalizePromoCode(payload.normalizedCode),
        alreadyRedeemed: Boolean(payload.alreadyRedeemed),
        redeemedCodes: normalizePromoCodeList(payload.redeemedCodes),
      };
    }

    return {
      ok: false,
      normalizedCode,
      alreadyRedeemed: false,
      redeemedCodes: await readRedeemedTopupPromoCodes(viewerKey),
    };
  }

  const normalizedCode = normalizePromoCode(code);

  if (!normalizedCode) {
    return {
      ok: false,
      normalizedCode: "",
      alreadyRedeemed: false,
      redeemedCodes: await readRedeemedTopupPromoCodes(viewerKey),
    };
  }

  const state = await readState();
  const existing = normalizePromoCodeList(state.redeemedTopupPromoCodesByUser[viewerKey]);

  if (existing.includes(normalizedCode)) {
    return {
      ok: true,
      normalizedCode,
      alreadyRedeemed: true,
      redeemedCodes: existing,
    };
  }

  const next = [normalizedCode, ...existing];

  await writeState({
    ...state,
    redeemedTopupPromoCodesByUser: {
      ...state.redeemedTopupPromoCodesByUser,
      [viewerKey]: next,
    },
  });

  return {
    ok: true,
    normalizedCode,
    alreadyRedeemed: false,
    redeemedCodes: next,
  };
};

export const buildPublicProfiles = (input: {
  artists: ShopCatalogArtist[];
  products: ShopProduct[];
  followingSlugs: string[];
  currentViewer?: ViewerIdentity | null;
  currentMode: ProfileMode;
  currentPurchasesVisible: boolean;
  currentPurchasedReleaseSlugs: string[];
  followStatsBySlug?: Record<string, FollowStatsEntry>;
  followProfilesBySlug?: Record<string, FollowProfileEntry>;
}): PublicProfile[] => {
  const digitalReleases = input.products.filter((item) => item.kind === "digital_track");
  const followStatsBySlug = input.followStatsBySlug ?? {};
  const followProfilesBySlug = input.followProfilesBySlug ?? {};
  const normalizedFollowingSlugs = Array.from(new Set(input.followingSlugs.map((slug) => normalizeSlug(slug)).filter(Boolean)));
  const statForSlug = (slug: string): FollowStatsEntry | undefined => {
    const normalized = normalizeSlug(slug);
    return normalized ? followStatsBySlug[normalized] : undefined;
  };
  const profileHintBySlug = (slug: string): FollowProfileEntry | undefined => {
    const normalized = normalizeSlug(slug);
    return normalized ? followProfilesBySlug[normalized] : undefined;
  };
  const buildListenerProfile = (slug: string, followersCount: number, followingCount: number): PublicProfile => {
    const hint = profileHintBySlug(slug);
    const prettyName = slug
      .split("-")
      .filter(Boolean)
      .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
      .join(" ");

    return {
      slug,
      displayName: hint?.displayName || prettyName || slug,
      username: hint?.username || (slug.startsWith("user-") ? undefined : slug),
      avatarUrl: hint?.avatarUrl,
      coverUrl: hint?.coverUrl,
      bio: hint?.bio || "",
      mode: "listener",
      followersCount: normalizeNonNegativeInt(followersCount),
      followingCount: normalizeNonNegativeInt(followingCount),
      topGenres: [],
      awards: buildListenerAwards(0, normalizeNonNegativeInt(followersCount)),
      purchasesVisible: false,
      purchasedReleaseSlugs: [],
    };
  };

  const artistProfiles: PublicProfile[] = input.artists.map((artist) => {
    const ownReleases = digitalReleases.filter((release) => normalizeSlug(release.artistSlug) === normalizeSlug(artist.slug));
    const dynamicStats = statForSlug(artist.slug);
    const followersCount = dynamicStats ? dynamicStats.followersCount : artist.followersCount;
    const followingCount = dynamicStats ? dynamicStats.followingCount : 0;

    return {
      slug: normalizeSlug(artist.slug),
      displayName: artist.displayName,
      username: undefined,
      avatarUrl: artist.avatarUrl,
      coverUrl: artist.coverUrl,
      bio: artist.bio || "",
      mode: "artist",
      followersCount: normalizeNonNegativeInt(followersCount),
      followingCount: normalizeNonNegativeInt(followingCount),
      isVerified: true,
      topGenres: [
        ...new Set(
          ownReleases
            .map((release) => release.subcategoryLabel || release.attributes.collection)
            .filter(Boolean)
            .slice(0, 3),
        ),
      ],
      awards: buildArtistAwards(artist, ownReleases.length),
      purchasesVisible: true,
      purchasedReleaseSlugs: ownReleases.slice(0, 4).map((release) => release.slug),
    };
  });

  const bySlug = new Map<string, PublicProfile>();

  artistProfiles.forEach((profile) => {
    const slug = normalizeSlug(profile.slug);

    if (!slug) {
      return;
    }

    bySlug.set(slug, { ...profile, slug });
  });

  Array.from(
    new Set([
      ...normalizedFollowingSlugs,
      ...Object.keys(followProfilesBySlug),
      ...Object.keys(followStatsBySlug),
    ]),
  ).forEach((rawSlug) => {
    const slug = normalizeSlug(rawSlug);
    if (!slug || bySlug.has(slug)) {
      return;
    }

    const dynamicStats = statForSlug(slug);
    bySlug.set(
      slug,
      buildListenerProfile(
        slug,
        dynamicStats?.followersCount ?? 0,
        dynamicStats?.followingCount ?? 0,
      ),
    );
  });

  const viewer = input.currentViewer;

  if (viewer?.id || viewer?.username) {
    const viewerSlug = profileSlugFromIdentity({
      username: viewer.username,
      telegramUserId: viewer.id,
      fallback: "me",
    });

    const existing = bySlug.get(viewerSlug);
    const displayName = resolveViewerName(viewer);
    const dynamicStats = statForSlug(viewerSlug);
    const followersCount = normalizeNonNegativeInt(dynamicStats?.followersCount ?? existing?.followersCount ?? 0);
    const followingCount = normalizeNonNegativeInt(
      dynamicStats?.followingCount ?? Math.max(normalizedFollowingSlugs.length, existing?.followingCount ?? 0),
    );

    bySlug.set(viewerSlug, {
      slug: viewerSlug,
      displayName,
      username: normalizeSlug(viewer.username) || undefined,
      avatarUrl: typeof viewer.photo_url === "string" ? viewer.photo_url : existing?.avatarUrl,
      coverUrl: profileHintBySlug(viewerSlug)?.coverUrl ?? existing?.coverUrl,
      bio: profileHintBySlug(viewerSlug)?.bio || existing?.bio || "",
      mode: input.currentMode,
      followersCount,
      followingCount,
      isVerified: existing?.isVerified,
      topGenres: existing?.topGenres ?? [],
      awards: buildListenerAwards(input.currentPurchasedReleaseSlugs.length, followersCount),
      purchasesVisible: input.currentPurchasesVisible,
      purchasedReleaseSlugs: Array.from(new Set(input.currentPurchasedReleaseSlugs)),
    });
  }

  Object.entries(followStatsBySlug).forEach(([rawSlug, stats]) => {
    const slug = normalizeSlug(rawSlug);
    if (!slug) {
      return;
    }

    const followersCount = normalizeNonNegativeInt(stats.followersCount);
    const followingCount = normalizeNonNegativeInt(stats.followingCount);
    const existing = bySlug.get(slug);

    if (!existing) {
      bySlug.set(slug, buildListenerProfile(slug, followersCount, followingCount));
      return;
    }

    const next: PublicProfile = {
      ...existing,
      followersCount,
      followingCount,
    };

    if (next.mode === "listener") {
      next.awards = buildListenerAwards(next.purchasedReleaseSlugs.length, followersCount);
    }

    bySlug.set(slug, next);
  });

  return Array.from(bySlug.values()).sort((a, b) => {
    if (a.mode !== b.mode) {
      return a.mode === "artist" ? -1 : 1;
    }

    return b.followersCount - a.followersCount;
  });
};

export const buildUnifiedFeed = (input: {
  posts: BlogPost[];
  products: ShopProduct[];
  followingSlugs: string[];
}): UnifiedFeedItem[] => {
  const followingSet = new Set(input.followingSlugs.map((slug) => normalizeSlug(slug)).filter(Boolean));

  const releaseItems: UnifiedFeedItem[] = input.products
    .filter((product) => product.kind === "digital_track")
    .map((product) => {
      const authorSlug = normalizeSlug(product.artistSlug || product.artistName || "artist");
      const publishedAt = product.publishedAt || new Date().toISOString();

      return {
        id: `release:${product.slug}`,
        kind: "release",
        title: product.title,
        subtitle: `${product.artistName || "Artist"} · ${String(product.releaseType || "single").toUpperCase()}`,
        description: product.subtitle || product.description,
        coverUrl: product.image,
        href: `/shop/${product.slug}`,
        publishedAt,
        authorName: product.artistName || "Artist",
        authorSlug,
        tags: product.tags.slice(0, 4),
        priceStarsCents: product.priceStarsCents,
        isFollowedSource: followingSet.has(authorSlug),
        reactionsCount: 0,
        commentsCount: 0,
      };
    });

  const blogItems: UnifiedFeedItem[] = input.posts.map((post) => {
    return {
      id: `blog:${post.slug}`,
      kind: "blog",
      title: post.title,
      subtitle: `Редакционный блог · ${post.readTime}`,
      description: post.excerpt,
      coverUrl: post.cover.src,
      href: `/post/${post.slug}`,
      publishedAt: post.publishedAt,
      authorName: "C3K Editorial",
      authorSlug: "c3k-editorial",
      tags: post.tags.slice(0, 4),
      isFollowedSource: followingSet.has("c3k-editorial"),
      reactionsCount: 0,
      commentsCount: 0,
    };
  });

  return [...releaseItems, ...blogItems].sort((a, b) => parseDate(b.publishedAt) - parseDate(a.publishedAt));
};

export const buildSearchBundle = (input: {
  query: string;
  products: ShopProduct[];
  profiles: PublicProfile[];
  posts: BlogPost[];
}): SearchBundle => {
  const normalized = input.query.trim().toLowerCase();

  const releases = input.products
    .filter((product) => product.kind === "digital_track")
    .filter((product) => {
      if (!normalized) {
        return true;
      }

      const blob = `${product.title} ${product.subtitle} ${product.artistName ?? ""} ${product.tags.join(" ")}`.toLowerCase();
      return blob.includes(normalized);
    })
    .sort((a, b) => Number(b.isHit) - Number(a.isHit) || Number(b.isNew) - Number(a.isNew) || b.rating - a.rating)
    .slice(0, 12)
    .map((product) => ({
      slug: product.slug,
      title: product.title,
      subtitle: product.subtitle,
      artistName: product.artistName,
      image: product.image,
      priceStarsCents: product.priceStarsCents,
    }));

  const matchingProfiles = input.profiles
    .filter((profile) => {
      if (!normalized) {
        return true;
      }

      const blob = `${profile.displayName} ${profile.username ?? ""} ${profile.bio} ${profile.topGenres.join(" ")}`.toLowerCase();
      return blob.includes(normalized);
    })
    .sort((a, b) => b.followersCount - a.followersCount);

  const artists = matchingProfiles.filter((profile) => profile.mode === "artist").slice(0, 8);
  const users = matchingProfiles.filter((profile) => profile.mode === "listener").slice(0, 8);

  const blogPosts = input.posts
    .filter((post) => {
      if (!normalized) {
        return true;
      }

      const blob = `${post.title} ${post.excerpt} ${post.tags.join(" ")}`.toLowerCase();
      return blob.includes(normalized);
    })
    .slice(0, 8)
    .map((post) => ({
      slug: post.slug,
      title: post.title,
      excerpt: post.excerpt,
      cover: post.cover.src,
    }));

  return {
    releases,
    artists,
    users,
    blogPosts,
  };
};

export const buildTelegramShareUrl = (url: string, text: string): string => {
  const safeUrl = String(url || "").trim();
  const safeText = String(text || "").trim();

  return `https://t.me/share/url?url=${encodeURIComponent(safeUrl)}&text=${encodeURIComponent(safeText)}`;
};

export const getAwardStyleClass = (tier: ProfileAward["tier"]): string => {
  return normalizeAwardTier(tier);
};
