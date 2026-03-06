export const RELEASE_REACTION_OPTIONS = [
  { key: "like", emoji: "👍", label: "Нравится" },
  { key: "fire", emoji: "🔥", label: "Огонь" },
  { key: "wow", emoji: "🤯", label: "Вау" },
  { key: "idea", emoji: "💡", label: "Полезно" },
] as const;

export type ReleaseReactionType = (typeof RELEASE_REACTION_OPTIONS)[number]["key"];

export interface ReleaseCommentAuthor {
  telegramUserId: number;
  username?: string;
  firstName?: string;
  lastName?: string;
  photoUrl?: string;
}

export interface ReleaseCommentRecord {
  id: string;
  releaseSlug: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  author: ReleaseCommentAuthor;
}

export interface ReleaseCommentView extends ReleaseCommentRecord {
  canDelete: boolean;
}

export interface ReleaseSocialSnapshot {
  releaseSlug: string;
  reactions: Record<ReleaseReactionType, number>;
  myReaction: ReleaseReactionType | null;
  comments: ReleaseCommentView[];
  updatedAt: string;
}

export interface ReleaseSocialFeedSummary {
  releaseSlug: string;
  reactionsTotal: number;
  commentsCount: number;
}
