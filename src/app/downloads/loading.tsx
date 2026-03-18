import styles from "./page.module.scss";

export default function Loading() {
  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <div className={styles.skeletonStack} aria-hidden="true">
          <section className={styles.skeletonHero} />
          <section className={styles.skeletonMetrics}>
            <span />
            <span />
            <span />
          </section>
          <section className={styles.list}>
            {Array.from({ length: 4 }).map((_, index) => (
              <article key={index} className={styles.skeletonCard} />
            ))}
          </section>
        </div>
      </main>
    </div>
  );
}
