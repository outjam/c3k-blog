import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import type { ArtistApplication, ShopAdminConfig } from "@/types/shop";

interface ArtistApplicationRow {
  id?: unknown;
  telegram_user_id?: unknown;
  display_name?: unknown;
  bio?: unknown;
  avatar_url?: unknown;
  cover_url?: unknown;
  ton_wallet_address?: unknown;
  reference_links?: unknown;
  note?: unknown;
  status?: unknown;
  moderation_note?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  reviewed_at?: unknown;
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

const normalizeIso = (value: unknown, fallback: string): string => {
  const date = new Date(String(value ?? "").trim());
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
};

const normalizeReferenceLinks = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((entry) => normalizeText(entry, 3000)).filter(Boolean).slice(0, 8);
};

const normalizeApplicationStatus = (value: unknown): ArtistApplication["status"] => {
  return value === "needs_info" || value === "approved" || value === "rejected" ? value : "pending";
};

const toArtistApplication = (row: ArtistApplicationRow): ArtistApplication | null => {
  const id = normalizeText(row.id, 120);
  const telegramUserId = normalizeTelegramUserId(row.telegram_user_id);
  const displayName = normalizeText(row.display_name, 120);
  const createdAt = normalizeIso(row.created_at, new Date().toISOString());

  if (!id || !telegramUserId || !displayName) {
    return null;
  }

  return {
    id,
    telegramUserId,
    displayName,
    bio: normalizeText(row.bio, 1200),
    avatarUrl: normalizeOptionalText(row.avatar_url, 3000),
    coverUrl: normalizeOptionalText(row.cover_url, 3000),
    tonWalletAddress: normalizeOptionalText(row.ton_wallet_address, 128),
    referenceLinks: normalizeReferenceLinks(row.reference_links),
    note: normalizeOptionalText(row.note, 1200),
    status: normalizeApplicationStatus(row.status),
    moderationNote: normalizeOptionalText(row.moderation_note, 240),
    createdAt,
    updatedAt: normalizeIso(row.updated_at, createdAt),
    reviewedAt: normalizeOptionalText(row.reviewed_at, 64),
  };
};

const sortApplications = (entries: ArtistApplication[]): ArtistApplication[] => {
  return [...entries].sort((a, b) => {
    const left = new Date(a.updatedAt || a.createdAt).getTime();
    const right = new Date(b.updatedAt || b.createdAt).getTime();
    return right - left || b.telegramUserId - a.telegramUserId;
  });
};

const filterLegacyApplications = (
  config: ShopAdminConfig,
  options: { telegramUserId?: number },
): ArtistApplication[] => {
  return sortApplications(
    Object.values(config.artistApplications).filter((entry) => {
      if (typeof options.telegramUserId === "number" && entry.telegramUserId !== options.telegramUserId) {
        return false;
      }
      return true;
    }),
  );
};

const mergeApplications = (
  primary: ArtistApplication[],
  fallback: ArtistApplication[],
): ArtistApplication[] => {
  const map = new Map<number, ArtistApplication>();
  [...primary, ...fallback].forEach((entry) => {
    if (!map.has(entry.telegramUserId)) {
      map.set(entry.telegramUserId, entry);
    }
  });

  return sortApplications(Array.from(map.values()));
};

export const readArtistApplicationSnapshot = async (options: {
  config: ShopAdminConfig;
  telegramUserId?: number;
  limit?: number;
}): Promise<{
  applications: ArtistApplication[];
  source: "postgres" | "legacy";
}> => {
  if (!isConfigured()) {
    return {
      applications: filterLegacyApplications(options.config, options),
      source: "legacy",
    };
  }

  const query = new URLSearchParams();
  query.set(
    "select",
    "id,telegram_user_id,display_name,bio,avatar_url,cover_url,ton_wallet_address,reference_links,note,status,moderation_note,created_at,updated_at,reviewed_at",
  );
  query.set("order", "updated_at.desc");
  query.set("limit", String(Math.max(1, Math.min(options.limit ?? 1000, 5000))));
  if (typeof options.telegramUserId === "number") {
    query.set("telegram_user_id", `eq.${options.telegramUserId}`);
  }

  const rows = await postgresTableRequest<ArtistApplicationRow[]>({
    method: "GET",
    path: "/artist_applications",
    query,
  });

  if (!rows) {
    return {
      applications: filterLegacyApplications(options.config, options),
      source: "legacy",
    };
  }

  return {
    applications: mergeApplications(
      rows
        .map((row) => toArtistApplication(row))
        .filter((entry): entry is ArtistApplication => Boolean(entry)),
      filterLegacyApplications(options.config, options),
    ),
    source: "postgres",
  };
};

export const upsertArtistApplications = async (applications: ArtistApplication[]): Promise<boolean> => {
  if (!isConfigured() || applications.length === 0) {
    return false;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "telegram_user_id");

  const body = applications.map((application) => ({
    id: normalizeText(application.id, 120),
    telegram_user_id: normalizeTelegramUserId(application.telegramUserId),
    display_name: normalizeText(application.displayName, 120),
    bio: normalizeText(application.bio, 1200),
    avatar_url: normalizeOptionalText(application.avatarUrl, 3000) ?? null,
    cover_url: normalizeOptionalText(application.coverUrl, 3000) ?? null,
    ton_wallet_address: normalizeOptionalText(application.tonWalletAddress, 128) ?? null,
    reference_links: application.referenceLinks.slice(0, 8),
    note: normalizeOptionalText(application.note, 1200) ?? null,
    status: normalizeApplicationStatus(application.status),
    moderation_note: normalizeOptionalText(application.moderationNote, 240) ?? null,
    created_at: normalizeIso(application.createdAt, new Date().toISOString()),
    updated_at: normalizeIso(application.updatedAt, application.createdAt),
    reviewed_at: normalizeOptionalText(application.reviewedAt, 64) ?? null,
  }));

  const result = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/artist_applications",
    query,
    body,
    prefer: "resolution=merge-duplicates,return=representation",
  });

  return result !== null;
};
