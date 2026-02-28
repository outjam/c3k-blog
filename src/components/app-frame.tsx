"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { hapticSelection } from "@/lib/telegram";

import styles from "./app-frame.module.scss";

interface AppFrameProps {
  children: React.ReactNode;
}

function BlogIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M7 4.5h10a2.5 2.5 0 0 1 2.5 2.5v10A2.5 2.5 0 0 1 17 19.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Zm1 4a.75.75 0 1 0 0 1.5h8a.75.75 0 0 0 0-1.5H8Zm0 3a.75.75 0 1 0 0 1.5h8a.75.75 0 0 0 0-1.5H8Zm0 3a.75.75 0 1 0 0 1.5h5.5a.75.75 0 0 0 0-1.5H8Z" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M12 12.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Zm0 1.75c-4.04 0-7.5 2.1-7.5 4.7 0 .41.34.75.75.75h13.5a.75.75 0 0 0 .75-.75c0-2.6-3.46-4.7-7.5-4.7Z" />
    </svg>
  );
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
  const showTabBar = pathname === "/" || pathname.startsWith("/profile");

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
        <div>
          <p className={styles.brand}>C3K Mini App</p>
          <h2 className={styles.title}>{sectionTitle}</h2>
        </div>
      </header>

      <main className={`${styles.content} ${showTabBar ? styles.contentWithTabBar : ""}`}>{children}</main>

      {showTabBar ? (
        <nav className={styles.tabBar} aria-label="Основная навигация">
          <Link
            href="/"
            className={`${styles.tab} ${isBlog ? styles.tabActive : ""}`}
            onClick={() => hapticSelection()}
          >
            <span className={styles.tabIcon}>
              <BlogIcon />
            </span>
            <span className={styles.tabLabel}>Блог</span>
          </Link>
          <Link
            href="/profile"
            className={`${styles.tab} ${isProfile ? styles.tabActive : ""}`}
            onClick={() => hapticSelection()}
          >
            <span className={styles.tabIcon}>
              <ProfileIcon />
            </span>
            <span className={styles.tabLabel}>Профиль</span>
          </Link>
        </nav>
      ) : null}
    </div>
  );
}
