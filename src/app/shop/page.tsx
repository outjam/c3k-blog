"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ShopCatalogControls } from "@/components/shop/shop-catalog-controls";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { readFavoriteProductIds, toggleFavoriteProductId } from "@/lib/product-favorites";
import { getCartSubtotalStarsCents } from "@/lib/shop-pricing";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticImpact, hapticNotification, hapticSelection } from "@/lib/telegram";
import type {
  CartItem,
  ProductSort,
  ShopAppSettings,
  ShopCatalogArtist,
  ShopProduct,
  ShopShowcaseCollectionView,
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

export default function ShopPage() {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("popular");
  const [quickFilter, setQuickFilter] = useState<"all" | "new" | "hit" | "sale">("all");
  const [favoriteProductIds, setFavoriteProductIds] = useState<string[]>([]);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<ShopProduct[]>([]);
  const [catalogArtists, setCatalogArtists] = useState<ShopCatalogArtist[]>([]);
  const [showcaseCollections, setShowcaseCollections] = useState<ShopShowcaseCollectionView[]>([]);
  const [catalogSettings, setCatalogSettings] = useState<ShopAppSettings>(defaultCatalogSettings);
  const [catalogError, setCatalogError] = useState("");
  const [catalogLoaded, setCatalogLoaded] = useState(false);

  const productsMap = useMemo(() => new Map(catalogProducts.map((item) => [item.id, item])), [catalogProducts]);

  const getMaxQuantity = useCallback(
    (productId: string): number => {
      const stock = productsMap.get(productId)?.attributes.stock ?? 0;
      return Math.max(0, Math.min(stock, 99));
    },
    [productsMap],
  );

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
    if (!catalogLoaded) {
      return;
    }

    let mounted = true;

    readShopCart().then((state) => {
      if (!mounted) {
        return;
      }

      const normalizedItems = state.items
        .map((item) => {
          const maxQuantity = getMaxQuantity(item.productId);

          if (maxQuantity < 1) {
            return null;
          }

          const quantity = Math.max(1, Math.min(Math.round(item.quantity), maxQuantity));
          return { productId: item.productId, quantity };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      setCartItems(normalizedItems);
      setIsCartHydrated(true);
    });

    return () => {
      mounted = false;
    };
  }, [catalogLoaded, getMaxQuantity]);

  useEffect(() => {
    let mounted = true;

    void fetchPublicCatalog().then((snapshot) => {
      if (!mounted) {
        return;
      }

      if (snapshot.error) {
        setCatalogError(snapshot.error);
        setCatalogLoaded(true);
        return;
      }

      setCatalogProducts(snapshot.products);
      setCatalogArtists(snapshot.artists);
      setShowcaseCollections(snapshot.showcaseCollections);

      if (snapshot.settings) {
        setCatalogSettings(snapshot.settings);
      }

      setCatalogLoaded(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isCartHydrated) {
      return;
    }

    void writeShopCart({ items: cartItems, promoCode: "" });
  }, [cartItems, isCartHydrated]);

  const productQuantityMap = useMemo(() => {
    return new Map(cartItems.map((item) => [item.productId, item.quantity]));
  }, [cartItems]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    const filtered = catalogProducts.filter((product) => {
      if (product.kind !== "digital_track") {
        return false;
      }

      if (!normalizedQuery) {
        if (quickFilter === "new") {
          return product.isNew;
        }

        if (quickFilter === "hit") {
          return product.isHit;
        }

        if (quickFilter === "sale") {
          return Boolean(product.oldPriceStarsCents);
        }

        return true;
      }

      const textBlob = `${product.title} ${product.subtitle} ${product.attributes.sku} ${product.attributes.collection} ${product.artistName ?? ""}`.toLowerCase();
      if (!textBlob.includes(normalizedQuery)) {
        return false;
      }

      if (quickFilter === "new") {
        return product.isNew;
      }

      if (quickFilter === "hit") {
        return product.isHit;
      }

      if (quickFilter === "sale") {
        return Boolean(product.oldPriceStarsCents);
      }

      return true;
    });

    return sortProducts(filtered, sort);
  }, [catalogProducts, quickFilter, search, sort]);

  const subtotalStarsCents = useMemo(() => getCartSubtotalStarsCents(catalogProducts, cartItems), [cartItems, catalogProducts]);
  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const activeFiltersCount = [
    Boolean(search.trim()),
    sort !== "popular",
    quickFilter !== "all",
  ].filter(Boolean).length;

  const addToCart = (productId: string) => {
    const maxQuantity = getMaxQuantity(productId);
    const currentQuantity = productQuantityMap.get(productId) ?? 0;

    if (maxQuantity < 1) {
      hapticNotification("warning");
      return;
    }

    if (currentQuantity >= maxQuantity) {
      hapticNotification("warning");
      return;
    }

    setCartItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);

      if (!existing) {
        return [...prev, { productId, quantity: 1 }];
      }

      return prev.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, maxQuantity) } : item,
      );
    });

    hapticImpact("light");
  };

  const increaseQty = (productId: string) => {
    const maxQuantity = getMaxQuantity(productId);
    const currentQuantity = productQuantityMap.get(productId) ?? 0;

    if (maxQuantity < 1 || currentQuantity >= maxQuantity) {
      hapticNotification("warning");
      return;
    }

    setCartItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, maxQuantity) } : item,
      ),
    );
    hapticSelection();
  };

  const decreaseQty = (productId: string) => {
    const currentQuantity = productQuantityMap.get(productId) ?? 0;

    if (currentQuantity <= 0) {
      return;
    }

    setCartItems((prev) =>
      prev
        .map((item) => (item.productId === productId ? { ...item, quantity: Math.max(item.quantity - 1, 0) } : item))
        .filter((item) => item.quantity > 0),
    );
    hapticSelection();
  };

  const resetFilters = () => {
    setSearch("");
    setSort("popular");
    setQuickFilter("all");
    hapticSelection();
  };

  const handleToggleFavorite = (productId: string) => {
    void toggleFavoriteProductId(productId).then((next) => {
      setFavoriteProductIds(next);
    });
  };

  const tracksCount = useMemo(
    () => catalogProducts.filter((product) => product.kind === "digital_track").length,
    [catalogProducts],
  );

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <p className={styles.kicker}>C3K Music Showcase</p>
          <h1>Витрина артистов и цифровых релизов</h1>
          <p>
            Пользователи могут стать артистами, публиковать треки после модерации и зарабатывать через продажи,
            донаты и подписки.
          </p>
          <div className={styles.heroMeta}>
            <p>Артисты: <strong>{catalogArtists.length}</strong></p>
            <p>Треки: <strong>{tracksCount}</strong></p>
            <p>Формат: <strong>Digital only</strong></p>
          </div>
          {catalogSettings.maintenanceMode ? <p className={styles.paymentError}>Режим обслуживания включен администратором.</p> : null}
          {catalogError ? <p className={styles.paymentError}>Ошибка синхронизации каталога: {catalogError}</p> : null}
        </section>

        {showcaseCollections.length > 0 ? (
          <section className={styles.showcaseSection}>
            <div className={styles.showcaseHeader}>
              <h2>Подборки витрины</h2>
              <p>Управляются из админки</p>
            </div>

            {showcaseCollections.map((collection) => (
              <article key={collection.id} className={styles.showcaseCollection}>
                <header>
                  <h3>{collection.title}</h3>
                  {collection.subtitle ? <p>{collection.subtitle}</p> : null}
                </header>
                <div className={styles.showcaseRail}>
                  {collection.products.slice(0, 12).map((product) => (
                    <Link key={`${collection.id}-${product.id}`} href={`/shop/${product.slug}`} className={styles.showcaseCard}>
                      <img src={product.image} alt={product.title} loading="lazy" />
                      <div>
                        <strong>{product.title}</strong>
                        <span>{formatStarsFromCents(product.priceStarsCents)} ⭐</span>
                      </div>
                    </Link>
                  ))}
                </div>
              </article>
            ))}
          </section>
        ) : null}

        {catalogArtists.length > 0 ? (
          <section className={styles.artistSection}>
            <div className={styles.showcaseHeader}>
              <h2>Артисты</h2>
              <p>Поддерживайте авторов донатами и подпиской</p>
            </div>
            <div className={styles.artistsRail}>
              {catalogArtists.map((artist) => (
                <Link key={artist.telegramUserId} href={`/shop/artist/${artist.slug}`} className={styles.artistCard}>
                  {artist.avatarUrl ? (
                    <img src={artist.avatarUrl} alt={artist.displayName} loading="lazy" />
                  ) : (
                    <div className={styles.artistAvatarFallback}>{artist.displayName.slice(0, 2).toUpperCase()}</div>
                  )}
                  <div>
                    <strong>{artist.displayName}</strong>
                    <span>{artist.tracksCount} треков</span>
                    <span>{artist.followersCount} подписчиков</span>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <ShopCatalogControls
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          quickFilter={quickFilter}
          onQuickFilterChange={setQuickFilter}
          activeFiltersCount={activeFiltersCount}
          onResetFilters={resetFilters}
        />

        <section className={styles.resultsBar}>
          <p>
            Найдено релизов: <strong>{filteredProducts.length}</strong>
          </p>
          <p>
            В корзине: <strong>{cartCount}</strong> · {formatStarsFromCents(subtotalStarsCents)} ⭐
          </p>
          <p>
            Избранное: <strong>{favoriteProductIds.length}</strong> · Артистов: <strong>{catalogArtists.length}</strong>
          </p>
        </section>

        <section className={styles.grid}>
          {filteredProducts.length > 0 ? (
            filteredProducts.map((product) => (
              <ShopProductCard
                key={product.id}
                product={product}
                quantity={productQuantityMap.get(product.id) ?? 0}
                canIncrease={(productQuantityMap.get(product.id) ?? 0) < getMaxQuantity(product.id)}
                onAdd={addToCart}
                onIncrease={increaseQty}
                onDecrease={decreaseQty}
                onToggleFavorite={handleToggleFavorite}
                isFavorite={favoriteProductIds.includes(product.id)}
              />
            ))
          ) : (
            <article className={styles.emptyState}>
              <h3>Ничего не найдено</h3>
              <p>Попробуйте сбросить фильтры или изменить поисковый запрос.</p>
              <button type="button" onClick={resetFilters}>
                Сбросить фильтры
              </button>
            </article>
          )}
        </section>
      </main>

      <Link href="/shop/cart" className={styles.cartFab} onClick={() => hapticSelection()}>
        Корзина {cartCount > 0 ? `(${cartCount})` : ""} · {formatStarsFromCents(subtotalStarsCents)} ⭐
      </Link>
    </div>
  );
}
