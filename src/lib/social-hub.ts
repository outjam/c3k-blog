import { readPersistedString, writePersistedString } from "@/lib/telegram-persist";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { BlogPost } from "@/types/blog";
import type { ShopCatalogArtist, ShopProduct } from "@/types/shop";
import type {
  ProfileAward,
  ProfileMode,
  PublicProfile,
  ReleaseComment,
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
  purchasedTrackKeysByUser: Record<string, string[]>;
  redeemedTopupPromoCodesByUser: Record<string, string[]>;
  releaseCommentsBySlug: Record<string, ReleaseComment[]>;
}

const DEFAULT_STATE: SocialHubState = {
  followingSlugs: [],
  profileModeByUser: {},
  walletCentsByUser: {},
  purchasesVisibleByUser: {},
  purchasedReleaseSlugsByUser: {},
  purchasedTrackKeysByUser: {},
  redeemedTopupPromoCodesByUser: {},
  releaseCommentsBySlug: {},
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

const toTrackPurchaseKey = (releaseSlug: unknown, trackId: unknown): string => {
  const release = normalizeSlug(releaseSlug);
  const track = normalizeTrackId(trackId);

  if (!release || !track) {
    return "";
  }

  return `${release}::${track}`;
};

const normalizeTrackPurchaseKey = (value: unknown): string => {
  const [releaseSlug = "", trackId = ""] = String(value ?? "").split("::", 2);
  return toTrackPurchaseKey(releaseSlug, trackId);
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

const normalizePromoCode = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
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

const normalizeReleaseComment = (value: unknown, releaseSlug: string): ReleaseComment | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Record<string, unknown>;
  const id = String(source.id ?? "").trim();
  const text = String(source.text ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
  const createdAt = String(source.createdAt ?? "").trim();
  const authorSlug = normalizeSlug(source.authorSlug);
  const authorName = String(source.authorName ?? "").trim().slice(0, 120);

  if (!id || !text || !authorSlug || !authorName) {
    return null;
  }

  const timestamp = new Date(createdAt).getTime();

  return {
    id,
    releaseSlug,
    text,
    createdAt: Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : new Date().toISOString(),
    authorSlug,
    authorName,
    authorUsername: normalizeSlug(source.authorUsername) || undefined,
    authorAvatarUrl: typeof source.authorAvatarUrl === "string" ? source.authorAvatarUrl : undefined,
  };
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

  const releaseCommentsBySlug =
    source.releaseCommentsBySlug && typeof source.releaseCommentsBySlug === "object"
      ? Object.fromEntries(
          Object.entries(source.releaseCommentsBySlug as Record<string, unknown>).map(([rawSlug, comments]) => {
            const slug = normalizeSlug(rawSlug);
            const list = Array.isArray(comments)
              ? comments
                  .map((entry) => normalizeReleaseComment(entry, slug))
                  .filter((entry): entry is ReleaseComment => Boolean(entry))
              : [];
            return [slug, list];
          }),
        )
      : {};

  return {
    followingSlugs: normalizeStringList(source.followingSlugs),
    profileModeByUser,
    walletCentsByUser,
    purchasesVisibleByUser,
    purchasedReleaseSlugsByUser,
    purchasedTrackKeysByUser,
    redeemedTopupPromoCodesByUser,
    releaseCommentsBySlug,
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

const generateId = (): string => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

const parseDate = (value: string | undefined): number => {
  if (!value) {
    return 0;
  }

  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const buildListenerAwards = (purchasesCount: number, followersCount: number): ProfileAward[] => {
  const awards: ProfileAward[] = [
    {
      id: "listener-core",
      icon: "🎧",
      title: "Лояльный слушатель",
      description: "Собирает покупки и поддерживает артистов в C3K.",
      tier: "bronze",
    },
  ];

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

  return "Гость";
};

export const readFollowingSlugs = async (): Promise<string[]> => {
  try {
    const response = await fetch("/api/social/follows", {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (response.ok) {
      const payload = (await response.json()) as { followingSlugs?: unknown };
      const remoteFollowing = normalizeStringList(payload.followingSlugs);
      const local = await readState();

      if (JSON.stringify(local.followingSlugs) !== JSON.stringify(remoteFollowing)) {
        await writeState({
          ...local,
          followingSlugs: remoteFollowing,
        });
      }

      return remoteFollowing;
    }
  } catch {
    // ignore network errors and fall back to local state
  }

  const state = await readState();
  return state.followingSlugs;
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
    // ignore network errors and fall back to local state
  }

  const state = await readState();
  const next = state.followingSlugs.includes(normalizedSlug)
    ? state.followingSlugs.filter((value) => value !== normalizedSlug)
    : [normalizedSlug, ...state.followingSlugs];

  await writeState({
    ...state,
    followingSlugs: next,
  });

  return next;
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

export const readWalletBalanceCents = async (viewerKey: string): Promise<number> => {
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

export const readPurchasesVisibility = async (viewerKey: string): Promise<boolean> => {
  const state = await readState();

  if (typeof state.purchasesVisibleByUser[viewerKey] === "boolean") {
    return state.purchasesVisibleByUser[viewerKey];
  }

  return true;
};

export const writePurchasesVisibility = async (viewerKey: string, isVisible: boolean): Promise<boolean> => {
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
  const state = await readState();
  return normalizeStringList(state.purchasedReleaseSlugsByUser[viewerKey]);
};

export const appendPurchasedReleaseSlug = async (viewerKey: string, releaseSlug: string): Promise<string[]> => {
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

export const readRedeemedTopupPromoCodes = async (viewerKey: string): Promise<string[]> => {
  const state = await readState();
  return normalizePromoCodeList(state.redeemedTopupPromoCodesByUser[viewerKey]);
};

export const redeemTopupPromoCode = async (
  viewerKey: string,
  code: string,
): Promise<{ ok: boolean; normalizedCode: string; alreadyRedeemed: boolean; redeemedCodes: string[] }> => {
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

export const readReleaseComments = async (releaseSlug: string): Promise<ReleaseComment[]> => {
  const state = await readState();
  const key = normalizeSlug(releaseSlug);

  if (!key) {
    return [];
  }

  const comments = state.releaseCommentsBySlug[key] ?? [];

  return [...comments].sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt));
};

export const addReleaseComment = async (input: {
  releaseSlug: string;
  text: string;
  authorSlug: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
}): Promise<ReleaseComment[]> => {
  const state = await readState();
  const key = normalizeSlug(input.releaseSlug);
  const text = String(input.text).replace(/\s+/g, " ").trim().slice(0, 600);
  const authorSlug = normalizeSlug(input.authorSlug);
  const authorName = String(input.authorName).trim().slice(0, 120);

  if (!key || text.length < 2 || !authorSlug || !authorName) {
    return readReleaseComments(key);
  }

  const created: ReleaseComment = {
    id: generateId(),
    releaseSlug: key,
    text,
    createdAt: new Date().toISOString(),
    authorSlug,
    authorName,
    authorUsername: normalizeSlug(input.authorUsername) || undefined,
    authorAvatarUrl: input.authorAvatarUrl,
  };

  const current = state.releaseCommentsBySlug[key] ?? [];

  await writeState({
    ...state,
    releaseCommentsBySlug: {
      ...state.releaseCommentsBySlug,
      [key]: [created, ...current],
    },
  });

  return readReleaseComments(key);
};

export const deleteReleaseComment = async (input: {
  releaseSlug: string;
  commentId: string;
  viewerSlug: string;
}): Promise<ReleaseComment[]> => {
  const state = await readState();
  const key = normalizeSlug(input.releaseSlug);
  const viewerSlug = normalizeSlug(input.viewerSlug);

  if (!key || !viewerSlug) {
    return readReleaseComments(key);
  }

  const next = (state.releaseCommentsBySlug[key] ?? []).filter((entry) => {
    if (entry.id !== input.commentId) {
      return true;
    }

    return normalizeSlug(entry.authorSlug) !== viewerSlug;
  });

  await writeState({
    ...state,
    releaseCommentsBySlug: {
      ...state.releaseCommentsBySlug,
      [key]: next,
    },
  });

  return readReleaseComments(key);
};

export const buildPublicProfiles = (input: {
  artists: ShopCatalogArtist[];
  products: ShopProduct[];
  followingSlugs: string[];
  currentViewer?: ViewerIdentity | null;
  currentMode: ProfileMode;
  currentPurchasesVisible: boolean;
  currentPurchasedReleaseSlugs: string[];
}): PublicProfile[] => {
  const digitalReleases = input.products.filter((item) => item.kind === "digital_track");

  const artistProfiles: PublicProfile[] = input.artists.map((artist) => {
    const ownReleases = digitalReleases.filter((release) => normalizeSlug(release.artistSlug) === normalizeSlug(artist.slug));

    return {
      slug: normalizeSlug(artist.slug),
      displayName: artist.displayName,
      username: undefined,
      avatarUrl: artist.avatarUrl,
      coverUrl: artist.coverUrl,
      bio: artist.bio || "Артист платформы C3K.",
      mode: "artist",
      followersCount: artist.followersCount,
      followingCount: 0,
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

  const followingListenerProfiles = Array.from(new Set(input.followingSlugs.map((slug) => normalizeSlug(slug)).filter(Boolean))).map((slug) => {
    const existing = bySlug.get(slug);

    if (existing) {
      return existing;
    }

    const prettyName = slug
      .split("-")
      .filter(Boolean)
      .map((entry) => entry.charAt(0).toUpperCase() + entry.slice(1))
      .join(" ");

    return {
      slug,
      displayName: prettyName || slug,
      username: slug.startsWith("user-") ? undefined : slug,
      bio: "Профиль пользователя Culture3k.",
      mode: "listener",
      followersCount: 0,
      followingCount: 0,
      topGenres: [],
      awards: buildListenerAwards(0, 0),
      purchasesVisible: false,
      purchasedReleaseSlugs: [],
    } satisfies PublicProfile;
  });

  followingListenerProfiles.forEach((profile) => {
    if (!bySlug.has(profile.slug)) {
      bySlug.set(profile.slug, profile);
    }
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
    const followersCount = Math.max(0, existing?.followersCount ?? 0);

    bySlug.set(viewerSlug, {
      slug: viewerSlug,
      displayName,
      username: normalizeSlug(viewer.username) || undefined,
      avatarUrl: typeof viewer.photo_url === "string" ? viewer.photo_url : existing?.avatarUrl,
      coverUrl: existing?.coverUrl,
      bio:
        existing?.bio ||
        "Покупаю релизы, поддерживаю артистов и собираю награды в социальном профиле C3K.",
      mode: input.currentMode,
      followersCount,
      followingCount: Math.max(input.followingSlugs.length, existing?.followingCount ?? 0),
      isVerified: existing?.isVerified,
      topGenres: existing?.topGenres ?? [],
      awards: buildListenerAwards(input.currentPurchasedReleaseSlugs.length, followersCount),
      purchasesVisible: input.currentPurchasesVisible,
      purchasedReleaseSlugs: Array.from(new Set(input.currentPurchasedReleaseSlugs)),
    });
  }

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
