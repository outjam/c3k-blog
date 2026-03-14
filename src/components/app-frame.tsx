"use client";

import Image from "next/image";
import { useMemo, type CSSProperties } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { hapticSelection } from "@/lib/telegram";
import { MiniTabBar } from "@/components/mini-tab-bar";
import { GlobalPlayerBar } from "@/components/player/global-player-bar";
import { StarsIcon } from "@/components/stars-icon";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";

import styles from "./app-frame.module.scss";

interface AppFrameProps {
  children: React.ReactNode;
}

interface TabItem {
  id: "feed" | "shop" | "profile";
  label: string;
  href: "/" | "/shop" | "/profile";
  icon: React.ReactNode;
}

function FeedIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden>
      <path
        d="M8.72266 4.59375C8.79297 3.5625 9.41406 3 10.5273 3H21.7422C22.8672 3 23.4766 3.5625 23.5586 4.59375H8.72266ZM6.33203 7.98047C6.49609 6.86719 7.05859 6.23438 8.30078 6.23438H23.9805C25.2227 6.23438 25.7852 6.86719 25.9492 7.98047H6.33203ZM7.71484 29.0508C5.26562 29.0508 4 27.7852 4 25.3711V13.5703C4 11.1445 5.26562 9.89062 7.71484 9.89062H24.5547C26.9922 9.89062 28.2695 11.1562 28.2695 13.5703V25.3711C28.2695 27.7852 26.9922 29.0508 24.5547 29.0508H7.71484ZM16.7383 24.2812C16.9727 24.2812 17.1484 24.1172 17.1953 23.8828C17.8281 20.3555 18.1797 19.7109 21.8359 19.2305C22.082 19.1953 22.2578 19.0078 22.2578 18.7617C22.2578 18.5273 22.082 18.3398 21.8359 18.3047C18.2148 17.8125 17.7227 17.1445 17.1953 13.6641C17.1484 13.418 16.9727 13.2422 16.7383 13.2422C16.5039 13.2422 16.3164 13.4062 16.2695 13.6523C15.6367 17.1914 15.2734 17.8125 11.6406 18.3047C11.3828 18.3398 11.2188 18.5273 11.2188 18.7617C11.2188 19.0078 11.3828 19.1836 11.6406 19.2305C15.2617 19.6406 15.7305 20.3438 16.2695 23.8711C16.3047 24.1172 16.4805 24.2812 16.7383 24.2812ZM11.9219 26.25C12.0977 26.25 12.2266 26.1328 12.2734 25.9688C12.5898 24.2109 12.4961 24.1523 14.3945 23.8477C14.5586 23.8125 14.6875 23.6719 14.6875 23.5078C14.6875 23.332 14.5586 23.1914 14.3945 23.168C12.4961 22.8633 12.5781 22.793 12.2734 21.0703C12.2266 20.8828 12.1094 20.7539 11.9219 20.7539C11.7461 20.7539 11.6289 20.8828 11.5703 21.0703C11.2539 22.7812 11.3711 22.8398 9.47266 23.168C9.28516 23.2031 9.17969 23.332 9.17969 23.5078C9.17969 23.6953 9.28516 23.8125 9.49609 23.8477C11.3711 24.1406 11.2539 24.2109 11.5703 25.9336C11.6289 26.1211 11.7461 26.25 11.9219 26.25Z"
        fill="currentColor"
      />
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
  return <StarsIcon />;
}

export function AppFrame({ children }: AppFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAppAuthUser();
  const profilePhotoUrl = user?.photo_url;

  const isShop = pathname === "/shop";
  const isProfile = pathname === "/profile";
  const activeIndex = isProfile ? 2 : isShop ? 1 : 0;

  const showNavigation =
    pathname === "/" || pathname === "/shop" || pathname === "/profile";
  const frameStyle = useMemo(
    () =>
      ({
        "--app-tabbar-height": showNavigation ? "82px" : "0px",
      }) as CSSProperties,
    [showNavigation],
  );

  const tabs = useMemo<TabItem[]>(
    () => [
      { id: "feed", label: "Новости", href: "/", icon: <FeedIcon /> },
      { id: "shop", label: "Релизы", href: "/shop", icon: <ShopIcon /> },
      {
        id: "profile",
        label: "Профиль",
        href: "/profile",
        icon: profilePhotoUrl ? (
          <Image
            src={profilePhotoUrl}
            alt=""
            width={28}
            height={28}
            className={styles.profileAvatar}
          />
        ) : (
          <ProfileIcon />
        ),
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
    <div
      className={`${styles.shell} ${showNavigation ? "" : styles.shellNoNav}`}
      style={frameStyle}
    >
      {showNavigation ? (
        <aside className={styles.desktopSidebar}>
          <Link className={styles.desktopBrand} href="/">
            <span className={styles.desktopBrandDot} />
            <span>Culture3k</span>
          </Link>

          <nav
            className={styles.desktopNav}
            aria-label="Основная навигация desktop"
          >
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
            <strong>
              Показывайте награды, делитесь покупками, поддерживайте артистов.
            </strong>
          </div>
        </aside>
      ) : null}

      <div className={styles.frame}>
        <header
          className={`${styles.header} ${showNavigation ? "" : styles.headerNoNav}`}
        >
          <p className={styles.brand}>Culture3k Network</p>
          <p className={styles.title}>Elite Music Community</p>
        </header>

        <main
          className={`${styles.content} ${showNavigation ? styles.contentWithTabBar : ""}`}
        >
          {children}
        </main>

        <GlobalPlayerBar />

        {showNavigation ? (
          <div className={styles.mobileTabBarWrap}>
            <MiniTabBar
              activeIndex={activeIndex}
              items={tabs}
              onChange={navigateTo}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
