export type ProfileMode = "listener" | "artist";

export type AwardTier = "bronze" | "silver" | "gold" | "diamond";

export interface ProfileAward {
  id: string;
  icon: string;
  title: string;
  description: string;
  tier: AwardTier;
}

export interface PublicProfile {
  slug: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  coverUrl?: string;
  bio: string;
  mode: ProfileMode;
  followersCount: number;
  followingCount: number;
  isVerified?: boolean;
  topGenres: string[];
  awards: ProfileAward[];
  purchasesVisible: boolean;
  purchasedReleaseSlugs: string[];
}

export interface ReleaseComment {
  id: string;
  releaseSlug: string;
  text: string;
  createdAt: string;
  authorSlug: string;
  authorName: string;
  authorUsername?: string;
  authorAvatarUrl?: string;
}

export interface UnifiedFeedItem {
  id: string;
  kind: "release" | "blog";
  title: string;
  subtitle: string;
  description: string;
  coverUrl: string;
  href: string;
  publishedAt: string;
  authorName: string;
  authorSlug: string;
  tags: string[];
  priceStarsCents?: number;
  isFollowedSource: boolean;
  reactionsCount: number;
  commentsCount: number;
}

export interface SearchBundle {
  releases: Array<{
    slug: string;
    title: string;
    subtitle: string;
    artistName?: string;
    image: string;
    priceStarsCents: number;
  }>;
  artists: PublicProfile[];
  users: PublicProfile[];
  blogPosts: Array<{
    slug: string;
    title: string;
    excerpt: string;
    cover: string;
  }>;
}
