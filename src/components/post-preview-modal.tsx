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
}

const SHEET_CLOSE_OFFSET = 160;
const SHEET_CLOSE_VELOCITY = 980;
const OPEN_SPRING = { type: "spring" as const, stiffness: 300, damping: 36, mass: 0.8 };
const RETURN_SPRING = { type: "spring" as const, stiffness: 360, damping: 38, mass: 0.82 };
const HERO_LAYOUT_SPRING = { type: "spring" as const, stiffness: 280, damping: 34, mass: 0.86 };

export function PostPreviewModal({ post, sourceLayout, sourceReverse, open, onClose }: PostPreviewModalProps) {
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
  const bodyOpacity = useTransform(y, [0, 120], [1, 0.72]);
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

  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          className={styles.root}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
        >
          <motion.button
            type="button"
            className={styles.backdrop}
            style={{ opacity: backdropOpacity }}
            onClick={() => {
              hapticImpact("soft");
              closeToCard();
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
            transition={{ type: "spring", stiffness: 350, damping: 32, mass: 0.78 }}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragDirectionLock
            dragElastic={{ top: 0.01, bottom: 0.12 }}
            dragMomentum={false}
            dragTransition={{ bounceStiffness: 620, bounceDamping: 48 }}
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
              const projected = info.offset.y + info.velocity.y * 0.28;
              const shouldClose =
                projected > closeThreshold ||
                info.offset.y > closeThreshold ||
                info.velocity.y > SHEET_CLOSE_VELOCITY;

              if (shouldClose) {
                hapticImpact("medium");
                const snapTarget = sourceSnapOffsetRef.current;
                animate(y, snapTarget, {
                  type: "spring",
                  stiffness: 420,
                  damping: 42,
                  mass: 0.74,
                  velocity: Math.max(info.velocity.y, 240),
                  onComplete: closeToCard,
                });
                return;
              }

              animate(y, 0, { ...RETURN_SPRING, velocity: info.velocity.y });
            }}
          >
            <div
              className={styles.handleWrap}
              onPointerDown={startDragFromTopZone}
            >
              <div className={styles.handle} />
              <button
                type="button"
                className={styles.closeButton}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => {
                  hapticImpact("soft");
                  closeToCard();
                }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

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
                        <div className={cardStyles.largeTopMeta}>
                          <span>{post.tags[0] ?? "Разработка"}</span>
                          <span>{post.readTime}</span>
                        </div>
                        <span className={cardStyles.ribbon} aria-hidden>
                          ★
                        </span>
                      </div>
                      <div className={cardStyles.largeBottom}>
                        <h2 className={cardStyles.titleLarge}>{post.title}</h2>
                        <p className={cardStyles.excerptLarge}>{post.excerpt}</p>
                      </div>
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
                        <span className={cardStyles.ribbon} aria-hidden>
                          ★
                        </span>
                      </div>
                      <div className={cardStyles.smallContent}>
                        <h2 className={cardStyles.titleSmall}>{post.title}</h2>
                        <p className={cardStyles.excerptSmall}>{post.excerpt}</p>
                        <div className={cardStyles.meta}>
                          <span>{post.tags[0] ?? "Разработка"}</span>
                          <span>•</span>
                          <span>{post.readTime}</span>
                        </div>
                      </div>
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
                transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1], delay: 0.06 }}
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
