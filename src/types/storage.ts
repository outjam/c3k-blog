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

export type StorageIngestMode = "test_prepare";

export type StorageIngestJobStatus =
  | "queued"
  | "processing"
  | "prepared"
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
  status: StorageBagStatus;
  replicasTarget: number;
  replicasActual: number;
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
  entityType: "node" | "bag" | "provider";
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
  failureCode?: string;
  failureMessage?: string;
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
  membership: StorageProgramMembership | null;
  nodeCount: number;
}
