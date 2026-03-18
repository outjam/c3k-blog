import { createHash, createHmac, timingSafeEqual, webcrypto } from "node:crypto";

interface TelegramWidgetPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

interface TelegramLoginCallbackPayload {
  id_token?: string;
  user?: {
    id?: number;
    name?: string;
    preferred_username?: string;
    picture?: string;
    phone_number?: string;
  };
  error?: string;
}

interface TelegramOidcTokenHeader {
  alg?: unknown;
  kid?: unknown;
}

interface TelegramOidcTokenClaims {
  iss?: unknown;
  aud?: unknown;
  sub?: unknown;
  exp?: unknown;
  iat?: unknown;
  id?: unknown;
  name?: unknown;
  preferred_username?: unknown;
  picture?: unknown;
  phone_number?: unknown;
}

interface TelegramJwksResponse {
  keys?: TelegramOidcJwk[];
}

type TelegramOidcJwk = JsonWebKey & {
  kid?: string;
  alg?: string;
  kty?: string;
};

export interface TelegramBrowserAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
}

interface BrowserSessionPayload {
  user: TelegramBrowserAuthUser;
  iat: number;
  exp: number;
}

export const TELEGRAM_BROWSER_AUTH_COOKIE = "c3k_tg_auth";

const DEFAULT_MAX_AUTH_AGE_SECONDS = 60 * 60 * 24;
const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const TELEGRAM_OIDC_ISSUER = "https://oauth.telegram.org";
const TELEGRAM_OIDC_JWKS_URL = "https://oauth.telegram.org/.well-known/jwks.json";
const TELEGRAM_JWKS_CACHE_TTL_MS = 15 * 60 * 1000;

let telegramJwksCache:
  | {
      expiresAt: number;
      keys: TelegramOidcJwk[];
    }
  | null = null;

const getMaxAuthAgeSeconds = (): number => {
  const parsed = Number.parseInt(process.env.TELEGRAM_LOGIN_MAX_AGE_SECONDS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_MAX_AUTH_AGE_SECONDS;
};

const getSessionTtlSeconds = (): number => {
  const parsed = Number.parseInt(process.env.BROWSER_AUTH_SESSION_TTL_SECONDS ?? "", 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }

  return DEFAULT_SESSION_TTL_SECONDS;
};

const getSessionSecret = (botToken: string): string => {
  const secret = (process.env.SHOP_AUTH_SESSION_SECRET ?? "").trim();
  return secret || botToken;
};

export const resolveTelegramLoginClientId = (botToken?: string): string => {
  const explicit =
    process.env.TELEGRAM_LOGIN_CLIENT_ID?.trim() ||
    process.env.NEXT_PUBLIC_TELEGRAM_LOGIN_CLIENT_ID?.trim() ||
    "";

  if (explicit) {
    return explicit;
  }

  const normalizedToken = String(botToken ?? "").trim();
  const prefix = normalizedToken.split(":", 1)[0]?.trim() ?? "";

  return /^\d+$/.test(prefix) ? prefix : "";
};

const safeCompareHex = (leftHex: string, rightHex: string): boolean => {
  try {
    const left = Buffer.from(leftHex, "hex");
    const right = Buffer.from(rightHex, "hex");

    if (left.length !== right.length) {
      return false;
    }

    return timingSafeEqual(left, right);
  } catch {
    return false;
  }
};

const toDataCheckString = (payload: Record<string, string>): string => {
  return Object.entries(payload)
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
};

const normalizeTelegramWidgetPayload = (value: unknown): TelegramWidgetPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = Math.round(Number(raw.id ?? 0));
  const authDate = Math.round(Number(raw.auth_date ?? 0));
  const hash = String(raw.hash ?? "")
    .trim()
    .toLowerCase();

  if (!Number.isFinite(id) || id < 1 || !Number.isFinite(authDate) || authDate < 1 || hash.length !== 64) {
    return null;
  }

  return {
    id,
    first_name: typeof raw.first_name === "string" ? raw.first_name.slice(0, 120) : undefined,
    last_name: typeof raw.last_name === "string" ? raw.last_name.slice(0, 120) : undefined,
    username: typeof raw.username === "string" ? raw.username.replace(/^@/, "").slice(0, 64) : undefined,
    photo_url: typeof raw.photo_url === "string" ? raw.photo_url.slice(0, 3000) : undefined,
    auth_date: authDate,
    hash,
  };
};

const normalizeTelegramLoginCallbackPayload = (value: unknown): TelegramLoginCallbackPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const idToken = typeof raw.id_token === "string" ? raw.id_token.trim() : "";

  return {
    id_token: idToken || undefined,
    user:
      raw.user && typeof raw.user === "object"
        ? {
            id: Math.round(Number((raw.user as Record<string, unknown>).id ?? 0)) || undefined,
            name:
              typeof (raw.user as Record<string, unknown>).name === "string"
                ? String((raw.user as Record<string, unknown>).name).trim().slice(0, 240)
                : undefined,
            preferred_username:
              typeof (raw.user as Record<string, unknown>).preferred_username === "string"
                ? String((raw.user as Record<string, unknown>).preferred_username).trim().replace(/^@/, "").slice(0, 64)
                : undefined,
            picture:
              typeof (raw.user as Record<string, unknown>).picture === "string"
                ? String((raw.user as Record<string, unknown>).picture).trim().slice(0, 3000)
                : undefined,
            phone_number:
              typeof (raw.user as Record<string, unknown>).phone_number === "string"
                ? String((raw.user as Record<string, unknown>).phone_number).trim().slice(0, 64)
                : undefined,
          }
        : undefined,
    error: typeof raw.error === "string" ? raw.error.trim().slice(0, 240) : undefined,
  };
};

const fromBase64UrlJson = <T,>(value: string): T | null => {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
};

const splitDisplayName = (displayName: string): { firstName?: string; lastName?: string } => {
  const normalized = displayName.trim();
  if (!normalized) {
    return {};
  }

  const parts = normalized.split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return {};
  }

  return {
    firstName: parts[0]?.slice(0, 120) || undefined,
    lastName: parts.slice(1).join(" ").slice(0, 120) || undefined,
  };
};

const readTelegramJwks = async (): Promise<TelegramOidcJwk[] | null> => {
  const now = Date.now();

  if (telegramJwksCache && telegramJwksCache.expiresAt > now) {
    return telegramJwksCache.keys;
  }

  try {
    const response = await fetch(TELEGRAM_OIDC_JWKS_URL, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as TelegramJwksResponse;
    const keys = Array.isArray(payload.keys)
      ? payload.keys.filter((entry): entry is TelegramOidcJwk => Boolean(entry && typeof entry === "object"))
      : [];

    telegramJwksCache = {
      expiresAt: now + TELEGRAM_JWKS_CACHE_TTL_MS,
      keys,
    };

    return keys;
  } catch {
    return null;
  }
};

const verifyTelegramOidcIdToken = async (
  idToken: string,
  clientId: string,
): Promise<TelegramBrowserAuthUser | null> => {
  const parts = String(idToken ?? "").trim().split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = fromBase64UrlJson<TelegramOidcTokenHeader>(encodedHeader);
  const claims = fromBase64UrlJson<TelegramOidcTokenClaims>(encodedPayload);

  if (!header || !claims || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid.trim()) {
    return null;
  }

  const jwks = await readTelegramJwks();
  const matchingKey = jwks?.find(
    (entry) => entry.kid === header.kid && entry.kty === "RSA" && (!entry.alg || entry.alg === "RS256"),
  ) ?? null;

  if (!matchingKey) {
    return null;
  }

  let cryptoKey: CryptoKey;
  try {
    cryptoKey = await webcrypto.subtle.importKey(
      "jwk",
      matchingKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
  } catch {
    return null;
  }

  const signature = Buffer.from(encodedSignature, "base64url");
  const signingInput = new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`);
  const isValid = await webcrypto.subtle.verify("RSASSA-PKCS1-v1_5", cryptoKey, signature, signingInput);

  if (!isValid) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const exp = Math.round(Number(claims.exp ?? 0));
  const iat = Math.round(Number(claims.iat ?? 0));
  const telegramUserId = Math.round(Number(claims.id ?? 0));
  const issuer = String(claims.iss ?? "").trim();
  const audience = Array.isArray(claims.aud)
    ? claims.aud.map((entry) => String(entry ?? "").trim())
    : [String(claims.aud ?? "").trim()];

  if (
    issuer !== TELEGRAM_OIDC_ISSUER ||
    !audience.includes(clientId) ||
    !Number.isFinite(exp) ||
    !Number.isFinite(iat) ||
    exp <= now ||
    iat > now + 300 ||
    !Number.isFinite(telegramUserId) ||
    telegramUserId < 1
  ) {
    return null;
  }

  const { firstName, lastName } = splitDisplayName(String(claims.name ?? "").trim());

  return {
    id: telegramUserId,
    first_name: firstName,
    last_name: lastName,
    username: String(claims.preferred_username ?? "").trim().replace(/^@/, "").slice(0, 64) || undefined,
    photo_url: String(claims.picture ?? "").trim().slice(0, 3000) || undefined,
    auth_date: iat,
  };
};

const verifyLegacyTelegramBrowserLogin = (
  input: unknown,
  botToken: string,
): TelegramBrowserAuthUser | null => {
  const payload = normalizeTelegramWidgetPayload(input);
  if (!payload) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const authAge = Math.abs(now - payload.auth_date);
  if (authAge > getMaxAuthAgeSeconds()) {
    return null;
  }

  const checkData: Record<string, string> = {
    auth_date: String(payload.auth_date),
    first_name: payload.first_name ?? "",
    id: String(payload.id),
    last_name: payload.last_name ?? "",
    photo_url: payload.photo_url ?? "",
    username: payload.username ?? "",
  };

  const dataCheckString = toDataCheckString(checkData);
  const secret = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");

  if (!safeCompareHex(payload.hash, expectedHash)) {
    return null;
  }

  return {
    id: payload.id,
    first_name: payload.first_name,
    last_name: payload.last_name,
    username: payload.username,
    photo_url: payload.photo_url,
    auth_date: payload.auth_date,
  };
};

export const verifyTelegramBrowserLogin = async (
  input: unknown,
  botToken: string,
): Promise<TelegramBrowserAuthUser | null> => {
  const callbackPayload = normalizeTelegramLoginCallbackPayload(input);

  if (callbackPayload?.id_token) {
    const clientId = resolveTelegramLoginClientId(botToken);
    if (!clientId) {
      return null;
    }

    const verified = await verifyTelegramOidcIdToken(callbackPayload.id_token, clientId);
    if (verified) {
      return verified;
    }
  }

  return verifyLegacyTelegramBrowserLogin(input, botToken);
};

const toBase64Url = (value: string): string => {
  return Buffer.from(value, "utf8").toString("base64url");
};

const fromBase64Url = (value: string): string | null => {
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
};

const signValue = (value: string, secret: string): string => {
  return createHmac("sha256", secret).update(value).digest("base64url");
};

export const issueTelegramBrowserSession = (user: TelegramBrowserAuthUser, botToken: string): string => {
  const ttl = getSessionTtlSeconds();
  const now = Math.floor(Date.now() / 1000);
  const payload: BrowserSessionPayload = {
    user,
    iat: now,
    exp: now + ttl,
  };

  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = signValue(encodedPayload, getSessionSecret(botToken));
  return `${encodedPayload}.${signature}`;
};

const parseBrowserSessionPayload = (value: unknown): BrowserSessionPayload | null => {
  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<BrowserSessionPayload>;
  const user = raw.user;
  const iat = Math.round(Number(raw.iat ?? 0));
  const exp = Math.round(Number(raw.exp ?? 0));

  if (!user || typeof user !== "object" || !Number.isFinite(iat) || !Number.isFinite(exp) || exp <= iat) {
    return null;
  }

  const browserUser = user as TelegramBrowserAuthUser;

  const normalizedUser = {
    id: Math.round(Number(browserUser.id ?? 0)),
    first_name:
      typeof browserUser.first_name === "string"
        ? browserUser.first_name.slice(0, 120)
        : undefined,
    last_name:
      typeof browserUser.last_name === "string"
        ? browserUser.last_name.slice(0, 120)
        : undefined,
    username:
      typeof browserUser.username === "string"
        ? browserUser.username.replace(/^@/, "").slice(0, 64)
        : undefined,
    photo_url:
      typeof browserUser.photo_url === "string"
        ? browserUser.photo_url.slice(0, 3000)
        : undefined,
    auth_date: Math.round(Number(browserUser.auth_date ?? 0)),
  };

  if (!Number.isFinite(normalizedUser.id) || normalizedUser.id < 1 || !Number.isFinite(normalizedUser.auth_date)) {
    return null;
  }

  return {
    user: normalizedUser,
    iat,
    exp,
  };
};

export const verifyTelegramBrowserSession = (
  token: string | null | undefined,
  botToken: string,
): TelegramBrowserAuthUser | null => {
  const normalized = String(token ?? "").trim();
  if (!normalized) {
    return null;
  }

  const [encodedPayload, signature] = normalized.split(".");
  if (!encodedPayload || !signature) {
    return null;
  }

  const expectedSignature = signValue(encodedPayload, getSessionSecret(botToken));
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  const payloadRaw = fromBase64Url(encodedPayload);
  if (!payloadRaw) {
    return null;
  }

  let payload: BrowserSessionPayload | null = null;
  try {
    payload = parseBrowserSessionPayload(JSON.parse(payloadRaw));
  } catch {
    payload = null;
  }

  if (!payload) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) {
    return null;
  }

  return payload.user;
};

export const extractCookieValue = (request: Request, cookieName: string): string | null => {
  const cookieHeader = request.headers.get("cookie") ?? "";
  if (!cookieHeader) {
    return null;
  }

  const chunks = cookieHeader.split(";").map((part) => part.trim());
  for (const chunk of chunks) {
    if (!chunk) {
      continue;
    }

    const separatorIndex = chunk.indexOf("=");
    if (separatorIndex < 0) {
      continue;
    }

    const key = chunk.slice(0, separatorIndex).trim();
    if (key !== cookieName) {
      continue;
    }

    return decodeURIComponent(chunk.slice(separatorIndex + 1));
  }

  return null;
};

export const buildBrowserAuthCookie = (token: string): string => {
  const maxAge = getSessionTtlSeconds();
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${TELEGRAM_BROWSER_AUTH_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure}`;
};

export const buildBrowserAuthCookieClear = (): string => {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${TELEGRAM_BROWSER_AUTH_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
};
