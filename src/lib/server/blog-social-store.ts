import { BLOG_REACTION_OPTIONS, type BlogCommentView, type BlogPostSocialSnapshot, type BlogReactionType } from "@/types/blog-social";
import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1" || process.env.NODE_ENV === "production";

interface BlogPostRow {
  id?: number;
  slug?: string;
  is_hidden?: boolean;
}

interface UserRow {
  id?: number;
  telegram_user_id?: number;
  username?: string;
  first_name?: string;
  last_name?: string;
}

interface CommentRow {
  id?: number;
  post_id?: number;
  user_id?: number;
  body?: string;
  is_deleted?: boolean;
  created_at?: string;
  updated_at?: string;
}

interface ReactionRow {
  user_id?: number;
  reaction_type?: string;
}

interface SocialActor {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  isAdmin: boolean;
}

const REACTION_KEYS = BLOG_REACTION_OPTIONS.map((item) => item.key);

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const normalizeCommentText = (value: unknown): string => {
  return String(value ?? "").replace(/\s+/g, " ").trim();
};

const isValidReactionType = (value: unknown): value is BlogReactionType => {
  return REACTION_KEYS.includes(value as BlogReactionType);
};

const emptyReactions = (): Record<BlogReactionType, number> => {
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

const getPostBySlug = async (slug: string): Promise<{ id: number; slug: string } | null> => {
  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  const query = new URLSearchParams();
  query.set("select", "id,slug,is_hidden");
  query.set("slug", `eq.${normalizedSlug}`);
  query.set("is_hidden", "eq.false");
  query.set("limit", "1");

  const rows = await postgresTableRequest<BlogPostRow[]>({
    method: "GET",
    path: "/blog_posts",
    query,
  });

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const postId = Number(row?.id ?? NaN);

  if (!Number.isFinite(postId) || postId < 1) {
    return null;
  }

  return {
    id: postId,
    slug: normalizedSlug,
  };
};

const getUserByTelegramId = async (telegramUserId: number): Promise<{ id: number; row: UserRow } | null> => {
  const normalizedId = Math.max(1, Math.round(Number(telegramUserId)));

  if (!Number.isFinite(normalizedId) || normalizedId < 1) {
    return null;
  }

  const query = new URLSearchParams();
  query.set("select", "id,telegram_user_id,username,first_name,last_name");
  query.set("telegram_user_id", `eq.${normalizedId}`);
  query.set("limit", "1");

  const rows = await postgresTableRequest<UserRow[]>({
    method: "GET",
    path: "/users",
    query,
  });

  if (!rows || rows.length === 0) {
    return null;
  }

  const row = rows[0];
  const userId = Number(row?.id ?? NaN);

  if (!Number.isFinite(userId) || userId < 1) {
    return null;
  }

  return {
    id: userId,
    row,
  };
};

const ensureUser = async (actor: SocialActor): Promise<{ id: number; row: UserRow } | null> => {
  const existing = await getUserByTelegramId(actor.telegramUserId);

  if (existing) {
    return existing;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "telegram_user_id");

  const rows = await postgresTableRequest<UserRow[]>({
    method: "POST",
    path: "/users",
    query,
    body: {
      telegram_user_id: Math.max(1, Math.round(actor.telegramUserId)),
      username: actor.username ? String(actor.username).trim().replace(/^@/, "").slice(0, 64) : null,
      first_name: actor.firstName ? String(actor.firstName).slice(0, 80) : null,
      last_name: actor.lastName ? String(actor.lastName).slice(0, 80) : null,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (!rows || rows.length === 0) {
    return getUserByTelegramId(actor.telegramUserId);
  }

  const row = rows[0];
  const userId = Number(row?.id ?? NaN);

  if (!Number.isFinite(userId) || userId < 1) {
    return getUserByTelegramId(actor.telegramUserId);
  }

  return {
    id: userId,
    row,
  };
};

const listComments = async (postId: number): Promise<CommentRow[] | null> => {
  const query = new URLSearchParams();
  query.set("select", "id,post_id,user_id,body,is_deleted,created_at,updated_at");
  query.set("post_id", `eq.${postId}`);
  query.set("is_deleted", "eq.false");
  query.set("order", "created_at.desc");
  query.set("limit", "100");

  return postgresTableRequest<CommentRow[]>({
    method: "GET",
    path: "/post_comments",
    query,
  });
};

const listReactions = async (postId: number): Promise<ReactionRow[] | null> => {
  const query = new URLSearchParams();
  query.set("select", "user_id,reaction_type");
  query.set("post_id", `eq.${postId}`);
  query.set("limit", "5000");

  return postgresTableRequest<ReactionRow[]>({
    method: "GET",
    path: "/post_reactions",
    query,
  });
};

const listUsersByIds = async (userIds: number[]): Promise<UserRow[] | null> => {
  if (userIds.length === 0) {
    return [];
  }

  const unique = Array.from(new Set(userIds.filter((id) => Number.isFinite(id) && id > 0))).slice(0, 500);

  if (unique.length === 0) {
    return [];
  }

  const query = new URLSearchParams();
  query.set("select", "id,telegram_user_id,username,first_name,last_name");
  query.set("id", `in.(${unique.join(",")})`);

  return postgresTableRequest<UserRow[]>({
    method: "GET",
    path: "/users",
    query,
  });
};

const buildSnapshot = async (input: {
  postId: number;
  postSlug: string;
  viewerTelegramUserId?: number;
  viewerDbUserId?: number;
  viewerIsAdmin?: boolean;
}): Promise<BlogPostSocialSnapshot | null> => {
  const [comments, reactions] = await Promise.all([listComments(input.postId), listReactions(input.postId)]);

  if (!comments || !reactions) {
    return null;
  }

  const userIds = comments
    .map((item) => Number(item.user_id ?? NaN))
    .filter((value) => Number.isFinite(value) && value > 0);

  const users = await listUsersByIds(userIds);

  if (!users) {
    return null;
  }

  const usersById = new Map<number, UserRow>();

  users.forEach((row) => {
    const id = Number(row.id ?? NaN);
    if (Number.isFinite(id) && id > 0) {
      usersById.set(id, row);
    }
  });

  const reactionsCount = emptyReactions();
  let myReaction: BlogReactionType | null = null;

  reactions.forEach((row) => {
    if (!isValidReactionType(row.reaction_type)) {
      return;
    }

    reactionsCount[row.reaction_type] += 1;

    const rowUserId = Number(row.user_id ?? NaN);
    if (input.viewerDbUserId && Number.isFinite(rowUserId) && rowUserId === input.viewerDbUserId) {
      myReaction = row.reaction_type;
    }
  });

  const commentsView = comments
    .map((row) => {
      const commentId = String(row.id ?? "").trim();
      const rowUserId = Number(row.user_id ?? NaN);
      const authorRow = Number.isFinite(rowUserId) ? usersById.get(rowUserId) : undefined;

      if (!commentId || !Number.isFinite(rowUserId) || !authorRow) {
        return null;
      }

      const authorTelegramId = Math.max(1, Math.round(Number(authorRow.telegram_user_id ?? 0)));

      if (!Number.isFinite(authorTelegramId) || authorTelegramId < 1) {
        return null;
      }

      const comment: BlogCommentView = {
        id: commentId,
        postSlug: input.postSlug,
        text: String(row.body ?? "").slice(0, 1500),
        createdAt: String(row.created_at ?? new Date().toISOString()),
        updatedAt: String(row.updated_at ?? row.created_at ?? new Date().toISOString()),
        author: {
          telegramUserId: authorTelegramId,
          username: authorRow.username ? String(authorRow.username).slice(0, 64) : undefined,
          firstName: authorRow.first_name ? String(authorRow.first_name).slice(0, 80) : undefined,
          lastName: authorRow.last_name ? String(authorRow.last_name).slice(0, 80) : undefined,
        },
        canDelete:
          Boolean(input.viewerIsAdmin) ||
          (typeof input.viewerTelegramUserId === "number" && input.viewerTelegramUserId === authorTelegramId),
      };

      return comment;
    })
    .filter((item): item is BlogCommentView => Boolean(item));

  return {
    postSlug: input.postSlug,
    reactions: reactionsCount,
    myReaction,
    comments: commentsView,
    updatedAt: new Date().toISOString(),
  };
};

const validateCommentText = (rawText: unknown): { ok: true; text: string } | { ok: false; code: string } => {
  const text = normalizeCommentText(rawText);

  if (text.length < 2 || text.length > 500) {
    return { ok: false, code: "invalid_length" };
  }

  const lower = text.toLowerCase();
  if (lower.includes("http://") || lower.includes("https://") || lower.includes("t.me/") || lower.includes("@everyone")) {
    return { ok: false, code: "links_not_allowed" };
  }

  if (/(.)\1{12,}/.test(text)) {
    return { ok: false, code: "spam_pattern" };
  }

  return { ok: true, text };
};

export const getBlogPostSocialSnapshot = async (input: {
  slug: string;
  viewer?: SocialActor;
}): Promise<BlogPostSocialSnapshot | null> => {
  if (!ensureDbEnabled()) {
    if (POSTGRES_STRICT) {
      throwStrictError("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for blog social");
    }

    return {
      postSlug: normalizeSlug(input.slug),
      reactions: emptyReactions(),
      myReaction: null,
      comments: [],
      updatedAt: new Date().toISOString(),
    };
  }

  const post = await getPostBySlug(input.slug);

  if (!post) {
    return null;
  }

  let viewerDbUserId: number | undefined;

  if (input.viewer) {
    const viewer = await getUserByTelegramId(input.viewer.telegramUserId);
    viewerDbUserId = viewer?.id;
  }

  return buildSnapshot({
    postId: post.id,
    postSlug: post.slug,
    viewerTelegramUserId: input.viewer?.telegramUserId,
    viewerDbUserId,
    viewerIsAdmin: input.viewer?.isAdmin,
  });
};

export const createBlogComment = async (input: {
  slug: string;
  actor: SocialActor;
  text: unknown;
}): Promise<{ snapshot?: BlogPostSocialSnapshot; error?: "post_not_found" | "invalid_comment" | "moderation_block" | "db_unavailable" }> => {
  if (!ensureDbEnabled()) {
    return { error: "db_unavailable" };
  }

  const post = await getPostBySlug(input.slug);

  if (!post) {
    return { error: "post_not_found" };
  }

  const validation = validateCommentText(input.text);

  if (!validation.ok) {
    return { error: validation.code === "invalid_length" ? "invalid_comment" : "moderation_block" };
  }

  const user = await ensureUser(input.actor);

  if (!user) {
    return { error: "db_unavailable" };
  }

  const inserted = await postgresTableRequest<CommentRow[]>({
    method: "POST",
    path: "/post_comments",
    body: {
      post_id: post.id,
      user_id: user.id,
      body: validation.text,
      is_deleted: false,
    },
    prefer: "return=representation",
  });

  if (!inserted) {
    return { error: "db_unavailable" };
  }

  const snapshot = await buildSnapshot({
    postId: post.id,
    postSlug: post.slug,
    viewerTelegramUserId: input.actor.telegramUserId,
    viewerDbUserId: user.id,
    viewerIsAdmin: input.actor.isAdmin,
  });

  if (!snapshot) {
    return { error: "db_unavailable" };
  }

  return { snapshot };
};

export const deleteBlogComment = async (input: {
  slug: string;
  commentId: string;
  actor: SocialActor;
}): Promise<{ snapshot?: BlogPostSocialSnapshot; error?: "post_not_found" | "comment_not_found" | "forbidden" | "db_unavailable" }> => {
  if (!ensureDbEnabled()) {
    return { error: "db_unavailable" };
  }

  const post = await getPostBySlug(input.slug);

  if (!post) {
    return { error: "post_not_found" };
  }

  const user = await ensureUser(input.actor);

  if (!user) {
    return { error: "db_unavailable" };
  }

  const commentNumericId = Math.max(1, Math.round(Number(input.commentId)));

  if (!Number.isFinite(commentNumericId) || commentNumericId < 1) {
    return { error: "comment_not_found" };
  }

  const checkQuery = new URLSearchParams();
  checkQuery.set("select", "id,user_id,post_id,is_deleted");
  checkQuery.set("id", `eq.${commentNumericId}`);
  checkQuery.set("post_id", `eq.${post.id}`);
  checkQuery.set("limit", "1");

  const rows = await postgresTableRequest<CommentRow[]>({
    method: "GET",
    path: "/post_comments",
    query: checkQuery,
  });

  if (!rows || rows.length === 0) {
    return { error: "comment_not_found" };
  }

  const row = rows[0];
  const commentOwnerId = Number(row?.user_id ?? NaN);

  if (!input.actor.isAdmin && (!Number.isFinite(commentOwnerId) || commentOwnerId !== user.id)) {
    return { error: "forbidden" };
  }

  const updateQuery = new URLSearchParams();
  updateQuery.set("id", `eq.${commentNumericId}`);
  updateQuery.set("post_id", `eq.${post.id}`);

  const updated = await postgresTableRequest<CommentRow[]>({
    method: "PATCH",
    path: "/post_comments",
    query: updateQuery,
    body: {
      is_deleted: true,
      deleted_by_user_id: user.id,
      updated_at: new Date().toISOString(),
    },
    prefer: "return=representation",
  });

  if (!updated) {
    return { error: "db_unavailable" };
  }

  const snapshot = await buildSnapshot({
    postId: post.id,
    postSlug: post.slug,
    viewerTelegramUserId: input.actor.telegramUserId,
    viewerDbUserId: user.id,
    viewerIsAdmin: input.actor.isAdmin,
  });

  if (!snapshot) {
    return { error: "db_unavailable" };
  }

  return { snapshot };
};

export const setBlogReaction = async (input: {
  slug: string;
  actor: SocialActor;
  reactionType: unknown;
}): Promise<{ snapshot?: BlogPostSocialSnapshot; error?: "post_not_found" | "invalid_reaction" | "db_unavailable" }> => {
  if (!ensureDbEnabled()) {
    return { error: "db_unavailable" };
  }

  if (!isValidReactionType(input.reactionType)) {
    return { error: "invalid_reaction" };
  }

  const post = await getPostBySlug(input.slug);

  if (!post) {
    return { error: "post_not_found" };
  }

  const user = await ensureUser(input.actor);

  if (!user) {
    return { error: "db_unavailable" };
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "post_id,user_id");

  const upserted = await postgresTableRequest<ReactionRow[]>({
    method: "POST",
    path: "/post_reactions",
    query,
    body: {
      post_id: post.id,
      user_id: user.id,
      reaction_type: input.reactionType,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (!upserted) {
    return { error: "db_unavailable" };
  }

  const snapshot = await buildSnapshot({
    postId: post.id,
    postSlug: post.slug,
    viewerTelegramUserId: input.actor.telegramUserId,
    viewerDbUserId: user.id,
    viewerIsAdmin: input.actor.isAdmin,
  });

  if (!snapshot) {
    return { error: "db_unavailable" };
  }

  return { snapshot };
};

export const clearBlogReaction = async (input: {
  slug: string;
  actor: SocialActor;
}): Promise<{ snapshot?: BlogPostSocialSnapshot; error?: "post_not_found" | "db_unavailable" }> => {
  if (!ensureDbEnabled()) {
    return { error: "db_unavailable" };
  }

  const post = await getPostBySlug(input.slug);

  if (!post) {
    return { error: "post_not_found" };
  }

  const user = await ensureUser(input.actor);

  if (!user) {
    return { error: "db_unavailable" };
  }

  const query = new URLSearchParams();
  query.set("post_id", `eq.${post.id}`);
  query.set("user_id", `eq.${user.id}`);

  const deleted = await postgresTableRequest<ReactionRow[]>({
    method: "DELETE",
    path: "/post_reactions",
    query,
    prefer: "return=representation",
  });

  if (!deleted) {
    return { error: "db_unavailable" };
  }

  const snapshot = await buildSnapshot({
    postId: post.id,
    postSlug: post.slug,
    viewerTelegramUserId: input.actor.telegramUserId,
    viewerDbUserId: user.id,
    viewerIsAdmin: input.actor.isAdmin,
  });

  if (!snapshot) {
    return { error: "db_unavailable" };
  }

  return { snapshot };
};
