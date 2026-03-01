"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";
import BlurEffect from "react-progressive-blur";
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
  const imageId = `post-image-${post.slug}`;
  const titleId = `post-title-${post.slug}`;

  return (
    <Link
      href={`/post/${post.slug}`}
      className={`${styles.card} ${layout === "large" ? styles.cardLarge : styles.cardSmall} ${
        reverse ? styles.cardReverse : ""
      } ${isHidden ? styles.cardHidden : ""}`}
      onTouchStart={() => hapticSelection()}
      onClick={handleClick}
    >
      <motion.article className={styles.shell} layoutId={shellId} transition={{ type: "spring", stiffness: 360, damping: 34, mass: 0.82 }}>
        {layout === "large" ? (
          <>
            <motion.div className={styles.largeImageWrap} layoutId={imageId}>
              <Image
                className={styles.largeImage}
                src={post.cover.src}
                alt={post.cover.alt}
                width={post.cover.width}
                height={post.cover.height}
                priority={false}
              />
              <BlurEffect className={styles.largeTopBlur} intensity={24} position="top" />
              <BlurEffect className={styles.largeBottomBlur} intensity={56} position="bottom" />
              <div className={styles.largeTopMeta}>
                <span>{post.tags[0] ?? "Разработка"}</span>
                <span>{post.readTime}</span>
              </div>
              <span className={styles.ribbon} aria-hidden>
                ★
              </span>
            </motion.div>

            <div className={styles.largeBottom}>
              <motion.h3 className={styles.titleLarge} layoutId={titleId}>
                {post.title}
              </motion.h3>
              <p className={styles.excerptLarge}>{post.excerpt}</p>
            </div>
          </>
        ) : (
          <div className={styles.smallGrid}>
            <motion.div className={styles.smallImageWrap} layoutId={imageId}>
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
            </motion.div>

            <div className={styles.smallContent}>
              <motion.h3 className={styles.titleSmall} layoutId={titleId}>
                {post.title}
              </motion.h3>
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
