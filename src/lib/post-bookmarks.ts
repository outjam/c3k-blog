import { readPersistedString, writePersistedString } from "@/lib/telegram-persist";

const BOOKMARKS_KEY = "c3k-post-bookmarks-v1";

const normalize = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item : ""))
    .filter(Boolean);
};

export const readBookmarkedPostSlugs = async (): Promise<string[]> => {
  const raw = await readPersistedString(BOOKMARKS_KEY);

  if (!raw) {
    return [];
  }

  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const writeBookmarkedPostSlugs = async (slugs: string[]): Promise<void> => {
  const unique = Array.from(new Set(slugs));
  await writePersistedString(BOOKMARKS_KEY, JSON.stringify(unique));
};

export const toggleBookmarkedPost = async (slug: string): Promise<string[]> => {
  const current = await readBookmarkedPostSlugs();
  const next = current.includes(slug) ? current.filter((value) => value !== slug) : [slug, ...current];
  await writeBookmarkedPostSlugs(next);
  return next;
};
