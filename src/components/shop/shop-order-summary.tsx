"use client";

import styles from "./shop-order-summary.module.scss";
import { formatStarsFromCents } from "@/lib/stars-format";

interface ShopOrderSummaryProps {
  subtotal: number;
  discount: number;
  deliveryFee: number;
  totalStars: number;
  promoCode: string;
  promoLabel: string;
  freeDeliveryLeft: number;
  freeDeliveryProgress: number;
  onPromoChange: (value: string) => void;
  onApplyPromo: () => void;
}

export function ShopOrderSummary({
  subtotal,
  discount,
  deliveryFee,
  totalStars,
  promoCode,
  promoLabel,
  freeDeliveryLeft,
  freeDeliveryProgress,
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
      <div className={styles.shippingProgress}>
        <div className={styles.shippingTrack}>
          <span style={{ width: `${freeDeliveryProgress}%` }} />
        </div>
        <p>
          {freeDeliveryLeft > 0
            ? `До бесплатной доставки осталось ${formatStarsFromCents(freeDeliveryLeft)} ⭐`
            : "Бесплатная доставка активна"}
        </p>
      </div>

      <dl className={styles.totals}>
        <div>
          <dt>Товары</dt>
          <dd>{formatStarsFromCents(subtotal)} ⭐</dd>
        </div>
        <div>
          <dt>Скидка</dt>
          <dd>-{formatStarsFromCents(discount)} ⭐</dd>
        </div>
        <div>
          <dt>Доставка</dt>
          <dd>{deliveryFee === 0 ? "Бесплатно" : `${formatStarsFromCents(deliveryFee)} ⭐`}</dd>
        </div>
        <div className={styles.totalRow}>
          <dt>Итого</dt>
          <dd>{formatStarsFromCents(totalStars)} ⭐</dd>
        </div>
      </dl>
    </section>
  );
}
