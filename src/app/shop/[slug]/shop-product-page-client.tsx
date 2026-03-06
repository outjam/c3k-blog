"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  addReleaseComment,
  appendPurchasedReleaseSlug,
  buildTelegramShareUrl,
  deleteReleaseComment,
  profileSlugFromIdentity,
  readReleaseComments,
  readWalletBalanceCents,
  resolveViewerKey,
  resolveViewerName,
  spendWalletBalanceCents,
} from "@/lib/social-hub";
import { readFavoriteProductIds, toggleFavoriteProductId } from "@/lib/product-favorites";
import { getDefaultTrackFormat, getFormatLabel, getProductPriceByFormat, getTrackFormats } from "@/lib/shop-release-format";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import type { ReleaseComment } from "@/types/social";
import type { ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

export function ShopProductPageClient({ product }: { product: ShopProduct }) {
  const router = useRouter();
  const { user } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const viewerSlug = useMemo(
    () =>
      profileSlugFromIdentity({
        username: user?.username,
        telegramUserId: user?.id,
        fallback: "guest",
      }),
    [user?.id, user?.username],
  );
  const viewerName = useMemo(() => resolveViewerName(user), [user]);
  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return process.env.NEXT_PUBLIC_APP_URL ?? "";
    }

    return window.location.origin;
  }, []);

  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(() => getDefaultTrackFormat(product));
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [walletMessage, setWalletMessage] = useState("");

  const [releaseComments, setReleaseComments] = useState<ReleaseComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");

  useEffect(() => {
    let mounted = true;

    void readFavoriteProductIds().then((ids) => {
      if (mounted) {
        setIsFavorite(ids.includes(product.id));
      }
    });

    void readWalletBalanceCents(viewerKey).then((balance) => {
      if (mounted) {
        setWalletBalanceCents(balance);
      }
    });

    void readReleaseComments(product.slug).then((comments) => {
      if (mounted) {
        setReleaseComments(comments);
      }
    });

    return () => {
      mounted = false;
    };
  }, [product.id, product.slug, viewerKey]);

  const addToCart = useCallback(async () => {
    const cart = await readShopCart();
    const exists = cart.items.find(
      (item) => item.productId === product.id && (item.selectedFormat ?? "") === (selectedFormat ?? ""),
    );

    const nextItems = exists
      ? cart.items.map((item) =>
          item.productId === product.id && (item.selectedFormat ?? "") === (selectedFormat ?? "")
            ? { ...item, quantity: Math.min(item.quantity + 1, 99) }
            : item,
        )
      : [...cart.items, { productId: product.id, quantity: 1, selectedFormat }];

    await writeShopCart({ ...cart, items: nextItems });
    hapticNotification("success");
  }, [product.id, selectedFormat]);

  const handleBack = useCallback(() => {
    hapticImpact("light");
    router.back();
  }, [router]);

  const toggleFavorite = useCallback(() => {
    void toggleFavoriteProductId(product.id).then((ids) => {
      const favorite = ids.includes(product.id);
      setIsFavorite(favorite);
      hapticNotification(favorite ? "success" : "warning");
    });
  }, [product.id]);

  const formats = getTrackFormats(product);
  const selectedPriceStarsCents = getProductPriceByFormat(product, selectedFormat);
  const releaseLabel = product.releaseType === "album" ? "Album" : product.releaseType === "ep" ? "EP" : "Single";
  const releaseTracklist = product.releaseTracklist ?? [];

  const buyWithWallet = async () => {
    setWalletMessage("");

    const payment = await spendWalletBalanceCents(viewerKey, selectedPriceStarsCents);

    if (!payment.ok) {
      setWalletMessage("Недостаточно средств на внутреннем балансе.");
      hapticNotification("warning");
      return;
    }

    await appendPurchasedReleaseSlug(viewerKey, product.slug);
    setWalletBalanceCents(payment.balanceCents);
    setWalletMessage("Покупка оформлена с внутреннего баланса. Релиз добавлен в профиль.");
    hapticNotification("success");
  };

  const sharePurchase = () => {
    const releaseUrl = appOrigin ? `${appOrigin}/shop/${product.slug}` : `/shop/${product.slug}`;
    const shareUrl = buildTelegramShareUrl(releaseUrl, `Купил релиз ${product.title} в Culture3k`);
    window.open(shareUrl, "_blank", "noopener,noreferrer");
  };

  const submitComment = async () => {
    if (commentSubmitting) {
      return;
    }

    setCommentSubmitting(true);

    const next = await addReleaseComment({
      releaseSlug: product.slug,
      text: commentDraft,
      authorSlug: viewerSlug,
      authorName: viewerName,
      authorUsername: user?.username,
      authorAvatarUrl: user?.photo_url,
    });

    setCommentSubmitting(false);

    if (next.length === releaseComments.length && commentDraft.trim().length < 2) {
      setWalletMessage("Комментарий слишком короткий.");
      return;
    }

    setCommentDraft("");
    setReleaseComments(next);
    hapticNotification("success");
  };

  const removeComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    const next = await deleteReleaseComment({
      releaseSlug: product.slug,
      commentId,
      viewerSlug,
    });
    setDeletingCommentId("");
    setReleaseComments(next);
  };

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <article className={styles.card}>
        <Image src={product.image} alt={product.title} width={640} height={480} className={styles.cover} priority />
        <div className={styles.body}>
          <p className={styles.subtitle}>{product.subtitle}</p>
          <h1>{product.title}</h1>
          <p className={styles.description}>{product.description}</p>
          {product.artistName ? (
            <p className={styles.subtitle}>
              Артист: {product.artistSlug ? <Link href={`/profile/${product.artistSlug}`}>{product.artistName}</Link> : product.artistName}
            </p>
          ) : null}
          <p className={styles.price}>{formatStarsFromCents(selectedPriceStarsCents)} ⭐</p>

          <dl className={styles.meta}>
            <div>
              <dt>Релиз</dt>
              <dd>{releaseLabel}</dd>
            </div>
            <div>
              <dt>Жанр</dt>
              <dd>{product.subcategoryLabel ?? product.attributes.collection}</dd>
            </div>
            <div>
              <dt>Треков</dt>
              <dd>{releaseTracklist.length || 1}</dd>
            </div>
            <div>
              <dt>Доступ</dt>
              <dd>Мгновенно после оплаты</dd>
            </div>
          </dl>

          <section className={styles.formatSection}>
            <p className={styles.sectionTitle}>Формат покупки</p>
            <div className={styles.formatGrid}>
              {formats.map((entry) => (
                <button
                  key={entry.format}
                  type="button"
                  className={`${styles.formatChip} ${selectedFormat === entry.format ? styles.formatChipActive : ""}`}
                  onClick={() => setSelectedFormat(entry.format)}
                >
                  <span>{getFormatLabel(entry.format)}</span>
                  <small>{formatStarsFromCents(entry.priceStarsCents)} ⭐</small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.tracklistSection}>
            <p className={styles.sectionTitle}>Треклист релиза</p>
            <ol className={styles.tracklist}>
              {releaseTracklist.length > 0 ? (
                releaseTracklist.map((track) => (
                  <li key={track.id}>
                    <span>{track.title}</span>
                    <small>
                      {track.durationSec
                        ? `${Math.floor(track.durationSec / 60)}:${String(track.durationSec % 60).padStart(2, "0")}`
                        : "—:—"}
                    </small>
                  </li>
                ))
              ) : (
                <li>
                  <span>{product.title}</span>
                  <small>—:—</small>
                </li>
              )}
            </ol>
          </section>

          <section className={styles.socialBuySection}>
            <p>
              Внутренний баланс: <strong>{formatStarsFromCents(walletBalanceCents)} ⭐</strong>
            </p>
            <div className={styles.socialBuyActions}>
              <button type="button" className={styles.addButton} onClick={buyWithWallet}>
                Купить с баланса
              </button>
              <button type="button" className={styles.addButton} onClick={sharePurchase}>
                Поделиться покупкой в Telegram
              </button>
            </div>
            {walletMessage ? <p className={styles.walletMessage}>{walletMessage}</p> : null}
          </section>

          <button type="button" className={styles.addButton} onClick={() => void addToCart()}>
            Добавить в корзину
          </button>
          <button type="button" className={styles.addButton} onClick={toggleFavorite}>
            {isFavorite ? "Убрать из избранного" : "В избранное"}
          </button>
          <button type="button" className={styles.addButton} onClick={() => router.push("/shop/cart")}>
            Перейти в корзину
          </button>

          <section className={styles.releaseCommentsSection}>
            <div className={styles.releaseCommentsHead}>
              <h2>Комментарии к релизу</h2>
              <p>{releaseComments.length}</p>
            </div>

            <div className={styles.commentComposer}>
              <textarea
                value={commentDraft}
                onChange={(event) => setCommentDraft(event.target.value)}
                maxLength={600}
                placeholder="Поделитесь впечатлениями о релизе"
              />
              <button type="button" className={styles.addButton} disabled={commentSubmitting} onClick={() => void submitComment()}>
                {commentSubmitting ? "Публикуем..." : "Отправить комментарий"}
              </button>
            </div>

            <div className={styles.commentsList}>
              {releaseComments.length > 0 ? (
                releaseComments.map((comment) => (
                  <article key={comment.id} className={styles.commentCard}>
                    <header>
                      <div>
                        <Link href={`/profile/${comment.authorSlug}`}>{comment.authorName}</Link>
                        <time>{new Date(comment.createdAt).toLocaleString("ru-RU")}</time>
                      </div>
                      {comment.authorSlug === viewerSlug ? (
                        <button
                          type="button"
                          disabled={deletingCommentId === comment.id}
                          onClick={() => void removeComment(comment.id)}
                        >
                          {deletingCommentId === comment.id ? "..." : "Удалить"}
                        </button>
                      ) : null}
                    </header>
                    <p>{comment.text}</p>
                  </article>
                ))
              ) : (
                <p className={styles.emptyComments}>Пока нет комментариев. Будьте первым.</p>
              )}
            </div>
          </section>
        </div>
      </article>
    </div>
  );
}
