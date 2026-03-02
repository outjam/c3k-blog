"use client";

import styles from "./shop-order-summary.module.scss";

interface ShopOrderSummaryProps {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalRub: number;
  totalStars: number;
  promoCode: string;
  promoLabel: string;
  onPromoChange: (value: string) => void;
  onApplyPromo: () => void;
}

export function ShopOrderSummary({
  subtotal,
  discount,
  deliveryFee,
  totalRub,
  totalStars,
  promoCode,
  promoLabel,
  onPromoChange,
  onApplyPromo,
}: ShopOrderSummaryProps) {
  return (
    <section className={styles.summary}>
      <h3>Сумма заказа</h3>
      <div className={styles.promoRow}>
        <input
          type="text"
          value={promoCode}
          onChange={(event) => onPromoChange(event.target.value.toUpperCase())}
          placeholder="Промокод"
        />
        <button type="button" onClick={onApplyPromo}>
          Применить
        </button>
      </div>
      {promoLabel ? <p className={styles.promoLabel}>{promoLabel}</p> : null}

      <dl className={styles.totals}>
        <div>
          <dt>Товары</dt>
          <dd>{subtotal.toLocaleString("ru-RU")} ₽</dd>
        </div>
        <div>
          <dt>Скидка</dt>
          <dd>-{discount.toLocaleString("ru-RU")} ₽</dd>
        </div>
        <div>
          <dt>Доставка</dt>
          <dd>{deliveryFee === 0 ? "Бесплатно" : `${deliveryFee.toLocaleString("ru-RU")} ₽`}</dd>
        </div>
        <div className={styles.totalRow}>
          <dt>Итого</dt>
          <dd>
            {totalRub.toLocaleString("ru-RU")} ₽ <span>{totalStars} ⭐</span>
          </dd>
        </div>
      </dl>
    </section>
  );
}
