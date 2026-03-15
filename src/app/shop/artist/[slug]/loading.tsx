import styles from "./page.module.scss";

export default function Loading() {
  return (
    <div className={styles.page}>
      <section className={styles.skeletonHero} aria-hidden="true">
        <span className={styles.skeletonAvatar} />
        <div className={styles.skeletonMeta}>
          <span className={styles.skeletonLineShort} />
          <span className={styles.skeletonTitle} />
          <span className={styles.skeletonLine} />
        </div>
      </section>

      <section className={styles.skeletonSupport} aria-hidden="true">
        <span className={styles.skeletonPanel} />
        <span className={styles.skeletonPanel} />
      </section>

      <section className={styles.skeletonGrid} aria-hidden="true">
        {Array.from({ length: 4 }).map((_, index) => (
          <article key={index} className={styles.skeletonRelease}>
            <span className={styles.skeletonReleaseMedia} />
            <span className={styles.skeletonLine} />
            <span className={styles.skeletonLineShort} />
          </article>
        ))}
      </section>
    </div>
  );
}
