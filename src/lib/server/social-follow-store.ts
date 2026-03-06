import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";

const SOCIAL_FOLLOW_STATE_KEY = "social_follow_graph_v1";

interface PostgresAppStateRow {
  payload?: unknown;
  row_version?: number;
}

interface PostgresPutStateResult {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

interface FollowProfile {
  slug: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  updatedAt: string;
}

interface SocialFollowState {
  followingByUserId: Record<string, string[]>;
  profilesBySlug: Record<string, FollowProfile>;
  updatedAt: string;
}

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

const normalizeUserId = (value: unknown): string => {
  const id = Math.round(Number(value ?? 0));
  return Number.isFinite(id) && id > 0 ? String(id) : "";
};

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const sanitizeFollowProfile = (value: unknown, fallbackSlug = ""): FollowProfile | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<FollowProfile>;
  const slug = normalizeSlug(source.slug ?? fallbackSlug);
  const displayName = normalizeText(source.displayName, 120);

  if (!slug || !displayName) {
    return null;
  }

  return {
    slug,
    displayName,
    username: normalizeSlug(source.username) || undefined,
    avatarUrl: normalizeText(source.avatarUrl, 3000) || undefined,
    updatedAt: normalizeText(source.updatedAt, 120) || new Date().toISOString(),
  };
};

const sanitizeFollowState = (value: unknown): SocialFollowState => {
  const now = new Date().toISOString();

  if (!value || typeof value !== "object") {
    return {
      followingByUserId: {},
      profilesBySlug: {},
      updatedAt: now,
    };
  }

  const source = value as Record<string, unknown>;
  const followingByUserId =
    source.followingByUserId && typeof source.followingByUserId === "object"
      ? Object.fromEntries(
          Object.entries(source.followingByUserId as Record<string, unknown>).map(([rawUserId, rawSlugs]) => {
            const userId = normalizeUserId(rawUserId);
            const slugs = Array.isArray(rawSlugs)
              ? Array.from(new Set(rawSlugs.map((entry) => normalizeSlug(entry)).filter(Boolean))).slice(0, 600)
              : [];
            return [userId, slugs];
          }),
        )
      : {};

  const profilesBySlug =
    source.profilesBySlug && typeof source.profilesBySlug === "object"
      ? Object.fromEntries(
          Object.entries(source.profilesBySlug as Record<string, unknown>).flatMap(([rawSlug, rawProfile]) => {
            const profile = sanitizeFollowProfile(rawProfile, rawSlug);
            return profile ? [[profile.slug, profile]] : [];
          }),
        )
      : {};

  return {
    followingByUserId,
    profilesBySlug,
    updatedAt: normalizeText(source.updatedAt, 120) || now,
  };
};

const readFollowStateWithVersion = async (): Promise<{ state: SocialFollowState; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: SOCIAL_FOLLOW_STATE_KEY,
  });

  if (!rows) {
    return null;
  }

  const first = rows[0];

  if (!first) {
    return {
      state: sanitizeFollowState({}),
      rowVersion: 0,
    };
  }

  return {
    state: sanitizeFollowState(first.payload),
    rowVersion: typeof first.row_version === "number" ? first.row_version : 1,
  };
};

const writeFollowState = async (
  state: SocialFollowState,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: SOCIAL_FOLLOW_STATE_KEY,
    p_payload: state,
    p_expected_row_version: expectedRowVersion,
  });

  if (!rows || !rows[0]) {
    return { ok: false, conflict: false };
  }

  const first = rows[0];
  const ok = Boolean(first.ok);
  const conflict = String(first.error ?? "") === "version_conflict";

  if (ok) {
    return { ok: true };
  }

  return { ok: false, conflict };
};

const mutateFollowState = async (mutate: (state: SocialFollowState) => SocialFollowState): Promise<SocialFollowState> => {
  if (!getPostgresHttpConfig()) {
    throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for follow graph");
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readFollowStateWithVersion();

    if (!current) {
      break;
    }

    const next = sanitizeFollowState(mutate(current.state));
    next.updatedAt = new Date().toISOString();
    const saved = await writeFollowState(next, current.rowVersion);

    if (saved.ok) {
      return next;
    }

    if (!saved.conflict) {
      break;
    }
  }

  throw new Error("Failed to mutate follow graph in Postgres");
};

const userKey = (telegramUserId: number): string => normalizeUserId(telegramUserId);

const followerCountBySlug = (state: SocialFollowState, targetSlug: string): number => {
  const normalizedSlug = normalizeSlug(targetSlug);

  if (!normalizedSlug) {
    return 0;
  }

  return Object.values(state.followingByUserId).reduce((acc, following) => {
    return following.includes(normalizedSlug) ? acc + 1 : acc;
  }, 0);
};

const mergeProfile = (state: SocialFollowState, profile: Partial<FollowProfile> | undefined): SocialFollowState => {
  if (!profile) {
    return state;
  }

  const slug = normalizeSlug(profile.slug);
  const displayName = normalizeText(profile.displayName, 120);

  if (!slug || !displayName) {
    return state;
  }

  return {
    ...state,
    profilesBySlug: {
      ...state.profilesBySlug,
      [slug]: {
        slug,
        displayName,
        username: normalizeSlug(profile.username) || undefined,
        avatarUrl: normalizeText(profile.avatarUrl, 3000) || undefined,
        updatedAt: new Date().toISOString(),
      },
    },
  };
};

export const listUserFollowingSlugs = async (telegramUserId: number): Promise<string[]> => {
  if (!getPostgresHttpConfig()) {
    return [];
  }

  const snapshot = await readFollowStateWithVersion();

  if (!snapshot) {
    return [];
  }

  return snapshot.state.followingByUserId[userKey(telegramUserId)] ?? [];
};

export const setUserFollowing = async (input: {
  telegramUserId: number;
  targetSlug: string;
  active?: boolean;
  actorProfile?: Partial<FollowProfile>;
  targetProfile?: Partial<FollowProfile>;
}): Promise<{
  followingSlugs: string[];
  isFollowing: boolean;
  targetSlug: string;
  targetFollowersCount: number;
}> => {
  const targetSlug = normalizeSlug(input.targetSlug);
  const actorUserKey = userKey(input.telegramUserId);

  if (!targetSlug || !actorUserKey) {
    return {
      followingSlugs: [],
      isFollowing: false,
      targetSlug: "",
      targetFollowersCount: 0,
    };
  }

  const nextState = await mutateFollowState((current) => {
    const mergedActor = mergeProfile(current, input.actorProfile);
    const mergedAll = mergeProfile(mergedActor, { ...input.targetProfile, slug: targetSlug });
    const existing = mergedAll.followingByUserId[actorUserKey] ?? [];
    const currentlyFollowing = existing.includes(targetSlug);
    const shouldFollow = typeof input.active === "boolean" ? input.active : !currentlyFollowing;
    const nextFollowing = shouldFollow ? Array.from(new Set([targetSlug, ...existing])) : existing.filter((slug) => slug !== targetSlug);

    return {
      ...mergedAll,
      followingByUserId: {
        ...mergedAll.followingByUserId,
        [actorUserKey]: nextFollowing.slice(0, 600),
      },
    };
  });

  const followingSlugs = nextState.followingByUserId[actorUserKey] ?? [];
  const isFollowing = followingSlugs.includes(targetSlug);

  return {
    followingSlugs,
    isFollowing,
    targetSlug,
    targetFollowersCount: followerCountBySlug(nextState, targetSlug),
  };
};

export const getFollowProfileBySlug = async (slug: string): Promise<FollowProfile | null> => {
  if (!getPostgresHttpConfig()) {
    return null;
  }

  const normalizedSlug = normalizeSlug(slug);
  if (!normalizedSlug) {
    return null;
  }

  const snapshot = await readFollowStateWithVersion();
  if (!snapshot) {
    return null;
  }

  return snapshot.state.profilesBySlug[normalizedSlug] ?? null;
};
