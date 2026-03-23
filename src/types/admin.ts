export type AdminIncidentSeverity = "critical" | "warning" | "info";
export type AdminIncidentSectionState = "ok" | "warning" | "critical";
export type AdminIncidentSectionSourceState = "ok" | "degraded";

export interface AdminIncidentEntry {
  id: string;
  severity: AdminIncidentSeverity;
  title: string;
  description: string;
  timestamp: string;
  ageLabel?: string;
}

export interface AdminIncidentSection {
  id: "payments" | "payouts" | "deliveries" | "ingest" | "nft_runtime";
  label: string;
  state: AdminIncidentSectionState;
  count: number;
  summary: string;
  actionHint: string;
  windowLabel?: string;
  sourceState: AdminIncidentSectionSourceState;
  sourceNote?: string;
  entries: AdminIncidentEntry[];
}

export interface AdminIncidentStatusSnapshot {
  updatedAt: string;
  openIncidents: number;
  criticalIncidents: number;
  warningIncidents: number;
  sections: AdminIncidentSection[];
}

export type AdminWorkerRunWorkerId = "telegram_notifications" | "storage_delivery_telegram";
export type AdminWorkerRunStatus = "completed" | "partial" | "failed";

export interface AdminWorkerRunRecord {
  id: string;
  workerId: AdminWorkerRunWorkerId;
  status: AdminWorkerRunStatus;
  startedAt: string;
  completedAt: string;
  limit: number;
  queueSizeBefore?: number;
  queueSizeAfter?: number;
  processed: number;
  delivered: number;
  failed: number;
  retried?: number;
  skipped?: number;
  claimed?: number;
  remaining?: number;
  errorMessage?: string;
}

export interface AdminWorkerRunSnapshot {
  updatedAt: string;
  runs: AdminWorkerRunRecord[];
}
