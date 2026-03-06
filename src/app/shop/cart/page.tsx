"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ShopCheckoutForm } from "@/components/shop/shop-checkout-form";
import { ShopOrderSummary } from "@/components/shop/shop-order-summary";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { validateCheckoutForm, hasCheckoutErrors, type CheckoutValidationErrors } from "@/lib/shop-checkout-validation";
import { createShopOrder, markShopOrderPaymentFailed } from "@/lib/shop-orders-api";
import { payWithTelegramStars } from "@/lib/shop-payment";
import {
  PROMO_RULES,
  findPromoRule,
  getCartSubtotalStarsCents,
  getDiscountAmountStarsCents,
} from "@/lib/shop-pricing";
import { getCartItemKey, getFormatLabel, getProductPriceByFormat, isSameCartItem } from "@/lib/shop-release-format";
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
  delivery: "digital_download",
};

const defaultCatalogSettings: ShopAppSettings = {
  shopEnabled: true,
  checkoutEnabled: true,
  maintenanceMode: false,
  defaultDeliveryFeeStarsCents: 0,
  freeDeliveryThresholdStarsCents: 0,
  updatedAt: "",
};

const CHECKOUT_ERROR_FIELDS: Partial<Record<keyof CheckoutFormValues, keyof CheckoutValidationErrors>> = {
  firstName: "firstName",
  lastName: "lastName",
  phone: "phone",
  email: "email",
  comment: "comment",
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
  const [canRequestPhone] = useState(() => Boolean(getTelegramWebApp()?.requestContact));
  const [isCartHydrated, setIsCartHydrated] = useState(false);
  const [paymentError, setPaymentError] = useState("");
  const [catalogProducts, setCatalogProducts] = useState<ShopProduct[]>([]);
  const [promoRules, setPromoRules] = useState(PROMO_RULES);
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
          return { productId: item.productId, quantity, selectedFormat: item.selectedFormat };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      setCartItems(normalizedItems);
      setPromoCode(state.promoCode);
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
      setPromoRules(snapshot.promoRules);

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
    const user = getTelegramWebApp()?.initDataUnsafe?.user;

    if (!user) {
      return;
    }

    const timer = window.setTimeout(() => {
      setCheckout((prev) => ({
        ...prev,
        firstName: prev.firstName || user.first_name || "",
        lastName: prev.lastName || user.last_name || "",
        phone: prev.phone || user.phone_number || "",
        email: prev.email || (user.username ? `${user.username}@telegram.local` : ""),
        comment: prev.comment || (user.username ? `Telegram: @${user.username}` : ""),
      }));
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
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
  const deliveryFeeStarsCents = 0;
  const totalStarsCents = Math.max(0, subtotalStarsCents - discountStarsCents);
  const invoiceStars = starsCentsToInvoiceStars(totalStarsCents);

  const promoRule = findPromoRule(promoCode, promoRules);
  const promoLabel = promoRule ? `${promoRule.label} активирована (${promoRule.code})` : "";

  const checkoutAvailable = catalogSettings.shopEnabled && catalogSettings.checkoutEnabled && !catalogSettings.maintenanceMode;
  const canPay = checkoutAvailable && cartItems.length > 0 && !isPaying;

  const increaseQty = (productId: string, selectedFormat?: CartItem["selectedFormat"]) => {
    const maxQuantity = getMaxQuantity(productId);

    setCartItems((prev) =>
      prev.map((item) =>
        isSameCartItem(item, { productId, selectedFormat }) ? { ...item, quantity: Math.min(item.quantity + 1, maxQuantity) } : item,
      ),
    );
    hapticSelection();
  };

  const decreaseQty = (productId: string, selectedFormat?: CartItem["selectedFormat"]) => {
    setCartItems((prev) =>
      prev
        .map((item) =>
          isSameCartItem(item, { productId, selectedFormat }) ? { ...item, quantity: Math.max(item.quantity - 1, 0) } : item,
        )
        .filter((item) => item.quantity > 0),
    );
    hapticSelection();
  };

  const removeFromCart = (productId: string, selectedFormat?: CartItem["selectedFormat"]) => {
    setCartItems((prev) => prev.filter((item) => !isSameCartItem(item, { productId, selectedFormat })));
    hapticImpact("soft");
  };

  const clearCart = () => {
    setCartItems([]);
    setPromoCode("");
    hapticSelection();
  };

  const updateCheckout = (field: keyof CheckoutFormValues, value: string) => {
    setCheckout((prev) => ({ ...prev, [field]: value }));

    const errorField = CHECKOUT_ERROR_FIELDS[field];

    if (errorField && checkoutErrors[errorField]) {
      setCheckoutErrors((prev) => ({ ...prev, [errorField]: undefined }));
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
          title: item.selectedFormat ? `${product.title} (${getFormatLabel(item.selectedFormat)})` : product.title,
          quantity: item.quantity,
          priceStarsCents: getProductPriceByFormat(product, item.selectedFormat),
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
      delivery: "digital_download",
      address: "Digital download",
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
      description: "Оплата цифрового аудио-релиза в C3K.",
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
            <p>Проверьте релизы, заполните данные и завершите оплату в Telegram Stars.</p>
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
            <p>Добавьте релизы из витрины, затем вернитесь на эту страницу для оформления заказа.</p>
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
                  <article key={getCartItemKey(item)} className={styles.item}>
                    <img src={product.image} alt={product.title} loading="lazy" />
                    <div className={styles.itemBody}>
                      <h3>{product.title}</h3>
                      <p>
                        {formatStarsFromCents(getProductPriceByFormat(product, item.selectedFormat))} ⭐
                        {item.selectedFormat ? ` · ${getFormatLabel(item.selectedFormat)}` : ""}
                      </p>
                      <div className={styles.qtyRow}>
                        <button
                          type="button"
                          onClick={() => decreaseQty(product.id, item.selectedFormat)}
                          disabled={item.quantity <= 1}
                        >
                          −
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          type="button"
                          onClick={() => increaseQty(product.id, item.selectedFormat)}
                          disabled={item.quantity >= maxQuantity}
                        >
                          +
                        </button>
                        <button
                          type="button"
                          onClick={() => removeFromCart(product.id, item.selectedFormat)}
                          className={styles.remove}
                        >
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
                totalStars={totalStarsCents}
                invoiceStars={invoiceStars}
                promoCode={promoCode}
                promoLabel={promoLabel}
                onPromoChange={setPromoCode}
                onApplyPromo={applyPromo}
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
