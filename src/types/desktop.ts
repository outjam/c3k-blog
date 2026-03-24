export interface C3kDesktopRuntimeFeatures {
  storageProgramEnabled: boolean;
  desktopClientEnabled: boolean;
  tonSiteDesktopGatewayEnabled: boolean;
  telegramBotDeliveryEnabled: boolean;
  testModeIngestEnabled: boolean;
}

export interface C3kDesktopGatewayConfig {
  host: string;
  port: number;
  baseUrl: string;
  tonSiteHost: string;
}

export interface C3kDesktopOnboardingStep {
  id: string;
  title: string;
  description: string;
}

export interface C3kDesktopNodeMapNode {
  id: string;
  city: string;
  role: string;
  health: string;
  bags: string;
  tone: "live" | "ready" | "relay";
  coordinates: [number, number];
}

export interface C3kDesktopLocalNodeStorageState {
  rootPath?: string;
  dataBytes: number;
  freeBytes?: number;
  totalBytes?: number;
  targetBytes: number;
  bagFileCount: number;
  verifiedBagCount: number;
}

export interface C3kDesktopLocalNodeHealthState {
  infoCount: number;
  warningCount: number;
  criticalCount: number;
  lastEventAt?: string;
  lastEventMessage?: string;
}

export interface C3kDesktopLocalNodeParticipationPreview {
  state: "observer" | "warming" | "serving" | "keeper";
  label: string;
  summary: string;
  estimatedDailyCredits: number;
  estimatedWeeklyCredits: number;
}

export interface C3kDesktopLocalNodeRuntime {
  checkedAt: string;
  deviceLabel: string;
  platformLabel: string;
  storageRuntimeLabel: string;
  uploadMode: "simulated" | "tonstorage_cli";
  daemonReady: boolean;
  gatewayReady: boolean;
  overallReady: boolean;
  workerSecretConfigured: boolean;
  bagCount: number;
  tone: "live" | "ready" | "relay";
  gatewayUrl?: string;
  registryNodeId?: string;
  storage: C3kDesktopLocalNodeStorageState;
  health: C3kDesktopLocalNodeHealthState;
  participation: C3kDesktopLocalNodeParticipationPreview;
  nextAction: string;
  notes: string[];
}

export interface C3kDesktopRuntimeContract {
  appId: string;
  appName: string;
  appScheme: string;
  version: string;
  webAppOrigin: string | null;
  startUrl: string | null;
  storageProgramUrl: string | null;
  downloadsUrl: string | null;
  runtimeUrl: string | null;
  features: C3kDesktopRuntimeFeatures;
  gateway: C3kDesktopGatewayConfig;
  localNode: C3kDesktopLocalNodeRuntime;
  onboarding: {
    minRecommendedDiskGb: number;
    targetDiskGb: number;
    supportedPlatforms: string[];
    steps: C3kDesktopOnboardingStep[];
  };
  nodeMap: {
    nodes: C3kDesktopNodeMapNode[];
    bounds: [[number, number], [number, number]];
  };
  deepLinks: {
    openTonSite: string;
    openStorageExample: string;
  };
}

export interface C3kDesktopStorageOpenRequest {
  requestId?: string;
  releaseSlug?: string;
  trackId?: string;
  storagePointer?: string;
  deliveryUrl?: string;
  fileName?: string;
}
