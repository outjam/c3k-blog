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

const openDesktopTarget = (target: { gatewayUrl: string; deepLink: string }) => {
  if (typeof window === "undefined") {
    return target;
  }

  const fallbackTimer = window.setTimeout(() => {
    if (document.visibilityState === "visible") {
      window.location.assign(target.gatewayUrl);
    }
  }, 900);

  const clearFallback = () => {
    window.clearTimeout(fallbackTimer);
    window.removeEventListener("pagehide", clearFallback);
    window.removeEventListener("blur", clearFallback);
  };

  window.addEventListener("pagehide", clearFallback, { once: true });
  window.addEventListener("blur", clearFallback, { once: true });
  window.location.assign(target.deepLink);
  return target;
};

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
  return openDesktopTarget(target);
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

  return openDesktopTarget(target);
};
