import {
  buildDesktopStorageOpenUrl,
  buildDesktopTonSiteOpenUrl,
} from "@/lib/desktop-runtime";
import type { C3kDesktopLocalNodeSettings, C3kDesktopRuntimeContract } from "@/types/desktop";
import type { StorageDeliveryRequest } from "@/types/storage";

interface DesktopRuntimeResponseShape {
  ok?: boolean;
  runtime?: C3kDesktopRuntimeContract;
  error?: string;
}

interface DesktopLocalNodeSettingsResponseShape {
  ok?: boolean;
  settings?: C3kDesktopLocalNodeSettings;
  error?: string;
}

const getDesktopGatewayRuntimeBase = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(window.location.href);
    const explicit = url.searchParams.get("desktopGatewayBase");
    if (explicit?.trim()) {
      return explicit.trim().replace(/\/+$/, "");
    }
  } catch {
    // Ignore malformed location.
  }

  if (!window.navigator.userAgent.includes("Electron")) {
    return null;
  }

  return "http://127.0.0.1:3467";
};

const getDesktopLocalRuntimeBase = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const url = new URL(window.location.href);
    const explicit = url.searchParams.get("desktopRuntimeBase");
    if (explicit?.trim()) {
      return explicit.trim().replace(/\/+$/, "");
    }
  } catch {
    // Ignore malformed location.
  }

  if (!window.navigator.userAgent.includes("Electron")) {
    return null;
  }

  return "http://127.0.0.1:3000";
};

const isDesktopRuntimeContract = (value: unknown): value is C3kDesktopRuntimeContract => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<C3kDesktopRuntimeContract>;
  return (
    typeof candidate.appId === "string" &&
    typeof candidate.appName === "string" &&
    typeof candidate.appScheme === "string" &&
    Boolean(candidate.gateway) &&
    Boolean(candidate.features)
  );
};

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
    if (typeof window !== "undefined" && typeof window.c3kDesktop?.runtime === "function") {
      try {
        const payload = await window.c3kDesktop.runtime();
        if (isDesktopRuntimeContract(payload)) {
          return { runtime: payload };
        }
      } catch {
        // Fall through to HTTP runtime fetch for browser mode and degraded desktop mode.
      }
    }

    const gatewayRuntimeBase = getDesktopGatewayRuntimeBase();
    if (gatewayRuntimeBase) {
      try {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), 1200);
        const response = await fetch(`${gatewayRuntimeBase}/runtime`, {
          method: "GET",
          cache: "no-store",
          signal: controller.signal,
        });
        window.clearTimeout(timeoutId);

        if (response.ok) {
          const payload = (await response.json()) as DesktopRuntimeResponseShape;
          if (isDesktopRuntimeContract(payload.runtime)) {
            return { runtime: payload.runtime };
          }
        }
      } catch {
        // Ignore local gateway fetch failures and fall back to web runtime.
      }
    }

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

export const updateDesktopLocalNodeSettingsApi = async (
  payload: Partial<C3kDesktopLocalNodeSettings>,
): Promise<{
  settings: C3kDesktopLocalNodeSettings | null;
  error?: string;
}> => {
  const localRuntimeBase = getDesktopLocalRuntimeBase();

  if (!localRuntimeBase) {
    return {
      settings: null,
      error: "Local desktop runtime is not available in this context.",
    };
  }

  try {
    const response = await fetch(`${localRuntimeBase}/api/desktop/node-settings`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const result = (await response.json().catch(() => ({}))) as DesktopLocalNodeSettingsResponseShape;

    if (!response.ok) {
      return {
        settings: null,
        error: result.error ?? `HTTP ${response.status}`,
      };
    }

    return {
      settings: result.settings ?? null,
    };
  } catch {
    return {
      settings: null,
      error: "Network error",
    };
  }
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
