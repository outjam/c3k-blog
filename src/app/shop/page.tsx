"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { SegmentedTabs } from "@/components/segmented-tabs";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import {
  readFavoriteProductIds,
  toggleFavoriteProductId,
} from "@/lib/product-favorites";
import { hapticSelection } from "@/lib/telegram";
import type {
  ProductSort,
  ShopAppSettings,
  ShopCatalogArtist,
  ShopProduct,
} from "@/types/shop";

import styles from "./page.module.scss";

const defaultCatalogSettings: ShopAppSettings = {
  shopEnabled: true,
  checkoutEnabled: true,
  maintenanceMode: false,
  defaultDeliveryFeeStarsCents: 0,
  freeDeliveryThresholdStarsCents: 0,
  updatedAt: "",
};

const QUICK_FILTERS = [
  { id: "all", label: "Все" },
  { id: "new", label: "Новые" },
  { id: "hit", label: "Хиты" },
  { id: "sale", label: "Скидки" },
] as const;

const sortProducts = (items: ShopProduct[], sort: ProductSort) => {
  const list = [...items];

  switch (sort) {
    case "price_asc":
      return list.sort((a, b) => a.priceStarsCents - b.priceStarsCents);
    case "price_desc":
      return list.sort((a, b) => b.priceStarsCents - a.priceStarsCents);
    case "rating":
      return list.sort((a, b) => b.rating - a.rating);
    case "new":
      return list.sort((a, b) => Number(b.isNew) - Number(a.isNew));
    case "popular":
    default:
      return list.sort((a, b) => b.reviewsCount - a.reviewsCount);
  }
};

function ShopSkeleton() {
  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.skeletonHero}>
          <span className={styles.skeletonShort} />
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonText} />
          <span className={styles.skeletonTextWide} />
        </section>

        <section className={styles.skeletonControls}>
          <span className={styles.skeletonInput} />
          <span className={styles.skeletonTabs} />
        </section>

        <section className={styles.skeletonArtistRail}>
          {Array.from({ length: 4 }).map((_, index) => (
            <article key={index} className={styles.skeletonArtistCard}>
              <span className={styles.skeletonAvatar} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLineMuted} />
            </article>
          ))}
        </section>

        <section className={styles.skeletonList}>
          {Array.from({ length: 5 }).map((_, index) => (
            <article key={index} className={styles.skeletonReleaseCard}>
              <span className={styles.skeletonReleaseCover} />
              <div className={styles.skeletonReleaseBody}>
                <span className={styles.skeletonShort} />
                <span className={styles.skeletonTitle} />
                <span className={styles.skeletonTextWide} />
                <span className={styles.skeletonLineMuted} />
              </div>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}

export default function ShopPage() {
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();

  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("popular");
  const [quickFilter, setQuickFilter] = useState<
    "all" | "new" | "hit" | "sale"
  >("all");
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<ShopProduct[]>([]);
  const [catalogArtists, setCatalogArtists] = useState<ShopCatalogArtist[]>([]);
  const [catalogSettings, setCatalogSettings] = useState<ShopAppSettings>(
    defaultCatalogSettings,
  );
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoading, setCatalogLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    void readFavoriteProductIds().then((ids) => {
      if (mounted) {
        setFavoriteProductIds(ids);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setCatalogLoading(true);
      const snapshot = await fetchPublicCatalog();

      if (!mounted) {
        return;
      }

      if (snapshot.error) {
        setCatalogError(snapshot.error);
      } else {
        setCatalogError("");
      }

      setCatalogProducts(snapshot.products);
      setCatalogArtists(snapshot.artists);

      if (snapshot.settings) {
        setCatalogSettings(snapshot.settings);
      }

      setCatalogLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    const filtered = catalogProducts.filter((product) => {
      if (product.kind !== "digital_track") {
        return false;
      }

      const matchesQuickFilter =
        quickFilter === "all" ||
        (quickFilter === "new" && product.isNew) ||
        (quickFilter === "hit" && product.isHit) ||
        (quickFilter === "sale" && Boolean(product.oldPriceStarsCents));

      if (!matchesQuickFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      const textBlob =
        `${product.title} ${product.subtitle} ${product.attributes.sku} ${product.attributes.collection} ${product.artistName ?? ""}`.toLowerCase();

      return textBlob.includes(normalizedQuery);
    });

    return sortProducts(filtered, sort);
  }, [catalogProducts, quickFilter, search, sort]);

  const releaseCount = useMemo(
    () =>
      catalogProducts.filter((product) => product.kind === "digital_track")
        .length,
    [catalogProducts],
  );

  const filterTabs = useMemo(
    () =>
      QUICK_FILTERS.map((tab) => ({
        id: tab.id,
        label: tab.label,
        badge:
          tab.id === "all"
            ? releaseCount
            : tab.id === "new"
              ? catalogProducts.filter((product) => product.isNew).length
              : tab.id === "hit"
                ? catalogProducts.filter((product) => product.isHit).length
                : catalogProducts.filter((product) =>
                    Boolean(product.oldPriceStarsCents),
                  ).length,
      })),
    [catalogProducts, releaseCount],
  );

  const favoriteCount = favoriteProductIds.length;
  const featuredArtists = useMemo(() => catalogArtists.slice(0, 8), [catalogArtists]);

  const handleToggleFavorite = (productId: string) => {
    void toggleFavoriteProductId(productId).then((next) => {
      setFavoriteProductIds(next);
    });
  };

  const activeFilterIndex = Math.max(
    0,
    QUICK_FILTERS.findIndex((item) => item.id === quickFilter),
  );

  if (catalogLoading) {
    return <ShopSkeleton />;
  }

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.kicker}>Релизы</p>
            <h1>Каталог цифровых релизов</h1>
            <p>
              Покупка релизов, коллекция в профиле и NFT улучшения собраны в
              одном потоке.
            </p>
          </div>

          <div className={styles.heroStats}>
            <article>
              <span>Релизы</span>
              <strong>{releaseCount}</strong>
            </article>
            <article>
              <span>Артисты</span>
              <strong>{catalogArtists.length}</strong>
            </article>
            <article>
              <span>Избранное</span>
              <strong>{favoriteCount}</strong>
            </article>
          </div>
        </section>

        {catalogSettings.maintenanceMode ? (
          <p className={styles.notice}>
            Режим обслуживания включен администратором.
          </p>
        ) : null}

        {catalogError ? (
          <p className={`${styles.notice} ${styles.noticeError}`}>
            Ошибка синхронизации каталога: {catalogError}
          </p>
        ) : null}

        {!user && !isSessionLoading ? (
          <section className={styles.authPanel}>
            <div className={styles.sectionHeader}>
              <h2>Вход через Telegram</h2>
              <p>Нужен для покупок, коллекции и NFT улучшений.</p>
            </div>

            <TelegramLoginWidget
              onAuthorized={() => {
                void refreshSession();
              }}
            />
          </section>
        ) : null}

        {featuredArtists.length > 0 ? (
          <section className={styles.artistSection}>
            <div className={styles.sectionHeader}>
              <h2>Артисты</h2>
              <p>Открывайте авторов и переходите в их релизы.</p>
            </div>

            <div className={styles.artistRail}>
              {featuredArtists.map((artist) => (
                <Link
                  key={artist.telegramUserId}
                  href={`/shop/artist/${artist.slug}`}
                  className={styles.artistCard}
                >
                  {artist.avatarUrl ? (
                    <Image
                      src={artist.avatarUrl}
                      alt={artist.displayName}
                      width={44}
                      height={44}
                      className={styles.artistAvatar}
                    />
                  ) : (
                    <div className={styles.artistAvatarFallback}>
                      {artist.displayName.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                  <div>
                    <strong>{artist.displayName}</strong>
                    <span>{artist.tracksCount} релизов</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className={styles.controls}>
          <label className={styles.searchWrap}>
            <span>Поиск</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Название, артист или жанр"
            />
          </label>

          <div className={styles.controlsRow}>
            <div className={styles.tabsWrap}>
              <SegmentedTabs
                activeIndex={activeFilterIndex}
                items={filterTabs}
                onChange={(index) =>
                  setQuickFilter(QUICK_FILTERS[index]?.id ?? "all")
                }
                ariaLabel="Фильтр релизов"
              />
            </div>

            <label className={styles.sortWrap}>
              <span>Сортировка</span>
              <select
                value={sort}
                onChange={(event) =>
                  setSort(event.target.value as ProductSort)
                }
              >
                <option value="popular">Популярные</option>
                <option value="new">Сначала новинки</option>
                <option value="rating">По рейтингу</option>
                <option value="price_asc">Цена ниже</option>
                <option value="price_desc">Цена выше</option>
              </select>
            </label>
          </div>
        </section>

        <section className={styles.releaseSection}>
          <div className={styles.sectionHeader}>
            <h2>Релизы</h2>
            <p>{filteredProducts.length}</p>
          </div>

          <div className={styles.releaseList}>
            {filteredProducts.length > 0 ? (
              filteredProducts.map((product) => (
                <ShopProductCard
                  key={product.id}
                  product={product}
                  onToggleFavorite={handleToggleFavorite}
                  isFavorite={favoriteProductIds.includes(product.id)}
                />
              ))
            ) : (
              <article className={styles.emptyState}>
                <h3>Ничего не найдено</h3>
                <p>Попробуйте изменить фильтр или поисковый запрос.</p>
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setSort("popular");
                    setQuickFilter("all");
                    hapticSelection();
                  }}
                >
                  Сбросить фильтры
                </button>
              </article>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
