"use client";

import Image from "next/image";
import Link from "next/link";

import { hapticImpact, hapticSelection } from "@/lib/telegram";
import type { BlogPost } from "@/data/posts";

import styles from "./post-card.module.scss";

export function PostCard({ post }: { post: BlogPost }) {
  return (
    <Link
      href={`/post/${post.slug}`}
      className={styles.card}
      onTouchStart={() => hapticSelection()}
      onClick={() => hapticImpact("light")}
    >
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
    </Link>
  );
}
