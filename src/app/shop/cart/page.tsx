"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ShopCheckoutForm } from "@/components/shop/shop-checkout-form";
import { ShopOrderSummary } from "@/components/shop/shop-order-summary";
import { SHOP_PRODUCTS } from "@/data/shop-products";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { validateCheckoutForm, hasCheckoutErrors, type CheckoutValidationErrors } from "@/lib/shop-checkout-validation";
import { createShopOrder, markShopOrderPaymentFailed } from "@/lib/shop-orders-api";
import { payWithTelegramStars } from "@/lib/shop-payment";
import {
  DEFAULT_DELIVERY_FEE_STARS_CENTS,
  DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS,
  PROMO_RULES,
  findPromoRule,
  getCartSubtotalStarsCents,
  getDeliveryFeeStarsCents,
  getDiscountAmountStarsCents,
} from "@/lib/shop-pricing";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
import { formatStarsFromCents, starsCentsToInvoiceStars } from "@/lib/stars-format";
import { getTelegramWebApp, hapticImpact, hapticNotification, hapticSelection } from "@/lib/telegram";
import type { CartItem, CheckoutFormValues, ShopAppSettings, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

const ORDER_CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

const defaultCheckout: CheckoutFormValues = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  comment: "",
  delivery: "yandex_go",
};

const defaultCatalogSettings: ShopAppSettings = {
  shopEnabled: true,
  checkoutEnabled: true,
  maintenanceMode: false,
  defaultDeliveryFeeStarsCents: DEFAULT_DELIVERY_FEE_STARS_CENTS,
  freeDeliveryThresholdStarsCents: DEFAULT_FREE_DELIVERY_THRESHOLD_STARS_CENTS,
  updatedAt: "",
};

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

export default function ShopCartPage() {
  const router = useRouter();
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [promoCode, setPromoCode] = useState("");
  const [checkout, setCheckout] = useState<CheckoutFormValues>(defaultCheckout);
  const [checkoutErrors, setCheckoutErrors] = useState<CheckoutValidationErrors>({});
  const [isPaying, setIsPaying] = useState(false);
  const [isRequestingPhone, setIsRequestingPhone] = useState(false);
  const [canRequestPhone, setCanRequestPhone] = useState(false);
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<ShopProduct[]>(SHOP_PRODUCTS);
  const [promoRules, setPromoRules] = useState(PROMO_RULES);
  const [catalogSettings, setCatalogSettings] = useState<ShopAppSettings>(defaultCatalogSettings);
  const [catalogError, setCatalogError] = useState("");

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
    let mounted = true;

    void fetchPublicCatalog().then((snapshot) => {
      if (!mounted) {
        return;
      }

      if (snapshot.error) {
        setCatalogError(snapshot.error);
        return;
      }

      setCatalogProducts(snapshot.products);
      setPromoRules(snapshot.promoRules);

      if (snapshot.settings) {
        setCatalogSettings(snapshot.settings);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

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

  const subtotalStarsCents = useMemo(() => getCartSubtotalStarsCents(catalogProducts, cartItems), [cartItems, catalogProducts]);
  const discountStarsCents = useMemo(
    () => getDiscountAmountStarsCents(subtotalStarsCents, promoCode, promoRules),
    [promoCode, promoRules, subtotalStarsCents],
  );
  const deliveryFeeStarsCents = useMemo(
    () =>
      getDeliveryFeeStarsCents(subtotalStarsCents - discountStarsCents, {
        freeDeliveryThresholdStarsCents: catalogSettings.freeDeliveryThresholdStarsCents,
        defaultDeliveryFeeStarsCents: catalogSettings.defaultDeliveryFeeStarsCents,
      }),
    [catalogSettings.defaultDeliveryFeeStarsCents, catalogSettings.freeDeliveryThresholdStarsCents, discountStarsCents, subtotalStarsCents],
  );
  const totalStarsCents = Math.max(0, subtotalStarsCents - discountStarsCents + deliveryFeeStarsCents);
  const invoiceStars = starsCentsToInvoiceStars(totalStarsCents);
  const freeDeliveryThresholdStarsCents = catalogSettings.freeDeliveryThresholdStarsCents;
  const freeDeliveryLeftStarsCents = Math.max(freeDeliveryThresholdStarsCents - (subtotalStarsCents - discountStarsCents), 0);
  const freeDeliveryProgress = freeDeliveryThresholdStarsCents
    ? Math.min(((subtotalStarsCents - discountStarsCents) / freeDeliveryThresholdStarsCents) * 100, 100)
    : 100;

  const promoRule = findPromoRule(promoCode, promoRules);
  const promoLabel = promoRule ? `${promoRule.label} активирована (${promoRule.code})` : "";

  const checkoutAvailable = catalogSettings.shopEnabled && catalogSettings.checkoutEnabled && !catalogSettings.maintenanceMode;
  const canPay = checkoutAvailable && cartItems.length > 0 && !isPaying;

  const increaseQty = (productId: string) => {
    const maxQuantity = getMaxQuantity(productId);

    setCartItems((prev) =>
      prev.map((item) =>
        item.productId === productId ? { ...item, quantity: Math.min(item.quantity + 1, maxQuantity) } : item,
      ),
    );
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

  const clearCart = () => {
    setCartItems([]);
    setPromoCode("");
    hapticSelection();
  };

  const updateCheckout = (field: keyof CheckoutFormValues, value: string) => {
    setCheckout((prev) => ({ ...prev, [field]: value }));

    if (field !== "delivery" && checkoutErrors[field]) {
      setCheckoutErrors((prev) => ({ ...prev, [field]: undefined }));
    }
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
      setCheckoutErrors((prev) => ({ ...prev, phone: undefined }));
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

    if (findPromoRule(normalized, promoRules)) {
      hapticNotification("success");
      return;
    }

    hapticNotification("warning");
  };

  const submitPayment = async () => {
    if (!canPay) {
      return;
    }

    const validationErrors = validateCheckoutForm(checkout);
    setCheckoutErrors(validationErrors);

    if (hasCheckoutErrors(validationErrors)) {
      hapticNotification("warning");
      return;
    }

    setPaymentError("");
    setIsPaying(true);
    hapticImpact("medium");

    const orderCode = generateOrderCode();
    const customerName = [checkout.firstName, checkout.lastName].filter(Boolean).join(" ");
    const normalizedItems = cartItems
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
      .filter((item): item is NonNullable<typeof item> => Boolean(item));

    const orderCreation = await createShopOrder({
      id: orderCode,
      invoiceStars,
      promoCode: promoCode.trim().toUpperCase() || undefined,
      totalStarsCents,
      deliveryFeeStarsCents,
      discountStarsCents,
      delivery: checkout.delivery,
      address: checkout.address,
      customerName,
      phone: checkout.phone,
      email: checkout.email,
      comment: checkout.comment,
      items: normalizedItems,
    });

    if (!orderCreation.order) {
      setIsPaying(false);
      setPaymentError(orderCreation.error ?? "Сервер заказов недоступен. Оплата не была инициирована.");
      hapticNotification("error");
      return;
    }

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
      await markShopOrderPaymentFailed({
        orderId: orderCode,
        providerStatus: payment.status,
        reason: payment.message,
      });
      setPaymentError(payment.message ?? "Платеж не выполнен. Попробуйте снова.");
      hapticNotification("error");
      return;
    }

    setCartItems([]);
    setPromoCode("");
    setCheckout(defaultCheckout);
    hapticNotification("success");
    router.push(`/orders/${encodeURIComponent(orderCode)}`);
  };

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <header className={styles.head}>
          <div>
            <h1>Корзина</h1>
            <p>Проверьте товары, заполните данные и завершите оплату в Telegram Stars.</p>
          </div>
          <div className={styles.actions}>
            <Link href="/shop">В каталог</Link>
            <button type="button" onClick={clearCart} disabled={cartItems.length === 0}>
              Очистить
            </button>
          </div>
        </header>

        {catalogSettings.maintenanceMode ? <p className={styles.error}>Режим обслуживания включен администратором.</p> : null}
        {catalogError ? <p className={styles.error}>Ошибка синхронизации каталога: {catalogError}</p> : null}
        {paymentError ? <p className={styles.error}>{paymentError}</p> : null}

        {cartItems.length === 0 ? (
          <section className={styles.emptyState}>
            <h2>Корзина пуста</h2>
            <p>Добавьте товары из каталога, затем вернитесь на эту страницу для оформления заказа.</p>
            <Link href="/shop">Открыть каталог</Link>
          </section>
        ) : (
          <section className={styles.layout}>
            <section className={styles.items}>
              {cartItems.map((item) => {
                const product = productsMap.get(item.productId);

                if (!product) {
                  return null;
                }

                const maxQuantity = getMaxQuantity(product.id);

                return (
                  <article key={item.productId} className={styles.item}>
                    <img src={product.image} alt={product.title} loading="lazy" />
                    <div className={styles.itemBody}>
                      <h3>{product.title}</h3>
                      <p>{formatStarsFromCents(product.priceStarsCents)} ⭐</p>
                      <div className={styles.qtyRow}>
                        <button type="button" onClick={() => decreaseQty(product.id)} disabled={item.quantity <= 1}>
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button type="button" onClick={() => increaseQty(product.id)} disabled={item.quantity >= maxQuantity}>
                          +
                        </button>
                        <button type="button" onClick={() => removeFromCart(product.id)} className={styles.remove}>
                          Удалить
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>

            <section className={styles.checkoutColumn}>
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
                errors={checkoutErrors}
              />

              <button type="button" className={styles.payButton} onClick={submitPayment} disabled={!canPay}>
                {isPaying ? "Проводим платеж..." : `Оплатить ${invoiceStars} ⭐`}
              </button>
            </section>
          </section>
        )}
      </main>
    </div>
  );
}
