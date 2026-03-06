import { createHash, createHmac, timingSafeEqual } from "node:crypto";

interface TelegramWidgetPayload {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

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

export const verifyTelegramBrowserLogin = (
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

  const normalizedUser = normalizeTelegramWidgetPayload({
    ...user,
    auth_date: (user as TelegramBrowserAuthUser).auth_date,
    hash: "0".repeat(64),
  });

  if (!normalizedUser) {
    return null;
  }

  return {
    user: {
      id: normalizedUser.id,
      first_name: normalizedUser.first_name,
      last_name: normalizedUser.last_name,
      username: normalizedUser.username,
      photo_url: normalizedUser.photo_url,
      auth_date: normalizedUser.auth_date,
    },
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
