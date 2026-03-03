import { createHmac, timingSafeEqual } from "node:crypto";

interface TelegramAuthUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
  allows_write_to_pm?: boolean;
}

export interface VerifiedTelegramInitData {
  authDate: number | null;
  queryId: string | null;
  user: TelegramAuthUser;
}

const MAX_AUTH_AGE_SECONDS = 60 * 60 * 24 * 7;

const getHashFromParams = (params: URLSearchParams): string | null => {
  const hash = params.get("hash");

  if (!hash) {
    return null;
  }

  const normalized = hash.trim().toLowerCase();
  return normalized.length === 64 ? normalized : null;
};

const buildDataCheckString = (params: URLSearchParams, excludeSignature = false): string => {
  const pairs = Array.from(params.entries())
    .filter(([key]) => key !== "hash" && (!excludeSignature || key !== "signature"))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`);

  return pairs.join("\n");
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

const parseUser = (userRaw: string | null): TelegramAuthUser | null => {
  if (!userRaw) {
    return null;
  }

  try {
    const parsed = JSON.parse(userRaw) as TelegramAuthUser;

    if (!parsed || typeof parsed !== "object" || !Number.isFinite(parsed.id) || parsed.id < 1) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
};

export const verifyTelegramInitData = (initData: string, botToken: string): VerifiedTelegramInitData | null => {
  const params = new URLSearchParams(initData);
  const receivedHash = getHashFromParams(params);

  if (!receivedHash) {
    return null;
  }

  const dataCheckString = buildDataCheckString(params);
  const legacyDataCheckString = buildDataCheckString(params, true);
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  const legacyExpectedHash = createHmac("sha256", secret).update(legacyDataCheckString).digest("hex");

  if (!safeCompareHex(receivedHash, expectedHash) && !safeCompareHex(receivedHash, legacyExpectedHash)) {
    return null;
  }

  const authDateValue = params.get("auth_date");
  const authDate = authDateValue ? Number.parseInt(authDateValue, 10) : null;

  if (authDate && Number.isFinite(authDate)) {
    const now = Math.floor(Date.now() / 1000);
    const age = Math.abs(now - authDate);

    if (age > MAX_AUTH_AGE_SECONDS) {
      return null;
    }
  }

  const user = parseUser(params.get("user"));

  if (!user) {
    return null;
  }

  return {
    authDate: Number.isFinite(authDate) ? authDate : null,
    queryId: params.get("query_id"),
    user,
  };
};

export const extractTelegramInitDataFromRequest = (request: Request): string | null => {
  const fromHeader = request.headers.get("x-telegram-init-data");

  if (fromHeader?.trim()) {
    return fromHeader.trim();
  }

  const auth = request.headers.get("authorization");

  if (!auth) {
    return null;
  }

  if (auth.startsWith("tma ")) {
    return auth.slice(4).trim();
  }

  if (auth.startsWith("Bearer ")) {
    return auth.slice(7).trim();
  }

  return null;
};
