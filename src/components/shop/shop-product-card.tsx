"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { MouseEventHandler } from "react";

import { hapticSelection } from "@/lib/telegram";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ShopProduct } from "@/types/shop";

import styles from "./shop-product-card.module.scss";

interface ShopProductCardProps {
  product: ShopProduct;
  onAdd: (productId: string) => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onToggleFavorite: (productId: string) => void;
  isFavorite: boolean;
  quantity: number;
  canIncrease: boolean;
}

export function ShopProductCard({
  product,
  onAdd,
  onIncrease,
  onDecrease,
  onToggleFavorite,
  isFavorite,
  quantity,
  canIncrease,
}: ShopProductCardProps) {
  const handleAdd: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onAdd(product.id);
  };

  const handleIncrease: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onIncrease(product.id);
  };

  const handleDecrease: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onDecrease(product.id);
  };

  const handleFavorite: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleFavorite(product.id);
    hapticSelection();
  };

  return (
    <motion.div layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>
      <Link href={`/shop/${product.slug}`} className={styles.card}>
        <div className={styles.mediaWrap}>
          <img src={product.image} alt={product.title} className={styles.media} loading="lazy" />
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

            {quantity > 0 ? (
              <div className={styles.stepper}>
                <button type="button" onClick={handleDecrease} aria-label="Уменьшить количество">
                  −
                </button>
                <span>{quantity}</span>
                <button type="button" onClick={handleIncrease} disabled={!canIncrease} aria-label="Увеличить количество">
                  +
                </button>
              </div>
            ) : (
              <button type="button" className={styles.addButton} onClick={handleAdd} disabled={product.attributes.stock < 1}>
                {product.attributes.stock < 1 ? "Недоступно" : "В корзину"}
              </button>
            )}
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
