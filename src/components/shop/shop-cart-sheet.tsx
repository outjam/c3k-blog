"use client";

import { AnimatePresence, motion } from "motion/react";

import type { CartItem, ShopProduct } from "@/types/shop";

import styles from "./shop-cart-sheet.module.scss";

interface ShopCartSheetProps {
  open: boolean;
  items: CartItem[];
  productsMap: Map<string, ShopProduct>;
  onClose: () => void;
  onIncrease: (productId: string) => void;
  onDecrease: (productId: string) => void;
  onRemove: (productId: string) => void;
  children: React.ReactNode;
}

export function ShopCartSheet({
  open,
  items,
  productsMap,
  onClose,
  onIncrease,
  onDecrease,
  onRemove,
  children,
}: ShopCartSheetProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.aside
          className={styles.root}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24 }}
        >
          <button type="button" className={styles.backdrop} onClick={onClose} aria-label="Закрыть корзину" />

          <motion.section
            className={styles.panel}
            initial={{ y: 34, opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 24, opacity: 0.7 }}
            transition={{ type: "spring", stiffness: 290, damping: 34, mass: 0.86 }}
          >
            <header className={styles.header}>
              <h2>Корзина</h2>
              <button type="button" onClick={onClose}>
                Закрыть
              </button>
            </header>

            <div className={styles.items}>
              {items.length === 0 ? (
                <p className={styles.empty}>Корзина пока пустая.</p>
              ) : (
                items.map((item) => {
                  const product = productsMap.get(item.productId);

                  if (!product) {
                    return null;
                  }

                  return (
                    <article key={item.productId} className={styles.item}>
                      <img src={product.image} alt={product.title} loading="lazy" />
                      <div className={styles.itemBody}>
                        <h4>{product.title}</h4>
                        <p>{product.priceRub.toLocaleString("ru-RU")} ₽</p>
                        <div className={styles.qtyRow}>
                          <button type="button" onClick={() => onDecrease(product.id)}>
                            −
                          </button>
                          <span>{item.quantity}</span>
                          <button type="button" onClick={() => onIncrease(product.id)}>
                            +
                          </button>
                          <button type="button" onClick={() => onRemove(product.id)} className={styles.remove}>
                            Удалить
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {children}
          </motion.section>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
