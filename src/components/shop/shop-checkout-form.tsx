"use client";

import type { CheckoutFormValues } from "@/types/shop";

import styles from "./shop-checkout-form.module.scss";

interface ShopCheckoutFormProps {
  values: CheckoutFormValues;
  onChange: (field: keyof CheckoutFormValues, value: string) => void;
}

export function ShopCheckoutForm({ values, onChange }: ShopCheckoutFormProps) {
  return (
    <section className={styles.form}>
      <h3>Детали заказа</h3>

      <div className={styles.row2}>
        <label>
          Имя
          <input value={values.firstName} onChange={(event) => onChange("firstName", event.target.value)} />
        </label>
        <label>
          Фамилия
          <input value={values.lastName} onChange={(event) => onChange("lastName", event.target.value)} />
        </label>
      </div>

      <div className={styles.row2}>
        <label>
          Телефон
          <input value={values.phone} onChange={(event) => onChange("phone", event.target.value)} placeholder="+7 (___) ___-__-__" />
        </label>
        <label>
          Эл. почта
          <input value={values.email} onChange={(event) => onChange("email", event.target.value)} placeholder="mail@example.com" />
        </label>
      </div>

      <label>
        Адрес доставки
        <input value={values.address} onChange={(event) => onChange("address", event.target.value)} placeholder="Город, улица, дом, квартира" />
      </label>

      <label>
        Комментарий к заказу
        <textarea
          value={values.comment}
          onChange={(event) => onChange("comment", event.target.value)}
          rows={3}
          placeholder="Например: позвонить за 30 минут"
        />
      </label>

      <fieldset className={styles.delivery}>
        <legend>Способ доставки</legend>
        <label>
          <input
            type="radio"
            checked={values.delivery === "yandex_go"}
            onChange={() => onChange("delivery", "yandex_go")}
          />
          Яндекс Go
        </label>
        <label>
          <input
            type="radio"
            checked={values.delivery === "cdek"}
            onChange={() => onChange("delivery", "cdek")}
          />
          CDEK
        </label>
      </fieldset>
    </section>
  );
}
