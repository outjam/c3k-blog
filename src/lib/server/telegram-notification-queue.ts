import { executeUpstashPipeline } from "@/lib/server/upstash-store";
import {
  sendTelegramDocument,
  sendTelegramMessage,
  type TelegramDocumentOptions,
  type TelegramMessageOptions,
} from "@/lib/server/telegram-bot";

const QUEUE_STORAGE_KEY = "c3k:telegram:notify-queue:v1";
const INLINE_PROCESS_ENABLED = process.env.TELEGRAM_QUEUE_INLINE_PROCESSING !== "0";
const INLINE_PROCESS_LIMIT = Math.max(1, Math.min(25, Math.round(Number(process.env.TELEGRAM_QUEUE_INLINE_LIMIT ?? 5))));

type NotificationJobKind = "message" | "document";

interface NotificationJobBase {
  id: string;
  kind: NotificationJobKind;
  dedupeKey?: string;
  attempts: number;
  maxAttempts: number;
  runAt: number;
  createdAt: string;
}

interface MessageJob extends NotificationJobBase {
  kind: "message";
  payload: {
    chatId: number;
    text: string;
    options?: TelegramMessageOptions;
  };
}

interface DocumentJob extends NotificationJobBase {
  kind: "document";
  payload: {
    chatId: number;
    contentType: "utf8" | "base64";
    content: string;
    options?: TelegramDocumentOptions;
  };
}

type NotificationJob = MessageJob | DocumentJob;

interface QueueStats {
  processed: number;
  delivered: number;
  retried: number;
  failed: number;
  remaining: number;
}

type GlobalWithQueue = typeof globalThis & { __c3kTelegramNotifyQueueMemory__?: NotificationJob[] };

const getMemoryQueue = (): NotificationJob[] => {
  const root = globalThis as GlobalWithQueue;

  if (!root.__c3kTelegramNotifyQueueMemory__) {
    root.__c3kTelegramNotifyQueueMemory__ = [];
  }

  return root.__c3kTelegramNotifyQueueMemory__;
};

const parseQueue = (raw: unknown): NotificationJob[] => {
  if (typeof raw !== "string") {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as NotificationJob[]) : [];
  } catch {
    return [];
  }
};

const readQueue = async (): Promise<NotificationJob[]> => {
  const result = await executeUpstashPipeline([["GET", QUEUE_STORAGE_KEY]]);

  if (!result) {
    return [...getMemoryQueue()];
  }

  const first = result[0];

  if (!first || first.error) {
    return [...getMemoryQueue()];
  }

  return parseQueue(first.result);
};

const writeQueue = async (jobs: NotificationJob[]): Promise<void> => {
  const normalized = [...jobs].sort((a, b) => a.runAt - b.runAt);
  const result = await executeUpstashPipeline([["SET", QUEUE_STORAGE_KEY, JSON.stringify(normalized)]]);
  const first = result?.[0];

  if (!first || first.error) {
    const queue = getMemoryQueue();
    queue.splice(0, queue.length, ...normalized);
  }
};

const makeJobId = (kind: NotificationJobKind): string => {
  return `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const hasPendingDedupe = (jobs: NotificationJob[], dedupeKey: string): boolean => {
  return jobs.some((job) => job.dedupeKey === dedupeKey);
};

const computeRetryDelayMs = (attempts: number): number => {
  const baseSec = Math.min(300, 5 * 2 ** Math.max(0, attempts - 1));
  const jitterSec = Math.floor(Math.random() * 4);
  return (baseSec + jitterSec) * 1000;
};

const kickInlineQueueProcessing = (): void => {
  if (!INLINE_PROCESS_ENABLED) {
    return;
  }

  void processTelegramNotificationQueue(INLINE_PROCESS_LIMIT).catch(() => undefined);
};

export const enqueueTelegramMessageNotification = async (input: {
  chatId: number;
  text: string;
  options?: TelegramMessageOptions;
  dedupeKey?: string;
  maxAttempts?: number;
}): Promise<boolean> => {
  const jobs = await readQueue();
  const dedupeKey = input.dedupeKey?.trim();

  if (dedupeKey && hasPendingDedupe(jobs, dedupeKey)) {
    return false;
  }

  const job: MessageJob = {
    id: makeJobId("message"),
    kind: "message",
    dedupeKey: dedupeKey || undefined,
    attempts: 0,
    maxAttempts: Math.max(1, Math.min(12, Math.round(input.maxAttempts ?? 6))),
    runAt: Date.now(),
    createdAt: new Date().toISOString(),
    payload: {
      chatId: input.chatId,
      text: input.text,
      options: input.options,
    },
  };

  jobs.push(job);
  await writeQueue(jobs);
  kickInlineQueueProcessing();
  return true;
};

export const enqueueTelegramDocumentNotification = async (input: {
  chatId: number;
  content: string | Uint8Array;
  options?: TelegramDocumentOptions;
  dedupeKey?: string;
  maxAttempts?: number;
}): Promise<boolean> => {
  const jobs = await readQueue();
  const dedupeKey = input.dedupeKey?.trim();

  if (dedupeKey && hasPendingDedupe(jobs, dedupeKey)) {
    return false;
  }

  const isString = typeof input.content === "string";
  const content = isString ? (input.content as string) : Buffer.from(input.content).toString("base64");

  const job: DocumentJob = {
    id: makeJobId("document"),
    kind: "document",
    dedupeKey: dedupeKey || undefined,
    attempts: 0,
    maxAttempts: Math.max(1, Math.min(12, Math.round(input.maxAttempts ?? 6))),
    runAt: Date.now(),
    createdAt: new Date().toISOString(),
    payload: {
      chatId: input.chatId,
      contentType: isString ? "utf8" : "base64",
      content,
      options: input.options,
    },
  };

  jobs.push(job);
  await writeQueue(jobs);
  kickInlineQueueProcessing();
  return true;
};

const sendJob = async (job: NotificationJob): Promise<boolean> => {
  try {
    if (job.kind === "message") {
      return sendTelegramMessage(job.payload.chatId, job.payload.text, job.payload.options);
    }

    const content =
      job.payload.contentType === "utf8" ? job.payload.content : Buffer.from(job.payload.content, "base64");

    return sendTelegramDocument(job.payload.chatId, content, job.payload.options);
  } catch {
    return false;
  }
};

export const processTelegramNotificationQueue = async (limit = 25): Promise<QueueStats> => {
  const maxJobs = Math.max(1, Math.min(100, Math.round(limit)));
  const jobs = await readQueue();
  const now = Date.now();
  const pending = [...jobs].sort((a, b) => a.runAt - b.runAt);
  const nextQueue: NotificationJob[] = [];

  const stats: QueueStats = {
    processed: 0,
    delivered: 0,
    retried: 0,
    failed: 0,
    remaining: 0,
  };

  for (const job of pending) {
    if (stats.processed >= maxJobs || job.runAt > now) {
      nextQueue.push(job);
      continue;
    }

    stats.processed += 1;
    const delivered = await sendJob(job);

    if (delivered) {
      stats.delivered += 1;
      continue;
    }

    const nextAttempts = job.attempts + 1;

    if (nextAttempts >= job.maxAttempts) {
      stats.failed += 1;
      console.error("[telegram-notify-queue] delivery failed", {
        jobId: job.id,
        jobKind: job.kind,
        chatId: job.payload.chatId,
        attempts: nextAttempts,
        maxAttempts: job.maxAttempts,
        dedupeKey: job.dedupeKey,
      });
      continue;
    }

    stats.retried += 1;
    nextQueue.push({
      ...job,
      attempts: nextAttempts,
      runAt: Date.now() + computeRetryDelayMs(nextAttempts),
    });
  }

  stats.remaining = nextQueue.length;
  await writeQueue(nextQueue);
  return stats;
};

export const getTelegramNotificationQueueSize = async (): Promise<number> => {
  const jobs = await readQueue();
  return jobs.length;
};
