import React from 'react';
import Image from "next/image";
import styles from './style.module.scss';

function CardPost() {
  return (
    <div className={styles.cardPost}>
      <div className={styles.cardPost__topBar}>
      <div className={styles.cardPost__topBar__detail}>
        <p className={styles.cardPost__topBar__detail__category}>Разработка</p>
        <p className={styles.cardPost__topBar__detail__readTime}>5 мин</p>
      </div>
      </div>
      <Image
        className={styles.cardPost__image}
        src="https://avatars.mds.yandex.net/i?id=7658c14856a4a7f770363b77d8fa3953_l-4600229-images-thumbs&n=13"
        alt=""
        fill
        sizes="(max-width: 800px) 100vw, 800px"
      />
      <div className={styles.cardPost__border} />
    </div>
  )
}

export default CardPost
