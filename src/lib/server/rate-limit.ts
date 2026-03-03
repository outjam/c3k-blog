import { executeUpstashPipeline } from "@/lib/server/upstash-store";

interface RateLimitInput {
  scope: string;
  identifier: string | number;
  limit: number;
  windowSec: number;
}

interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

type MemoryRateLimitEntry = {
  count: number;
  resetAt: number;
};

const memoryRateLimit = new Map<string, MemoryRateLimitEntry>();

const normalizeId = (value: string | number): string => {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_").slice(0, 120) || "unknown";
};

const rateLimitKey = (scope: string, identifier: string | number): string => {
  const normalizedScope = scope.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_").slice(0, 80) || "global";
  return `c3k:rate:${normalizedScope}:${normalizeId(identifier)}`;
};

const parseNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const applyMemoryRateLimit = ({ scope, identifier, limit, windowSec }: RateLimitInput): RateLimitResult => {
  const key = rateLimitKey(scope, identifier);
  const now = Date.now();
  const current = memoryRateLimit.get(key);

  if (!current || now >= current.resetAt) {
    const resetAt = now + windowSec * 1000;
    memoryRateLimit.set(key, { count: 1, resetAt });
    return {
      ok: true,
      remaining: Math.max(0, limit - 1),
      retryAfterSec: 0,
    };
  }

  current.count += 1;
  const ok = current.count <= limit;
  const retryAfterSec = ok ? 0 : Math.max(1, Math.ceil((current.resetAt - now) / 1000));

  return {
    ok,
    remaining: Math.max(0, limit - current.count),
    retryAfterSec,
  };
};

export const checkRateLimit = async (input: RateLimitInput): Promise<RateLimitResult> => {
  const limit = Math.max(1, Math.round(input.limit));
  const windowSec = Math.max(1, Math.round(input.windowSec));
  const key = rateLimitKey(input.scope, input.identifier);

  const result = await executeUpstashPipeline([
    ["INCR", key],
    ["TTL", key],
  ]);

  if (!result) {
    return applyMemoryRateLimit({ ...input, limit, windowSec });
  }

  const count = parseNumber(result[0]?.result, 1);
  const ttl = parseNumber(result[1]?.result, -1);

  if (ttl < 0) {
    await executeUpstashPipeline([["EXPIRE", key, String(windowSec)]]);
  }

  const effectiveTtl = ttl > 0 ? ttl : windowSec;
  const ok = count <= limit;

  return {
    ok,
    remaining: Math.max(0, limit - count),
    retryAfterSec: ok ? 0 : Math.max(1, effectiveTtl),
  };
};
