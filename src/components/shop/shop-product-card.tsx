"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, type MouseEventHandler } from "react";

import { useGlobalPlayer } from "@/components/player/global-player-provider";
import { buildReleasePlaybackQueue } from "@/lib/player-release-queue";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticSelection } from "@/lib/telegram";
import type { ReleaseOwnershipViewModel } from "@/lib/release-ownership";
import { StarsIcon } from "@/components/stars-icon";
import type { ShopProduct } from "@/types/shop";

import styles from "./shop-product-card.module.scss";

interface ShopProductCardProps {
  product: ShopProduct;
  onToggleFavorite: (productId: string) => void;
  isFavorite: boolean;
  ownership?: ReleaseOwnershipViewModel | null;
}

const formatStorageCardHint = (product: ShopProduct): string | null => {
  const summary = product.storageSummary;

  if (!summary) {
    return null;
  }

  switch (summary.status) {
    case "verified":
      return "Archive уже подтверждён и готов к runtime-выдаче.";
    case "archived":
      return "Релиз уже в archive contour и готовится к более устойчивой раздаче.";
    case "prepared":
      return "Bag уже подготовлен, часть выдач ещё может идти через fallback.";
    case "syncing":
      return "Storage pipeline ещё собирает assets и runtime mapping.";
    case "attention":
      return "Runtime отметил релиз как требующий внимания.";
    default:
      return "Релиз пока ещё не попал в storage archive.";
  }
};

const formatStorageCardFact = (product: ShopProduct): string | null => {
  const summary = product.storageSummary;

  if (!summary) {
    return null;
  }

  if (summary.verifiedBagCount > 0) {
    return `${summary.verifiedBagCount} verified bag`;
  }

  if (summary.pointerReadyCount > 0) {
    return `${summary.pointerReadyCount} pointer ready`;
  }

  if (summary.preparedJobCount > 0) {
    return `${summary.preparedJobCount} prepared job`;
  }

  if (summary.pendingJobCount > 0) {
    return `${summary.pendingJobCount} в очереди`;
  }

  return `${summary.assetCount} assets`;
};

function HeartIcon({ filled }: { filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 20.4 4.84 13.6a4.8 4.8 0 0 1 6.8-6.8L12 7.16l.36-.36a4.8 4.8 0 1 1 6.8 6.8L12 20.4Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M8.8 6.8 18 12l-9.2 5.2V6.8Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M4 7h10M4 12h10M4 17h7m5-5 4 3-4 3v-6Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ShopProductCard({
  product,
  onToggleFavorite,
  isFavorite,
  ownership,
}: ShopProductCardProps) {
  const { playQueue, enqueueTracks } = useGlobalPlayer();
  const playbackQueue = useMemo(() => buildReleasePlaybackQueue(product), [product]);
  const canPreview = playbackQueue.length > 0;
  const trackCount =
    Array.isArray(product.releaseTracklist) && product.releaseTracklist.length > 0
      ? product.releaseTracklist.length
      : 1;
  const releaseTypeLabel =
    product.releaseType === "album"
      ? "Album"
      : product.releaseType === "ep"
        ? "EP"
        : "Single";
  const releaseContext = product.subcategoryLabel ?? product.attributes.collection ?? "Релиз";
  const ownershipSummary = ownership?.isFullReleaseOwned
    ? "Полный релиз"
    : ownership && ownership.ownedTrackCount > 0
      ? `${ownership.ownedTrackCount} из ${ownership.totalTrackCount} треков`
      : `${trackCount} треков`;
  const formatSummary =
    ownership && ownership.ownedFormatLabels.length > 0
      ? ownership.ownedFormatLabels.join(" · ")
      : ownership?.availableFormatLabels.slice(0, 2).join(" · ") || "Форматы";
  const ownershipDetail = ownership?.isFullReleaseOwned
    ? ownership.ownedFormatLabels.length > 0
      ? `Ваши форматы: ${ownership.ownedFormatLabels.join(" · ")}`
      : "Релиз уже в коллекции"
    : ownership && ownership.ownedTrackCount > 0
      ? "Можно докупить релиз целиком"
      : "Доступен полный релиз";
  const storageLabel = product.storageSummary?.label ?? null;
  const storageHint = formatStorageCardHint(product);
  const storageFact = formatStorageCardFact(product);

  const handleFavorite: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleFavorite(product.id);
    hapticSelection();
  };

  const handlePlayNow: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canPreview) {
      return;
    }

    playQueue(playbackQueue, 0);
    hapticSelection();
  };

  const handleEnqueue: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();

    if (!canPreview) {
      return;
    }

    enqueueTracks(playbackQueue);
    hapticSelection();
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={`/shop/${product.slug}`} className={styles.card}>
        <div className={styles.mediaWrap}>
          <Image
            src={product.image}
            alt={product.title}
            fill
            sizes="(max-width: 700px) 100vw, 188px"
            className={styles.media}
          />

          <div className={styles.badges}>
            <span className={styles.kindBadge}>{releaseTypeLabel}</span>
            {product.isNew ? <span className={styles.stateBadge}>NEW</span> : null}
            {product.isHit ? <span className={styles.stateBadge}>HIT</span> : null}
            {storageLabel ? <span className={styles.storageBadge}>{storageLabel}</span> : null}
          </div>

          <button
            type="button"
            className={`${styles.favoriteButton} ${isFavorite ? styles.favoriteButtonActive : ""}`}
            onClick={handleFavorite}
            aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
          >
            <HeartIcon filled={isFavorite} />
          </button>
        </div>

        <div className={styles.body}>
          <div className={styles.metaTop}>
            <span>{product.artistName || product.subtitle || "Релиз"}</span>
            <span>{releaseTypeLabel}</span>
          </div>

          <h3 className={styles.title}>{product.title}</h3>
          <div className={styles.supportingStack}>
            <p className={styles.supportingLine}>
              {releaseContext} · {trackCount} треков
            </p>
            {storageHint ? (
              <p className={styles.storageLine}>
                {storageHint}
                {storageFact ? ` ${storageFact}.` : null}
              </p>
            ) : null}
          </div>

          <div className={styles.metaRow}>
            <span className={styles.infoChip}>{ownershipSummary}</span>
            <span className={styles.infoChip}>{formatSummary}</span>
            {ownership?.isMinted ? (
              <span className={`${styles.infoChip} ${styles.infoChipAccent}`}>NFT</span>
            ) : null}
            {storageLabel ? (
              <span className={`${styles.infoChip} ${styles.infoChipStorage}`}>
                {storageLabel}
              </span>
            ) : null}
          </div>

          <div className={styles.metaRow}>
            <span>{ownershipDetail}</span>
            <div className={styles.priceBadge}>
              <StarsIcon className={styles.priceBadgeIcon} />
              {formatStarsFromCents(product.priceStarsCents)}
            </div>
          </div>

          <div className={styles.playerActions}>
            <button
              type="button"
              className={styles.playerButton}
              onClick={handlePlayNow}
              disabled={!canPreview}
            >
              <PlayIcon />
              Слушать
            </button>
            <button
              type="button"
              className={styles.playerButton}
              onClick={handleEnqueue}
              disabled={!canPreview}
            >
              <QueueIcon />
              В очередь
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
