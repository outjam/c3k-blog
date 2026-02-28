"use client";

import Image from "next/image";

import type { PostContentBlock } from "@/data/posts";

import { GallerySlider } from "./gallery-slider";
import styles from "./rich-post-content.module.scss";

export function RichPostContent({ blocks }: { blocks: PostContentBlock[] }) {
  return (
    <div className={styles.content}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        if (block.type === "paragraph") {
          return (
            <p key={key} className={styles.paragraph}>
              {block.text}
            </p>
          );
        }

        if (block.type === "heading") {
          return (
            <h3 key={key} className={styles.heading}>
              {block.text}
            </h3>
          );
        }

        if (block.type === "quote") {
          return (
            <blockquote key={key} className={styles.quote}>
              <p className={styles.quoteText}>{block.text}</p>
              {block.author ? <cite className={styles.quoteAuthor}>{block.author}</cite> : null}
            </blockquote>
          );
        }

        if (block.type === "image") {
          return (
            <figure key={key} className={styles.figure}>
              <Image
                className={styles.image}
                src={block.image.src}
                alt={block.image.alt}
                width={block.image.width}
                height={block.image.height}
              />
              {block.image.caption ? <figcaption className={styles.caption}>{block.image.caption}</figcaption> : null}
            </figure>
          );
        }

        if (block.type === "gallery") {
          return (
            <section key={key} className={styles.gallery}>
              {block.title ? <h4 className={styles.galleryTitle}>{block.title}</h4> : null}
              <GallerySlider images={block.images} />
            </section>
          );
        }

        if (block.ordered) {
          return (
            <ol key={key} className={styles.list}>
              {block.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          );
        }

        return (
          <ul key={key} className={styles.list}>
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        );
      })}
    </div>
  );
}
