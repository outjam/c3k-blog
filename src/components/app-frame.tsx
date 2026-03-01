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
  id: "blog" | "profile";
  label: string;
  href: "/" | "/profile";
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

export function AppFrame({ children }: AppFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const isProfile = pathname.startsWith("/profile");
  const activeIndex = isProfile ? 1 : 0;
  const showTabBar = pathname === "/" || pathname.startsWith("/profile");

  const tabs = useMemo<TabItem[]>(() => [
    { id: "blog", label: "Блог", href: "/", icon: <BlogIcon /> },
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
