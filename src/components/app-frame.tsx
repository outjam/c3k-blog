"use client";

import { useMemo } from "react";
import { usePathname, useRouter } from "next/navigation";

import { hapticSelection } from "@/lib/telegram";
import { MiniTabBar } from "@/components/mini-tab-bar";

import styles from "./app-frame.module.scss";

interface AppFrameProps {
  children: React.ReactNode;
}

interface TabItem {
  id: "blog" | "shop" | "profile";
  label: string;
  href: "/" | "/shop" | "/profile";
  icon: React.ReactNode;
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

function ShopIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M5.5 5.25A2.25 2.25 0 0 1 7.75 3h8.5a2.25 2.25 0 0 1 2.25 2.25v1.1c0 .43-.12.85-.35 1.22l-1.3 2.08a2.25 2.25 0 0 1-1.9 1.05H9.05a2.25 2.25 0 0 1-1.9-1.05l-1.3-2.08a2.3 2.3 0 0 1-.35-1.22v-1.1Zm2.25-.75a.75.75 0 0 0-.75.75v1.1c0 .15.04.3.12.43l1.3 2.07a.75.75 0 0 0 .63.35h5.9a.75.75 0 0 0 .63-.35l1.3-2.07c.08-.13.12-.28.12-.43v-1.1a.75.75 0 0 0-.75-.75h-8.5ZM6 12.25c0-.41.34-.75.75-.75h10.5c.41 0 .75.34.75.75v6A2.25 2.25 0 0 1 15.75 20.5h-7.5A2.25 2.25 0 0 1 6 18.25v-6Zm1.5.75v5.25c0 .41.34.75.75.75h7.5a.75.75 0 0 0 .75-.75V13h-9Z" />
    </svg>
  );
}

export function AppFrame({ children }: AppFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isShop = pathname.startsWith("/shop");
  const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/orders");
  const activeIndex = isProfile ? 2 : isShop ? 1 : 0;
  const showTabBar =
    pathname === "/" || pathname.startsWith("/shop") || pathname.startsWith("/profile") || pathname.startsWith("/orders");

  const tabs = useMemo<TabItem[]>(() => [
    { id: "blog", label: "Блог", href: "/", icon: <BlogIcon /> },
    { id: "shop", label: "Магазин", href: "/shop", icon: <ShopIcon /> },
    { id: "profile", label: "Профиль", href: "/profile", icon: <ProfileIcon /> },
  ], []);

  const navigateTo = (index: number) => {
    const nextTab = tabs[index];

    if (!nextTab) {
      return;
    }

    if (nextTab.href !== pathname) {
      hapticSelection();
      router.push(nextTab.href);
    }
  };

  return (
    <div className={styles.frame}>
      <header className={styles.header}>
          <p className={styles.brand}>Culture3k</p>
          {/* <h2 className={styles.title}>{sectionTitle}</h2> */}
      </header>

      <main className={`${styles.content} ${showTabBar ? styles.contentWithTabBar : ""}`}>
        {children}
      </main>

      {showTabBar ? <MiniTabBar activeIndex={activeIndex} items={tabs} onChange={navigateTo} /> : null}
    </div>
  );
}
