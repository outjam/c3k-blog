"use client";

import Image from "next/image";
import { useState } from "react";

import type { PostImage } from "@/data/posts";
import { hapticImpact, hapticSelection } from "@/lib/telegram";

import styles from "./gallery-slider.module.scss";

interface GallerySliderProps {
  images: PostImage[];
}

export function GallerySlider({ images }: GallerySliderProps) {
  const [index, setIndex] = useState(0);

  const goTo = (nextIndex: number) => {
    const safe = (nextIndex + images.length) % images.length;
    setIndex(safe);
    hapticSelection();
  };

  if (!images.length) {
    return null;
  }

  return (
    <div className={styles.slider}>
      <div className={styles.viewport}>
        <div className={styles.track} style={{ transform: `translateX(-${index * 100}%)` }}>
          {images.map((image) => (
            <div className={styles.slide} key={image.src}>
              <Image
                className={styles.image}
                src={image.src}
                alt={image.alt}
                width={image.width}
                height={image.height}
              />
            </div>
          ))}
        </div>
      </div>

      <div className={styles.controls}>
        <div className={styles.buttons}>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              hapticImpact("light");
              goTo(index - 1);
            }}
          >
            Назад
          </button>
          <button
            className={styles.button}
            type="button"
            onClick={() => {
              hapticImpact("light");
              goTo(index + 1);
            }}
          >
            Вперед
          </button>
        </div>

        <div className={styles.dots}>
          {images.map((item, dotIndex) => (
            <button
              key={`${item.src}-${dotIndex}`}
              type="button"
              className={`${styles.dot} ${dotIndex === index ? styles.dotActive : ""}`}
              onClick={() => goTo(dotIndex)}
              aria-label={`Слайд ${dotIndex + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
