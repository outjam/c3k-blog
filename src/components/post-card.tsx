"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import type { MouseEventHandler } from "react";

import { hapticImpact, hapticSelection } from "@/lib/telegram";
import type { BlogPost } from "@/data/posts";

import styles from "./post-card.module.scss";

interface PostCardProps {
  post: BlogPost;
  layout: "large" | "small";
  reverse?: boolean;
  isHidden?: boolean;
  onOpen?: (post: BlogPost) => void;
}

export function PostCard({ post, layout, reverse = false, isHidden = false, onOpen }: PostCardProps) {
  const handleClick: MouseEventHandler<HTMLAnchorElement> = (event) => {
    hapticImpact("light");

    if (onOpen) {
      event.preventDefault();
      onOpen(post);
    }
  };

  const shellId = `post-shell-${post.slug}`;

  return (
    <Link
      href={`/post/${post.slug}`}
      data-post-card={post.slug}
      className={`${styles.card} ${layout === "large" ? styles.cardLarge : styles.cardSmall} ${
        reverse ? styles.cardReverse : ""
      } ${isHidden ? styles.cardHidden : ""}`}
      onTouchStart={() => hapticSelection()}
      onClick={handleClick}
    >
      <motion.article
        className={styles.shell}
        layoutId={shellId}
        layout
        transition={{ type: "spring", stiffness: 280, damping: 34, mass: 0.86 }}
      >
        {layout === "large" ? (
          <>
            <div className={styles.largeImageWrap}>
              <Image
                className={styles.largeImage}
                src={post.cover.src}
                alt={post.cover.alt}
                width={post.cover.width}
                height={post.cover.height}
                priority={false}
              />
              <div className={styles.largeTopMeta}>
                <span>{post.tags[0] ?? "Разработка"}</span>
                <span>{post.readTime}</span>
              </div>
              <span className={styles.ribbon} aria-hidden>
                ★
              </span>
            </div>

            <div className={styles.largeBottom}>
              <h3 className={styles.titleLarge}>{post.title}</h3>
              <p className={styles.excerptLarge}>{post.excerpt}</p>
            </div>
          </>
        ) : (
          <div className={styles.smallGrid}>
            <div className={styles.smallImageWrap}>
              <Image
                className={styles.smallImage}
                src={post.cover.src}
                alt={post.cover.alt}
                width={post.cover.width}
                height={post.cover.height}
              />
              <span className={styles.ribbon} aria-hidden>
                ★
              </span>
            </div>

            <div className={styles.smallContent}>
              <h3 className={styles.titleSmall}>{post.title}</h3>
              <p className={styles.excerptSmall}>{post.excerpt}</p>
              <div className={styles.meta}>
                <span>{post.tags[0] ?? "Разработка"}</span>
                <span>•</span>
                <span>{post.readTime}</span>
              </div>
            </div>
          </div>
        )}
      </motion.article>
    </Link>
  );
}
