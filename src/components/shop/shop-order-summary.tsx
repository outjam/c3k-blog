"use client";

import styles from "./shop-order-summary.module.scss";
import { formatStarsFromCents } from "@/lib/stars-format";

interface ShopOrderSummaryProps {
  subtotal: number;
  discount: number;
  totalStars: number;
  invoiceStars: number;
  promoCode: string;
  promoLabel: string;
  onPromoChange: (value: string) => void;
  onApplyPromo: () => void;
}

export function ShopOrderSummary({
  subtotal,
  discount,
  totalStars,
  invoiceStars,
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
          <dt>Релизы</dt>
          <dd>{formatStarsFromCents(subtotal)} ⭐</dd>
        </div>
        <div>
          <dt>Скидка</dt>
          <dd>-{formatStarsFromCents(discount)} ⭐</dd>
        </div>
        <div className={styles.totalRow}>
          <dt>Итого</dt>
          <dd>{formatStarsFromCents(totalStars)} ⭐</dd>
        </div>
        <div className={styles.invoiceRow}>
          <dt>К списанию в Telegram</dt>
          <dd>{invoiceStars} ⭐</dd>
        </div>
      </dl>
    </section>
  );
}
