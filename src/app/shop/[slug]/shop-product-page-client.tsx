"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import type { ShopProduct } from "@/types/shop";
import { readFavoriteProductIds, toggleFavoriteProductId } from "@/lib/product-favorites";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticImpact, hapticNotification } from "@/lib/telegram";

import styles from "./page.module.scss";

export function ShopProductPageClient({ product }: { product: ShopProduct }) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(false);

  useEffect(() => {
    let mounted = true;

    void readFavoriteProductIds().then((ids) => {
      if (mounted) {
        setIsFavorite(ids.includes(product.id));
      }
    });

    return () => {
      mounted = false;
    };
  }, [product.id]);

  const addToCart = useCallback(async () => {
    const cart = await readShopCart();
    const exists = cart.items.find((item) => item.productId === product.id);

    const nextItems = exists
      ? cart.items.map((item) =>
          item.productId === product.id ? { ...item, quantity: Math.min(item.quantity + 1, 99) } : item,
        )
      : [...cart.items, { productId: product.id, quantity: 1 }];

    await writeShopCart({ ...cart, items: nextItems });
    hapticNotification("success");
  }, [product.id]);

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

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <article className={styles.card}>
        <Image src={product.image} alt={product.title} width={640} height={480} className={styles.cover} priority />
        <div className={styles.body}>
          <p className={styles.subtitle}>{product.subtitle}</p>
          <h1>{product.title}</h1>
          <p className={styles.description}>{product.description}</p>
          {product.artistName ? (
            <p className={styles.subtitle}>
              Артист:{" "}
              {product.artistSlug ? (
                <a href={`/shop/artist/${product.artistSlug}`}>{product.artistName}</a>
              ) : (
                product.artistName
              )}
            </p>
          ) : null}
          <p className={styles.price}>{formatStarsFromCents(product.priceStarsCents)} ⭐</p>

          {product.kind === "digital_track" ? (
            <dl className={styles.meta}>
              <div>
                <dt>Формат</dt>
                <dd>Digital track</dd>
              </div>
              <div>
                <dt>Артикул</dt>
                <dd>{product.attributes.sku}</dd>
              </div>
            </dl>
          ) : (
            <dl className={styles.meta}>
              <div>
                <dt>SKU</dt>
                <dd>{product.attributes.sku}</dd>
              </div>
              <div>
                <dt>Коллекция</dt>
                <dd>{product.attributes.collection}</dd>
              </div>
              <div>
                <dt>Техника</dt>
                <dd>{product.attributes.technique}</dd>
              </div>
              <div>
                <dt>Размер</dt>
                <dd>
                  {product.attributes.heightCm}×{product.attributes.widthCm} см
                </dd>
              </div>
            </dl>
          )}

          <button type="button" className={styles.addButton} onClick={() => void addToCart()}>
            {product.kind === "digital_track" ? "Купить трек" : "Добавить в корзину"}
          </button>
          <button type="button" className={styles.addButton} onClick={toggleFavorite}>
            {isFavorite ? "Убрать из избранного" : "В избранное"}
          </button>
          <button type="button" className={styles.addButton} onClick={() => router.push("/shop/cart")}>
            Перейти в корзину
          </button>
        </div>
      </article>
    </div>
  );
}
