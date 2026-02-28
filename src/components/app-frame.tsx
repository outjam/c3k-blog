"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { hapticSelection } from "@/lib/telegram";

import styles from "./app-frame.module.scss";

interface AppFrameProps {
  children: React.ReactNode;
}

const getSectionTitle = (pathname: string): string => {
  if (pathname.startsWith("/profile")) {
    return "Профиль";
  }

  if (pathname.startsWith("/post/")) {
    return "Пост";
  }

  return "Блог";
};

export function AppFrame({ children }: AppFrameProps) {
  const pathname = usePathname();
  const sectionTitle = getSectionTitle(pathname);
  const isProfile = pathname.startsWith("/profile");
  const isBlog = !isProfile;

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>C3K Mini App</p>
          <h2 className={styles.title}>{sectionTitle}</h2>
        </div>
      </header>

      <main className={styles.content}>{children}</main>

      <nav className={styles.tabBar} aria-label="Основная навигация">
        <Link
          href="/"
          className={`${styles.tab} ${isBlog ? styles.tabActive : ""}`}
          onClick={() => hapticSelection()}
        >
          Блог
        </Link>
        <Link
          href="/profile"
          className={`${styles.tab} ${isProfile ? styles.tabActive : ""}`}
          onClick={() => hapticSelection()}
        >
          Профиль
        </Link>
      </nav>
    </div>
  );
}
