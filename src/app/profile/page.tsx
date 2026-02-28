"use client";

import { useMemo } from "react";

import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";

import styles from "./page.module.scss";

export default function ProfilePage() {
  const webApp = useTelegramWebApp();
  const user = webApp?.initDataUnsafe?.user;

  const fullName = useMemo(() => {
    if (!user) {
      return "Гость";
    }

    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  }, [user]);

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Профиль</h1>
        <p className={styles.subtitle}>Данные пользователя Telegram из WebApp.</p>

        <div className={styles.avatar} aria-hidden>
          {fullName.slice(0, 2).toUpperCase()}
        </div>

        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>Имя</dt>
            <dd>{fullName}</dd>
          </div>
          <div className={styles.row}>
            <dt>Username</dt>
            <dd>{user?.username ? `@${user.username}` : "не указан"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Telegram ID</dt>
            <dd>{user?.id ?? "недоступен"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Язык</dt>
            <dd>{user?.language_code ?? "недоступен"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Premium</dt>
            <dd>{user?.is_premium ? "да" : "нет"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Можно писать в ЛС</dt>
            <dd>{user?.allows_write_to_pm ? "да" : "нет"}</dd>
          </div>
        </dl>

        {!user ? (
          <p className={styles.warning}>
            Открой Mini App внутри Telegram, чтобы получить данные пользователя.
          </p>
        ) : null}
      </section>
    </div>
  );
}
