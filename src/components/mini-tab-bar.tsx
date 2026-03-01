"use client";

import { type CSSProperties, useEffect, useRef, useState } from "react";
import { animate, motion, useMotionValue, useTransform, type PanInfo } from "motion/react";

import styles from "./mini-tab-bar.module.scss";
import GlassSurface from "./GlassSurface";

interface MiniTabBarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface MiniTabBarProps {
  activeIndex: number;
  items: MiniTabBarItem[];
  onChange: (index: number) => void;
}

const RAIL_INSET = 4;

const clamp = (value: number, min: number, max: number): number => {
  return Math.max(min, Math.min(value, max));
};

const snapSpring = {
  type: "spring" as const,
  stiffness: 520,
  damping: 40,
  mass: 0.62,
};

export function MiniTabBar({ activeIndex, items, onChange }: MiniTabBarProps) {
  const railRef = useRef<HTMLElement | null>(null);
  const [railInnerWidth, setRailInnerWidth] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isCapsulePressed, setIsCapsulePressed] = useState(false);
  const capsuleX = useMotionValue(0);
  const accentOffsetX = useTransform(capsuleX, (value) => -value);

  const tabCount = items.length;
  const tabs = items;
  const itemWidth = tabCount ? railInnerWidth / tabCount : 0;
  const maxX = itemWidth * Math.max(tabCount - 1, 0);
  const isReady = itemWidth > 0;

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
    if (!isCapsulePressed) {
      return;
    }

    const release = () => setIsCapsulePressed(false);
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);

    return () => {
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
  }, [isCapsulePressed]);

  useEffect(() => {
    if (!isReady) {
      return;
    }

    const target = clamp(activeIndex, 0, tabCount - 1) * itemWidth;
    const controls = animate(capsuleX, target, snapSpring);

    return () => controls.stop();
  }, [activeIndex, capsuleX, isReady, itemWidth, tabCount]);

  const handleNavigate = (index: number) => {
    const safeIndex = clamp(index, 0, tabCount - 1);
    onChange(safeIndex);
  };

  const handleCapsuleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (!isReady) {
      return;
    }

    const liveIndex = Math.round(capsuleX.get() / itemWidth);
    const fastSwipe = Math.abs(info.velocity.x) > 320;
    const longSwipe = Math.abs(info.offset.x) > itemWidth * 0.26;
    const direction = info.velocity.x > 0 || info.offset.x > 0 ? 1 : -1;
    const nextIndex = clamp(fastSwipe || longSwipe ? activeIndex + direction : liveIndex, 0, tabCount - 1);

    setIsDragging(false);

    if (nextIndex === activeIndex) {
      animate(capsuleX, activeIndex * itemWidth, snapSpring);
      return;
    }

    animate(capsuleX, nextIndex * itemWidth, snapSpring);
    handleNavigate(nextIndex);
  };

  if (!tabCount) {
    return null;
  }

  return (
    <nav
      className={styles.tabBar}
      aria-label="Основная навигация"
      ref={railRef}
      style={{ "--tab-count": tabCount } as CSSProperties}
    >
      <div className={styles.glassLayer} aria-hidden>
        <GlassSurface
          width="100%"
          height="100%"
          borderRadius={62}
          displace={0.5}
          distortionScale={-180}
          redOffset={0}
          greenOffset={10}
          blueOffset={20}
          brightness={52}
          opacity={0.9}
          mixBlendMode="screen"
        />
      </div>
      <div className={styles.tabBarTint} aria-hidden />

      <div className={styles.glowLeft} aria-hidden />
      <div className={styles.glowRight} aria-hidden />

      {isReady ? (
        <motion.div
          className={styles.capsuleWindow}
          style={{ x: capsuleX, width: itemWidth }}
          drag="x"
          dragConstraints={{ left: 0, right: maxX }}
          dragElastic={0}
          dragMomentum={false}
          dragTransition={{ bounceStiffness: 900, bounceDamping: 90 }}
          whileTap={{ scale: 1.012 }}
          whileDrag={{ scaleX: 1.03, scaleY: 0.97 }}
          transition={{ type: "spring", stiffness: 520, damping: 36, mass: 0.55 }}
          onPointerDown={() => setIsCapsulePressed(true)}
          onTouchStart={() => setIsCapsulePressed(true)}
          onTouchEnd={() => setIsCapsulePressed(false)}
          onTouchCancel={() => setIsCapsulePressed(false)}
          onDragStart={() => {
            setIsDragging(true);
            setIsCapsulePressed(true);
          }}
          onDragEnd={(event, info) => {
            setIsCapsulePressed(false);
            handleCapsuleDragEnd(event, info);
          }}
        >
          <div className={styles.capsuleGlass} aria-hidden />
          <motion.div
            className={styles.capsulePressGlass}
            aria-hidden
            initial={false}
            animate={{ opacity: isCapsulePressed ? 1 : 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <GlassSurface
              width="100%"
              height="100%"
              borderRadius={54}
              displace={0.45}
              distortionScale={-140}
              redOffset={0}
              greenOffset={8}
              blueOffset={16}
              brightness={54}
              opacity={0.94}
              mixBlendMode="screen"
            />
          </motion.div>
          <div className={styles.capsuleBg} />
          <div className={styles.capsuleShine} />
          <motion.div className={styles.accentTrack} style={{ x: accentOffsetX, width: railInnerWidth }}>
            {tabs.map((tab) => (
              <div className={`${styles.tab} ${styles.tabAccent}`} key={`accent-${tab.id}`} aria-hidden>
                <span className={styles.tabIcon}>{tab.icon}</span>
                <span className={styles.tabLabel}>{tab.label}</span>
              </div>
            ))}
          </motion.div>
        </motion.div>
      ) : null}

      <div className={styles.tabLayer}>
        {tabs.map((tab, index) => (
          <motion.button
            key={tab.id}
            type="button"
            className={styles.tabButton}
            aria-current={activeIndex === index ? "page" : undefined}
            onClick={() => handleNavigate(index)}
            whileTap={{ scale: 1.02 }}
            transition={{ type: "spring", stiffness: 600, damping: 40, mass: 0.52 }}
            disabled={isDragging}
          >
            <div className={styles.tab}>
              <span className={styles.tabIcon}>{tab.icon}</span>
              <span className={styles.tabLabel}>{tab.label}</span>
            </div>
          </motion.button>
        ))}
      </div>
    </nav>
  );
}
