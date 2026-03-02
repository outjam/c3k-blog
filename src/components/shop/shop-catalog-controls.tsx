"use client";

import { motion } from "motion/react";

import type { ProductSort, ShopCategory } from "@/types/shop";

import styles from "./shop-catalog-controls.module.scss";

interface ShopCatalogControlsProps {
  search: string;
  onSearchChange: (value: string) => void;
  category: ShopCategory | "all";
  onCategoryChange: (value: ShopCategory | "all") => void;
  sort: ProductSort;
  onSortChange: (value: ProductSort) => void;
  inStockOnly: boolean;
  onInStockChange: (value: boolean) => void;
  categoryOptions: Array<{ value: ShopCategory | "all"; label: string }>;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: "popular", label: "Популярные" },
  { value: "new", label: "Сначала новинки" },
  { value: "rating", label: "По рейтингу" },
  { value: "price_asc", label: "Цена: ниже" },
  { value: "price_desc", label: "Цена: выше" },
];

export function ShopCatalogControls({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  sort,
  onSortChange,
  inStockOnly,
  onInStockChange,
  categoryOptions,
}: ShopCatalogControlsProps) {
  return (
    <motion.section
      className={styles.controls}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <label className={styles.searchWrap}>
        <span className={styles.searchIcon} aria-hidden>
          ⌕
        </span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Поиск по названию, SKU, коллекции"
          className={styles.searchInput}
        />
      </label>

      <div className={styles.row}>
        <label className={styles.selectWrap}>
          <span>Категория</span>
          <select value={category} onChange={(event) => onCategoryChange(event.target.value as ShopCategory | "all")}> 
            {categoryOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.selectWrap}>
          <span>Сортировка</span>
          <select value={sort} onChange={(event) => onSortChange(event.target.value as ProductSort)}>
            {SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className={styles.stockOnly}>
        <input type="checkbox" checked={inStockOnly} onChange={(event) => onInStockChange(event.target.checked)} />
        <span>Только в наличии</span>
      </label>
    </motion.section>
  );
}
