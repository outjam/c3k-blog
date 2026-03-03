"use client";

import { motion } from "motion/react";

import type { ProductSort, ShopProductCategory } from "@/types/shop";

import styles from "./shop-catalog-controls.module.scss";

interface ShopCatalogControlsProps {
  search: string;
  onSearchChange: (value: string) => void;
  selectedCategoryId: string | "all";
  onCategoryChange: (value: string | "all") => void;
  selectedSubcategoryId: string | "all";
  onSubcategoryChange: (value: string | "all") => void;
  sort: ProductSort;
  onSortChange: (value: ProductSort) => void;
  inStockOnly: boolean;
  onInStockChange: (value: boolean) => void;
  categories: ShopProductCategory[];
  categoryCountMap: Record<string, number>;
  visibleSubcategories: ShopProductCategory["subcategories"];
  subcategoryCountMap: Record<string, number>;
  quickFilter: "all" | "new" | "hit" | "sale";
  onQuickFilterChange: (value: "all" | "new" | "hit" | "sale") => void;
  activeFiltersCount: number;
  onResetFilters: () => void;
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
  selectedCategoryId,
  onCategoryChange,
  selectedSubcategoryId,
  onSubcategoryChange,
  sort,
  onSortChange,
  inStockOnly,
  onInStockChange,
  categories,
  categoryCountMap,
  visibleSubcategories,
  subcategoryCountMap,
  quickFilter,
  onQuickFilterChange,
  activeFiltersCount,
  onResetFilters,
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

      <div className={styles.categoriesRail}>
        <button
          type="button"
          className={`${styles.categoryCard} ${selectedCategoryId === "all" ? styles.categoryCardActive : ""}`}
          onClick={() => onCategoryChange("all")}
        >
          <span className={styles.categoryLabel}>Все товары</span>
          <span className={styles.categoryCount}>{Object.values(categoryCountMap).reduce((sum, value) => sum + value, 0)}</span>
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`${styles.categoryCard} ${selectedCategoryId === category.id ? styles.categoryCardActive : ""}`}
            onClick={() => onCategoryChange(category.id)}
          >
            <span className={styles.categoryEmoji}>{category.emoji ?? "🧱"}</span>
            <span className={styles.categoryLabel}>{category.label}</span>
            <span className={styles.categoryCount}>{categoryCountMap[category.id] ?? 0}</span>
          </button>
        ))}
      </div>

      {visibleSubcategories.length > 0 ? (
        <div className={styles.subcategories}>
          <button
            type="button"
            className={`${styles.subcategoryChip} ${selectedSubcategoryId === "all" ? styles.subcategoryChipActive : ""}`}
            onClick={() => onSubcategoryChange("all")}
          >
            Все подкатегории
          </button>
          {visibleSubcategories.map((subcategory) => (
            <button
              key={subcategory.id}
              type="button"
              className={`${styles.subcategoryChip} ${selectedSubcategoryId === subcategory.id ? styles.subcategoryChipActive : ""}`}
              onClick={() => onSubcategoryChange(subcategory.id)}
            >
              {subcategory.label}
              <span>{subcategoryCountMap[`${selectedCategoryId}:${subcategory.id}`] ?? 0}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.row}>
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

        <label className={styles.stockOnly}>
          <input type="checkbox" checked={inStockOnly} onChange={(event) => onInStockChange(event.target.checked)} />
          <span>Только в наличии</span>
        </label>
      </div>

      <div className={styles.quickFilters}>
        {[
          { value: "all" as const, label: "Все" },
          { value: "new" as const, label: "Новинки" },
          { value: "hit" as const, label: "Хиты" },
          { value: "sale" as const, label: "Скидки" },
        ].map((item) => (
          <button
            key={item.value}
            type="button"
            className={`${styles.filterChip} ${quickFilter === item.value ? styles.filterChipActive : ""}`}
            onClick={() => onQuickFilterChange(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {activeFiltersCount > 0 ? (
        <button type="button" className={styles.resetButton} onClick={onResetFilters}>
          Сбросить фильтры ({activeFiltersCount})
        </button>
      ) : null}
    </motion.section>
  );
}
