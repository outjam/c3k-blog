"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import type { ShopProduct } from "@/types/shop";
import { readFavoriteProductIds, toggleFavoriteProductId } from "@/lib/product-favorites";
import { getDefaultTrackFormat, getFormatLabel, getProductPriceByFormat, getTrackFormats } from "@/lib/shop-release-format";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticImpact, hapticNotification } from "@/lib/telegram";

import styles from "./page.module.scss";

export function ShopProductPageClient({ product }: { product: ShopProduct }) {
  const router = useRouter();
  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(() => getDefaultTrackFormat(product));

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
    const exists = cart.items.find(
      (item) => item.productId === product.id && (item.selectedFormat ?? "") === (selectedFormat ?? ""),
    );

    const nextItems = exists
      ? cart.items.map((item) =>
          item.productId === product.id && (item.selectedFormat ?? "") === (selectedFormat ?? "")
            ? { ...item, quantity: Math.min(item.quantity + 1, 99) }
            : item,
        )
      : [...cart.items, { productId: product.id, quantity: 1, selectedFormat }];

    await writeShopCart({ ...cart, items: nextItems });
    hapticNotification("success");
  }, [product.id, selectedFormat]);

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

  const formats = getTrackFormats(product);
  const selectedPriceStarsCents = getProductPriceByFormat(product, selectedFormat);
  const releaseLabel = product.releaseType === "album" ? "Album" : product.releaseType === "ep" ? "EP" : "Single";
  const releaseTracklist = product.releaseTracklist ?? [];

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
          <p className={styles.price}>{formatStarsFromCents(selectedPriceStarsCents)} ⭐</p>

          <dl className={styles.meta}>
            <div>
              <dt>Релиз</dt>
              <dd>{releaseLabel}</dd>
            </div>
            <div>
              <dt>Жанр</dt>
              <dd>{product.subcategoryLabel ?? product.attributes.collection}</dd>
            </div>
            <div>
              <dt>Треков</dt>
              <dd>{releaseTracklist.length || 1}</dd>
            </div>
            <div>
              <dt>Доступ</dt>
              <dd>Мгновенно после оплаты</dd>
            </div>
          </dl>

          <section className={styles.formatSection}>
            <p className={styles.sectionTitle}>Формат покупки</p>
            <div className={styles.formatGrid}>
              {formats.map((entry) => (
                <button
                  key={entry.format}
                  type="button"
                  className={`${styles.formatChip} ${selectedFormat === entry.format ? styles.formatChipActive : ""}`}
                  onClick={() => setSelectedFormat(entry.format)}
                >
                  <span>{getFormatLabel(entry.format)}</span>
                  <small>{formatStarsFromCents(entry.priceStarsCents)} ⭐</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.tracklistSection}>
            <p className={styles.sectionTitle}>Треклист релиза</p>
            <ol className={styles.tracklist}>
              {releaseTracklist.length > 0 ? (
                releaseTracklist.map((track) => (
                  <li key={track.id}>
                    <span>{track.title}</span>
                    <small>{track.durationSec ? `${Math.floor(track.durationSec / 60)}:${String(track.durationSec % 60).padStart(2, "0")}` : "—:—"}</small>
                  </li>
                ))
              ) : (
                <li>
                  <span>{product.title}</span>
                  <small>—:—</small>
                </li>
              )}
            </ol>
          </section>

          <button type="button" className={styles.addButton} onClick={() => void addToCart()}>
            Добавить в корзину
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
