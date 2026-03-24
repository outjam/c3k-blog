export type StorageAssetType =
  | "audio_master"
  | "audio_preview"
  | "cover"
  | "booklet"
  | "nft_media"
  | "site_bundle";

export type StorageAssetFormat =
  | "aac"
  | "alac"
  | "mp3"
  | "ogg"
  | "wav"
  | "flac"
  | "zip"
  | "png"
  | "json"
  | "html_bundle";

export type StorageBagStatus =
  | "draft"
  | "created"
  | "uploaded"
  | "replicating"
  | "healthy"
  | "degraded"
  | "disabled";

export type StorageBagRuntimeFetchStatus = "pending" | "verified" | "failed";

export type StorageNodeType =
  | "owned_provider"
  | "partner_provider"
  | "community_node";

export type StorageNodePlatform = "macos" | "windows" | "linux";

export type StorageNodeStatus =
  | "candidate"
  | "active"
  | "degraded"
  | "suspended";

export type StorageAssignmentStatus =
  | "pending"
  | "replicating"
  | "serving"
  | "failed";

export type StorageProgramMembershipStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "suspended";

export type StorageProgramTier =
  | "supporter"
  | "keeper"
  | "core"
  | "guardian";

export type StorageDeliveryChannel =
  | "telegram_bot"
  | "web_download"
  | "desktop_download";

export type StorageDeliveryTargetType = "release" | "track";

export type StorageRuntimeMode = "test_prepare" | "tonstorage_testnet";
export type StorageTonUploadBridgeMode = "simulated" | "tonstorage_cli";
export type StorageRuntimeFetchVia =
  | "delivery_url"
  | "resolved_source"
  | "bag_meta"
  | "asset_source"
  | "bag_http_pointer"
  | "tonstorage_gateway";

export type StorageIngestMode = StorageRuntimeMode;

export type StorageIngestJobStatus =
  | "queued"
  | "processing"
  | "prepared"
  | "uploaded"
  | "failed"
  | "skipped";

export type StorageDeliveryRequestStatus =
  | "requested"
  | "processing"
  | "pending_asset_mapping"
  | "ready"
  | "delivered"
  | "failed";

export interface StorageAsset {
  id: string;
  releaseSlug?: string;
  trackId?: string;
  artistTelegramUserId?: number;
  resourceKey?: string;
  audioFileId?: string;
  assetType: StorageAssetType;
  format: StorageAssetFormat;
  sourceUrl?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes: number;
  checksumSha256?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageBag {
  id: string;
  bagId?: string;
  assetId: string;
  description?: string;
  tonstorageUri?: string;
  metaFileUrl?: string;
  runtimeMode?: StorageRuntimeMode;
  runtimeLabel?: string;
  status: StorageBagStatus;
  replicasTarget: number;
  replicasActual: number;
  runtimeFetchStatus?: StorageBagRuntimeFetchStatus;
  runtimeFetchCheckedAt?: string;
  runtimeFetchVerifiedAt?: string;
  runtimeFetchUrl?: string;
  runtimeFetchError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageBagFile {
  id: string;
  bagId: string;
  path: string;
  sizeBytes: number;
  priority: number;
  mimeType?: string;
}

export interface StorageNode {
  id: string;
  userTelegramId?: number;
  walletAddress?: string;
  nodeLabel: string;
  publicLabel?: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  nodeType: StorageNodeType;
  platform: StorageNodePlatform;
  status: StorageNodeStatus;
  diskAllocatedBytes: number;
  diskUsedBytes: number;
  bandwidthLimitKbps: number;
  lastSeenAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StorageNodeAssignment {
  id: string;
  nodeId: string;
  bagId: string;
  assignmentStatus: StorageAssignmentStatus;
  assignedAt: string;
  updatedAt: string;
}

export interface StorageProviderContract {
  id: string;
  providerNodeId: string;
  providerContractAddress: string;
  acceptingNewContracts: boolean;
  minBagSizeBytes: number;
  maxBagSizeBytes: number;
  rateNanoTonPerMbDay: string;
  maxSpanSec: number;
  maxContracts: number;
  maxTotalSizeBytes: number;
  lastSyncedAt?: string;
}

export interface StorageHealthEvent {
  id: string;
  entityType: "node" | "bag" | "provider" | "runtime";
  entityId: string;
  severity: "info" | "warning" | "critical";
  code: string;
  message: string;
  createdAt: string;
}

export interface StorageProgramMembership {
  telegramUserId: number;
  walletAddress?: string;
  status: StorageProgramMembershipStatus;
  tier: StorageProgramTier;
  note?: string;
  moderationNote?: string;
  joinedAt: string;
  updatedAt: string;
}

export interface StorageProgramNodeSummary {
  id: string;
  nodeLabel: string;
  publicLabel?: string;
  city?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  status: StorageNodeStatus;
  nodeType: StorageNodeType;
  platform: StorageNodePlatform;
  diskAllocatedBytes: number;
  diskUsedBytes: number;
  bandwidthLimitKbps: number;
  lastSeenAt?: string;
  updatedAt: string;
  mapReady: boolean;
  reliabilityScore: number;
  reliabilityLabel: "stable" | "warming" | "attention";
  recentWarningCount: number;
  recentCriticalCount: number;
  rewardScore: number;
  rewardLabel: "strong" | "building" | "low";
  weeklyCreditsPreview: number;
  staleHeartbeat: boolean;
  peerLinkCount: number;
}

export interface StorageProgramNetworkSummary {
  totalNodes: number;
  activeNodes: number;
  degradedNodes: number;
  communityNodes: number;
  providerNodes: number;
  stableNodes: number;
  warmingNodes: number;
  attentionNodes: number;
  staleHeartbeatNodes: number;
  avgReliabilityScore: number;
  avgRewardScore: number;
  totalWeeklyCreditsPreview: number;
  topRewardNodeLabel?: string;
  recentWarningEvents: number;
  recentCriticalEvents: number;
  peerAssignmentCount: number;
  readyPeerAssignments: number;
  watchPeerAssignments: number;
  riskPeerAssignments: number;
  overallReliabilityLabel: "stable" | "warming" | "attention";
  summary: string;
  countries: string[];
  cities: string[];
}

export interface StorageProgramRuntimeSummary {
  tone: "live" | "ready" | "pending";
  headline: string;
  note: string;
  assetCount: number;
  sourceReadyAssetCount: number;
  bagCount: number;
  uploadedBagCount: number;
  pointerReadyBagCount: number;
  verifiedBagCount: number;
  failedBagCount: number;
  bagFileCount: number;
  queuedJobCount: number;
  processingJobCount: number;
  preparedJobCount: number;
  uploadedJobCount: number;
  failedJobCount: number;
  userDeliveryCount: number;
  processingDeliveryCount: number;
  pendingAssetMappingCount: number;
  readyDeliveryCount: number;
  deliveredDeliveryCount: number;
  failedDeliveryCount: number;
  runtimeBackedDeliveryCount: number;
  webDeliveryCount: number;
  telegramDeliveryCount: number;
  desktopDeliveryCount: number;
  attentionCount: number;
  lastActivityAt?: string;
  lastDeliveryAt?: string;
  recentEvents: StorageHealthEvent[];
}

export interface StoragePeerAssignmentPreview {
  id: string;
  sourceNodeId: string;
  sourceLabel: string;
  sourceNodeType: StorageNodeType;
  sourceLatitude?: number;
  sourceLongitude?: number;
  sourceReliabilityScore: number;
  targetNodeId: string;
  targetLabel: string;
  targetNodeType: StorageNodeType;
  targetLatitude?: number;
  targetLongitude?: number;
  targetReliabilityScore: number;
  status: "ready" | "watch" | "risk";
  reason: string;
  distanceKm?: number;
}

export interface StoragePublicNodeSnapshot {
  node: StorageProgramNodeSummary;
  recentHealthEvents: StorageHealthEvent[];
  otherPublicNodes: StorageProgramNodeSummary[];
  networkSummary: StorageProgramNetworkSummary;
  peerAssignments: StoragePeerAssignmentPreview[];
}

export interface StorageRuntimeStatusSnapshot {
  mode: StorageRuntimeMode;
  label: string;
  pointerBase?: string;
  providerLabel?: string;
  enabled: boolean;
  supportsRealPointers: boolean;
  requiresExternalUploadWorker: boolean;
  notes: string[];
}

export interface StorageTonRuntimeBridgeStatus {
  generatedAt: string;
  uploadMode: StorageTonUploadBridgeMode;
  workerSecretConfigured: boolean;
  daemonCliBin?: string;
  daemonCliArgsConfigured: boolean;
  gatewayBase?: string;
  realUploadReady: boolean;
  gatewayRetrievalReady: boolean;
  missing: string[];
  notes: string[];
}

export interface StorageTonRuntimePreflightSnapshot {
  checkedAt: string;
  uploadMode: StorageTonUploadBridgeMode;
  workerSecretConfigured: boolean;
  daemonCliBin?: string;
  daemonCliArgsConfigured: boolean;
  gatewayBase?: string;
  cliChecked: boolean;
  cliOk: boolean;
  cliCommand?: string;
  cliKnownBagCount?: number;
  cliSample?: string;
  cliError?: string;
  gatewayChecked: boolean;
  gatewayOk: boolean;
  gatewayProbeUrl?: string;
  gatewayStatus?: number;
  gatewayError?: string;
  overallReady: boolean;
  notes: string[];
  nextActions: string[];
}

export interface StorageBagRuntimeReverifySummary {
  checkedAt: string;
  bagId: string;
  assetId: string;
  filePath?: string;
  status: StorageBagRuntimeFetchStatus;
  gatewayUrl?: string;
  error?: string;
  probeMethod?: "HEAD" | "GET";
  httpStatus?: number;
  reconciledRequestsUpdated: number;
  reconciledReady: number;
  reconciledProcessing: number;
  reconciledPending: number;
}

export interface StorageBagRuntimeSweepSummary {
  checkedAt: string;
  scanned: number;
  verified: number;
  failed: number;
  pending: number;
  reconciledRequestsUpdated: number;
  reconciledReady: number;
  reconciledProcessing: number;
  reconciledPending: number;
  bagIds: string[];
}

export interface StorageDeliveryRequest {
  id: string;
  telegramUserId: number;
  channel: StorageDeliveryChannel;
  targetType: StorageDeliveryTargetType;
  releaseSlug: string;
  trackId?: string;
  requestedFormat?: string;
  resolvedFormat?: string;
  status: StorageDeliveryRequestStatus;
  resolvedAssetId?: string;
  resolvedBagId?: string;
  resolvedSourceUrl?: string;
  storagePointer?: string;
  deliveryUrl?: string;
  fileName?: string;
  mimeType?: string;
  telegramChatId?: number;
  workerLockId?: string;
  workerLockedAt?: string;
  workerAttemptCount: number;
  failureCode?: string;
  failureMessage?: string;
  lastDeliveredVia?: StorageRuntimeFetchVia;
  lastDeliveredSourceUrl?: string;
  createdAt: string;
  updatedAt: string;
  deliveredAt?: string;
}

export interface StorageDeliveryState {
  requests: Record<string, StorageDeliveryRequest>;
  updatedAt: string;
}

export interface StorageIngestJob {
  id: string;
  assetId: string;
  bagId?: string;
  mode: StorageIngestMode;
  status: StorageIngestJobStatus;
  requestedByTelegramUserId?: number;
  storagePointer?: string;
  message?: string;
  attemptCount: number;
  workerLockId?: string;
  workerLockedAt?: string;
  failureCode?: string;
  failureMessage?: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface StorageIngestState {
  jobs: Record<string, StorageIngestJob>;
  updatedAt: string;
}

export interface StorageRegistryState {
  assets: Record<string, StorageAsset>;
  bags: Record<string, StorageBag>;
  bagFiles: Record<string, StorageBagFile>;
  nodes: Record<string, StorageNode>;
  nodeAssignments: Record<string, StorageNodeAssignment>;
  providerContracts: Record<string, StorageProviderContract>;
  memberships: Record<string, StorageProgramMembership>;
  healthEvents: StorageHealthEvent[];
  updatedAt: string;
}

export interface StorageProgramSnapshot {
  enabled: boolean;
  desktopClientEnabled: boolean;
  tonSiteDesktopGatewayEnabled: boolean;
  telegramBotDeliveryEnabled: boolean;
  testModeIngestEnabled: boolean;
  runtimeStatus: StorageRuntimeStatusSnapshot;
  membership: StorageProgramMembership | null;
  nodeCount: number;
  nodeIds: string[];
  nodes: StorageProgramNodeSummary[];
  publicNodeCount: number;
  publicNodes: StorageProgramNodeSummary[];
  runtimeSummary: StorageProgramRuntimeSummary;
  networkSummary: StorageProgramNetworkSummary;
  peerAssignments: StoragePeerAssignmentPreview[];
}
