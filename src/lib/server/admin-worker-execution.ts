import { recordAdminWorkerRun } from "@/lib/server/admin-worker-run-store";
import type {
  AdminWorkerRunRecord,
  AdminWorkerRunStatus,
  AdminWorkerRunTrigger,
  AdminWorkerRunWorkerId,
} from "@/types/admin";

interface WorkerExecutionStats {
  processed: number;
  delivered: number;
  failed: number;
  remaining: number;
  retried?: number;
  skipped?: number;
  claimed?: number;
}

interface ExecuteAdminWorkerRunInput {
  workerId: AdminWorkerRunWorkerId;
  limit: number;
  getQueueSize: () => Promise<number>;
  run: (limit: number) => Promise<WorkerExecutionStats>;
  failureMessage: string;
  trigger: AdminWorkerRunTrigger;
  triggeredByTelegramUserId?: number;
}

const resolveRunStatus = (stats: WorkerExecutionStats): AdminWorkerRunStatus => {
  return stats.failed > 0 ? "partial" : "completed";
};

export const executeAdminWorkerRun = async (
  input: ExecuteAdminWorkerRunInput,
): Promise<AdminWorkerRunRecord | null> => {
  const queueSizeBefore = await input.getQueueSize();
  const startedAt = new Date().toISOString();

  try {
    const stats = await input.run(input.limit);

    return recordAdminWorkerRun({
      workerId: input.workerId,
      status: resolveRunStatus(stats),
      trigger: input.trigger,
      triggeredByTelegramUserId: input.triggeredByTelegramUserId,
      startedAt,
      completedAt: new Date().toISOString(),
      limit: input.limit,
      queueSizeBefore,
      queueSizeAfter: stats.remaining,
      processed: stats.processed,
      delivered: stats.delivered,
      failed: stats.failed,
      retried: stats.retried,
      skipped: stats.skipped,
      claimed: stats.claimed,
      remaining: stats.remaining,
    });
  } catch (error) {
    await recordAdminWorkerRun({
      workerId: input.workerId,
      status: "failed",
      trigger: input.trigger,
      triggeredByTelegramUserId: input.triggeredByTelegramUserId,
      startedAt,
      completedAt: new Date().toISOString(),
      limit: input.limit,
      queueSizeBefore,
      queueSizeAfter: queueSizeBefore,
      processed: 0,
      delivered: 0,
      failed: 1,
      remaining: queueSizeBefore,
      errorMessage: error instanceof Error ? error.message : input.failureMessage,
    });
    throw error;
  }
};
