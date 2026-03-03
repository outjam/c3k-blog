"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { BlogPostSocialSnapshot, BlogReactionType } from "@/types/blog-social";

const parseApiError = async (response: Response): Promise<string> => {
  try {
    const payload = (await response.json()) as { error?: string };
    return payload.error ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
};

export const fetchBlogSocialSnapshot = async (
  postSlug: string,
): Promise<{ snapshot: BlogPostSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/blog/posts/${encodeURIComponent(postSlug)}/social`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as BlogPostSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const createBlogCommentApi = async (
  postSlug: string,
  text: string,
): Promise<{ snapshot: BlogPostSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/blog/posts/${encodeURIComponent(postSlug)}/comments`, {
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

    return { snapshot: (await response.json()) as BlogPostSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const deleteBlogCommentApi = async (
  postSlug: string,
  commentId: string,
): Promise<{ snapshot: BlogPostSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/blog/posts/${encodeURIComponent(postSlug)}/comments/${encodeURIComponent(commentId)}`, {
      method: "DELETE",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as BlogPostSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const setBlogReactionApi = async (
  postSlug: string,
  reactionType: BlogReactionType,
): Promise<{ snapshot: BlogPostSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/blog/posts/${encodeURIComponent(postSlug)}/reaction`, {
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

    return { snapshot: (await response.json()) as BlogPostSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};

export const clearBlogReactionApi = async (
  postSlug: string,
): Promise<{ snapshot: BlogPostSocialSnapshot | null; error?: string }> => {
  try {
    const response = await fetch(`/api/blog/posts/${encodeURIComponent(postSlug)}/reaction`, {
      method: "DELETE",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      return { snapshot: null, error: await parseApiError(response) };
    }

    return { snapshot: (await response.json()) as BlogPostSocialSnapshot };
  } catch {
    return { snapshot: null, error: "Network error" };
  }
};
