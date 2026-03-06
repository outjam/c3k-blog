"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { ReleaseReactionType, ReleaseSocialSnapshot } from "@/types/release-social";

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const fetchReleaseSocialSnapshot = async (
  releaseSlug: string,
): Promise<{ snapshot: ReleaseSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/shop/releases/${encodeURIComponent(releaseSlug)}/social`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as ReleaseSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const setReleaseReactionApi = async (
  releaseSlug: string,
  reactionType: ReleaseReactionType,
): Promise<{ snapshot: ReleaseSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/shop/releases/${encodeURIComponent(releaseSlug)}/reaction`, {
      method: "PUT",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ reactionType }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as ReleaseSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const clearReleaseReactionApi = async (
  releaseSlug: string,
): Promise<{ snapshot: ReleaseSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/shop/releases/${encodeURIComponent(releaseSlug)}/reaction`, {
      method: "DELETE",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as ReleaseSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const createReleaseCommentApi = async (
  releaseSlug: string,
  text: string,
): Promise<{ snapshot: ReleaseSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/shop/releases/${encodeURIComponent(releaseSlug)}/comments`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...getTelegramAuthHeaders(),
      },
      body: JSON.stringify({ text }),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as ReleaseSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const deleteReleaseCommentApi = async (
  releaseSlug: string,
  commentId: string,
): Promise<{ snapshot: ReleaseSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(
      `/api/shop/releases/${encodeURIComponent(releaseSlug)}/comments/${encodeURIComponent(commentId)}`,
      {
        method: "DELETE",
        headers: getTelegramAuthHeaders(),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as ReleaseSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};
