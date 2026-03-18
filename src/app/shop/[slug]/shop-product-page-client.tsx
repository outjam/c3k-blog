"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type SVGProps } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { BackButtonController } from "@/components/back-button-controller";
import { useGlobalPlayer } from "@/components/player/global-player-provider";
import { StarsIcon } from "@/components/stars-icon";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  type MintedReleaseNft,
  profileSlugFromIdentity,
  purchaseReleaseWithWallet,
  purchaseTrackWithWallet,
  readMintedReleaseNfts,
  readPurchasedReleaseFormatKeys,
  readPurchasedReleaseSlugs,
  readPurchasedTrackKeys,
  readTonWalletAddress,
  readWalletBalanceCents,
  resolveViewerKey,
  toPurchasedReleaseFormatKey,
  toPurchasedTrackKey,
  writeTonWalletAddress,
} from "@/lib/social-hub";
import { buildReleasePlaybackQueue } from "@/lib/player-release-queue";
import {
  clearReleaseReactionApi,
  createReleaseCommentApi,
  deleteReleaseCommentApi,
  fetchReleaseSocialSnapshot,
  setReleaseReactionApi,
} from "@/lib/release-social-api";
import {
  readFavoriteProductIds,
  toggleFavoriteProductId,
} from "@/lib/product-favorites";
import {
  getDefaultTrackFormat,
  getFormatLabel,
  getProductPriceByFormat,
  getReleaseTrackPrice,
  getTrackFormats,
} from "@/lib/shop-release-format";
import { formatStarsFromCents } from "@/lib/stars-format";
import { openStorageDeliveryInDesktop } from "@/lib/desktop-runtime-api";
import { C3K_STORAGE_DESKTOP_CLIENT_ENABLED } from "@/lib/storage-config";
import {
  fetchMyStorageDeliveryRequests,
  requestReleaseDownload,
  retryStorageDeliveryRequestApi,
  requestTrackDownload,
} from "@/lib/storage-delivery-api";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { mintViaSponsoredTon } from "@/lib/ton-sponsored-api";
import {
  TON_NETWORK_LABEL,
  TON_ONCHAIN_NFT_MINT_ENABLED,
  isTonWalletOnRequiredNetwork,
  toPreferredTonAddress,
} from "@/lib/ton-network";
import {
  RELEASE_REACTION_OPTIONS,
  type ReleaseSocialSnapshot,
} from "@/types/release-social";
import type { StorageDeliveryChannel, StorageDeliveryRequest } from "@/types/storage";
import type { ArtistAudioFormat, ArtistReleaseTrackItem, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

const buildWrongTonNetworkMessage = (): string => {
  return `Подключен кошелек не из сети ${TON_NETWORK_LABEL}. Переключите сеть и повторите.`;
};

const formatTrackDuration = (durationSec?: number): string => {
  if (!durationSec || !Number.isFinite(durationSec) || durationSec <= 0) {
    return "Preview";
  }

  const minutes = Math.floor(durationSec / 60);
  const seconds = durationSec % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const formatDeliveryStatus = (value: StorageDeliveryRequest["status"]): string => {
  switch (value) {
    case "processing":
      return "Обрабатывается";
    case "pending_asset_mapping":
      return "Ждёт mapping";
    case "ready":
      return "Готово";
    case "delivered":
      return "Доставлено";
    case "failed":
      return "Ошибка";
    default:
      return "Запрошено";
  }
};

const formatDeliveryChannel = (value: StorageDeliveryRequest["channel"]): string => {
  switch (value) {
    case "telegram_bot":
      return "Telegram";
    case "desktop_download":
      return "Desktop";
    default:
      return "Web";
  }
};

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M7 5.25L14.5 10L7 14.75V5.25Z" fill="currentColor" />
    </svg>
  );
}

function HeartIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 16.2 3.8 10.2a4.04 4.04 0 0 1 0-5.76 4.14 4.14 0 0 1 5.84 0L10 4.8l.36-.36a4.14 4.14 0 0 1 5.84 0 4.04 4.04 0 0 1 0 5.76L10 16.2Z"
        fill="currentColor"
      />
    </svg>
  );
}

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.5 4.75h11a1.75 1.75 0 0 1 1.75 1.75v6.25a1.75 1.75 0 0 1-1.75 1.75H9l-3.75 2v-2H4.5a1.75 1.75 0 0 1-1.75-1.75V6.5A1.75 1.75 0 0 1 4.5 4.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DownloadIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M10 3.75a.75.75 0 0 1 .75.75v5.69l1.97-1.97a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0l-3.25-3.25a.75.75 0 0 1 1.06-1.06l1.97 1.97V4.5A.75.75 0 0 1 10 3.75ZM4.75 13.5a.75.75 0 0 1 .75.75v.5c0 .14.11.25.25.25h8.5a.25.25 0 0 0 .25-.25v-.5a.75.75 0 0 1 1.5 0v.5A1.75 1.75 0 0 1 14.25 16.5h-8.5A1.75 1.75 0 0 1 4 14.75v-.5a.75.75 0 0 1 .75-.75Z"
        fill="currentColor"
      />
    </svg>
  );
}

function TelegramIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="m16.8 4.28-2.17 10.25c-.16.73-.58.91-1.18.57l-3.27-2.41-1.58 1.52c-.17.17-.32.32-.65.32l.24-3.38 6.16-5.56c.27-.24-.06-.37-.41-.13L6.3 10.22 3 9.19c-.72-.23-.73-.72.15-1.06l12.9-4.98c.6-.22 1.13.15.75 1.13Z"
        fill="currentColor"
      />
    </svg>
  );
}

function DesktopIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M4.75 4A1.75 1.75 0 0 0 3 5.75v7.5C3 14.22 3.78 15 4.75 15h3.38l-.88 1.25a.75.75 0 1 0 1.22.86L9.7 15h.6l1.22 2.11a.75.75 0 1 0 1.3-.72L11.87 15h3.38A1.75 1.75 0 0 0 17 13.25v-7.5A1.75 1.75 0 0 0 15.25 4h-10.5ZM4.5 6a.5.5 0 0 1 .5-.5h10a.5.5 0 0 1 .5.5v7a.5.5 0 0 1-.5.5H5a.5.5 0 0 1-.5-.5V6Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ReleasePageSkeleton() {
  return (
    <div className={styles.skeletonStack} aria-hidden="true">
      <section className={styles.skeletonHero}>
        <span className={styles.skeletonCover} />
        <div className={styles.skeletonMeta}>
          <span className={styles.skeletonKicker} />
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonLine} />
          <span className={styles.skeletonLineWide} />
          <div className={styles.skeletonActions}>
            <span className={styles.skeletonPill} />
            <span className={styles.skeletonPill} />
            <span className={styles.skeletonPill} />
          </div>
        </div>
      </section>

      <section className={styles.skeletonSection}>
        <div className={styles.skeletonTabs} />
        {Array.from({ length: 5 }).map((_, index) => (
          <article key={index} className={styles.skeletonTrackRow}>
            <span className={styles.skeletonTrackIndex} />
            <div className={styles.skeletonTrackMeta}>
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLineShort} />
            </div>
            <span className={styles.skeletonPrice} />
            <span className={styles.skeletonButton} />
          </article>
        ))}
      </section>

      <section className={styles.skeletonSection}>
        <div className={styles.skeletonPanelGrid}>
          <article className={styles.skeletonPanel} />
          <article className={styles.skeletonPanel} />
        </div>
      </section>
    </div>
  );
}

export function ShopProductPageClient({ product }: { product: ShopProduct }) {
  const router = useRouter();
  const { playQueue } = useGlobalPlayer();
  const tonWallet = useTonWallet();
  const { user, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);

  const [bootLoading, setBootLoading] = useState(true);
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState<ArtistAudioFormat>(() =>
    getDefaultTrackFormat(product),
  );
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [ownedReleaseSlugs, setOwnedReleaseSlugs] = useState<string[]>([]);
  const [ownedReleaseFormatKeys, setOwnedReleaseFormatKeys] = useState<string[]>(
    [],
  );
  const [ownedTrackKeys, setOwnedTrackKeys] = useState<string[]>([]);
  const [mintedReleaseNfts, setMintedReleaseNfts] = useState<MintedReleaseNft[]>(
    [],
  );
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [minting, setMinting] = useState(false);
  const [releasePurchasing, setReleasePurchasing] = useState(false);
  const [pendingTrackId, setPendingTrackId] = useState("");
  const [socialSnapshot, setSocialSnapshot] =
    useState<ReleaseSocialSnapshot | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");
  const [reactionSubmitting, setReactionSubmitting] = useState(false);
  const [mintDialogOpen, setMintDialogOpen] = useState(false);
  const [deliveryPendingKey, setDeliveryPendingKey] = useState("");
  const [deliveryHistory, setDeliveryHistory] = useState<StorageDeliveryRequest[]>([]);
  const [retryingDeliveryId, setRetryingDeliveryId] = useState("");

  const formats = useMemo(() => getTrackFormats(product), [product]);
  const releaseTracklist = useMemo<ArtistReleaseTrackItem[]>(
    () =>
      Array.isArray(product.releaseTracklist) && product.releaseTracklist.length > 0
        ? product.releaseTracklist
        : [
            {
              id: "track-1",
              title: product.title,
              previewUrl: product.previewUrl,
              position: 1,
            },
          ],
    [product.previewUrl, product.releaseTracklist, product.title],
  );
  const releaseQueue = useMemo(() => buildReleasePlaybackQueue(product), [product]);
  const releaseComments = socialSnapshot?.comments ?? [];
  const releaseReactions = socialSnapshot?.reactions;

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      readFavoriteProductIds(),
      readWalletBalanceCents(viewerKey),
      readPurchasedReleaseSlugs(viewerKey),
      readPurchasedReleaseFormatKeys(viewerKey),
      readPurchasedTrackKeys(viewerKey),
      readMintedReleaseNfts(viewerKey),
      readTonWalletAddress(viewerKey),
      fetchReleaseSocialSnapshot(product.slug),
      user?.id ? fetchMyStorageDeliveryRequests(30) : Promise.resolve({ requests: [] }),
    ]).then(
      ([
        favoriteIds,
        balance,
        purchasedReleaseSlugs,
        purchasedReleaseFormatKeys,
        purchasedTrackKeys,
        mintedReleaseNfts,
        persistedTonWalletAddress,
        releaseSocial,
        deliveryHistory,
      ]) => {
        if (!mounted) {
          return;
        }

        setIsFavorite(favoriteIds.includes(product.id));
        setWalletBalanceCents(balance);
        setOwnedReleaseSlugs(purchasedReleaseSlugs);
        setOwnedReleaseFormatKeys(purchasedReleaseFormatKeys);
        setOwnedTrackKeys(purchasedTrackKeys);
        setMintedReleaseNfts(mintedReleaseNfts);
        setTonWalletAddress(persistedTonWalletAddress);

        if (releaseSocial.snapshot) {
          setSocialSnapshot(releaseSocial.snapshot);
        }

        setDeliveryHistory(deliveryHistory.requests);

        setBootLoading(false);
      },
    );

    return () => {
      mounted = false;
    };
  }, [product.id, product.slug, user?.id, viewerKey]);

  useEffect(() => {
    const connectedAddress = toPreferredTonAddress(
      String(tonWallet?.account?.address ?? "").trim(),
      tonWallet?.account?.chain,
    );

    if (!connectedAddress || connectedAddress === tonWalletAddress) {
      return;
    }

    void writeTonWalletAddress(viewerKey, connectedAddress);
  }, [
    tonWallet?.account?.address,
    tonWallet?.account?.chain,
    tonWalletAddress,
    viewerKey,
  ]);

  const handleBack = useCallback(() => {
    hapticImpact("light");
    router.back();
  }, [router]);

  const toggleFavorite = useCallback(() => {
    void toggleFavoriteProductId(product.id).then((ids) => {
      const favorite = ids.includes(product.id);
      setIsFavorite(favorite);
      hapticNotification(favorite ? "success" : "warning");
    });
  }, [product.id]);

  const selectedPriceStarsCents = useMemo(
    () => getProductPriceByFormat(product, selectedFormat),
    [product, selectedFormat],
  );
  const fallbackOwnedFormatKey = useMemo(() => {
    if (!ownedReleaseSlugs.includes(product.slug)) {
      return "";
    }

    const hasExactReleaseFormat = ownedReleaseFormatKeys.some((entry) =>
      entry.startsWith(`${product.slug}::`),
    );

    return hasExactReleaseFormat
      ? ""
      : toPurchasedReleaseFormatKey(product.slug, getDefaultTrackFormat(product));
  }, [ownedReleaseFormatKeys, ownedReleaseSlugs, product]);
  const releaseFormatKeys = useMemo(() => {
    return Array.from(
      new Set(
        [fallbackOwnedFormatKey, ...ownedReleaseFormatKeys].filter(Boolean),
      ),
    );
  }, [fallbackOwnedFormatKey, ownedReleaseFormatKeys]);
  const selectedReleaseFormatKey = useMemo(
    () => toPurchasedReleaseFormatKey(product.slug, selectedFormat),
    [product.slug, selectedFormat],
  );
  const ownsReleaseInSelectedFormat = releaseFormatKeys.includes(
    selectedReleaseFormatKey,
  );
  const ownsAnyReleaseFormat = releaseFormatKeys.some((entry) =>
    entry.startsWith(`${product.slug}::`),
  );
  const ownsWholeRelease =
    ownsAnyReleaseFormat || ownedReleaseSlugs.includes(product.slug);
  const ownedFormatLabels = useMemo(
    () =>
      formats
        .filter((entry) =>
          releaseFormatKeys.includes(
            toPurchasedReleaseFormatKey(product.slug, entry.format),
          ),
        )
        .map((entry) => getFormatLabel(entry.format)),
    [formats, product.slug, releaseFormatKeys],
  );
  const mintedNft = useMemo(
    () =>
      mintedReleaseNfts.find((entry) => entry.releaseSlug === product.slug) ?? null,
    [mintedReleaseNfts, product.slug],
  );
  const isMintedInTon = Boolean(mintedNft);
  const releaseMintable = product.isMintable !== false;
  const resolvedTonWalletAddress = useMemo(
    () =>
      toPreferredTonAddress(
        String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
        tonWallet?.account?.chain,
      ),
    [tonWallet?.account?.address, tonWallet?.account?.chain, tonWalletAddress],
  );
  const primaryGenre = product.subcategoryLabel ?? product.attributes.collection;
  const releaseLabel =
    product.releaseType === "album"
      ? "Album"
      : product.releaseType === "ep"
        ? "EP"
        : "Single";
  const releaseReactionsTotal = useMemo(() => {
    if (!releaseReactions) {
      return 0;
    }

    return Object.values(releaseReactions).reduce(
      (acc, value) => acc + (Number.isFinite(value) ? value : 0),
      0,
    );
  }, [releaseReactions]);

  const releaseStats = useMemo(
    () => [
      {
        label: "Тип",
        value: releaseLabel,
      },
      {
        label: "Жанр",
        value: primaryGenre,
      },
      {
        label: "Треков",
        value: String(releaseTracklist.length),
      },
      {
        label: "Форматы",
        value: formats.map((entry) => getFormatLabel(entry.format)).join(" · "),
      },
    ],
    [formats, primaryGenre, releaseLabel, releaseTracklist.length],
  );
  const releaseDeliveryRequests = useMemo(
    () => deliveryHistory.filter((entry) => entry.releaseSlug === product.slug).slice(0, 6),
    [deliveryHistory, product.slug],
  );
  const desktopDownloadsEnabled = C3K_STORAGE_DESKTOP_CLIENT_ENABLED;

  const isTrackOwned = useCallback(
    (trackId: string) => {
      if (ownsWholeRelease) {
        return true;
      }

      return ownedTrackKeys.includes(toPurchasedTrackKey(product.slug, trackId));
    },
    [ownedTrackKeys, ownsWholeRelease, product.slug],
  );

  const handlePlayTrack = (index: number) => {
    if (releaseQueue.length === 0) {
      setWalletMessage("Для этого релиза пока нет доступных preview-ссылок.");
      return;
    }

    const startIndex = Math.max(0, Math.min(index, releaseQueue.length - 1));
    playQueue(releaseQueue, startIndex);
  };

  const handlePlayAll = () => {
    if (releaseQueue.length === 0) {
      setWalletMessage("Для этого релиза пока нет доступных preview-ссылок.");
      return;
    }

    playQueue(releaseQueue, 0);
  };

  const triggerBrowserDownload = useCallback((url: string, fileName?: string) => {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.target = "_blank";
    anchor.rel = "noreferrer";
    if (fileName) {
      anchor.download = fileName;
    }
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
  }, []);

  const upsertDeliveryRequest = useCallback((request: StorageDeliveryRequest) => {
    setDeliveryHistory((current) => {
      const next = current.filter((entry) => entry.id !== request.id);
      return [request, ...next].slice(0, 30);
    });
  }, []);

  const requestReleaseFile = useCallback(
    async (channel: StorageDeliveryChannel) => {
      if (!user?.id) {
        setWalletMessage("Для выдачи файла войдите через Telegram Widget.");
        return;
      }

      if (!ownsWholeRelease) {
        setWalletMessage("Сначала купите релиз целиком.");
        return;
      }

      const pendingKey = `release:${channel}`;
      setDeliveryPendingKey(pendingKey);
      const result = await requestReleaseDownload({
        releaseSlug: product.slug,
        requestedFormat: selectedFormat,
        channel,
      });
      setDeliveryPendingKey("");

      if (!result.ok || !result.request) {
        setWalletMessage(result.error ?? result.message ?? "Не удалось подготовить файл релиза.");
        hapticNotification("warning");
        return;
      }

      upsertDeliveryRequest(result.request);

      if (channel === "web_download" && result.request.deliveryUrl) {
        triggerBrowserDownload(result.request.deliveryUrl, result.request.fileName);
      }
      if (
        channel === "desktop_download" &&
        (result.request.storagePointer || result.request.deliveryUrl)
      ) {
        openStorageDeliveryInDesktop(result.request);
      }

      setWalletMessage(
        result.message ??
          (channel === "telegram_bot"
            ? "Файл релиза отправлен в Telegram."
            : channel === "desktop_download"
              ? "Файл релиза передан в C3K Desktop."
            : "Файл релиза подготовлен к скачиванию."),
      );
      hapticNotification("success");
    },
    [
      ownsWholeRelease,
      product.slug,
      selectedFormat,
      triggerBrowserDownload,
      upsertDeliveryRequest,
      user?.id,
    ],
  );

  const requestTrackFile = useCallback(
    async (track: ArtistReleaseTrackItem, channel: StorageDeliveryChannel) => {
      if (!user?.id) {
        setWalletMessage("Для выдачи файла войдите через Telegram Widget.");
        return;
      }

      if (!isTrackOwned(track.id)) {
        setWalletMessage("Сначала купите этот трек или весь релиз.");
        return;
      }

      const trackFormat = ownsWholeRelease ? selectedFormat : getDefaultTrackFormat(product);
      const pendingKey = `track:${track.id}:${channel}`;
      setDeliveryPendingKey(pendingKey);
      const result = await requestTrackDownload({
        releaseSlug: product.slug,
        trackId: track.id,
        requestedFormat: trackFormat,
        channel,
      });
      setDeliveryPendingKey("");

      if (!result.ok || !result.request) {
        setWalletMessage(result.error ?? result.message ?? `Не удалось подготовить файл трека «${track.title}».`);
        hapticNotification("warning");
        return;
      }

      upsertDeliveryRequest(result.request);

      if (channel === "web_download" && result.request.deliveryUrl) {
        triggerBrowserDownload(result.request.deliveryUrl, result.request.fileName);
      }
      if (
        channel === "desktop_download" &&
        (result.request.storagePointer || result.request.deliveryUrl)
      ) {
        openStorageDeliveryInDesktop(result.request);
      }

      setWalletMessage(
        result.message ??
          (channel === "telegram_bot"
            ? `Трек «${track.title}» отправлен в Telegram.`
            : channel === "desktop_download"
              ? `Трек «${track.title}» передан в C3K Desktop.`
            : `Трек «${track.title}» подготовлен к скачиванию.`),
      );
      hapticNotification("success");
    },
    [
      isTrackOwned,
      ownsWholeRelease,
      product,
      selectedFormat,
      triggerBrowserDownload,
      upsertDeliveryRequest,
      user?.id,
    ],
  );

  const retryDeliveryRequest = useCallback(
    async (request: StorageDeliveryRequest) => {
      setRetryingDeliveryId(request.id);
      const result = await retryStorageDeliveryRequestApi(request.id);
      setRetryingDeliveryId("");

      if (!result.ok || !result.request) {
        setWalletMessage(result.error ?? result.message ?? "Не удалось повторить выдачу файла.");
        hapticNotification("warning");
        return;
      }

      upsertDeliveryRequest(result.request);

      if (
        result.request.channel === "web_download" &&
        result.request.deliveryUrl &&
        result.request.status === "ready"
      ) {
        triggerBrowserDownload(result.request.deliveryUrl, result.request.fileName);
      }
      if (
        result.request.channel === "desktop_download" &&
        result.request.status === "ready" &&
        (result.request.storagePointer || result.request.deliveryUrl)
      ) {
        openStorageDeliveryInDesktop(result.request);
      }

      setWalletMessage(result.message ?? "Запрос на выдачу обновлён.");
      hapticNotification("success");
    },
    [triggerBrowserDownload, upsertDeliveryRequest],
  );

  const resolveMintOwnerAddress = (): string | null => {
    if (!user?.id) {
      setWalletMessage("Для минта войдите через Telegram Widget.");
      return null;
    }

    if (!releaseMintable) {
      setWalletMessage("Для этого релиза NFT mint сейчас выключен.");
      return null;
    }

    if (!ownsWholeRelease) {
      setWalletMessage("NFT можно выпустить только после покупки всего релиза.");
      return null;
    }

    if (isMintedInTon) {
      setWalletMessage("Для этого релиза NFT уже сминчен в TON.");
      return null;
    }

    if (!TON_ONCHAIN_NFT_MINT_ENABLED) {
      setWalletMessage("On-chain mint выключен в конфиге приложения.");
      return null;
    }

    const connectedChain = String(tonWallet?.account?.chain ?? "").trim();
    if (!isTonWalletOnRequiredNetwork(connectedChain)) {
      setWalletMessage(buildWrongTonNetworkMessage());
      return null;
    }

    const connectedAddress = resolvedTonWalletAddress;
    if (!connectedAddress) {
      setWalletMessage("Подключите TON-кошелек через Ton Connect.");
      return null;
    }

    return connectedAddress;
  };

  const buyReleaseWithWallet = async () => {
    setWalletMessage("");

    if (!user?.id) {
      setWalletMessage("Для покупки войдите через Telegram Widget.");
      return;
    }

    if (ownsReleaseInSelectedFormat) {
      setWalletMessage(
        `Релиз уже куплен в формате ${getFormatLabel(selectedFormat)}.`,
      );
      return;
    }

    setReleasePurchasing(true);
    const payment = await purchaseReleaseWithWallet(viewerKey, {
      releaseSlug: product.slug,
      trackIds: releaseTracklist.map((track) => track.id),
      amountCents: selectedPriceStarsCents,
      format: selectedFormat,
    });
    setReleasePurchasing(false);

    setWalletBalanceCents(payment.balanceCents);
    setOwnedReleaseSlugs(payment.releaseSlugs);
    setOwnedReleaseFormatKeys(payment.releaseFormatKeys);
    setOwnedTrackKeys(payment.trackKeys);

    if (!payment.ok) {
      setWalletMessage(
        payment.reason === "already_owned"
          ? `Релиз уже куплен в формате ${getFormatLabel(selectedFormat)}.`
          : "Недостаточно средств на внутреннем балансе.",
      );
      hapticNotification("warning");
      return;
    }

    setWalletMessage(
      `Релиз добавлен в коллекцию в формате ${getFormatLabel(selectedFormat)}.`,
    );
    hapticNotification("success");
  };

  const buyTrack = async (track: ArtistReleaseTrackItem) => {
    setWalletMessage("");

    if (!user?.id) {
      setWalletMessage("Для покупки войдите через Telegram Widget.");
      return;
    }

    if (isTrackOwned(track.id)) {
      setWalletMessage("Этот трек уже есть в вашей коллекции.");
      return;
    }

    setPendingTrackId(track.id);
    const payment = await purchaseTrackWithWallet(viewerKey, {
      releaseSlug: product.slug,
      trackId: track.id,
      amountCents: getReleaseTrackPrice(product, track.id, selectedFormat),
    });
    setPendingTrackId("");

    setWalletBalanceCents(payment.balanceCents);
    setOwnedReleaseSlugs(payment.releaseSlugs);
    setOwnedReleaseFormatKeys(payment.releaseFormatKeys);
    setOwnedTrackKeys(payment.trackKeys);

    if (!payment.ok) {
      setWalletMessage(
        payment.reason === "already_owned"
          ? "Этот трек уже есть в вашей коллекции."
          : "Недостаточно средств на внутреннем балансе.",
      );
      hapticNotification("warning");
      return;
    }

    setWalletMessage(`Трек «${track.title}» добавлен в вашу коллекцию.`);
    hapticNotification("success");
  };

  const openMintDialog = () => {
    if (!resolveMintOwnerAddress()) {
      return;
    }

    setWalletMessage("");
    setMintDialogOpen(true);
  };

  const handleMintNft = async () => {
    if (minting) {
      return;
    }

    const connectedAddress = resolveMintOwnerAddress();
    if (!connectedAddress) {
      return;
    }

    setMintDialogOpen(false);
    setMinting(true);
    setWalletMessage("");

    const mintResult = await mintViaSponsoredTon({
      releaseSlug: product.slug,
      ownerAddress: connectedAddress,
      collectionAddress:
        String(process.env.NEXT_PUBLIC_TON_NFT_COLLECTION_ADDRESS ?? "").trim() ||
        undefined,
    });

    setMinting(false);

    if (!mintResult.ok) {
      setWalletBalanceCents(mintResult.walletCents);

      if (mintResult.reason === "insufficient_funds") {
        setWalletMessage(
          "Недостаточно средств на внутреннем балансе для оплаты газа on-chain mint.",
        );
        return;
      }

      if (mintResult.reason === "relay_unavailable") {
        setWalletMessage(
          mintResult.relayError || "On-chain mint сейчас не настроен на сервере.",
        );
        return;
      }

      if (mintResult.reason === "relay_failed") {
        setWalletMessage(
          `Ошибка TON relayer: ${mintResult.relayError ?? "не удалось отправить транзакцию"}`,
        );
        return;
      }

      if (mintResult.reason === "not_purchased") {
        setWalletMessage("Нельзя запросить on-chain mint без покупки релиза.");
        return;
      }

      setWalletMessage(
        mintResult.reason === "wallet_required"
          ? "Для on-chain mint нужен подключенный TON-кошелек."
          : "Не удалось выполнить on-chain mint.",
      );
      return;
    }

    setWalletBalanceCents(mintResult.walletCents);
    setMintedReleaseNfts(mintResult.mintedReleaseNfts);
    setTonWalletAddress(connectedAddress);
    setWalletMessage(
      mintResult.alreadyMinted
        ? "NFT для этого релиза уже был сминчен ранее."
        : `NFT сминчен в ${TON_NETWORK_LABEL}.`,
    );
    hapticNotification("success");
  };

  const submitComment = async () => {
    if (commentSubmitting) {
      return;
    }

    if (!user?.id) {
      setWalletMessage("Для комментариев нужен вход через Telegram Widget.");
      return;
    }

    setCommentSubmitting(true);
    const result = await createReleaseCommentApi(product.slug, commentDraft);
    setCommentSubmitting(false);

    if (!result.snapshot) {
      setWalletMessage(result.error ?? "Не удалось отправить комментарий.");
      return;
    }

    setCommentDraft("");
    setSocialSnapshot(result.snapshot);
    hapticNotification("success");
  };

  const removeComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    const result = await deleteReleaseCommentApi(product.slug, commentId);
    setDeletingCommentId("");

    if (!result.snapshot) {
      setWalletMessage(result.error ?? "Не удалось удалить комментарий.");
      return;
    }

    setSocialSnapshot(result.snapshot);
  };

  const handleSetReaction = async (
    reactionType: (typeof RELEASE_REACTION_OPTIONS)[number]["key"],
  ) => {
    if (reactionSubmitting) {
      return;
    }

    if (!user?.id) {
      setWalletMessage("Для реакций нужен вход через Telegram Widget.");
      return;
    }

    setReactionSubmitting(true);
    const currentReaction = socialSnapshot?.myReaction ?? null;
    const result =
      currentReaction === reactionType
        ? await clearReleaseReactionApi(product.slug)
        : await setReleaseReactionApi(product.slug, reactionType);
    setReactionSubmitting(false);

    if (!result.snapshot) {
      setWalletMessage(result.error ?? "Не удалось обновить реакцию.");
      return;
    }

    setSocialSnapshot(result.snapshot);
  };

  const commentComposerHint = user?.id
    ? "Короткий отзыв о релизе, звучании или любимом моменте."
    : "Чтобы оставить комментарий, войдите через Telegram.";

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <article className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroCoverWrap}>
            <Image
              src={product.image}
              alt={product.title}
              width={640}
              height={640}
              className={styles.cover}
              priority
            />
          </div>

          <div className={styles.heroBody}>
            <div className={styles.heroTopline}>
              <span className={styles.releaseTypePill}>
                {product.subtitle || releaseLabel}
              </span>
              <button
                type="button"
                className={styles.favoriteButton}
                onClick={toggleFavorite}
              >
                {isFavorite ? "Сохранено" : "Сохранить"}
              </button>
            </div>

            <div className={styles.heroHeading}>
              <h1>{product.title}</h1>
              {product.artistName ? (
                <p className={styles.artistLine}>
                  {product.artistSlug ? (
                    <Link href={`/profile/${product.artistSlug}`}>
                      {product.artistName}
                    </Link>
                  ) : (
                    product.artistName
                  )}
                </p>
              ) : null}
            </div>

            {product.description ? (
              <p className={styles.description}>{product.description}</p>
            ) : null}

            <div className={styles.heroStats}>
              {releaseStats.map((stat) => (
                <article key={stat.label}>
                  <span>{stat.label}</span>
                  <strong>{stat.value}</strong>
                </article>
              ))}
            </div>

            <div className={styles.heroActions}>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={handlePlayAll}
                disabled={releaseQueue.length === 0}
              >
                <PlayIcon className={styles.buttonIcon} />
                Слушать релиз
              </button>

              <button
                type="button"
                className={styles.secondaryButton}
                onClick={buyReleaseWithWallet}
                disabled={releasePurchasing || ownsReleaseInSelectedFormat}
              >
                {ownsReleaseInSelectedFormat
                  ? `Уже куплен в ${getFormatLabel(selectedFormat)}`
                  : releasePurchasing
                    ? "Покупаем..."
                    : ownsWholeRelease
                      ? `Купить ещё в ${getFormatLabel(selectedFormat)}`
                      : "Купить релиз"}
              </button>
            </div>

            <div className={styles.heroBadges}>
              {ownsWholeRelease ? (
                <span className={styles.statusBadge}>В коллекции</span>
              ) : null}
              {isMintedInTon ? (
                <span className={`${styles.statusBadge} ${styles.statusBadgeAccent}`}>
                  NFT
                </span>
              ) : null}
              {!releaseMintable ? (
                <span className={styles.statusBadge}>Mint off</span>
              ) : null}
            </div>

            {walletMessage ? <p className={styles.notice}>{walletMessage}</p> : null}
          </div>
        </section>

        {bootLoading ? (
          <ReleasePageSkeleton />
        ) : (
          <>
            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Покупка релиза</span>
                  <h2>Выберите формат и собирайте релиз целиком</h2>
                </div>
                <div className={styles.releasePurchaseCard}>
                  <span className={styles.releasePurchaseLabel}>Полный релиз</span>
                  <div className={styles.starsBadge}>
                    <StarsIcon className={styles.starsBadgeIcon} />
                    {formatStarsFromCents(selectedPriceStarsCents)}
                  </div>
                </div>
              </div>

              <div className={styles.formatRow} role="tablist" aria-label="Формат релиза">
                {formats.map((entry) => {
                  const isActive = selectedFormat === entry.format;
                  const isOwned = releaseFormatKeys.includes(
                    toPurchasedReleaseFormatKey(product.slug, entry.format),
                  );

                  return (
                    <button
                      key={entry.format}
                      type="button"
                      className={`${styles.formatButton} ${isActive ? styles.formatButtonActive : ""}`}
                      onClick={() => setSelectedFormat(entry.format)}
                    >
                      <span>{getFormatLabel(entry.format)}</span>
                      <div className={styles.starsBadge}>
                        <StarsIcon className={styles.starsBadgeIcon} />
                        {formatStarsFromCents(entry.priceStarsCents)}
                      </div>
                      {isOwned ? <small>Куплен</small> : null}
                    </button>
                  );
                })}
              </div>

              <div className={styles.releasePurchaseMeta}>
                <div>
                  <span>Коллекция</span>
                  <strong>
                    {ownsWholeRelease
                      ? ownedFormatLabels.length > 0
                        ? ownedFormatLabels.join(", ")
                        : "Куплен"
                      : "Ещё не куплен"}
                  </strong>
                </div>
                <div>
                  <span>Кошелек приложения</span>
                  <div className={styles.starsBadge}>
                    <StarsIcon className={styles.starsBadgeIcon} />
                    {formatStarsFromCents(walletBalanceCents)}
                  </div>
                </div>
              </div>
            </section>

            {releaseDeliveryRequests.length > 0 ? (
              <section className={styles.section}>
                <div className={styles.sectionHeader}>
                  <div>
                    <span className={styles.sectionEyebrow}>Выдача файлов</span>
                    <h2>Последние запросы по релизу</h2>
                  </div>
                  <p>{releaseDeliveryRequests.length}</p>
                </div>

                <div className={styles.deliveryRequestList}>
                  {releaseDeliveryRequests.map((request) => (
                    <article key={request.id} className={styles.deliveryRequestCard}>
                      <div className={styles.deliveryRequestTopline}>
                        <strong>
                          {request.targetType === "track"
                            ? request.trackId || "Трек"
                            : "Полный релиз"}
                        </strong>
                        <span>{formatDeliveryStatus(request.status)}</span>
                      </div>
                      <div className={styles.deliveryRequestMeta}>
                        <span>{formatDeliveryChannel(request.channel)}</span>
                        <span>{request.resolvedFormat || request.requestedFormat || "no format"}</span>
                        <span>{request.fileName || "file pending"}</span>
                      </div>
                      {request.failureMessage ? (
                        <p className={styles.deliveryRequestMessage}>{request.failureMessage}</p>
                      ) : null}
                      <div className={styles.deliveryRequestActions}>
                        {request.status === "ready" &&
                        (request.deliveryUrl || request.storagePointer) ? (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() =>
                              request.channel === "desktop_download"
                                ? openStorageDeliveryInDesktop(request)
                                : request.deliveryUrl
                                  ? triggerBrowserDownload(request.deliveryUrl, request.fileName)
                                  : undefined
                            }
                          >
                            {request.channel === "desktop_download" ? (
                              <DesktopIcon className={styles.buttonIcon} />
                            ) : (
                              <DownloadIcon className={styles.buttonIcon} />
                            )}
                            {request.channel === "desktop_download"
                              ? "Открыть в Desktop"
                              : "Открыть файл"}
                          </button>
                        ) : null}
                        {(request.status === "failed" ||
                          request.status === "pending_asset_mapping") ? (
                          <button
                            type="button"
                            className={styles.secondaryButton}
                            onClick={() => void retryDeliveryRequest(request)}
                            disabled={retryingDeliveryId === request.id}
                          >
                            {retryingDeliveryId === request.id ? "Повторяем..." : "Повторить"}
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ) : null}

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Tracklist</span>
                  <h2>Треки</h2>
                </div>
                <p>{releaseTracklist.length}</p>
              </div>

              <ol className={styles.trackList}>
                {releaseTracklist.map((track, index) => {
                  const trackOwned = isTrackOwned(track.id);
                  const trackPrice = getReleaseTrackPrice(
                    product,
                    track.id,
                    selectedFormat,
                  );

                  return (
                    <li key={track.id} className={styles.trackRow}>
                      <button
                        type="button"
                        className={styles.trackPlayButton}
                        onClick={() => handlePlayTrack(index)}
                        aria-label={`Слушать ${track.title}`}
                      >
                        <PlayIcon className={styles.trackPlayIcon} />
                      </button>

                      <div className={styles.trackMeta}>
                        <strong>{track.title}</strong>
                        <small>{formatTrackDuration(track.durationSec)}</small>
                      </div>

                      <div className={styles.trackPurchase}>
                        <div className={styles.starsBadge}>
                          <StarsIcon className={styles.starsBadgeIcon} />
                          {formatStarsFromCents(trackPrice)}
                        </div>
                        {trackOwned ? (
                          <div className={styles.trackFileActions}>
                            <button
                              type="button"
                              className={styles.inlineAction}
                              onClick={() => void requestTrackFile(track, "web_download")}
                              disabled={deliveryPendingKey === `track:${track.id}:web_download`}
                            >
                              <DownloadIcon className={styles.buttonIcon} />
                              {deliveryPendingKey === `track:${track.id}:web_download`
                                ? "..."
                                : "Файл"}
                            </button>
                            <button
                              type="button"
                              className={styles.inlineAction}
                              onClick={() => void requestTrackFile(track, "telegram_bot")}
                              disabled={deliveryPendingKey === `track:${track.id}:telegram_bot`}
                              aria-label={`Отправить ${track.title} в Telegram`}
                            >
                              <TelegramIcon className={styles.buttonIcon} />
                            </button>
                            {desktopDownloadsEnabled ? (
                              <button
                                type="button"
                                className={styles.inlineAction}
                                onClick={() => void requestTrackFile(track, "desktop_download")}
                                disabled={
                                  deliveryPendingKey === `track:${track.id}:desktop_download`
                                }
                                aria-label={`Открыть ${track.title} в C3K Desktop`}
                              >
                                <DesktopIcon className={styles.buttonIcon} />
                              </button>
                            ) : null}
                          </div>
                        ) : (
                          <button
                            type="button"
                            className={styles.trackBuyButton}
                            onClick={() => void buyTrack(track)}
                            disabled={pendingTrackId === track.id}
                          >
                            {pendingTrackId === track.id ? "..." : "Купить"}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section className={styles.panelGrid}>
              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className={styles.sectionEyebrow}>Коллекция</span>
                    <h3>Покупка релиза целиком</h3>
                  </div>
                  <span className={styles.panelState}>
                    {ownsWholeRelease ? "Активно" : "Доступно"}
                  </span>
                </div>

                <p className={styles.panelText}>
                  Полная покупка добавляет релиз в профиль, открывает все треки и
                  позволяет выпускать NFT для релиза целиком.
                </p>

                {ownsWholeRelease ? (
                  <div className={styles.releaseFileActions}>
                    <button
                      type="button"
                      className={styles.primaryButton}
                      onClick={() => void requestReleaseFile("web_download")}
                      disabled={deliveryPendingKey === "release:web_download"}
                    >
                      <DownloadIcon className={styles.buttonIcon} />
                      {deliveryPendingKey === "release:web_download"
                        ? "Готовим..."
                        : "Скачать релиз"}
                    </button>
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      onClick={() => void requestReleaseFile("telegram_bot")}
                      disabled={deliveryPendingKey === "release:telegram_bot"}
                    >
                      <TelegramIcon className={styles.buttonIcon} />
                      {deliveryPendingKey === "release:telegram_bot"
                        ? "Отправляем..."
                        : "В Telegram"}
                    </button>
                    {desktopDownloadsEnabled ? (
                      <button
                        type="button"
                        className={styles.secondaryButton}
                        onClick={() => void requestReleaseFile("desktop_download")}
                        disabled={deliveryPendingKey === "release:desktop_download"}
                      >
                        <DesktopIcon className={styles.buttonIcon} />
                        {deliveryPendingKey === "release:desktop_download"
                          ? "Открываем..."
                          : "В Desktop"}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className={styles.primaryButton}
                    onClick={buyReleaseWithWallet}
                    disabled={releasePurchasing || ownsReleaseInSelectedFormat}
                  >
                    {ownsReleaseInSelectedFormat
                      ? `Куплен в ${getFormatLabel(selectedFormat)}`
                      : releasePurchasing
                        ? "Покупаем..."
                        : `Купить релиз за ${formatStarsFromCents(selectedPriceStarsCents)}`}
                  </button>
                )}
              </article>

              <article className={styles.panel}>
                <div className={styles.panelHeader}>
                  <div>
                    <span className={styles.sectionEyebrow}>NFT upgrade</span>
                    <h3>Улучшить фиктовку</h3>
                  </div>
                  <span className={styles.panelState}>
                    {isMintedInTon
                      ? "Выпущен"
                      : releaseMintable
                        ? TON_NETWORK_LABEL
                        : "Недоступно"}
                  </span>
                </div>

                <p className={styles.panelText}>
                  NFT выпускается только для полного релиза. Отдельные покупки
                  треков не участвуют в mint flow.
                </p>

                {releaseMintable ? (
                  <div className={styles.panelActions}>
                    <TonConnectButton className={styles.tonConnectButton} />
                    <button
                      type="button"
                      className={styles.secondaryButton}
                      disabled={
                        !ownsWholeRelease ||
                        isMintedInTon ||
                        minting ||
                        !TON_ONCHAIN_NFT_MINT_ENABLED
                      }
                      onClick={openMintDialog}
                    >
                      {isMintedInTon
                        ? "NFT уже выпущен"
                        : minting
                          ? "Минтим..."
                          : "Улучшить фиктовку"}
                    </button>
                  </div>
                ) : (
                  <p className={styles.inlineHint}>
                    Для этого релиза mint пока выключен в настройках каталога.
                  </p>
                )}
              </article>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Реакции</span>
                  <h2>Оценка релиза</h2>
                </div>
                <div className={styles.socialCounters}>
                  <span>
                    <HeartIcon className={styles.counterIcon} />
                    {releaseReactionsTotal}
                  </span>
                  <span>
                    <CommentIcon className={styles.counterIcon} />
                    {releaseComments.length}
                  </span>
                </div>
              </div>

              <div className={styles.reactionRow}>
                {RELEASE_REACTION_OPTIONS.map((option) => {
                  const isActive = socialSnapshot?.myReaction === option.key;
                  const total = socialSnapshot?.reactions?.[option.key] ?? 0;

                  return (
                    <button
                      key={option.key}
                      type="button"
                      className={`${styles.reactionButton} ${isActive ? styles.reactionButtonActive : ""}`}
                      disabled={reactionSubmitting}
                      onClick={() => void handleSetReaction(option.key)}
                      aria-label={option.label}
                    >
                      <span>{option.emoji}</span>
                      <small>{total}</small>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHeader}>
                <div>
                  <span className={styles.sectionEyebrow}>Комментарии</span>
                  <h2>Обсуждение релиза</h2>
                </div>
                <p>{releaseComments.length}</p>
              </div>

              {user?.id ? (
                <div className={styles.commentComposer}>
                  <div className={styles.commentComposerMeta}>
                    <p>{commentComposerHint}</p>
                    <span>{commentDraft.length}/600</span>
                  </div>
                  <textarea
                    value={commentDraft}
                    onChange={(event) => setCommentDraft(event.target.value)}
                    maxLength={600}
                    placeholder="Напишите, что особенно зацепило в релизе"
                  />
                  <button
                    type="button"
                    className={styles.primaryButton}
                    disabled={commentSubmitting || commentDraft.trim().length === 0}
                    onClick={() => void submitComment()}
                  >
                    {commentSubmitting ? "Публикуем..." : "Отправить"}
                  </button>
                </div>
              ) : (
                <div className={styles.commentAuthState}>
                  <p>{commentComposerHint}</p>
                  <TelegramLoginWidget
                    onAuthorized={() => {
                      void refreshSession();
                    }}
                  />
                </div>
              )}

              <div className={styles.commentsList}>
                {releaseComments.length > 0 ? (
                  releaseComments.map((comment) => (
                    <article key={comment.id} className={styles.commentCard}>
                      <header className={styles.commentHeader}>
                        <div className={styles.commentAuthor}>
                          {comment.author.photoUrl ? (
                            <Image
                              src={comment.author.photoUrl}
                              alt=""
                              width={36}
                              height={36}
                              className={styles.commentAvatar}
                            />
                          ) : (
                            <div className={styles.commentAvatarFallback}>
                              {(
                                `${comment.author.firstName ?? ""}${comment.author.lastName ?? ""}`.trim() ||
                                comment.author.username ||
                                "U"
                              )
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                          )}

                          <div>
                            <Link
                              href={`/profile/${profileSlugFromIdentity({
                                username: comment.author.username,
                                telegramUserId: comment.author.telegramUserId,
                                fallback: `user-${comment.author.telegramUserId}`,
                              })}`}
                            >
                              {`${comment.author.firstName ?? ""} ${comment.author.lastName ?? ""}`.trim() ||
                                (comment.author.username
                                  ? `@${comment.author.username}`
                                  : `User ${comment.author.telegramUserId}`)}
                            </Link>
                            <time>
                              {new Date(comment.createdAt).toLocaleString("ru-RU")}
                            </time>
                          </div>
                        </div>

                        {comment.canDelete ? (
                          <button
                            type="button"
                            className={styles.inlineAction}
                            disabled={deletingCommentId === comment.id}
                            onClick={() => void removeComment(comment.id)}
                          >
                            {deletingCommentId === comment.id ? "..." : "Удалить"}
                          </button>
                        ) : null}
                      </header>
                      <p>{comment.text}</p>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>
                    {user?.id
                      ? "Пока нет комментариев. Начните обсуждение первым."
                      : "Пока нет комментариев. Авторизуйтесь и начните обсуждение."}
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </article>

      {mintDialogOpen ? (
        <div className={styles.modalBackdrop} onClick={() => setMintDialogOpen(false)}>
          <div className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Улучшить фиктовку</h2>
              <button
                type="button"
                className={styles.inlineAction}
                onClick={() => setMintDialogOpen(false)}
              >
                Закрыть
              </button>
            </div>

            <p className={styles.modalText}>
              Релиз будет выпущен как NFT в сети {TON_NETWORK_LABEL} и после
              подтверждения попадет на этот кошелек.
            </p>

            <div className={styles.modalWallet}>
              <span>Кошелек получателя</span>
              <code>{resolvedTonWalletAddress}</code>
            </div>

            <div className={styles.modalNotes}>
              <p>Mint запускается sponsored relay от имени приложения.</p>
              <p>
                В профиль релиз уже добавлен, а NFT зафиксирует on-chain ownership
                именно полного релиза.
              </p>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryButton}
                onClick={() => setMintDialogOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.primaryButton}
                onClick={() => void handleMintNft()}
                disabled={minting}
              >
                {minting ? "Минтим..." : `Выпустить NFT в ${TON_NETWORK_LABEL}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
