import { createHash } from "node:crypto";

import { executeUpstashPipeline } from "@/lib/server/upstash-store";

interface IdempotencyRecord {
  requestHash: string;
  statusCode: number;
  body: unknown;
  createdAt: string;
}

interface ReadIdempotencyInput {
  scope: string;
  actor: string | number;
  key: string;
  requestHash: string;
}

interface SaveIdempotencyInput extends ReadIdempotencyInput {
  statusCode: number;
  body: unknown;
  ttlSec: number;
}

type ReadIdempotencyResult =
  | { kind: "miss" }
  | { kind: "mismatch" }
  | { kind: "hit"; statusCode: number; body: unknown };

type MemoryIdempotencyEntry = {
  record: IdempotencyRecord;
  expiresAt: number;
};

const memoryStore = new Map<string, MemoryIdempotencyEntry>();

const normalizeChunk = (value: string): string => {
  return value.trim().toLowerCase().replace(/[^a-z0-9:_-]/g, "_").slice(0, 120) || "unknown";
};

const storageKey = (scope: string, actor: string | number, key: string): string => {
  const scopeChunk = normalizeChunk(scope);
  const actorChunk = normalizeChunk(String(actor));
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 24);
  return `c3k:idem:${scopeChunk}:${actorChunk}:${hash}`;
};

const parseRecord = (raw: unknown): IdempotencyRecord | null => {
  if (typeof raw !== "string") {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<IdempotencyRecord>;

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const requestHash = String(parsed.requestHash ?? "").trim().toLowerCase().slice(0, 128);
    const statusCode = Math.max(100, Math.min(599, Math.round(Number(parsed.statusCode ?? 200))));
    const createdAt = String(parsed.createdAt ?? "");

    if (!requestHash) {
      return null;
    }

    return {
      requestHash,
      statusCode,
      body: parsed.body,
      createdAt: createdAt || new Date().toISOString(),
    };
  } catch {
    return null;
  }
};

export const extractIdempotencyKey = (request: Request): string | null => {
  const value = request.headers.get("idempotency-key");

  if (!value) {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  return trimmed.slice(0, 160);
};

export const hashIdempotencyPayload = (payload: unknown): string => {
  const serialized = JSON.stringify(payload) ?? "null";
  return createHash("sha256").update(serialized).digest("hex");
};

export const readIdempotencyRecord = async (input: ReadIdempotencyInput): Promise<ReadIdempotencyResult> => {
  const key = storageKey(input.scope, input.actor, input.key);
  const memory = memoryStore.get(key);

  if (memory) {
    if (Date.now() >= memory.expiresAt) {
      memoryStore.delete(key);
    } else if (memory.record.requestHash !== input.requestHash) {
      return { kind: "mismatch" };
    } else {
      return {
        kind: "hit",
        statusCode: memory.record.statusCode,
        body: memory.record.body,
      };
    }
  }

  const result = await executeUpstashPipeline([["GET", key]]);

  if (!result) {
    return { kind: "miss" };
  }

  const record = parseRecord(result[0]?.result);

  if (!record) {
    return { kind: "miss" };
  }

  if (record.requestHash !== input.requestHash) {
    return { kind: "mismatch" };
  }

  return {
    kind: "hit",
    statusCode: record.statusCode,
    body: record.body,
  };
};

export const saveIdempotencyRecord = async (input: SaveIdempotencyInput): Promise<void> => {
  const key = storageKey(input.scope, input.actor, input.key);
  const ttlSec = Math.max(60, Math.round(input.ttlSec));

  const record: IdempotencyRecord = {
    requestHash: input.requestHash,
    statusCode: Math.max(100, Math.min(599, Math.round(input.statusCode))),
    body: input.body,
    createdAt: new Date().toISOString(),
  };

  memoryStore.set(key, {
    record,
    expiresAt: Date.now() + ttlSec * 1000,
  });

  await executeUpstashPipeline([["SET", key, JSON.stringify(record), "EX", String(ttlSec)]]);
};
