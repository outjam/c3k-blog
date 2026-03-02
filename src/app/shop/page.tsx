"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";

import { ShopCartSheet } from "@/components/shop/shop-cart-sheet";
import { ShopCatalogControls } from "@/components/shop/shop-catalog-controls";
import { ShopCheckoutForm } from "@/components/shop/shop-checkout-form";
import { ShopOrderSummary } from "@/components/shop/shop-order-summary";
import { ShopProductCard } from "@/components/shop/shop-product-card";
import { SHOP_CATEGORY_LABELS, SHOP_PRODUCTS } from "@/data/shop-products";
import { payWithTelegramStars } from "@/lib/shop-payment";
import { findPromoRule, getCartSubtotalRub, getCartSubtotalStars, getDeliveryFee, getDiscountAmount } from "@/lib/shop-pricing";
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

const sortProducts = (items: typeof SHOP_PRODUCTS, sort: ProductSort) => {
  const list = [...items];

  switch (sort) {
    case "price_asc":
      return list.sort((a, b) => a.priceRub - b.priceRub);
    case "price_desc":
      return list.sort((a, b) => b.priceRub - a.priceRub);
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
  const [category, setCategory] = useState<ShopCategory | "all">("all");
  const [sort, setSort] = useState<ProductSort>("popular");
  const [inStockOnly, setInStockOnly] = useState(false);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [cartOpen, setCartOpen] = useState(false);
  const [checkout, setCheckout] = useState<CheckoutFormValues>(defaultCheckout);
  const [isPaying, setIsPaying] = useState(false);
  const [isCartHydrated, setIsCartHydrated] = useState(false);

  useEffect(() => {
    let mounted = true;

    readShopCart().then((state) => {
      if (!mounted) {
        return;
      }

      setCartItems(state.items);
      setPromoCode(state.promoCode);
      setIsCartHydrated(true);
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const user = getTelegramWebApp()?.initDataUnsafe?.user;

    if (!user) {
      return;
    }

    setCheckout((prev) => ({
      ...prev,
      firstName: prev.firstName || user.first_name || "",
      lastName: prev.lastName || user.last_name || "",
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

  const productsMap = useMemo(() => new Map(SHOP_PRODUCTS.map((item) => [item.id, item])), []);

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
        return true;
      }

      const textBlob = `${product.title} ${product.subtitle} ${product.attributes.sku} ${product.attributes.collection}`.toLowerCase();
      return textBlob.includes(normalizedQuery);
    });

    return sortProducts(filtered, sort);
  }, [category, inStockOnly, search, sort]);

  const subtotalRub = useMemo(() => getCartSubtotalRub(SHOP_PRODUCTS, cartItems), [cartItems]);
  const subtotalStars = useMemo(() => getCartSubtotalStars(SHOP_PRODUCTS, cartItems), [cartItems]);
  const discountRub = useMemo(() => getDiscountAmount(subtotalRub, promoCode), [promoCode, subtotalRub]);
  const deliveryFee = useMemo(() => getDeliveryFee(subtotalRub - discountRub), [discountRub, subtotalRub]);
  const totalRub = Math.max(0, subtotalRub - discountRub + deliveryFee);
  const totalStars = Math.max(0, subtotalStars - Math.round(discountRub / 55));

  const promoRule = findPromoRule(promoCode);
  const promoLabel = promoRule ? `${promoRule.label} активирована (${promoRule.code})` : "";

  const cartCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);

  const addToCart = (productId: string) => {
    setCartItems((prev) => {
      const existing = prev.find((item) => item.productId === productId);

      if (!existing) {
        return [...prev, { productId, quantity: 1 }];
      }

      return prev.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, 99) } : item));
    });

    hapticImpact("light");
  };

  const increaseQty = (productId: string) => {
    setCartItems((prev) => prev.map((item) => (item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, 99) } : item)));
    hapticSelection();
  };

  const decreaseQty = (productId: string) => {
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

  const applyPromo = () => {
    const normalized = promoCode.trim().toUpperCase();
    setPromoCode(normalized);

    if (findPromoRule(normalized)) {
      hapticNotification("success");
      return;
    }

    hapticNotification("warning");
  };

  const canPay = Boolean(cartItems.length > 0 && checkout.firstName && checkout.lastName && checkout.phone && checkout.address);

  const submitPayment = async () => {
    if (!canPay || isPaying) {
      return;
    }

    setIsPaying(true);
    hapticImpact("medium");

    const paid = await payWithTelegramStars({
      amountStars: totalStars,
      orderId: `C3K-${Date.now()}`,
      title: `Заказ C3K (${cartItems.length} шт.)`,
      description: `Оплата заказа в магазине C3K. Доставка: ${checkout.delivery === "yandex_go" ? "Яндекс Go" : "CDEK"}.`,
    });

    setIsPaying(false);

    if (!paid) {
      return;
    }

    setCartItems([]);
    setPromoCode("");
    setCheckout(defaultCheckout);
    setCartOpen(false);
    hapticNotification("success");
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
        />

        <LayoutGroup>
          <motion.section layout className={styles.grid}>
            <AnimatePresence>
              {filteredProducts.map((product) => (
                <ShopProductCard key={product.id} product={product} onAdd={addToCart} />
              ))}
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
        Корзина {cartCount > 0 ? `(${cartCount})` : ""}
      </motion.button>

      <ShopCartSheet
        open={cartOpen}
        items={cartItems}
        productsMap={productsMap}
        onClose={() => setCartOpen(false)}
        onIncrease={increaseQty}
        onDecrease={decreaseQty}
        onRemove={removeFromCart}
      >
        <ShopOrderSummary
          subtotal={subtotalRub}
          discount={discountRub}
          deliveryFee={deliveryFee}
          totalRub={totalRub}
          totalStars={totalStars}
          promoCode={promoCode}
          promoLabel={promoLabel}
          onPromoChange={setPromoCode}
          onApplyPromo={applyPromo}
        />

        <ShopCheckoutForm values={checkout} onChange={updateCheckout} />

        <button
          type="button"
          className={styles.payButton}
          onClick={submitPayment}
          disabled={!canPay || isPaying}
        >
          {isPaying ? "Проводим платеж..." : `Оплатить ${totalStars} ⭐`}
        </button>
      </ShopCartSheet>
    </div>
  );
}
