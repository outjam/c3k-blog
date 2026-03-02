"use client";

import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useRef } from "react";
import Image from "next/image";
import { AnimatePresence, animate, motion, useDragControls, useMotionTemplate, useMotionValue, useTransform } from "motion/react";

import { RichPostContent } from "@/components/rich-post-content";
import type { BlogPost } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./post-preview-modal.module.scss";
import cardStyles from "./post-card.module.scss";

interface PostPreviewModalProps {
  post: BlogPost | null;
  sourceLayout: "large" | "small";
  sourceReverse: boolean;
  open: boolean;
  onClose: () => void;
  onExited?: () => void;
}

const SHEET_CLOSE_OFFSET = 160;
const SHEET_CLOSE_VELOCITY = 820;
const TOP_DRAG_ZONE_HEIGHT = 220;
const OPEN_SPRING = { type: "spring" as const, stiffness: 220, damping: 34, mass: 0.96 };
const RETURN_SPRING = { type: "spring" as const, stiffness: 260, damping: 36, mass: 0.94 };
const HERO_LAYOUT_SPRING = { type: "spring" as const, stiffness: 210, damping: 32, mass: 1.02 };

export function PostPreviewModal({ post, sourceLayout, sourceReverse, open, onClose, onExited }: PostPreviewModalProps) {
  const dragControls = useDragControls();
  const y = useMotionValue(0);
  const isClosingRef = useRef(false);
  const didCrossCloseZoneRef = useRef(false);
  const closeThresholdRef = useRef(SHEET_CLOSE_OFFSET);
  const sourceSnapOffsetRef = useRef(SHEET_CLOSE_OFFSET);
  const heroShellRef = useRef<HTMLElement | null>(null);
  const backdropOpacity = useTransform(y, [0, 340], [1, 0.08]);
  const sheetScale = useTransform(y, [0, 420], [1, 0.95]);
  const sheetRadius = useTransform(y, [0, 320], [28, 40]);
  const sheetShadowOpacity = useTransform(y, [0, 320], [0.26, 0.06]);
  const sheetShadow = useMotionTemplate`0 -8px 34px rgba(0, 0, 0, ${sheetShadowOpacity})`;
  const uiOpacity = useTransform(y, [0, 260], [1, 0.16]);
  const bodyOpacity = useTransform(y, [0, 220], [1, 0.12]);
  const bodyOffset = useTransform(y, [0, 180], [0, 16]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const closeToCard = useCallback(() => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    requestAnimationFrame(() => onClose());
  }, [onClose]);

  const updateCloseMetrics = useCallback(() => {
    if (!post) {
      closeThresholdRef.current = SHEET_CLOSE_OFFSET;
      sourceSnapOffsetRef.current = SHEET_CLOSE_OFFSET;
      return;
    }

    const sourceCard = document.querySelector<HTMLElement>(`[data-post-card="${post.slug}"]`);
    const heroShell = heroShellRef.current;

    if (!sourceCard || !heroShell) {
      closeThresholdRef.current = SHEET_CLOSE_OFFSET;
      sourceSnapOffsetRef.current = SHEET_CLOSE_OFFSET;
      return;
    }

    const sourceRect = sourceCard.getBoundingClientRect();
    const heroRect = heroShell.getBoundingClientRect();
    const deltaToOrigin = Math.max(sourceRect.top - heroRect.top, 0);

    // Threshold is tied to source card location to allow "placing" the card back with drag.
    closeThresholdRef.current = Math.max(SHEET_CLOSE_OFFSET, Math.min(deltaToOrigin * 0.88, 540));
    sourceSnapOffsetRef.current = Math.max(SHEET_CLOSE_OFFSET, Math.min(deltaToOrigin, 640));
  }, [post]);

  const closeWithMotion = useCallback(
    (velocity = 280) => {
      if (isClosingRef.current) {
        return;
      }

      updateCloseMetrics();
      const snapTarget = sourceSnapOffsetRef.current;

      animate(y, snapTarget, {
        type: "spring",
        stiffness: 250,
        damping: 34,
        mass: 0.96,
        velocity,
        onComplete: closeToCard,
      });
    },
    [closeToCard, updateCloseMetrics, y],
  );

  useEffect(() => {
    if (open) {
      isClosingRef.current = false;
      didCrossCloseZoneRef.current = false;
      y.set(0);
      animate(y, 0, OPEN_SPRING);
      requestAnimationFrame(() => updateCloseMetrics());
    }
  }, [open, updateCloseMetrics, y]);

  if (!post) {
    return null;
  }

  const shellId = `post-shell-${post.slug}`;

  const startDragFromTopZone = (event: ReactPointerEvent<HTMLElement>) => {
    dragControls.start(event);
  };

  const startDragFromSheetTopZone = (event: ReactPointerEvent<HTMLElement>) => {
    const sheet = event.currentTarget;
    const topZoneStart = sheet.getBoundingClientRect().top;
    const pointerOffsetFromTop = event.clientY - topZoneStart;
    const canStartDragFromTop = pointerOffsetFromTop <= TOP_DRAG_ZONE_HEIGHT;
    const sheetAtTop = sheet.scrollTop <= 0;

    if (!sheetAtTop || !canStartDragFromTop) {
      return;
    }

    dragControls.start(event);
  };

  return (
    <AnimatePresence initial={false} onExitComplete={onExited}>
      {open ? (
        <motion.div
          className={styles.root}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.button
            type="button"
            className={styles.backdrop}
            style={{ opacity: backdropOpacity }}
            onClick={() => {
              hapticImpact("soft");
              closeWithMotion(260);
            }}
            aria-label="Закрыть предпросмотр"
          />

          <motion.article
            className={styles.sheet}
            style={{
              y,
              scale: sheetScale,
              borderTopLeftRadius: sheetRadius,
              borderTopRightRadius: sheetRadius,
              boxShadow: sheetShadow,
            }}
            transition={{ type: "spring", stiffness: 240, damping: 34, mass: 0.96 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragDirectionLock
            dragElastic={{ top: 0.01, bottom: 0.12 }}
            dragMomentum={false}
            dragTransition={{ bounceStiffness: 620, bounceDamping: 48 }}
            onPointerDown={startDragFromSheetTopZone}
            onDragStart={() => {
              didCrossCloseZoneRef.current = false;
              updateCloseMetrics();
            }}
            onDrag={(_event, info) => {
              if (isClosingRef.current) {
                return;
              }

              const currentOffset = Math.max(info.offset.y, 0);
              const threshold = closeThresholdRef.current;

              if (!didCrossCloseZoneRef.current && currentOffset >= threshold * 0.82) {
                didCrossCloseZoneRef.current = true;
                hapticImpact("light");
                return;
              }

              if (didCrossCloseZoneRef.current && currentOffset <= threshold * 0.68) {
                didCrossCloseZoneRef.current = false;
              }
            }}
            onDragEnd={(_event, info) => {
              if (isClosingRef.current) {
                return;
              }

              const closeThreshold = closeThresholdRef.current;
              const projected = info.offset.y + info.velocity.y * 0.26;
              const progress = info.offset.y / closeThreshold;
              const shouldClose =
                projected > closeThreshold * 0.92 ||
                progress > 0.84 ||
                info.velocity.y > SHEET_CLOSE_VELOCITY;

              if (shouldClose) {
                hapticImpact("medium");
                closeWithMotion(Math.max(info.velocity.y, 240));
                return;
              }

              animate(y, 0, { ...RETURN_SPRING, velocity: info.velocity.y });
            }}
          >
            <motion.div
              className={styles.handleWrap}
              style={{ opacity: uiOpacity }}
              onPointerDown={startDragFromTopZone}
            >
              <div className={styles.handle} />
              <button
                type="button"
                className={styles.closeButton}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  hapticImpact("soft");
                  closeWithMotion(240);
                }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </motion.div>

            <header className={styles.hero}>
              <div
                className={`${sourceLayout === "large" ? cardStyles.cardLarge : cardStyles.cardSmall} ${
                  sourceReverse ? cardStyles.cardReverse : ""
                }`}
              >
                <motion.article
                  ref={heroShellRef}
                  className={cardStyles.shell}
                  layoutId={shellId}
                  layout
                  transition={HERO_LAYOUT_SPRING}
                >
                  {sourceLayout === "large" ? (
                    <div className={styles.previewLarge} onPointerDown={startDragFromTopZone}>
                      <div className={cardStyles.largeImageWrap}>
                        <Image
                          src={post.cover.src}
                          alt={post.cover.alt}
                          width={post.cover.width}
                          height={post.cover.height}
                          className={cardStyles.largeImage}
                          priority
                        />
                        <motion.div className={cardStyles.largeTopMeta} style={{ opacity: uiOpacity }}>
                          <span>{post.tags[0] ?? "Разработка"}</span>
                          <span>{post.readTime}</span>
                        </motion.div>
                        <motion.span className={cardStyles.ribbon} style={{ opacity: uiOpacity }} aria-hidden>
                          ★
                        </motion.span>
                      </div>
                      <motion.div className={cardStyles.largeBottom} style={{ opacity: uiOpacity }}>
                        <h2 className={cardStyles.titleLarge}>{post.title}</h2>
                        <p className={cardStyles.excerptLarge}>{post.excerpt}</p>
                      </motion.div>
                    </div>
                  ) : (
                    <div className={cardStyles.smallGrid} onPointerDown={startDragFromTopZone}>
                      <div className={cardStyles.smallImageWrap}>
                        <Image
                          src={post.cover.src}
                          alt={post.cover.alt}
                          width={post.cover.width}
                          height={post.cover.height}
                          className={cardStyles.smallImage}
                          priority
                        />
                        <motion.span className={cardStyles.ribbon} style={{ opacity: uiOpacity }} aria-hidden>
                          ★
                        </motion.span>
                      </div>
                      <motion.div className={cardStyles.smallContent} style={{ opacity: uiOpacity }}>
                        <h2 className={cardStyles.titleSmall}>{post.title}</h2>
                        <p className={cardStyles.excerptSmall}>{post.excerpt}</p>
                        <div className={cardStyles.meta}>
                          <span>{post.tags[0] ?? "Разработка"}</span>
                          <span>•</span>
                          <span>{post.readTime}</span>
                        </div>
                      </motion.div>
                    </div>
                  )}
                </motion.article>
              </div>
            </header>

            <motion.section className={styles.content} style={{ opacity: bodyOpacity, y: bodyOffset }}>
              <motion.div
                key={post.slug}
                className={styles.contentInner}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.1 }}
              >
                <RichPostContent blocks={post.content} />
              </motion.div>
            </motion.section>
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
