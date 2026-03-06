"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { hapticSelection } from "@/lib/telegram";
import { MiniTabBar } from "@/components/mini-tab-bar";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";

import styles from "./app-frame.module.scss";

interface AppFrameProps {
  children: React.ReactNode;
}

interface TabItem {
  id: "feed" | "search" | "shop" | "profile";
  label: string;
  href: "/" | "/search" | "/shop" | "/profile";
  icon: React.ReactNode;
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M4.5 6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25v10.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 17.25V6.75Zm2.25-.75a.75.75 0 0 0-.75.75v3.75h12V6.75a.75.75 0 0 0-.75-.75H6.75Zm11.25 6h-12v5.25c0 .41.34.75.75.75h10.5a.75.75 0 0 0 .75-.75V12Zm-10 1.5a.75.75 0 0 0 0 1.5h3.5a.75.75 0 0 0 0-1.5H8Zm5.25 0a.75.75 0 0 0 0 1.5H16a.75.75 0 0 0 0-1.5h-2.75Z" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path d="M10.5 4a6.5 6.5 0 1 1 4.74 10.95l3.4 3.4a.75.75 0 1 1-1.06 1.06l-3.4-3.4A6.5 6.5 0 0 1 10.5 4Zm0 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" />
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
  const { user } = useAppAuthUser();
  const profilePhotoUrl = user?.photo_url;

  const isSearch = pathname.startsWith("/search");
  const isShop = pathname.startsWith("/shop");
  const isProfile = pathname.startsWith("/profile") || pathname.startsWith("/orders");
  const activeIndex = isProfile ? 3 : isShop ? 2 : isSearch ? 1 : 0;

  const showNavigation =
    pathname === "/" ||
    pathname.startsWith("/search") ||
    pathname.startsWith("/shop") ||
    pathname.startsWith("/profile") ||
    pathname.startsWith("/orders");

  const tabs = useMemo<TabItem[]>(
    () => [
      { id: "feed", label: "Лента", href: "/", icon: <FeedIcon /> },
      { id: "search", label: "Поиск", href: "/search", icon: <SearchIcon /> },
      { id: "shop", label: "Релизы", href: "/shop", icon: <ShopIcon /> },
      {
        id: "profile",
        label: "Профиль",
        href: "/profile",
        icon: profilePhotoUrl ? <img src={profilePhotoUrl} alt="" className={styles.profileAvatar} /> : <ProfileIcon />,
      },
    ],
    [profilePhotoUrl],
  );

  const navigateTo = (index: number) => {
    const nextTab = tabs[index];

    if (!nextTab) {
      return;
    }

    if (nextTab.href !== pathname) {
      hapticSelection();
      router.push(nextTab.href, { scroll: false });
    }
  };

  return (
    <div className={`${styles.shell} ${showNavigation ? "" : styles.shellNoNav}`}>
      {showNavigation ? (
        <aside className={styles.desktopSidebar}>
          <Link className={styles.desktopBrand} href="/">
            <span className={styles.desktopBrandDot} />
            <span>Culture3k</span>
          </Link>

          <nav className={styles.desktopNav} aria-label="Основная навигация desktop">
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.desktopNavButton} ${index === activeIndex ? styles.desktopNavButtonActive : ""}`}
                onClick={() => navigateTo(index)}
              >
                <span className={styles.desktopIcon}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            ))}
          </nav>

          <div className={styles.desktopHintBox}>
            <p>Social + Music Commerce</p>
            <strong>Показывайте награды, делитесь покупками, поддерживайте артистов.</strong>
          </div>
        </aside>
      ) : null}

      <div className={styles.frame}>
        <header className={`${styles.header} ${showNavigation ? "" : styles.headerNoNav}`}>
          <p className={styles.brand}>Culture3k Network</p>
          <p className={styles.title}>Elite Music Community</p>
        </header>

        <main className={`${styles.content} ${showNavigation ? styles.contentWithTabBar : ""}`}>{children}</main>

        {showNavigation ? (
          <div className={styles.mobileTabBarWrap}>
            <MiniTabBar activeIndex={activeIndex} items={tabs} onChange={navigateTo} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
