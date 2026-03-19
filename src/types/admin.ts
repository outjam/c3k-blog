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
