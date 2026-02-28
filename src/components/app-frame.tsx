"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";

import { hapticSelection } from "@/lib/telegram";

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

const TAB_COUNT = 2;
const RAIL_INSET = 4;

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

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

export function AppFrame({ children }: AppFrameProps) {
  const router = useRouter();
  const pathname = usePathname();
  const sectionTitle = getSectionTitle(pathname);
  const isProfile = pathname.startsWith("/profile");
  const activeIndex = isProfile ? 1 : 0;
  const showTabBar = pathname === "/" || pathname.startsWith("/profile");
  const railRef = useRef<HTMLElement | null>(null);
  const [railInnerWidth, setRailInnerWidth] = useState(0);
  const capsuleX = useMotionValue(0);
  const maskX = useTransform(capsuleX, (value) => -value);

  const tabs = useMemo<TabItem[]>(() => ([
    { id: "blog", label: "Блог", href: "/", icon: <BlogIcon /> },
    { id: "profile", label: "Профиль", href: "/profile", icon: <ProfileIcon /> },
  ]), []);

  const itemWidth = railInnerWidth / TAB_COUNT;

  useEffect(() => {
    const node = railRef.current;

    if (!node) {
      return;
    }

    const updateSize = () => {
      const nextWidth = Math.max(node.clientWidth - RAIL_INSET * 2, 0);
      setRailInnerWidth(nextWidth);
    };

    updateSize();

    const observer = new ResizeObserver(updateSize);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!itemWidth) {
      return;
    }

    const controls = animate(capsuleX, activeIndex * itemWidth, {
      type: "spring",
      stiffness: 460,
      damping: 40,
      mass: 0.68,
    });

    return () => {
      controls.stop();
    };
  }, [activeIndex, capsuleX, itemWidth]);

  const navigateTo = (index: number) => {
    const safeIndex = clamp(index, 0, TAB_COUNT - 1);
    const nextTab = tabs[safeIndex];

    if (!nextTab) {
      return;
    }

    if (nextTab.href !== pathname) {
      hapticSelection();
      router.push(nextTab.href);
      return;
    }

    if (itemWidth) {
      animate(capsuleX, safeIndex * itemWidth, {
        type: "spring",
        stiffness: 460,
        damping: 40,
        mass: 0.68,
      });
    }
  };

  const handleCapsuleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!itemWidth) {
      return;
    }

    const draggedToIndex = capsuleX.get() >= itemWidth / 2 ? 1 : 0;
    const steppedByGesture = Math.abs(info.offset.x) > itemWidth * 0.24 || Math.abs(info.velocity.x) > 320;
    const direction = info.offset.x > 0 || info.velocity.x > 0 ? 1 : -1;
    const nextIndex = steppedByGesture ? clamp(activeIndex + direction, 0, TAB_COUNT - 1) : draggedToIndex;

    navigateTo(nextIndex);
  };

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
        <nav className={styles.tabBar} aria-label="Основная навигация" ref={railRef}>
          <motion.div
            className={styles.capsule}
            style={{ x: capsuleX, width: itemWidth || undefined }}
            drag="x"
            dragConstraints={{ left: 0, right: itemWidth || 0 }}
            dragElastic={0.08}
            dragMomentum={false}
            onDragEnd={handleCapsuleDragEnd}
          />

          <motion.div className={styles.maskLayer} style={{ x: capsuleX, width: itemWidth || undefined }}>
            <motion.div className={styles.maskTrack} style={{ x: maskX, width: railInnerWidth || undefined }}>
              {tabs.map((tab) => (
                <div className={`${styles.tab} ${styles.tabInverted}`} key={`mask-${tab.id}`} aria-hidden>
                  <span className={styles.tabIcon}>{tab.icon}</span>
                  <span className={styles.tabLabel}>{tab.label}</span>
                </div>
              ))}
            </motion.div>
          </motion.div>

          <div className={styles.tabLayer}>
            {tabs.map((tab, index) => (
              <button
                key={tab.id}
                type="button"
                className={styles.tab}
                aria-current={activeIndex === index ? "page" : undefined}
                onClick={() => navigateTo(index)}
              >
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </button>
            ))}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
