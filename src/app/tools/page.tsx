"use client";

import Link from "next/link";

import styles from "./page.module.scss";

const TOOL_TILES = [
  {
    id: "track-cover",
    title: "Track Cover Finder",
    description: "Поиск обложек треков и подготовка метаданных для экспорта.",
    href: "/tools/track-cover",
    status: "Готово",
  },
  {
    id: "coming-soon-1",
    title: "Waveform Studio",
    description: "Предпросмотр волн и таймкодов для будущих аудио-инструментов.",
    href: "",
    status: "Скоро",
  },
  {
    id: "coming-soon-2",
    title: "Release Checklist",
    description: "Шаблоны карточек релизов для публикации в профиле и канале.",
    href: "",
    status: "Скоро",
  },
];

export default function ToolsPage() {
  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h1>Инструменты</h1>
        <p>Раздел внутренних mini-app утилит для блога, музыки и контента в Telegram.</p>
      </section>

      <section className={styles.grid}>
        {TOOL_TILES.map((tile) => {
          const isReady = Boolean(tile.href);

          if (!isReady) {
            return (
              <article key={tile.id} className={`${styles.tile} ${styles.tileDisabled}`}>
                <header>
                  <h2>{tile.title}</h2>
                  <span>{tile.status}</span>
                </header>
                <p>{tile.description}</p>
              </article>
            );
          }

          return (
            <Link key={tile.id} href={tile.href} className={styles.tile}>
              <header>
                <h2>{tile.title}</h2>
                <span>{tile.status}</span>
              </header>
              <p>{tile.description}</p>
              <strong>Открыть</strong>
            </Link>
          );
        })}
      </section>
    </div>
  );
}
