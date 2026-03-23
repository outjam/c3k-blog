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

export interface AdminTonEnvironmentStatus {
  updatedAt: string;
  network: "mainnet" | "testnet";
  onchainMintEnabled: boolean;
  publicBaseUrl: string | null;
  envCollectionAddress: string | null;
  runtimeCollectionAddress: string | null;
  runtimeConfigNetwork: "mainnet" | "testnet" | null;
  runtimeNetworkMatches: boolean;
  activeCollectionAddress: string | null;
  collectionSource: "runtime" | "env" | "missing";
  relayReady: boolean;
  relayMissing: string[];
  sponsorAddress?: string;
  warnings: string[];
}

export type AdminDeploymentCheckStatus = "ready" | "warning" | "missing";

export interface AdminDeploymentCheck {
  id:
    | "public_urls"
    | "telegram_core"
    | "auth_session"
    | "postgres"
    | "worker_auth"
    | "ton_runtime"
    | "storage_desktop";
  label: string;
  status: AdminDeploymentCheckStatus;
  summary: string;
  hint: string;
}

export interface AdminDeploymentReadinessSnapshot {
  updatedAt: string;
  overallState: AdminDeploymentCheckStatus;
  readyChecks: number;
  warningChecks: number;
  missingChecks: number;
  checks: AdminDeploymentCheck[];
}
