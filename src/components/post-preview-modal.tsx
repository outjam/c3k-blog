"use client";

import { useEffect } from "react";
import Image from "next/image";
import { AnimatePresence, animate, motion, useMotionValue, useTransform } from "motion/react";

import { RichPostContent } from "@/components/rich-post-content";
import type { BlogPost } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import styles from "./post-preview-modal.module.scss";

interface PostPreviewModalProps {
  post: BlogPost | null;
  open: boolean;
  onClose: () => void;
}

const SHEET_CLOSE_OFFSET = 140;
const SHEET_CLOSE_VELOCITY = 900;

export function PostPreviewModal({ post, open, onClose }: PostPreviewModalProps) {
  const y = useMotionValue(0);
  const backdropOpacity = useTransform(y, [0, 260], [1, 0.2]);

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
      y.set(0);
    }
  }, [open, y]);

  if (!post) {
    return null;
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.root}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.24, ease: "easeOut" }}
        >
          <motion.button
            type="button"
            className={styles.backdrop}
            style={{ opacity: backdropOpacity }}
            onClick={() => {
              hapticImpact("soft");
              onClose();
            }}
            aria-label="Закрыть предпросмотр"
          />

          <motion.article
            className={styles.sheet}
            style={{ y }}
            initial={{ y: "9%", scale: 0.975, opacity: 0.8 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: "10%", scale: 0.985, opacity: 0.86 }}
            transition={{ type: "spring", stiffness: 320, damping: 30, mass: 0.8 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.26 }}
            dragMomentum={false}
            onDragEnd={(_event, info) => {
              const shouldClose = info.offset.y > SHEET_CLOSE_OFFSET || info.velocity.y > SHEET_CLOSE_VELOCITY;

              if (shouldClose) {
                hapticImpact("medium");
                onClose();
                return;
              }

              animate(y, 0, { type: "spring", stiffness: 430, damping: 36, mass: 0.62 });
            }}
          >
            <div className={styles.handleWrap}>
              <div className={styles.handle} />
            </div>

            <header className={styles.hero}>
              <div className={styles.imageWrap}>
                <Image
                  src={post.cover.src}
                  alt={post.cover.alt}
                  width={post.cover.width}
                  height={post.cover.height}
                  className={styles.cover}
                  priority
                />
                <div className={styles.heroOverlay} />
                <div className={styles.heroMeta}>
                  <span>{post.tags[0] ?? "Статья"}</span>
                  <span>{post.readTime}</span>
                </div>
              </div>
              <h2>{post.title}</h2>
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
