"use client";

import { motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useMemo, type MouseEventHandler } from "react";

import { useGlobalPlayer } from "@/components/player/global-player-provider";
import { buildReleasePlaybackQueue } from "@/lib/player-release-queue";
import { hapticSelection } from "@/lib/telegram";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ShopProduct } from "@/types/shop";

import styles from "./shop-product-card.module.scss";

interface ShopProductCardProps {
  product: ShopProduct;
  onToggleFavorite: (productId: string) => void;
  isFavorite: boolean;
}

export function ShopProductCard({
  product,
  onToggleFavorite,
  isFavorite,
}: ShopProductCardProps) {
  const { playQueue, enqueueTracks } = useGlobalPlayer();
  const playbackQueue = useMemo(() => buildReleasePlaybackQueue(product), [product]);
  const canPreview = playbackQueue.length > 0;

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
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      <Link href={`/shop/${product.slug}`} className={styles.card}>
        <div className={styles.mediaWrap}>
          <Image src={product.image} alt={product.title} fill sizes="(max-width: 700px) 100vw, 188px" className={styles.media} />
          <div className={styles.badges}>
            {product.isNew ? <span className={styles.badgeNew}>NEW</span> : null}
            {product.isHit ? <span className={styles.badgeHit}>HIT</span> : null}
          </div>
          <button
            type="button"
            className={`${styles.favoriteButton} ${isFavorite ? styles.favoriteButtonActive : ""}`}
            onClick={handleFavorite}
            aria-label={isFavorite ? "Убрать из избранного" : "Добавить в избранное"}
          >
            {isFavorite ? "★" : "☆"}
          </button>
        </div>

        <div className={styles.body}>
          <p className={styles.subtitle}>{product.subtitle}</p>
          <p className={styles.categoryMeta}>
            {product.categoryLabel ?? "Музыка"}
            {product.subcategoryLabel ? ` · ${product.subcategoryLabel}` : " · Треки"}
          </p>
          <h3 className={styles.title}>{product.title}</h3>
          {product.artistName ? <p className={styles.artistMeta}>Артист: {product.artistName}</p> : null}
          <p className={styles.description}>{product.description}</p>
          <p className={styles.socialProof}>Продаж: {product.reviewsCount}</p>

          <dl className={styles.attrs}>
            <div>
              <dt>Релиз</dt>
              <dd>{product.releaseType === "album" ? "Album" : product.releaseType === "ep" ? "EP" : "Single"}</dd>
            </div>
            <div>
              <dt>Жанр</dt>
              <dd>{product.subcategoryLabel ?? product.attributes.collection}</dd>
            </div>
            <div>
              <dt>Форматы</dt>
              <dd>{product.formats?.length ? `${product.formats.length} варианта` : "1 вариант"}</dd>
            </div>
            <div>
              <dt>Доступ</dt>
              <dd>Мгновенно</dd>
            </div>
          </dl>

          <div className={styles.footer}>
            <div className={styles.prices}>
              <p className={styles.priceStars}>{formatStarsFromCents(product.priceStarsCents)} ⭐</p>
              {product.oldPriceStarsCents ? <p className={styles.oldPrice}>{formatStarsFromCents(product.oldPriceStarsCents)} ⭐</p> : null}
            </div>

            <span className={styles.balanceOnlyBadge}>Оплата только с баланса</span>
          </div>

          <div className={styles.playerActions}>
            <button type="button" className={styles.playerButton} onClick={handlePlayNow} disabled={!canPreview}>
              Слушать
            </button>
            <button type="button" className={styles.playerButton} onClick={handleEnqueue} disabled={!canPreview}>
              В очередь
            </button>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
