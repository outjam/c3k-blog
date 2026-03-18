import { getDefaultTrackFormat, getTrackFormats, isArtistAudioFormat } from "@/lib/shop-release-format";
import { getC3kStorageConfig } from "@/lib/storage-config";
import {
  buildReleaseDeliveryResourceKey,
  buildTrackDeliveryResourceKey,
  inferAudioMimeType,
} from "@/lib/storage-resource-key";
import { getSocialUserSnapshot } from "@/lib/server/social-user-state-store";
import {
  listStorageAssets,
  listStorageBags,
} from "@/lib/server/storage-registry-store";
import {
  createStorageDeliveryRequest,
  getStorageDeliveryRequest,
  updateStorageDeliveryRequest,
} from "@/lib/server/storage-delivery-store";
import { getCatalogSnapshot } from "@/lib/server/shop-catalog";
import { sendTelegramDocument } from "@/lib/server/telegram-bot";
import type { StorageAsset, StorageBag, StorageDeliveryChannel, StorageDeliveryRequest } from "@/types/storage";
import type { ArtistAudioFormat, ArtistReleaseTrackItem, ShopProduct } from "@/types/shop";

type DeliveryFailureReason =
  | "storage_disabled"
  | "release_not_found"
  | "track_not_found"
  | "not_purchased"
  | "format_not_owned"
  | "telegram_delivery_disabled"
  | "telegram_delivery_failed";

interface DeliveryAccessResolution {
  allowed: boolean;
  reason?: "not_purchased" | "format_not_owned";
  resolvedFormat?: ArtistAudioFormat;
}

export type StorageDeliveryServiceResult =
  | {
      ok: true;
      request: StorageDeliveryRequest;
      message?: string;
    }
  | {
      ok: false;
      reason: DeliveryFailureReason;
      message: string;
      request?: StorageDeliveryRequest;
    };

const BAG_STATUS_PRIORITY: Record<StorageBag["status"], number> = {
  healthy: 6,
  replicating: 5,
  uploaded: 4,
  created: 3,
  draft: 2,
  degraded: 1,
  disabled: 0,
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const normalizeOptionalFormat = (value: unknown): ArtistAudioFormat | undefined => {
  const normalized = String(value ?? "").trim().toLowerCase();
  return isArtistAudioFormat(normalized) ? normalized : undefined;
};

const normalizeTrackId = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const normalizeTelegramUserId = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
};

const buildTrackKey = (releaseSlug: string, trackId: string): string => {
  return `${releaseSlug}::${trackId}`;
};

const getOwnedReleaseFormats = (
  product: ShopProduct,
  purchasedReleaseSlugs: string[],
  purchasedReleaseFormatKeys: string[],
): ArtistAudioFormat[] => {
  const exactOwned = purchasedReleaseFormatKeys
    .filter((entry) => entry.startsWith(`${product.slug}::`))
    .map((entry) => normalizeOptionalFormat(entry.split("::", 2)[1]))
    .filter((entry): entry is ArtistAudioFormat => Boolean(entry));

  if (exactOwned.length > 0) {
    return Array.from(new Set(exactOwned));
  }

  if (purchasedReleaseSlugs.includes(product.slug)) {
    return [getDefaultTrackFormat(product)];
  }

  return [];
};

const resolveReleaseAccess = (
  product: ShopProduct,
  purchasedReleaseSlugs: string[],
  purchasedReleaseFormatKeys: string[],
  requestedFormat?: ArtistAudioFormat,
): DeliveryAccessResolution => {
  const ownedFormats = getOwnedReleaseFormats(
    product,
    purchasedReleaseSlugs,
    purchasedReleaseFormatKeys,
  );

  if (ownedFormats.length === 0 && !purchasedReleaseSlugs.includes(product.slug)) {
    return {
      allowed: false,
      reason: "not_purchased",
    };
  }

  if (requestedFormat) {
    return ownedFormats.includes(requestedFormat)
      ? { allowed: true, resolvedFormat: requestedFormat }
      : { allowed: false, reason: "format_not_owned" };
  }

  return {
    allowed: true,
    resolvedFormat: ownedFormats[0] ?? getDefaultTrackFormat(product),
  };
};

const resolveTrackAccess = (
  product: ShopProduct,
  track: ArtistReleaseTrackItem,
  purchasedReleaseSlugs: string[],
  purchasedReleaseFormatKeys: string[],
  purchasedTrackKeys: string[],
  requestedFormat?: ArtistAudioFormat,
): DeliveryAccessResolution => {
  const releaseResolution = resolveReleaseAccess(
    product,
    purchasedReleaseSlugs,
    purchasedReleaseFormatKeys,
    requestedFormat,
  );

  if (releaseResolution.allowed) {
    return releaseResolution;
  }

  const ownsTrack = purchasedTrackKeys.includes(buildTrackKey(product.slug, track.id));
  if (!ownsTrack) {
    return {
      allowed: false,
      reason: "not_purchased",
    };
  }

  const defaultFormat = getDefaultTrackFormat(product);

  if (requestedFormat && requestedFormat !== defaultFormat) {
    return {
      allowed: false,
      reason: "format_not_owned",
    };
  }

  return {
    allowed: true,
    resolvedFormat: defaultFormat,
  };
};

const pickPreferredBag = (bags: StorageBag[], assetId: string): StorageBag | null => {
  return (
    bags
      .filter((bag) => bag.assetId === assetId)
      .sort((left, right) => {
        const leftPriority = BAG_STATUS_PRIORITY[left.status];
        const rightPriority = BAG_STATUS_PRIORITY[right.status];

        if (leftPriority !== rightPriority) {
          return rightPriority - leftPriority;
        }

        return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
      })[0] ?? null
  );
};

const resolveRelativeUrl = (value: string | undefined, publicBaseUrl?: string): string | undefined => {
  const normalized = String(value ?? "").trim();

  if (!normalized) {
    return undefined;
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (normalized.startsWith("/") && publicBaseUrl) {
    return new URL(normalized, publicBaseUrl).toString();
  }

  return undefined;
};

const inferFileName = (
  targetType: "release" | "track",
  releaseSlug: string,
  resolvedFormat: ArtistAudioFormat,
  asset?: StorageAsset | null,
  track?: ArtistReleaseTrackItem | null,
): string => {
  if (asset?.fileName) {
    return asset.fileName;
  }

  if (targetType === "track" && track) {
    const trackBase = normalizeSlug(track.title) || normalizeTrackId(track.id) || "track";
    return `${releaseSlug}-${trackBase}.${resolvedFormat}`;
  }

  return `${releaseSlug}-${resolvedFormat}.zip`;
};

const inferMimeType = (
  resolvedFormat: ArtistAudioFormat,
  asset?: StorageAsset | null,
): string => {
  if (asset?.mimeType) {
    return asset.mimeType;
  }

  switch (asset?.format) {
    case "zip":
      return "application/zip";
    case "json":
      return "application/json";
    case "png":
      return "image/png";
    case "html_bundle":
      return "application/zip";
    default:
      return inferAudioMimeType(resolvedFormat);
  }
};

const resolveTrackAudioFileId = (
  product: ShopProduct,
  track: ArtistReleaseTrackItem,
  resolvedFormat: ArtistAudioFormat,
): string | undefined => {
  const formatEntry = getTrackFormats(product).find((entry) => entry.format === resolvedFormat);

  if (Array.isArray(product.releaseTracklist) && product.releaseTracklist.some((entry) => entry.id === track.id)) {
    return formatEntry?.format === resolvedFormat ? product.formats?.find((entry) => entry.format === resolvedFormat)?.audioFileId : undefined;
  }

  return formatEntry?.format === resolvedFormat ? product.formats?.find((entry) => entry.format === resolvedFormat)?.audioFileId : undefined;
};

const resolveAssetForRequest = async (input: {
  targetType: "release" | "track";
  releaseSlug: string;
  trackId?: string;
  resolvedFormat: ArtistAudioFormat;
  product: ShopProduct;
  track?: ArtistReleaseTrackItem;
  publicBaseUrl?: string;
}): Promise<{
  asset: StorageAsset | null;
  bag: StorageBag | null;
  deliveryUrl?: string;
  storagePointer?: string;
  fileName: string;
  mimeType: string;
}> => {
  const [assets, bags] = await Promise.all([listStorageAssets(), listStorageBags()]);
  const resourceKey =
    input.targetType === "track" && input.trackId
      ? buildTrackDeliveryResourceKey(input.releaseSlug, input.trackId, input.resolvedFormat)
      : buildReleaseDeliveryResourceKey(input.releaseSlug, input.resolvedFormat);
  const fallbackTrackAudioFileId =
    input.targetType === "track" && input.track
      ? resolveTrackAudioFileId(input.product, input.track, input.resolvedFormat)
      : undefined;

  const asset =
    assets.find((entry) => entry.resourceKey === resourceKey) ??
    (input.targetType === "track" && fallbackTrackAudioFileId
      ? assets.find(
          (entry) =>
            entry.audioFileId === fallbackTrackAudioFileId &&
            entry.releaseSlug === input.releaseSlug &&
            (entry.trackId === input.trackId || !entry.trackId),
        )
      : null) ??
    null;
  const bag = asset ? pickPreferredBag(bags, asset.id) : null;
  const deliveryUrl =
    resolveRelativeUrl(asset?.sourceUrl, input.publicBaseUrl) ??
    resolveRelativeUrl(bag?.tonstorageUri, input.publicBaseUrl) ??
    resolveRelativeUrl(bag?.metaFileUrl, input.publicBaseUrl);
  const storagePointer = bag?.tonstorageUri ?? bag?.bagId ?? asset?.resourceKey;

  return {
    asset,
    bag,
    deliveryUrl,
    storagePointer,
    fileName: inferFileName(
      input.targetType,
      input.releaseSlug,
      input.resolvedFormat,
      asset,
      input.track ?? null,
    ),
    mimeType: inferMimeType(input.resolvedFormat, asset),
  };
};

const deliverToTelegram = async (input: {
  chatId: number;
  fileName: string;
  mimeType: string;
  deliveryUrl?: string;
  caption: string;
}): Promise<boolean> => {
  if (!input.deliveryUrl) {
    return false;
  }

  try {
    const response = await fetch(input.deliveryUrl, {
      method: "GET",
      cache: "no-store",
    });

    if (!response.ok) {
      return false;
    }

    const arrayBuffer = await response.arrayBuffer();
    return sendTelegramDocument(input.chatId, new Uint8Array(arrayBuffer), {
      caption: input.caption,
      fileName: input.fileName,
      mimeType: input.mimeType,
    });
  } catch {
    return false;
  }
};

const resolveProductBySlug = async (releaseSlug: string): Promise<ShopProduct | null> => {
  const snapshot = await getCatalogSnapshot();
  return snapshot.products.find((entry) => entry.slug === releaseSlug) ?? null;
};

const buildDeliveryCaption = (input: {
  product: ShopProduct;
  track?: ArtistReleaseTrackItem;
  targetType: "release" | "track";
  resolvedFormat: ArtistAudioFormat;
}): string => {
  if (input.targetType === "track" && input.track) {
    return `Файл трека «${input.track.title}» из релиза «${input.product.title}» (${input.resolvedFormat.toUpperCase()}).`;
  }

  return `Файл релиза «${input.product.title}» (${input.resolvedFormat.toUpperCase()}).`;
};

const requestDelivery = async (input: {
  telegramUserId: number;
  releaseSlug: string;
  trackId?: string;
  targetType: "release" | "track";
  requestedFormat?: string;
  channel: StorageDeliveryChannel;
  publicBaseUrl?: string;
  existingRequestId?: string;
}): Promise<StorageDeliveryServiceResult> => {
  const config = getC3kStorageConfig();
  const telegramUserId = normalizeTelegramUserId(input.telegramUserId);
  const releaseSlug = normalizeSlug(input.releaseSlug);
  const trackId = normalizeTrackId(input.trackId);
  const requestedFormat = normalizeOptionalFormat(input.requestedFormat);

  if (!config.enabled) {
    return {
      ok: false,
      reason: "storage_disabled",
      message: "C3K Storage пока выключен в конфиге приложения.",
    };
  }

  if (!telegramUserId || !releaseSlug || (input.targetType === "track" && !trackId)) {
    return {
      ok: false,
      reason: input.targetType === "track" ? "track_not_found" : "release_not_found",
      message: "Некорректный запрос на выдачу файла.",
    };
  }

  const [product, snapshot] = await Promise.all([
    resolveProductBySlug(releaseSlug),
    getSocialUserSnapshot(telegramUserId),
  ]);

  if (!product) {
    return {
      ok: false,
      reason: "release_not_found",
      message: "Релиз не найден в текущем каталоге.",
    };
  }

  if (!snapshot) {
    return {
      ok: false,
      reason: "not_purchased",
      message: "Для выдачи файла нужен активный профиль пользователя.",
    };
  }

  const track =
    input.targetType === "track"
      ? (product.releaseTracklist ?? []).find((entry) => entry.id === trackId) ?? null
      : null;

  if (input.targetType === "track" && !track) {
    return {
      ok: false,
      reason: "track_not_found",
      message: "Трек не найден внутри релиза.",
    };
  }

  const access =
    input.targetType === "track" && track
      ? resolveTrackAccess(
          product,
          track,
          snapshot.purchasedReleaseSlugs,
          snapshot.purchasedReleaseFormatKeys,
          snapshot.purchasedTrackKeys,
          requestedFormat,
        )
      : resolveReleaseAccess(
          product,
          snapshot.purchasedReleaseSlugs,
          snapshot.purchasedReleaseFormatKeys,
          requestedFormat,
        );

  if (!access.allowed || !access.resolvedFormat) {
    return {
      ok: false,
      reason: access.reason === "format_not_owned" ? "format_not_owned" : "not_purchased",
      message:
        access.reason === "format_not_owned"
          ? "Этот формат не куплен и недоступен для выгрузки."
          : "Сначала купите релиз или нужный трек.",
    };
  }

  const draftRequest = input.existingRequestId
    ? await updateStorageDeliveryRequest(input.existingRequestId, {
        channel: input.channel,
        requestedFormat: requestedFormat ?? null,
        resolvedFormat: access.resolvedFormat,
        status: "processing",
        resolvedAssetId: null,
        resolvedBagId: null,
        resolvedSourceUrl: null,
        storagePointer: null,
        deliveryUrl: null,
        fileName: null,
        mimeType: null,
        telegramChatId: telegramUserId,
        failureCode: null,
        failureMessage: null,
        deliveredAt: null,
      })
    : await createStorageDeliveryRequest({
        telegramUserId,
        channel: input.channel,
        targetType: input.targetType,
        releaseSlug,
        trackId: input.targetType === "track" ? trackId : undefined,
        requestedFormat,
        resolvedFormat: access.resolvedFormat,
        status: "processing",
        telegramChatId: telegramUserId,
      });

  if (!draftRequest) {
    return {
      ok: false,
      reason: "storage_disabled",
      message: "Не удалось создать delivery request.",
    };
  }

  const resolved = await resolveAssetForRequest({
    targetType: input.targetType,
    releaseSlug,
    trackId,
    resolvedFormat: access.resolvedFormat,
    product,
    track: track ?? undefined,
    publicBaseUrl: input.publicBaseUrl,
  });

  if (!resolved.asset) {
    const pendingRequest = await updateStorageDeliveryRequest(draftRequest.id, {
      status: "pending_asset_mapping",
      resolvedFormat: access.resolvedFormat,
      failureCode: "asset_not_mapped",
      failureMessage: "Для этого контента ещё не настроен Storage asset.",
    });

    return {
      ok: true,
      request: pendingRequest ?? draftRequest,
      message: "Файл ещё не привязан к C3K Storage. Запрос сохранён.",
    };
  }

  const hydratedRequest = await updateStorageDeliveryRequest(draftRequest.id, {
    resolvedFormat: access.resolvedFormat,
    resolvedAssetId: resolved.asset.id,
    resolvedBagId: resolved.bag?.id,
    resolvedSourceUrl: resolved.asset.sourceUrl,
    storagePointer: resolved.storagePointer,
    deliveryUrl: resolved.deliveryUrl,
    fileName: resolved.fileName,
    mimeType: resolved.mimeType,
  });

  const activeRequest = hydratedRequest ?? draftRequest;

  if (input.channel === "telegram_bot") {
    if (!config.telegramBotDeliveryEnabled) {
      const failedRequest = await updateStorageDeliveryRequest(activeRequest.id, {
        status: "failed",
        failureCode: "telegram_delivery_disabled",
        failureMessage: "Telegram delivery выключен в конфиге.",
      });

      return {
        ok: false,
        reason: "telegram_delivery_disabled",
        message: "Telegram delivery сейчас выключен.",
        request: failedRequest ?? activeRequest,
      };
    }

    if (!resolved.deliveryUrl) {
      const pendingRequest = await updateStorageDeliveryRequest(activeRequest.id, {
        status: "pending_asset_mapping",
        failureCode: "delivery_source_unavailable",
        failureMessage: "Asset найден, но ещё недоступен для Telegram delivery.",
      });

      return {
        ok: true,
        request: pendingRequest ?? activeRequest,
        message: "Запрос сохранён, но Telegram delivery станет доступен после настройки storage gateway.",
      };
    }

    const delivered = await deliverToTelegram({
      chatId: telegramUserId,
      fileName: resolved.fileName,
      mimeType: resolved.mimeType,
      deliveryUrl: resolved.deliveryUrl,
      caption: buildDeliveryCaption({
        product,
        track: track ?? undefined,
        targetType: input.targetType,
        resolvedFormat: access.resolvedFormat,
      }),
    });

    if (!delivered) {
      const failedRequest = await updateStorageDeliveryRequest(activeRequest.id, {
        status: "failed",
        failureCode: "telegram_delivery_failed",
        failureMessage: "Не удалось отправить файл в Telegram.",
      });

      return {
        ok: false,
        reason: "telegram_delivery_failed",
        message: "Не удалось отправить файл в Telegram.",
        request: failedRequest ?? activeRequest,
      };
    }

    const deliveredRequest = await updateStorageDeliveryRequest(activeRequest.id, {
      status: "delivered",
      deliveredAt: new Date().toISOString(),
      failureCode: "",
      failureMessage: "",
    });

    return {
      ok: true,
      request: deliveredRequest ?? activeRequest,
      message: "Файл отправлен в личные сообщения Telegram.",
    };
  }

  const isReadyForChannel =
    input.channel === "desktop_download"
      ? Boolean(resolved.deliveryUrl || resolved.storagePointer)
      : Boolean(resolved.deliveryUrl);

  const readyRequest = await updateStorageDeliveryRequest(activeRequest.id, {
    status: isReadyForChannel ? "ready" : "pending_asset_mapping",
    failureCode: isReadyForChannel ? "" : "delivery_source_unavailable",
    failureMessage:
      isReadyForChannel
        ? ""
        : input.channel === "desktop_download"
          ? "Asset найден, но desktop storage pointer ещё не готов."
          : "Asset найден, но ещё нет прямой ссылки для web download.",
  });

  return {
    ok: true,
    request: readyRequest ?? activeRequest,
    message:
      input.channel === "desktop_download"
        ? "Файл подготовлен для desktop client."
        : "Файл подготовлен для скачивания.",
  };
};

export const requestReleaseStorageDelivery = async (input: {
  telegramUserId: number;
  releaseSlug: string;
  requestedFormat?: string;
  channel: StorageDeliveryChannel;
  publicBaseUrl?: string;
}): Promise<StorageDeliveryServiceResult> => {
  return requestDelivery({
    telegramUserId: input.telegramUserId,
    releaseSlug: input.releaseSlug,
    targetType: "release",
    requestedFormat: input.requestedFormat,
    channel: input.channel,
    publicBaseUrl: input.publicBaseUrl,
  });
};

export const requestTrackStorageDelivery = async (input: {
  telegramUserId: number;
  releaseSlug: string;
  trackId: string;
  requestedFormat?: string;
  channel: StorageDeliveryChannel;
  publicBaseUrl?: string;
}): Promise<StorageDeliveryServiceResult> => {
  return requestDelivery({
    telegramUserId: input.telegramUserId,
    releaseSlug: input.releaseSlug,
    trackId: input.trackId,
    targetType: "track",
    requestedFormat: input.requestedFormat,
    channel: input.channel,
    publicBaseUrl: input.publicBaseUrl,
  });
};

export const retryStorageDeliveryRequest = async (input: {
  telegramUserId: number;
  requestId: string;
  publicBaseUrl?: string;
}): Promise<StorageDeliveryServiceResult> => {
  const request = await getStorageDeliveryRequest(input.requestId);

  if (!request || request.telegramUserId !== normalizeTelegramUserId(input.telegramUserId)) {
    return {
      ok: false,
      reason: "not_purchased",
      message: "Delivery request не найден или недоступен.",
    };
  }

  return requestDelivery({
    telegramUserId: input.telegramUserId,
    releaseSlug: request.releaseSlug,
    trackId: request.trackId,
    targetType: request.targetType,
    requestedFormat: request.requestedFormat ?? request.resolvedFormat,
    channel: request.channel,
    publicBaseUrl: input.publicBaseUrl,
    existingRequestId: request.id,
  });
};
