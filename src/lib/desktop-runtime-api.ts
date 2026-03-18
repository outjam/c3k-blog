import {
  buildDesktopStorageOpenUrl,
  buildDesktopTonSiteOpenUrl,
} from "@/lib/desktop-runtime";
import type { C3kDesktopRuntimeContract } from "@/types/desktop";
import type { StorageDeliveryRequest } from "@/types/storage";

interface DesktopRuntimeResponseShape {
  ok?: boolean;
  runtime?: C3kDesktopRuntimeContract;
  error?: string;
}

export const fetchDesktopRuntimeContract = async (): Promise<{
  runtime: C3kDesktopRuntimeContract | null;
  error?: string;
}> => {
  try {
    const response = await fetch("/api/desktop/runtime", {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      try {
        const payload = (await response.json()) as DesktopRuntimeResponseShape;
        return {
          runtime: null,
          error: payload.error ?? `HTTP ${response.status}`,
        };
      } catch {
        return { runtime: null, error: `HTTP ${response.status}` };
      }
    }

    const payload = (await response.json()) as DesktopRuntimeResponseShape;
    return { runtime: payload.runtime ?? null };
  } catch {
    return {
      runtime: null,
      error: "Network error",
    };
  }
};

export const openTonSiteInDesktop = (
  runtime?: C3kDesktopRuntimeContract | null,
): { gatewayUrl: string; deepLink: string } => {
  const target = buildDesktopTonSiteOpenUrl(runtime ?? undefined);

  if (typeof window !== "undefined") {
    window.location.href = target.deepLink;
  }

  return target;
};

export const openStorageDeliveryInDesktop = (
  request: StorageDeliveryRequest,
  runtime?: C3kDesktopRuntimeContract | null,
): { gatewayUrl: string; deepLink: string } => {
  const target = buildDesktopStorageOpenUrl(
    {
      requestId: request.id,
      releaseSlug: request.releaseSlug,
      trackId: request.trackId,
      storagePointer: request.storagePointer,
      deliveryUrl: request.deliveryUrl,
      fileName: request.fileName,
    },
    runtime ?? undefined,
  );

  if (typeof window !== "undefined") {
    window.location.href = target.deepLink;
  }

  return target;
};
