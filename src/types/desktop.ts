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
