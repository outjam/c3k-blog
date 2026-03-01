"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "motion/react";

import { hapticImpact, hapticSelection } from "@/lib/telegram";
import type { BlogPost } from "@/data/posts";

import styles from "./post-card.module.scss";

interface PostCardProps {
  post: BlogPost;
  onOpen?: (post: BlogPost) => void;
}

export function PostCard({ post, onOpen }: PostCardProps) {
  const variantClassName = {
    feature: styles.featureCard,
    glass: styles.glassCard,
    minimal: styles.minimalCard,
  }[post.cardVariant];

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (event) => {
    hapticImpact("light");

    if (onOpen) {
      event.preventDefault();
      onOpen(post);
    }
  };

  const cardContent = (
    <>
      <motion.div
        className={styles.cardInner}
        whileTap={{ scale: 0.985, y: -1 }}
        transition={{ type: "spring", stiffness: 640, damping: 42, mass: 0.54 }}
      >
        {post.cardVariant === "minimal" ? (
          <div className={styles.minimalLayout}>
            <Image
              className={styles.thumb}
              src={post.cover.src}
              alt={post.cover.alt}
              width={post.cover.width}
              height={post.cover.height}
            />

            <div className={styles.minimalContent}>
              <h2 className={styles.title}>{post.title}</h2>
              <p className={styles.excerpt}>{post.excerpt}</p>
              <div className={styles.meta}>
                <span>{post.publishedAt}</span>
                <span>{post.readTime}</span>
              </div>
              <div className={styles.tags}>
                {post.tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    #{tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <>
            <Image
              className={styles.cover}
              src={post.cover.src}
              alt={post.cover.alt}
              width={post.cover.width}
              height={post.cover.height}
            />
            <h2 className={styles.title}>{post.title}</h2>
            <p className={styles.excerpt}>{post.excerpt}</p>
            <div className={styles.meta}>
              <span>{post.publishedAt}</span>
              <span>{post.readTime}</span>
            </div>
            <div className={styles.tags}>
              {post.tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  #{tag}
                </span>
              ))}
            </div>
          </>
        )}
      </motion.div>
    </>
  );

  return (
    <Link
      href={`/post/${post.slug}`}
      className={`${styles.card} ${variantClassName}`}
      onTouchStart={() => hapticSelection()}
      onClick={handleClick}
    >
      {cardContent}
    </Link>
  );
}
