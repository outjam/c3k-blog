"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { useRouter } from "next/navigation";

import { ShopCartSheet } from "@/components/shop/shop-cart-sheet";
import { ShopCatalogControls } from "@/components/shop/shop-catalog-controls";
import { ShopCheckoutForm } from "@/components/shop/shop-checkout-form";
import { ShopOrderSummary } from "@/components/shop/shop-order-summary";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { SHOP_CATEGORY_LABELS, SHOP_PRODUCTS } from "@/data/shop-products";
import { payWithTelegramStars } from "@/lib/shop-payment";
import { formatStarsFromCents, starsCentsToInvoiceStars } from "@/lib/stars-format";
import { findPromoRule, getCartSubtotalStarsCents, getDeliveryFeeStarsCents, getDiscountAmountStarsCents } from "@/lib/shop-pricing";
import { appendShopOrder } from "@/lib/shop-orders";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
import { getTelegramWebApp, hapticImpact, hapticNotification, hapticSelection } from "@/lib/telegram";
import type { CartItem, CheckoutFormValues, ProductSort, ShopCategory } from "@/types/shop";

import styles from "./page.module.scss";

const defaultCheckout: CheckoutFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  comment: "",
  delivery: "yandex_go",
};

const ORDER_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const generateOrderCode = (): string => {
  const bytes = new Uint8Array(6);

  if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
    window.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  const raw = Array.from(bytes, (byte) => ORDER_CODE_ALPHABET[byte % ORDER_CODE_ALPHABET.length]).join("");
  return `${raw.slice(0, 3)}-${raw.slice(3, 6)}`;
};

const sortProducts = (items: typeof SHOP_PRODUCTS, sort: ProductSort) => {
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
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<ShopCategory | "all">("all");
  const [sort, setSort] = useState<ProductSort>("popular");
  const [quickFilter, setQuickFilter] = useState<"all" | "new" | "hit" | "sale">("all");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutFormValues>(defaultCheckout);
  const [isPaying, setIsPaying] = useState(false);
  const [isRequestingPhone, setIsRequestingPhone] = useState(false);
  const [canRequestPhone, setCanRequestPhone] = useState(false);
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const productsMap = useMemo(() => new Map(SHOP_PRODUCTS.map((item) => [item.id, item])), []);

  const getMaxQuantity = useCallback(
    (productId: string): number => {
      const stock = productsMap.get(productId)?.attributes.stock ?? 0;
      return Math.max(0, Math.min(stock, 99));
    },
    [productsMap],
  );

  useEffect(() => {
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
      setPromoCode(state.promoCode);
      setIsCartHydrated(true);
    });

    return () => {
      mounted = false;
    };
  }, [getMaxQuantity]);

  useEffect(() => {
    const user = getTelegramWebApp()?.initDataUnsafe?.user;
    setCanRequestPhone(Boolean(getTelegramWebApp()?.requestContact));

    if (!user) {
      return;
    }

    setCheckout((prev) => ({
      ...prev,
      firstName: prev.firstName || user.first_name || "",
      lastName: prev.lastName || user.last_name || "",
      phone: prev.phone || user.phone_number || "",
      email: prev.email || (user.username ? `${user.username}@telegram.local` : ""),
      comment: prev.comment || (user.username ? `Telegram: @${user.username}` : ""),
    }));
  }, []);

  useEffect(() => {
    if (!isCartHydrated) {
      return;
    }

    void writeShopCart({ items: cartItems, promoCode });
  }, [cartItems, isCartHydrated, promoCode]);

  const productQuantityMap = useMemo(() => {
    return new Map(cartItems.map((item) => [item.productId, item.quantity]));
  }, [cartItems]);

  const filteredProducts = useMemo(() => {
    const normalizedQuery = search.trim().toLowerCase();

    const filtered = SHOP_PRODUCTS.filter((product) => {
      if (category !== "all" && product.category !== category) {
        return false;
      }

      if (inStockOnly && product.attributes.stock < 1) {
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

      const textBlob = `${product.title} ${product.subtitle} ${product.attributes.sku} ${product.attributes.collection}`.toLowerCase();
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
  }, [category, inStockOnly, quickFilter, search, sort]);

  const subtotalStarsCents = useMemo(() => getCartSubtotalStarsCents(SHOP_PRODUCTS, cartItems), [cartItems]);
  const discountStarsCents = useMemo(() => getDiscountAmountStarsCents(subtotalStarsCents, promoCode), [promoCode, subtotalStarsCents]);
  const deliveryFeeStarsCents = useMemo(
    () => getDeliveryFeeStarsCents(subtotalStarsCents - discountStarsCents),
    [discountStarsCents, subtotalStarsCents],
  );
  const totalStarsCents = Math.max(0, subtotalStarsCents - discountStarsCents + deliveryFeeStarsCents);
  const invoiceStars = starsCentsToInvoiceStars(totalStarsCents);
  const freeDeliveryThresholdStarsCents = 1200;
  const freeDeliveryLeftStarsCents = Math.max(freeDeliveryThresholdStarsCents - (subtotalStarsCents - discountStarsCents), 0);
  const freeDeliveryProgress = Math.min(((subtotalStarsCents - discountStarsCents) / freeDeliveryThresholdStarsCents) * 100, 100);

  const promoRule = findPromoRule(promoCode);
  const promoLabel = promoRule ? `${promoRule.label} активирована (${promoRule.code})` : "";

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const activeFiltersCount = [
    Boolean(search.trim()),
    category !== "all",
    sort !== "popular",
    inStockOnly,
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

  const removeFromCart = (productId: string) => {
    setCartItems((prev) => prev.filter((item) => item.productId !== productId));
    hapticImpact("soft");
  };

  const updateCheckout = (field: keyof CheckoutFormValues, value: string) => {
    setCheckout((prev) => ({ ...prev, [field]: value }));
  };

  const requestPhoneFromTelegram = useCallback(() => {
    const webApp = getTelegramWebApp();

    if (!webApp?.requestContact) {
      hapticNotification("warning");
      setPaymentError("Текущая версия Telegram не поддерживает запрос контакта.");
      return;
    }

    setPaymentError("");
    setIsRequestingPhone(true);

    const applyPhone = () => {
      const freshWebApp = getTelegramWebApp();
      const phone = freshWebApp?.initDataUnsafe?.user?.phone_number;

      if (!phone) {
        return false;
      }

      setCheckout((prev) => ({ ...prev, phone }));
      hapticNotification("success");
      return true;
    };

    const finish = (resolved: boolean) => {
      setIsRequestingPhone(false);

      if (!resolved) {
        hapticNotification("warning");
        setPaymentError("Telegram не передал номер автоматически. Введите номер вручную.");
      }
    };

    try {
      webApp.requestContact?.((result) => {
        const accepted = result === true || result === "sent" || result === "allowed";

        if (!accepted) {
          finish(false);
          return;
        }

        if (applyPhone()) {
          finish(true);
          return;
        }

        let attempts = 0;
        const timer = window.setInterval(() => {
          attempts += 1;

          if (applyPhone()) {
            window.clearInterval(timer);
            finish(true);
            return;
          }

          if (attempts >= 8) {
            window.clearInterval(timer);
            finish(false);
          }
        }, 350);
      });
    } catch {
      finish(false);
    }
  }, []);

  const applyPromo = () => {
    const normalized = promoCode.trim().toUpperCase();
    setPromoCode(normalized);

    if (findPromoRule(normalized)) {
      hapticNotification("success");
      return;
    }

    hapticNotification("warning");
  };

  const resetFilters = () => {
    setSearch("");
    setCategory("all");
    setSort("popular");
    setInStockOnly(false);
    setQuickFilter("all");
    hapticSelection();
  };

  const canPay = Boolean(cartItems.length > 0 && checkout.firstName && checkout.lastName && checkout.phone && checkout.address);

  const submitPayment = async () => {
    if (!canPay || isPaying) {
      return;
    }

    setPaymentError("");
    setIsPaying(true);
    hapticImpact("medium");
    const orderCode = generateOrderCode();
    const productIdsForInvoice = Array.from(new Set(cartItems.map((item) => item.productId))).slice(0, 3);

    const payment = await payWithTelegramStars({
      amountStars: invoiceStars,
      orderId: orderCode,
      title: `Заказ C3K (${cartItems.length} шт.)`,
      description: `Оплата заказа в магазине C3K. Доставка: ${checkout.delivery === "yandex_go" ? "Яндекс Go" : "CDEK"}.`,
      productIds: productIdsForInvoice,
    });

    setIsPaying(false);

    if (!payment.ok) {
      setPaymentError(payment.message ?? "Платеж не выполнен. Попробуйте снова.");
      hapticNotification("error");
      return;
    }

    const customerName = [checkout.firstName, checkout.lastName].filter(Boolean).join(" ");
    await appendShopOrder({
      id: orderCode,
      createdAt: new Date().toISOString(),
      status: "processing",
      totalStarsCents,
      deliveryFeeStarsCents,
      discountStarsCents,
      delivery: checkout.delivery,
      address: checkout.address,
      customerName,
      phone: checkout.phone,
      comment: checkout.comment,
      items: cartItems
        .map((item) => {
          const product = productsMap.get(item.productId);

          if (!product) {
            return null;
          }

          return {
            productId: product.id,
            title: product.title,
            quantity: item.quantity,
            priceStarsCents: product.priceStarsCents,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item)),
    });

    setCartItems([]);
    setPromoCode("");
    setCheckout(defaultCheckout);
    setCartOpen(false);
    hapticNotification("success");
    router.push("/profile?section=orders");
  };

  const categoryOptions = useMemo(
    () => [
      { value: "all" as const, label: "Все товары" },
      ...Object.entries(SHOP_CATEGORY_LABELS).map(([value, label]) => ({ value: value as ShopCategory, label })),
    ],
    [],
  );

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <p className={styles.kicker}>Clay Fake Market</p>
          <h1>Магазин изделий из глины</h1>
          <p>
            Каталог подделок из глины: 50 товаров, фильтрация и поиск, корзина с промокодами и оформление заказа с оплатой
            в Telegram Stars.
          </p>
        </section>

        <ShopCatalogControls
          search={search}
          onSearchChange={setSearch}
          category={category}
          onCategoryChange={setCategory}
          sort={sort}
          onSortChange={setSort}
          inStockOnly={inStockOnly}
          onInStockChange={setInStockOnly}
          categoryOptions={categoryOptions}
          quickFilter={quickFilter}
          onQuickFilterChange={setQuickFilter}
          activeFiltersCount={activeFiltersCount}
          onResetFilters={resetFilters}
        />

        <section className={styles.resultsBar}>
          <p>
            Найдено товаров: <strong>{filteredProducts.length}</strong>
          </p>
          <p>
            В корзине: <strong>{cartCount}</strong> · {formatStarsFromCents(subtotalStarsCents)} ⭐
          </p>
        </section>

        <LayoutGroup>
          <motion.section layout className={styles.grid}>
            <AnimatePresence>
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
                  />
                ))
              ) : (
                <motion.article
                  key="empty"
                  className={styles.emptyState}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                >
                  <h3>Ничего не найдено</h3>
                  <p>Попробуйте сбросить фильтры или изменить поисковый запрос.</p>
                  <button type="button" onClick={resetFilters}>
                    Сбросить фильтры
                  </button>
                </motion.article>
              )}
            </AnimatePresence>
          </motion.section>
        </LayoutGroup>
      </main>

      <motion.button
        type="button"
        className={styles.cartFab}
        onClick={() => {
          setCartOpen(true);
          hapticSelection();
        }}
        whileTap={{ scale: 0.97 }}
      >
        Корзина {cartCount > 0 ? `(${cartCount})` : ""} · {formatStarsFromCents(subtotalStarsCents)} ⭐
      </motion.button>

      <ShopCartSheet
        open={cartOpen}
        items={cartItems}
        productsMap={productsMap}
        onClose={() => setCartOpen(false)}
        onIncrease={increaseQty}
        onDecrease={decreaseQty}
        onRemove={removeFromCart}
        getMaxQuantity={getMaxQuantity}
      >
        {paymentError ? <p className={styles.paymentError}>{paymentError}</p> : null}

        <ShopOrderSummary
          subtotal={subtotalStarsCents}
          discount={discountStarsCents}
          deliveryFee={deliveryFeeStarsCents}
          totalStars={totalStarsCents}
          invoiceStars={invoiceStars}
          promoCode={promoCode}
          promoLabel={promoLabel}
          onPromoChange={setPromoCode}
          onApplyPromo={applyPromo}
          freeDeliveryLeft={freeDeliveryLeftStarsCents}
          freeDeliveryProgress={freeDeliveryProgress}
        />

        <ShopCheckoutForm
          values={checkout}
          onChange={updateCheckout}
          onRequestPhone={requestPhoneFromTelegram}
          isRequestingPhone={isRequestingPhone}
          canRequestPhone={canRequestPhone}
        />
        

        <button
          type="button"
          className={styles.payButton}
          onClick={submitPayment}
          disabled={!canPay || isPaying}
        >
          {isPaying ? "Проводим платеж..." : `Оплатить ${invoiceStars} ⭐`}
        </button>
      </ShopCartSheet>
    </div>
  );
}
