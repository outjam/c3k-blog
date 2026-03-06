import {
  RELEASE_REACTION_OPTIONS,
  type ReleaseCommentRecord,
  type ReleaseCommentView,
  type ReleaseReactionType,
  type ReleaseSocialFeedSummary,
  type ReleaseSocialSnapshot,
} from "@/types/release-social";
import { getPostgresHttpConfig, postgresRpc } from "@/lib/server/postgres-http";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";
const RELEASE_SOCIAL_STATE_KEY = "release_social_v1";
const REACTION_KEYS = RELEASE_REACTION_OPTIONS.map((entry) => entry.key);

interface PostgresAppStateRow {
  payload?: unknown;
  row_version?: number;
}

interface PostgresPutStateResult {
  ok?: boolean;
  row_version?: number | null;
  error?: string | null;
}

interface SocialActor {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
  isAdmin?: boolean;
}

interface ReleaseSocialRecord {
  releaseSlug: string;
  reactedUsers: Record<string, ReleaseReactionType>;
  comments: ReleaseCommentRecord[];
  updatedAt: string;
}

interface ReleaseSocialState {
  releasesBySlug: Record<string, ReleaseSocialRecord>;
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
    .slice(0, 120);
};

const normalizeText = (value: unknown, maxLength: number): string => {
  return String(value ?? "").trim().slice(0, maxLength);
};

const parseDate = (value: string | undefined): number => {
  const timestamp = new Date(value ?? "").getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeUserId = (value: unknown): number => {
  const id = Math.round(Number(value ?? 0));
  return Number.isFinite(id) && id > 0 ? id : 0;
};

const isValidReactionType = (value: unknown): value is ReleaseReactionType => {
  return REACTION_KEYS.includes(value as ReleaseReactionType);
};

const emptyReactions = (): Record<ReleaseReactionType, number> => {
  return {
    like: 0,
    fire: 0,
    wow: 0,
    idea: 0,
  };
};

const throwStrictError = (message: string): never => {
  throw new Error(message);
};

const ensureDbEnabled = (): boolean => {
  return Boolean(getPostgresHttpConfig());
};

const generateId = (): string => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }

  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
};

const sanitizeActor = (value: unknown): ReleaseCommentRecord["author"] | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<ReleaseCommentRecord["author"]>;
  const telegramUserId = normalizeUserId(source.telegramUserId);

  if (!telegramUserId) {
    return null;
  }

  return {
    telegramUserId,
    username: normalizeText(source.username, 64) || undefined,
    firstName: normalizeText(source.firstName, 80) || undefined,
    lastName: normalizeText(source.lastName, 80) || undefined,
    photoUrl: normalizeText(source.photoUrl, 3000) || undefined,
  };
};

const sanitizeComment = (value: unknown, releaseSlug: string): ReleaseCommentRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<ReleaseCommentRecord>;
  const id = normalizeText(source.id, 120);
  const text = normalizeText(source.text, 1000);
  const author = sanitizeActor(source.author);

  if (!id || text.length < 2 || !author) {
    return null;
  }

  const createdAt = normalizeText(source.createdAt, 120) || new Date().toISOString();
  const updatedAt = normalizeText(source.updatedAt, 120) || createdAt;

  return {
    id,
    releaseSlug,
    text,
    createdAt,
    updatedAt,
    author,
  };
};

const sanitizeRecord = (value: unknown, fallbackSlug = ""): ReleaseSocialRecord | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const source = value as Partial<ReleaseSocialRecord>;
  const releaseSlug = normalizeSlug(source.releaseSlug ?? fallbackSlug);

  if (!releaseSlug) {
    return null;
  }

  const reactedUsers =
    source.reactedUsers && typeof source.reactedUsers === "object"
      ? Object.fromEntries(
          Object.entries(source.reactedUsers as Record<string, unknown>).flatMap(([rawUserId, reaction]) => {
            const userId = normalizeUserId(rawUserId);
            if (!userId || !isValidReactionType(reaction)) {
              return [];
            }

            return [[String(userId), reaction]];
          }),
        )
      : {};

  const comments = Array.isArray(source.comments)
    ? source.comments
        .map((entry) => sanitizeComment(entry, releaseSlug))
        .filter((entry): entry is ReleaseCommentRecord => Boolean(entry))
        .slice(0, 400)
    : [];

  return {
    releaseSlug,
    reactedUsers,
    comments,
    updatedAt: normalizeText(source.updatedAt, 120) || new Date().toISOString(),
  };
};

const sanitizeState = (value: unknown): ReleaseSocialState => {
  const now = new Date().toISOString();

  if (!value || typeof value !== "object") {
    return {
      releasesBySlug: {},
      updatedAt: now,
    };
  }

  const source = value as Record<string, unknown>;
  const releasesBySlug =
    source.releasesBySlug && typeof source.releasesBySlug === "object"
      ? Object.fromEntries(
          Object.entries(source.releasesBySlug as Record<string, unknown>).flatMap(([rawSlug, rawRecord]) => {
            const record = sanitizeRecord(rawRecord, rawSlug);
            return record ? [[record.releaseSlug, record]] : [];
          }),
        )
      : {};

  return {
    releasesBySlug,
    updatedAt: normalizeText(source.updatedAt, 120) || now,
  };
};

const readStateWithVersion = async (): Promise<{ state: ReleaseSocialState; rowVersion: number } | null> => {
  const rows = await postgresRpc<PostgresAppStateRow[]>("c3k_get_app_state", {
    p_key: RELEASE_SOCIAL_STATE_KEY,
  });

  if (!rows) {
    return null;
  }

  const first = rows[0];

  if (!first) {
    return {
      state: sanitizeState({}),
      rowVersion: 0,
    };
  }

  return {
    state: sanitizeState(first.payload),
    rowVersion: typeof first.row_version === "number" ? first.row_version : 1,
  };
};

const writeState = async (
  state: ReleaseSocialState,
  expectedRowVersion: number | null,
): Promise<{ ok: true } | { ok: false; conflict: boolean }> => {
  const rows = await postgresRpc<PostgresPutStateResult[]>("c3k_put_app_state", {
    p_key: RELEASE_SOCIAL_STATE_KEY,
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

const mutateState = async (mutate: (state: ReleaseSocialState) => ReleaseSocialState): Promise<ReleaseSocialState | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for release social");
    }

    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = await readStateWithVersion();

    if (!current) {
      break;
    }

    const next = sanitizeState(mutate(current.state));
    next.updatedAt = new Date().toISOString();
    const saved = await writeState(next, current.rowVersion);

    if (saved.ok) {
      return next;
    }

    if (!saved.conflict) {
      break;
    }
  }

  if (POSTGRES_STRICT) {
    throwStrictError("Failed to mutate release social app_state");
  }

  return null;
};

const getRecord = (state: ReleaseSocialState, releaseSlug: string): ReleaseSocialRecord => {
  const slug = normalizeSlug(releaseSlug);

  return (
    state.releasesBySlug[slug] ?? {
      releaseSlug: slug,
      reactedUsers: {},
      comments: [],
      updatedAt: new Date().toISOString(),
    }
  );
};

const toSnapshot = (record: ReleaseSocialRecord, viewer?: SocialActor): ReleaseSocialSnapshot => {
  const reactions = emptyReactions();

  Object.values(record.reactedUsers).forEach((reaction) => {
    if (isValidReactionType(reaction)) {
      reactions[reaction] += 1;
    }
  });

  const viewerId = normalizeUserId(viewer?.telegramUserId);
  const myReaction = viewerId ? record.reactedUsers[String(viewerId)] ?? null : null;

  const comments: ReleaseCommentView[] = [...record.comments]
    .sort((a, b) => parseDate(b.createdAt) - parseDate(a.createdAt))
    .map((entry) => ({
      ...entry,
      canDelete: Boolean(viewer?.isAdmin) || (viewerId > 0 && viewerId === entry.author.telegramUserId),
    }));

  return {
    releaseSlug: record.releaseSlug,
    reactions,
    myReaction: isValidReactionType(myReaction) ? myReaction : null,
    comments,
    updatedAt: record.updatedAt,
  };
};

const validateCommentText = (rawText: unknown): { ok: true; text: string } | { ok: false; code: string } => {
  const text = String(rawText ?? "").replace(/\s+/g, " ").trim();

  if (text.length < 2 || text.length > 600) {
    return { ok: false, code: "invalid_length" };
  }

  const lower = text.toLowerCase();
  if (lower.includes("http://") || lower.includes("https://") || lower.includes("t.me/") || lower.includes("@everyone")) {
    return { ok: false, code: "links_not_allowed" };
  }

  if (/(.)\1{14,}/.test(text)) {
    return { ok: false, code: "spam_pattern" };
  }

  return { ok: true, text: text.slice(0, 600) };
};

export const getReleaseSocialSnapshot = async (input: {
  slug: string;
  viewer?: SocialActor;
}): Promise<ReleaseSocialSnapshot> => {
  const normalizedSlug = normalizeSlug(input.slug);
  const fallback = toSnapshot(
    {
      releaseSlug: normalizedSlug,
      reactedUsers: {},
      comments: [],
      updatedAt: new Date().toISOString(),
    },
    input.viewer,
  );

  if (!normalizedSlug) {
    return fallback;
  }

  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for release social");
    }

    return fallback;
  }

  const current = await readStateWithVersion();
  if (!current) {
    return fallback;
  }

  const record = getRecord(current.state, normalizedSlug);
  return toSnapshot(record, input.viewer);
};

export const listReleaseSocialFeedSummaries = async (slugs: string[]): Promise<Record<string, ReleaseSocialFeedSummary>> => {
  const normalized = Array.from(new Set(slugs.map((entry) => normalizeSlug(entry)).filter(Boolean)));

  if (normalized.length === 0) {
    return {};
  }

  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for release social");
    }

    return Object.fromEntries(
      normalized.map((slug) => [
        slug,
        {
          releaseSlug: slug,
          reactionsTotal: 0,
          commentsCount: 0,
        },
      ]),
    );
  }

  const current = await readStateWithVersion();
  if (!current) {
    return {};
  }

  return Object.fromEntries(
    normalized.map((slug) => {
      const record = getRecord(current.state, slug);
      const reactions = emptyReactions();
      Object.values(record.reactedUsers).forEach((reaction) => {
        if (isValidReactionType(reaction)) {
          reactions[reaction] += 1;
        }
      });

      const reactionsTotal = Object.values(reactions).reduce((acc, item) => acc + item, 0);

      return [
        slug,
        {
          releaseSlug: slug,
          reactionsTotal,
          commentsCount: record.comments.length,
        } satisfies ReleaseSocialFeedSummary,
      ];
    }),
  );
};

export const setReleaseReaction = async (input: {
  slug: string;
  actor: SocialActor;
  reactionType: unknown;
}): Promise<{ snapshot?: ReleaseSocialSnapshot; error?: "invalid_reaction" | "db_unavailable" }> => {
  const slug = normalizeSlug(input.slug);
  const viewerId = normalizeUserId(input.actor.telegramUserId);

  if (!slug || !viewerId) {
    return { error: "db_unavailable" };
  }

  if (!isValidReactionType(input.reactionType)) {
    return { error: "invalid_reaction" };
  }
  const reactionType: ReleaseReactionType = input.reactionType;

  const mutated = await mutateState((current) => {
    const now = new Date().toISOString();
    const record = getRecord(current, slug);
    const reactedUsers = {
      ...record.reactedUsers,
      [String(viewerId)]: reactionType,
    };
    const nextRecord: ReleaseSocialRecord = {
      ...record,
      reactedUsers,
      updatedAt: now,
    };

    return {
      ...current,
      releasesBySlug: {
        ...current.releasesBySlug,
        [slug]: nextRecord,
      },
    };
  });

  if (!mutated) {
    return { error: "db_unavailable" };
  }

  return {
    snapshot: toSnapshot(getRecord(mutated, slug), input.actor),
  };
};

export const clearReleaseReaction = async (input: {
  slug: string;
  actor: SocialActor;
}): Promise<{ snapshot?: ReleaseSocialSnapshot; error?: "db_unavailable" }> => {
  const slug = normalizeSlug(input.slug);
  const viewerId = normalizeUserId(input.actor.telegramUserId);

  if (!slug || !viewerId) {
    return { error: "db_unavailable" };
  }

  const mutated = await mutateState((current) => {
    const record = getRecord(current, slug);
    const reactedUsers = { ...record.reactedUsers };
    delete reactedUsers[String(viewerId)];

    const nextRecord: ReleaseSocialRecord = {
      ...record,
      reactedUsers,
      updatedAt: new Date().toISOString(),
    };

    return {
      ...current,
      releasesBySlug: {
        ...current.releasesBySlug,
        [slug]: nextRecord,
      },
    };
  });

  if (!mutated) {
    return { error: "db_unavailable" };
  }

  return {
    snapshot: toSnapshot(getRecord(mutated, slug), input.actor),
  };
};

export const createReleaseComment = async (input: {
  slug: string;
  actor: SocialActor;
  text: unknown;
}): Promise<{ snapshot?: ReleaseSocialSnapshot; error?: "invalid_comment" | "moderation_block" | "db_unavailable" }> => {
  const slug = normalizeSlug(input.slug);
  const viewerId = normalizeUserId(input.actor.telegramUserId);

  if (!slug || !viewerId) {
    return { error: "db_unavailable" };
  }

  const validation = validateCommentText(input.text);

  if (!validation.ok) {
    return { error: validation.code === "invalid_length" ? "invalid_comment" : "moderation_block" };
  }

  const mutated = await mutateState((current) => {
    const record = getRecord(current, slug);
    const now = new Date().toISOString();
    const comment: ReleaseCommentRecord = {
      id: generateId(),
      releaseSlug: slug,
      text: validation.text,
      createdAt: now,
      updatedAt: now,
      author: {
        telegramUserId: viewerId,
        username: normalizeText(input.actor.username, 64) || undefined,
        firstName: normalizeText(input.actor.firstName, 80) || undefined,
        lastName: normalizeText(input.actor.lastName, 80) || undefined,
        photoUrl: normalizeText(input.actor.photoUrl, 3000) || undefined,
      },
    };
    const nextRecord: ReleaseSocialRecord = {
      ...record,
      comments: [comment, ...record.comments].slice(0, 400),
      updatedAt: now,
    };

    return {
      ...current,
      releasesBySlug: {
        ...current.releasesBySlug,
        [slug]: nextRecord,
      },
    };
  });

  if (!mutated) {
    return { error: "db_unavailable" };
  }

  return {
    snapshot: toSnapshot(getRecord(mutated, slug), input.actor),
  };
};

export const deleteReleaseComment = async (input: {
  slug: string;
  commentId: string;
  actor: SocialActor;
}): Promise<{ snapshot?: ReleaseSocialSnapshot; error?: "comment_not_found" | "forbidden" | "db_unavailable" }> => {
  const slug = normalizeSlug(input.slug);
  const viewerId = normalizeUserId(input.actor.telegramUserId);
  const commentId = normalizeText(input.commentId, 120);

  if (!slug || !viewerId || !commentId) {
    return { error: "db_unavailable" };
  }

  let denied = false;
  let found = false;

  const mutated = await mutateState((current) => {
    const record = getRecord(current, slug);

    const nextComments = record.comments.filter((comment) => {
      if (comment.id !== commentId) {
        return true;
      }

      found = true;

      const canDelete = Boolean(input.actor.isAdmin) || comment.author.telegramUserId === viewerId;
      if (!canDelete) {
        denied = true;
        return true;
      }

      return false;
    });

    if (denied || !found) {
      return current;
    }

    const nextRecord: ReleaseSocialRecord = {
      ...record,
      comments: nextComments,
      updatedAt: new Date().toISOString(),
    };

    return {
      ...current,
      releasesBySlug: {
        ...current.releasesBySlug,
        [slug]: nextRecord,
      },
    };
  });

  if (!mutated) {
    return { error: "db_unavailable" };
  }

  if (!found) {
    return { error: "comment_not_found" };
  }

  if (denied) {
    return { error: "forbidden" };
  }

  return {
    snapshot: toSnapshot(getRecord(mutated, slug), input.actor),
  };
};
