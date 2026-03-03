"use client";

import Image from "next/image";
import Link from "next/link";
import type { MouseEventHandler } from "react";

import { hapticImpact, hapticSelection } from "@/lib/telegram";
import type { BlogPost } from "@/data/posts";

import styles from "./post-card.module.scss";

interface PostCardProps {
  post: BlogPost;
  layout: "large" | "small";
  reverse?: boolean;
  isBookmarked?: boolean;
  onToggleBookmark?: (slug: string) => void;
}

export function PostCard({ post, layout, reverse = false, isBookmarked = false, onToggleBookmark }: PostCardProps) {
  const handleCardClick = () => {
    hapticImpact("light");
  };

  const toggleBookmark: MouseEventHandler<HTMLButtonElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    onToggleBookmark?.(post.slug);
  };

  return (
    <Link
      href={`/post/${post.slug}`}
      className={`${styles.card} ${layout === "large" ? styles.cardLarge : styles.cardSmall} ${reverse ? styles.cardReverse : ""}`}
      onTouchStart={() => hapticSelection()}
      onClick={handleCardClick}
    >
      <article className={styles.shell}>
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
              <button
                type="button"
                className={`${styles.bookmarkButton} ${isBookmarked ? styles.bookmarkButtonActive : ""}`}
                onClick={toggleBookmark}
                aria-label={isBookmarked ? "Убрать из закладок" : "Добавить в закладки"}
              >
                ★
              </button>
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
              <button
                type="button"
                className={`${styles.bookmarkButton} ${isBookmarked ? styles.bookmarkButtonActive : ""}`}
                onClick={toggleBookmark}
                aria-label={isBookmarked ? "Убрать из закладок" : "Добавить в закладки"}
              >
                ★
              </button>
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
      </article>
    </Link>
  );
}

