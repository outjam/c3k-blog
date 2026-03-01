"use client";

import { useEffect, useRef } from "react";
import Image from "next/image";
import BlurEffect from "react-progressive-blur";
import { AnimatePresence, animate, motion, useMotionTemplate, useMotionValue, useTransform } from "motion/react";

import { RichPostContent } from "@/components/rich-post-content";
import type { BlogPost } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./post-preview-modal.module.scss";

interface PostPreviewModalProps {
  post: BlogPost | null;
  open: boolean;
  onClose: () => void;
}

const SHEET_CLOSE_OFFSET = 160;
const SHEET_CLOSE_VELOCITY = 980;
const SHEET_CLOSE_PROJECTION = 210;

export function PostPreviewModal({ post, open, onClose }: PostPreviewModalProps) {
  const y = useMotionValue(0);
  const isClosingRef = useRef(false);
  const backdropOpacity = useTransform(y, [0, 260], [1, 0.12]);
  const sheetScale = useTransform(y, [0, 420], [1, 0.94]);
  const sheetRadius = useTransform(y, [0, 320], [28, 40]);
  const sheetShadowOpacity = useTransform(y, [0, 320], [0.26, 0.06]);
  const sheetShadow = useMotionTemplate`0 -8px 34px rgba(0, 0, 0, ${sheetShadowOpacity})`;

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

  useEffect(() => {
    if (open) {
      isClosingRef.current = false;
      y.set(0);
    }
  }, [open, y]);

  if (!post) {
    return null;
  }

  const shellId = `post-shell-${post.slug}`;
  const imageId = `post-image-${post.slug}`;
  const titleId = `post-title-${post.slug}`;

  const closeWithMomentum = (velocity = 0) => {
    if (isClosingRef.current) {
      return;
    }

    isClosingRef.current = true;
    const target = Math.max(window.innerHeight + 40, y.get() + SHEET_CLOSE_PROJECTION);

    animate(y, target, {
      type: "spring",
      stiffness: 300,
      damping: 32,
      mass: 0.92,
      velocity,
      onComplete: () => {
        onClose();
        isClosingRef.current = false;
      },
    });
  };

  return (
    <AnimatePresence>
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
              closeWithMomentum(460);
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
            layoutId={shellId}
            transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.82 }}
            drag="y"
            dragDirectionLock
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.18 }}
            dragMomentum={false}
            onDragEnd={(_event, info) => {
              const projected = info.offset.y + info.velocity.y * 0.22;
              const shouldClose =
                projected > SHEET_CLOSE_OFFSET ||
                info.offset.y > SHEET_CLOSE_OFFSET ||
                info.velocity.y > SHEET_CLOSE_VELOCITY;

              if (shouldClose) {
                hapticImpact("medium");
                closeWithMomentum(info.velocity.y);
                return;
              }

              animate(y, 0, { type: "spring", stiffness: 460, damping: 38, mass: 0.66, velocity: info.velocity.y });
            }}
          >
            <div className={styles.handleWrap}>
              <div className={styles.handle} />
              <button
                type="button"
                className={styles.closeButton}
                onClick={() => {
                  hapticImpact("soft");
                  closeWithMomentum(560);
                }}
                aria-label="Закрыть"
              >
                ✕
              </button>
            </div>

            <header className={styles.hero}>
              <motion.div className={styles.imageWrap} layoutId={imageId}>
                <Image
                  src={post.cover.src}
                  alt={post.cover.alt}
                  width={post.cover.width}
                  height={post.cover.height}
                  className={styles.cover}
                  priority
                />
                <BlurEffect className={styles.heroTopBlur} intensity={24} position="top" />
                <BlurEffect className={styles.heroBottomBlur} intensity={56} position="bottom" />
                <div className={styles.heroMeta}>
                  <span>{post.tags[0] ?? "Разработка"}</span>
                  <span>{post.readTime}</span>
                </div>
              </motion.div>
              <motion.h2 layoutId={titleId}>{post.title}</motion.h2>
              <p>{post.excerpt}</p>
            </header>

            <section className={styles.content}>
              <RichPostContent blocks={post.content} />
            </section>
          </motion.article>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
