"use client";

import { motion } from "motion/react";

import type { ShopProduct } from "@/types/shop";

import styles from "./shop-product-card.module.scss";

interface ShopProductCardProps {
  product: ShopProduct;
  onAdd: (productId: string) => void;
}

export function ShopProductCard({ product, onAdd }: ShopProductCardProps) {
  return (
    <motion.article
      layout
      className={styles.card}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className={styles.mediaWrap}>
        <img src={product.image} alt={product.title} className={styles.media} loading="lazy" />
        <div className={styles.badges}>
          {product.isNew ? <span className={styles.badgeNew}>NEW</span> : null}
          {product.isHit ? <span className={styles.badgeHit}>HIT</span> : null}
        </div>
      </div>

      <div className={styles.body}>
        <p className={styles.subtitle}>{product.subtitle}</p>
        <h3 className={styles.title}>{product.title}</h3>
        <p className={styles.description}>{product.description}</p>
        <p className={styles.socialProof}>
          ★ {product.rating.toFixed(1)} · {product.reviewsCount} отзывов
        </p>

        <dl className={styles.attrs}>
          <div>
            <dt>SKU</dt>
            <dd>{product.attributes.sku}</dd>
          </div>
          <div>
            <dt>Размер</dt>
            <dd>
              {product.attributes.heightCm}×{product.attributes.widthCm} см
            </dd>
          </div>
          <div>
            <dt>Вес</dt>
            <dd>{product.attributes.weightGr} г</dd>
          </div>
          <div>
            <dt>Остаток</dt>
            <dd>{product.attributes.stock} шт</dd>
          </div>
        </dl>

        <div className={styles.footer}>
          <div className={styles.prices}>
            <p className={styles.priceStars}>{product.priceStars} ⭐</p>
            {product.oldPriceStars ? <p className={styles.oldPrice}>{product.oldPriceStars} ⭐</p> : null}
          </div>

          <button type="button" className={styles.addButton} onClick={() => onAdd(product.id)}>
            В корзину
          </button>
        </div>
      </div>
    </motion.article>
  );
}
