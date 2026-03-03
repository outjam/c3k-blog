export const BLOG_REACTION_OPTIONS = [
  { key: "like", emoji: "👍", label: "Нравится" },
  { key: "fire", emoji: "🔥", label: "Огонь" },
  { key: "wow", emoji: "🤯", label: "Вау" },
  { key: "idea", emoji: "💡", label: "Полезно" },
] as const;

export type BlogReactionType = (typeof BLOG_REACTION_OPTIONS)[number]["key"];

export interface BlogCommentAuthor {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
}

export interface BlogCommentRecord {
  id: string;
  postSlug: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  author: BlogCommentAuthor;
}

export interface BlogCommentView extends BlogCommentRecord {
  canDelete: boolean;
}

export interface BlogPostSocialRecord {
  postSlug: string;
  reactions: Record<BlogReactionType, number>;
  reactedUsers: Record<string, BlogReactionType>;
  comments: BlogCommentRecord[];
  updatedAt: string;
}

export interface BlogPostSocialSnapshot {
  postSlug: string;
  reactions: Record<BlogReactionType, number>;
  myReaction: BlogReactionType | null;
  comments: BlogCommentView[];
  updatedAt: string;
}

