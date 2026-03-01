"use client";

import { useEffect, useMemo, useState } from "react";

import { useTelegramWebApp } from "@/hooks/useTelegramWebApp";
import { applyAppTheme, readThemePreference, resolveAutoTheme, saveThemePreference, type AppTheme } from "@/lib/app-theme";

import styles from "./page.module.scss";

export default function ProfilePage() {
  const webApp = useTelegramWebApp();
  const user = webApp?.initDataUnsafe?.user;
  const formatBool = (value: boolean | undefined): string => (value ? "да" : "нет");
  const [theme, setTheme] = useState<AppTheme>(() => {
    if (typeof document === "undefined") {
      return "dark";
    }

    const currentTheme = document.documentElement.getAttribute("data-app-theme");
    return currentTheme === "light" || currentTheme === "dark" ? currentTheme : resolveAutoTheme();
  });

  const fullName = useMemo(() => {
    if (!user) {
      return "Гость";
    }

    return [user.first_name, user.last_name].filter(Boolean).join(" ") || "Без имени";
  }, [user]);

  useEffect(() => {
    void readThemePreference().then((savedTheme) => {
      if (savedTheme) {
        setTheme(savedTheme);
      }
    });
  }, []);

  const handleThemeChange = async (nextTheme: AppTheme) => {
    setTheme(nextTheme);
    applyAppTheme(nextTheme);
    await saveThemePreference(nextTheme);
  };

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <h1 className={styles.title}>Профиль</h1>
        <p className={styles.subtitle}>Данные пользователя и окружения Telegram WebApp.</p>

        {user?.photo_url ? (
          <img className={styles.photo} src={user.photo_url} alt={fullName} />
        ) : (
          <div className={styles.avatar} aria-hidden>
            {fullName.slice(0, 2).toUpperCase()}
          </div>
        )}

        <div className={styles.themeBox}>
          <p className={styles.themeTitle}>Тема приложения</p>
          <div className={styles.themeActions}>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "light" ? styles.themeButtonActive : ""}`}
              onClick={() => void handleThemeChange("light")}
            >
              Светлая
            </button>
            <button
              type="button"
              className={`${styles.themeButton} ${theme === "dark" ? styles.themeButtonActive : ""}`}
              onClick={() => void handleThemeChange("dark")}
            >
              Тёмная
            </button>
          </div>
        </div>

        <dl className={styles.list}>
          <div className={styles.row}>
            <dt>Имя (полное)</dt>
            <dd>{fullName}</dd>
          </div>
          <div className={styles.row}>
            <dt>Имя</dt>
            <dd>{user?.first_name ?? "не указано"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Фамилия</dt>
            <dd>{user?.last_name ?? "не указана"}</dd>
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
            <dt>Бот</dt>
            <dd>{formatBool(user?.is_bot)}</dd>
          </div>
          <div className={styles.row}>
            <dt>Premium</dt>
            <dd>{formatBool(user?.is_premium)}</dd>
          </div>
          <div className={styles.row}>
            <dt>Можно писать в ЛС</dt>
            <dd>{formatBool(user?.allows_write_to_pm)}</dd>
          </div>
          <div className={styles.row}>
            <dt>Платформа</dt>
            <dd>{webApp?.platform ?? "недоступно"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Версия WebApp</dt>
            <dd>{webApp?.version ?? "недоступно"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Тема</dt>
            <dd>{webApp?.colorScheme ?? "недоступно"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Развернут</dt>
            <dd>{formatBool(webApp?.isExpanded)}</dd>
          </div>
          <div className={styles.row}>
            <dt>Viewport height</dt>
            <dd>{webApp?.viewportHeight ?? "недоступно"}</dd>
          </div>
          <div className={styles.row}>
            <dt>Viewport stable</dt>
            <dd>{webApp?.viewportStableHeight ?? "недоступно"}</dd>
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
