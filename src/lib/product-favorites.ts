import { readPersistedString, writePersistedString } from "@/lib/telegram-persist";

const PRODUCT_FAVORITES_KEY = "c3k-product-favorites-v1";

const normalize = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => (typeof item === "string" ? item.trim().toLowerCase() : ""))
    .filter(Boolean);
};

export const readFavoriteProductIds = async (): Promise<string[]> => {
  const raw = await readPersistedString(PRODUCT_FAVORITES_KEY);

  if (!raw) {
    return [];
  }

  try {
    return normalize(JSON.parse(raw));
  } catch {
    return [];
  }
};

export const writeFavoriteProductIds = async (productIds: string[]): Promise<void> => {
  const unique = Array.from(new Set(normalize(productIds)));
  await writePersistedString(PRODUCT_FAVORITES_KEY, JSON.stringify(unique));
};

export const toggleFavoriteProductId = async (productId: string): Promise<string[]> => {
  const normalized = productId.trim().toLowerCase();

  if (!normalized) {
    return readFavoriteProductIds();
  }

  const current = await readFavoriteProductIds();
  const next = current.includes(normalized)
    ? current.filter((value) => value !== normalized)
    : [normalized, ...current];

  await writeFavoriteProductIds(next);
  return next;
};

