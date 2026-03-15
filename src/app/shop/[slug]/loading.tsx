import styles from "./page.module.scss";

export default function Loading() {
  return (
    <div className={styles.page}>
      <article className={styles.container}>
        <div className={styles.skeletonStack} aria-hidden="true">
          <section className={styles.skeletonHero}>
            <span className={styles.skeletonCover} />
            <div className={styles.skeletonMeta}>
              <span className={styles.skeletonKicker} />
              <span className={styles.skeletonTitle} />
              <span className={styles.skeletonLine} />
              <span className={styles.skeletonLineWide} />
              <div className={styles.skeletonActions}>
                <span className={styles.skeletonPill} />
                <span className={styles.skeletonPill} />
              </div>
            </div>
          </section>

          <section className={styles.skeletonSection}>
            <div className={styles.skeletonTabs} />
            {Array.from({ length: 5 }).map((_, index) => (
              <article key={index} className={styles.skeletonTrackRow}>
                <span className={styles.skeletonTrackIndex} />
                <div className={styles.skeletonTrackMeta}>
                  <span className={styles.skeletonLine} />
                  <span className={styles.skeletonLineShort} />
                </div>
                <span className={styles.skeletonPrice} />
                <span className={styles.skeletonButton} />
              </article>
            ))}
          </section>
        </div>
      </article>
    </div>
  );
}
