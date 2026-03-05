"use client";

import type { CheckoutFormValues } from "@/types/shop";
import type { CheckoutValidationErrors } from "@/lib/shop-checkout-validation";

import styles from "./shop-checkout-form.module.scss";

interface ShopCheckoutFormProps {
  values: CheckoutFormValues;
  onChange: (field: keyof CheckoutFormValues, value: string) => void;
  onRequestPhone?: () => void;
  isRequestingPhone?: boolean;
  canRequestPhone?: boolean;
  errors?: CheckoutValidationErrors;
}

export function ShopCheckoutForm({
  values,
  onChange,
  onRequestPhone,
  isRequestingPhone = false,
  canRequestPhone = false,
  errors,
}: ShopCheckoutFormProps) {
  return (
    <section className={styles.form}>
      <h3>Детали заказа</h3>

      <div className={styles.row2}>
        <label>
          Имя
          <input
            value={values.firstName}
            onChange={(event) => onChange("firstName", event.target.value)}
            autoComplete="given-name"
            required
          />
          {errors?.firstName ? <span className={styles.error}>{errors.firstName}</span> : null}
        </label>
        <label>
          Фамилия
          <input
            value={values.lastName}
            onChange={(event) => onChange("lastName", event.target.value)}
            autoComplete="family-name"
            required
          />
          {errors?.lastName ? <span className={styles.error}>{errors.lastName}</span> : null}
        </label>
      </div>

      <div className={styles.row2}>
        <label>
          Телефон
          <input
            value={values.phone}
            onChange={(event) => onChange("phone", event.target.value)}
            placeholder="+7 (___) ___-__-__"
            autoComplete="tel"
            inputMode="tel"
            required
          />
          {errors?.phone ? <span className={styles.error}>{errors.phone}</span> : null}
          {onRequestPhone ? (
            <span className={styles.phoneActions}>
              <button type="button" onClick={onRequestPhone} disabled={!canRequestPhone || isRequestingPhone}>
                {isRequestingPhone ? "Запрашиваем..." : "Запросить из Telegram"}
              </button>
            </span>
          ) : null}
        </label>
        <label>
          Эл. почта
          <input
            type="email"
            value={values.email}
            onChange={(event) => onChange("email", event.target.value)}
            placeholder="mail@example.com"
            autoComplete="email"
            inputMode="email"
          />
          {errors?.email ? <span className={styles.error}>{errors.email}</span> : null}
        </label>
      </div>

      <label>
        Комментарий к заказу
        <textarea
          value={values.comment}
          onChange={(event) => onChange("comment", event.target.value)}
          rows={3}
          maxLength={300}
          placeholder="Комментарий к цифровому заказу (необязательно)"
        />
        {errors?.comment ? <span className={styles.error}>{errors.comment}</span> : null}
      </label>
    </section>
  );
}
