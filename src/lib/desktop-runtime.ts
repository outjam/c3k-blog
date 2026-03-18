import type {
  C3kDesktopGatewayConfig,
  C3kDesktopRuntimeContract,
  C3kDesktopStorageOpenRequest,
} from "@/types/desktop";

const normalizeUrlBase = (value: string): string => value.replace(/\/+$/, "");

const resolveScheme = (value?: string | null): string => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "c3k";
};

const resolveGatewayHost = (value?: string | null): string => {
  const normalized = String(value ?? "").trim();
  return normalized || "127.0.0.1";
};

const resolveGatewayPort = (value?: string | null): number => {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return 3467;
  }

  return Math.max(1, Math.min(65535, Math.round(parsed)));
};

const resolveTonSiteHost = (value?: string | null): string => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "c3k.ton";
};

const buildGatewayConfig = (options?: {
  scheme?: string | null;
  host?: string | null;
  port?: string | number | null;
  tonSiteHost?: string | null;
}): C3kDesktopGatewayConfig => {
  const host = resolveGatewayHost(typeof options?.host === "string" ? options.host : undefined);
  const port = resolveGatewayPort(
    typeof options?.port === "number" ? String(options.port) : options?.port,
  );

  return {
    host,
    port,
    baseUrl: `http://${host}:${port}`,
    tonSiteHost: resolveTonSiteHost(options?.tonSiteHost),
  };
};

const buildQueryString = (params: Record<string, string | undefined>): string => {
  const search = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    const normalized = String(value ?? "").trim();

    if (normalized) {
      search.set(key, normalized);
    }
  });

  const serialized = search.toString();
  return serialized ? `?${serialized}` : "";
};

export const getDefaultDesktopGatewayConfig = (): C3kDesktopGatewayConfig => {
  return buildGatewayConfig({
    host:
      process.env.NEXT_PUBLIC_C3K_DESKTOP_GATEWAY_HOST ??
      process.env.C3K_DESKTOP_GATEWAY_HOST,
    port:
      process.env.NEXT_PUBLIC_C3K_DESKTOP_GATEWAY_PORT ??
      process.env.C3K_DESKTOP_GATEWAY_PORT,
    tonSiteHost:
      process.env.NEXT_PUBLIC_C3K_DESKTOP_TON_SITE_HOST ??
      process.env.C3K_DESKTOP_TON_SITE_HOST,
  });
};

export const getDefaultDesktopAppScheme = (): string => {
  return resolveScheme(
    process.env.NEXT_PUBLIC_C3K_DESKTOP_APP_SCHEME ??
      process.env.C3K_DESKTOP_APP_SCHEME,
  );
};

export const buildDesktopGatewayUrl = (
  path: string,
  params?: Record<string, string | undefined>,
  gatewayConfig = getDefaultDesktopGatewayConfig(),
): string => {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${normalizeUrlBase(gatewayConfig.baseUrl)}${normalizedPath}${buildQueryString(params ?? {})}`;
};

export const buildDesktopDeepLink = (
  path: string,
  params?: Record<string, string | undefined>,
  scheme = getDefaultDesktopAppScheme(),
): string => {
  const normalizedPath = path.replace(/^\/+/, "");
  return `${scheme}://${normalizedPath}${buildQueryString(params ?? {})}`;
};

export const buildDesktopTonSiteOpenUrl = (
  runtime?: Pick<C3kDesktopRuntimeContract, "gateway" | "appScheme">,
): { gatewayUrl: string; deepLink: string } => {
  const gateway = runtime?.gateway ?? getDefaultDesktopGatewayConfig();
  const scheme = runtime?.appScheme ?? getDefaultDesktopAppScheme();

  return {
    gatewayUrl: buildDesktopGatewayUrl(
      "/site/open",
      { host: gateway.tonSiteHost },
      gateway,
    ),
    deepLink: buildDesktopDeepLink(
      "site/open",
      { host: gateway.tonSiteHost },
      scheme,
    ),
  };
};

export const buildDesktopStorageOpenUrl = (
  payload: C3kDesktopStorageOpenRequest,
  runtime?: Pick<C3kDesktopRuntimeContract, "gateway" | "appScheme">,
): { gatewayUrl: string; deepLink: string } => {
  const gateway = runtime?.gateway ?? getDefaultDesktopGatewayConfig();
  const scheme = runtime?.appScheme ?? getDefaultDesktopAppScheme();
  const params = {
    requestId: payload.requestId,
    releaseSlug: payload.releaseSlug,
    trackId: payload.trackId,
    storagePointer: payload.storagePointer,
    deliveryUrl: payload.deliveryUrl,
    fileName: payload.fileName,
  };

  return {
    gatewayUrl: buildDesktopGatewayUrl("/storage/open", params, gateway),
    deepLink: buildDesktopDeepLink("storage/open", params, scheme),
  };
};
