"use client";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import type { StorageDeliveryChannel, StorageDeliveryRequest } from "@/types/storage";

interface StorageDeliveryResponseShape {
  ok?: boolean;
  request?: StorageDeliveryRequest;
  message?: string;
  reason?: string;
  error?: string;
}

const triggerBlobDownload = (blob: Blob, fileName?: string) => {
  if (typeof window === "undefined") {
    return;
  }

  const objectUrl = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = fileName || "c3k-file";
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => window.URL.revokeObjectURL(objectUrl), 1_000);
};

const storageHeaders = (): HeadersInit => {
  return {
    "content-type": "application/json",
    ...getTelegramAuthHeaders(),
  };
};

export const requestReleaseDownload = async (payload: {
  releaseSlug: string;
  requestedFormat?: string;
  channel: StorageDeliveryChannel;
}): Promise<{
  ok: boolean;
  request: StorageDeliveryRequest | null;
  message?: string;
  reason?: string;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/storage/downloads/release", {
      method: "POST",
      headers: storageHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json()) as StorageDeliveryResponseShape;

    if (!response.ok) {
      return {
        ok: false,
        request: data.request ?? null,
        message: data.message,
        reason: data.reason,
        error: data.error ?? data.message ?? `HTTP ${response.status}`,
      };
    }

    return {
      ok: Boolean(data.ok),
      request: data.request ?? null,
      message: data.message,
      reason: data.reason,
    };
  } catch {
    return {
      ok: false,
      request: null,
      error: "Network error",
    };
  }
};

export const requestTrackDownload = async (payload: {
  releaseSlug: string;
  trackId: string;
  requestedFormat?: string;
  channel: StorageDeliveryChannel;
}): Promise<{
  ok: boolean;
  request: StorageDeliveryRequest | null;
  message?: string;
  reason?: string;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/storage/downloads/track", {
      method: "POST",
      headers: storageHeaders(),
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const data = (await response.json()) as StorageDeliveryResponseShape;

    if (!response.ok) {
      return {
        ok: false,
        request: data.request ?? null,
        message: data.message,
        reason: data.reason,
        error: data.error ?? data.message ?? `HTTP ${response.status}`,
      };
    }

    return {
      ok: Boolean(data.ok),
      request: data.request ?? null,
      message: data.message,
      reason: data.reason,
    };
  } catch {
    return {
      ok: false,
      request: null,
      error: "Network error",
    };
  }
};

export const fetchStorageDeliveryRequest = async (
  id: string,
): Promise<{ request: StorageDeliveryRequest | null; error?: string }> => {
  try {
    const response = await fetch(`/api/storage/downloads/${encodeURIComponent(id)}`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      try {
        const payload = (await response.json()) as StorageDeliveryResponseShape;
        return { request: null, error: payload.error ?? payload.message ?? `HTTP ${response.status}` };
      } catch {
        return { request: null, error: `HTTP ${response.status}` };
      }
    }

    const data = (await response.json()) as { request?: StorageDeliveryRequest | null };
    return { request: data.request ?? null };
  } catch {
    return { request: null, error: "Network error" };
  }
};

export const retryStorageDeliveryRequestApi = async (id: string): Promise<{
  ok: boolean;
  request: StorageDeliveryRequest | null;
  message?: string;
  reason?: string;
  error?: string;
}> => {
  try {
    const response = await fetch(`/api/storage/downloads/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: storageHeaders(),
      body: JSON.stringify({}),
      cache: "no-store",
    });
    const data = (await response.json()) as StorageDeliveryResponseShape;

    if (!response.ok) {
      return {
        ok: false,
        request: data.request ?? null,
        message: data.message,
        reason: data.reason,
        error: data.error ?? data.message ?? `HTTP ${response.status}`,
      };
    }

    return {
      ok: Boolean(data.ok),
      request: data.request ?? null,
      message: data.message,
      reason: data.reason,
    };
  } catch {
    return {
      ok: false,
      request: null,
      error: "Network error",
    };
  }
};

export const fetchMyStorageDeliveryRequests = async (
  limit = 20,
): Promise<{ requests: StorageDeliveryRequest[]; error?: string }> => {
  try {
    const response = await fetch(`/api/storage/downloads?limit=${encodeURIComponent(String(limit))}`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      try {
        const payload = (await response.json()) as StorageDeliveryResponseShape;
        return {
          requests: [],
          error: payload.error ?? payload.message ?? `HTTP ${response.status}`,
        };
      } catch {
        return { requests: [], error: `HTTP ${response.status}` };
      }
    }

    const data = (await response.json()) as { requests?: StorageDeliveryRequest[] };
    return { requests: Array.isArray(data.requests) ? data.requests : [] };
  } catch {
    return { requests: [], error: "Network error" };
  }
};

export const downloadStorageDeliveryRequestFile = async (
  request: StorageDeliveryRequest,
): Promise<{ ok: boolean; error?: string }> => {
  try {
    const response = await fetch(`/api/storage/downloads/${encodeURIComponent(request.id)}/file`, {
      method: "GET",
      headers: getTelegramAuthHeaders(),
      cache: "no-store",
    });

    if (!response.ok) {
      try {
        const payload = (await response.json()) as StorageDeliveryResponseShape;
        return { ok: false, error: payload.error ?? payload.message ?? `HTTP ${response.status}` };
      } catch {
        return { ok: false, error: `HTTP ${response.status}` };
      }
    }

    const blob = await response.blob();
    triggerBlobDownload(blob, request.fileName);
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
};
