"use client";

import Image from "next/image";
import { motion } from "motion/react";

import type { AnimationDemoId, PostContentBlock, TsxDemoId } from "@/data/posts";
import { hapticImpact } from "@/lib/telegram";

import { GallerySlider } from "./gallery-slider";
import styles from "./rich-post-content.module.scss";

function TsxDemo({ id }: { id: TsxDemoId }) {
  if (id === "theme-chip") {
    return (
      <div className={styles.tsxDemo}>
        <button type="button" className={styles.demoChip}>
          Theme · Light
        </button>
        <button type="button" className={styles.demoChip}>
          Theme · Dark
        </button>
      </div>
    );
  }

  if (id === "haptic-actions") {
    return (
      <div className={styles.tsxDemo}>
        <button type="button" className={styles.demoAction} onClick={() => hapticImpact("light")}>
          Haptic: Light
        </button>
        <button type="button" className={styles.demoAction} onClick={() => hapticImpact("medium")}>
          Haptic: Medium
        </button>
      </div>
    );
  }

  return (
    <div className={styles.tsxDemo}>
      <button type="button" className={styles.demoAction} onClick={() => hapticImpact("soft")}>
        WebApp Ready Action
      </button>
    </div>
  );
}

function AnimationDemo({ id }: { id: AnimationDemoId }) {
  if (id === "parallax-cards") {
    return (
      <div className={styles.animationParallax}>
        <motion.div className={styles.layerOne} animate={{ y: [0, -6, 0] }} transition={{ repeat: Infinity, duration: 3.2 }} />
        <motion.div className={styles.layerTwo} animate={{ y: [0, -10, 0] }} transition={{ repeat: Infinity, duration: 2.6 }} />
      </div>
    );
  }

  if (id === "pulse-grid") {
    return (
      <div className={styles.animationGrid}>
        {[0, 1, 2, 3].map((cell) => (
          <motion.span
            key={cell}
            className={styles.gridCell}
            animate={{ opacity: [0.35, 1, 0.35] }}
            transition={{ repeat: Infinity, duration: 1.5, delay: cell * 0.16 }}
          />
        ))}
      </div>
    );
  }

  return (
    <div className={styles.animationProgress}>
      <motion.div
        className={styles.progressLine}
        initial={{ width: "0%" }}
        animate={{ width: "100%" }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
      />
    </div>
  );
}

export function RichPostContent({ blocks }: { blocks: PostContentBlock[] }) {
  return (
    <div className={styles.content}>
      {blocks.map((block, index) => {
        const key = `${block.type}-${index}`;

        switch (block.type) {
          case "paragraph":
            return (
              <p key={key} className={styles.paragraph}>
                {block.text}
              </p>
            );

          case "heading":
            return (
              <h3 key={key} className={styles.heading}>
                {block.text}
              </h3>
            );

          case "quote":
            return (
              <blockquote key={key} className={styles.quote}>
                <p className={styles.quoteText}>{block.text}</p>
                {block.author ? <cite className={styles.quoteAuthor}>{block.author}</cite> : null}
              </blockquote>
            );

          case "image":
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

          case "gallery":
            return (
              <section key={key} className={styles.gallery}>
                {block.title ? <h4 className={styles.galleryTitle}>{block.title}</h4> : null}
                <GallerySlider images={block.images} />
              </section>
            );

          case "video":
            return (
              <figure key={key} className={styles.mediaFigure}>
                <video className={styles.video} controls playsInline preload="metadata" poster={block.video.poster}>
                  <source src={block.video.src} type="video/mp4" />
                </video>
                {block.video.caption ? <figcaption className={styles.caption}>{block.video.caption}</figcaption> : null}
              </figure>
            );

          case "audio":
            return (
              <figure key={key} className={styles.mediaFigure}>
                <figcaption className={styles.audioTitle}>{block.audio.title}</figcaption>
                <audio className={styles.audio} controls preload="none">
                  <source src={block.audio.src} type="audio/mpeg" />
                </audio>
                {block.audio.caption ? <figcaption className={styles.caption}>{block.audio.caption}</figcaption> : null}
              </figure>
            );

          case "model3d":
            return (
              <section key={key} className={styles.modelWrap}>
                <model-viewer
                  src={block.model.src}
                  ios-src={block.model.iosSrc}
                  poster={block.model.poster}
                  alt={block.model.alt}
                  camera-controls
                  auto-rotate
                  shadow-intensity="1"
                  style={{ width: "100%", height: "280px", borderRadius: "14px", background: "var(--tg-section-bg)" }}
                />
                {block.model.caption ? <p className={styles.caption}>{block.model.caption}</p> : null}
              </section>
            );

          case "tsx":
            return (
              <section key={key} className={styles.tsxBlock}>
                <h4 className={styles.galleryTitle}>{block.title}</h4>
                <pre className={styles.code}>
                  <code>{block.code}</code>
                </pre>
                <TsxDemo id={block.demoId} />
              </section>
            );

          case "animation":
            return (
              <section key={key} className={styles.tsxBlock}>
                <h4 className={styles.galleryTitle}>{block.title}</h4>
                <AnimationDemo id={block.demoId} />
                {block.caption ? <p className={styles.caption}>{block.caption}</p> : null}
              </section>
            );

          case "list":
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

          default:
            return null;
        }
      })}
    </div>
  );
}
