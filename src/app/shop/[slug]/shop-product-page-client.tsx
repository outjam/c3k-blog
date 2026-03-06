"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  appendPurchasedReleaseSlug,
  buildTelegramShareUrl,
  profileSlugFromIdentity,
  readWalletBalanceCents,
  resolveViewerKey,
  spendWalletBalanceCents,
} from "@/lib/social-hub";
import {
  clearReleaseReactionApi,
  createReleaseCommentApi,
  deleteReleaseCommentApi,
  fetchReleaseSocialSnapshot,
  setReleaseReactionApi,
} from "@/lib/release-social-api";
import { readFavoriteProductIds, toggleFavoriteProductId } from "@/lib/product-favorites";
import { getDefaultTrackFormat, getFormatLabel, getProductPriceByFormat, getTrackFormats } from "@/lib/shop-release-format";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { RELEASE_REACTION_OPTIONS, type ReleaseSocialSnapshot } from "@/types/release-social";
import type { ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

export function ShopProductPageClient({ product }: { product: ShopProduct }) {
  const router = useRouter();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
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

  const [socialSnapshot, setSocialSnapshot] = useState<ReleaseSocialSnapshot | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");
  const [reactionSubmitting, setReactionSubmitting] = useState(false);

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

    void fetchReleaseSocialSnapshot(product.slug).then((result) => {
      if (mounted && result.snapshot) {
        setSocialSnapshot(result.snapshot);
      }
    });

    return () => {
      mounted = false;
    };
  }, [product.id, product.slug, viewerKey]);

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
  const releaseComments = socialSnapshot?.comments ?? [];
  const releaseReactions = socialSnapshot?.reactions;
  const releaseReactionsTotal = useMemo(() => {
    if (!releaseReactions) {
      return 0;
    }

    return Object.values(releaseReactions).reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0);
  }, [releaseReactions]);

  const buyWithWallet = async () => {
    setWalletMessage("");

    if (!user?.id) {
      setWalletMessage("Для покупки войдите через Telegram Widget.");
      return;
    }

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

    if (!user?.id) {
      setWalletMessage("Для комментариев нужен вход через Telegram Widget.");
      return;
    }

    setCommentSubmitting(true);
    const result = await createReleaseCommentApi(product.slug, commentDraft);

    setCommentSubmitting(false);

    if (!result.snapshot) {
      setWalletMessage(result.error ?? "Не удалось отправить комментарий.");
      return;
    }

    setCommentDraft("");
    setSocialSnapshot(result.snapshot);
    hapticNotification("success");
  };

  const removeComment = async (commentId: string) => {
    setDeletingCommentId(commentId);
    const result = await deleteReleaseCommentApi(product.slug, commentId);
    setDeletingCommentId("");

    if (!result.snapshot) {
      setWalletMessage(result.error ?? "Не удалось удалить комментарий.");
      return;
    }

    setSocialSnapshot(result.snapshot);
  };

  const handleSetReaction = async (reactionType: (typeof RELEASE_REACTION_OPTIONS)[number]["key"]) => {
    if (reactionSubmitting) {
      return;
    }

    if (!user?.id) {
      setWalletMessage("Для реакций нужен вход через Telegram Widget.");
      return;
    }

    setReactionSubmitting(true);

    const currentReaction = socialSnapshot?.myReaction ?? null;
    const result =
      currentReaction === reactionType
        ? await clearReleaseReactionApi(product.slug)
        : await setReleaseReactionApi(product.slug, reactionType);

    setReactionSubmitting(false);

    if (!result.snapshot) {
      setWalletMessage(result.error ?? "Не удалось обновить реакцию.");
      return;
    }

    setSocialSnapshot(result.snapshot);
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

          <button type="button" className={styles.addButton} onClick={toggleFavorite}>
            {isFavorite ? "Убрать из избранного" : "В избранное"}
          </button>

          <section className={styles.releaseCommentsSection}>
            <div className={styles.releaseCommentsHead}>
              <h2>Реакции к релизу</h2>
              <p>{releaseReactionsTotal}</p>
            </div>

            <div className={styles.reactionRow}>
              {RELEASE_REACTION_OPTIONS.map((option) => {
                const isActive = socialSnapshot?.myReaction === option.key;
                const total = socialSnapshot?.reactions?.[option.key] ?? 0;

                return (
                  <button
                    key={option.key}
                    type="button"
                    className={`${styles.reactionButton} ${isActive ? styles.reactionButtonActive : ""}`}
                    disabled={reactionSubmitting}
                    onClick={() => void handleSetReaction(option.key)}
                  >
                    <span>{option.emoji}</span>
                    <small>{total}</small>
                  </button>
                );
              })}
            </div>
          </section>

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
                        <Link
                          href={`/profile/${profileSlugFromIdentity({
                            username: comment.author.username,
                            telegramUserId: comment.author.telegramUserId,
                            fallback: `user-${comment.author.telegramUserId}`,
                          })}`}
                        >
                          {`${comment.author.firstName ?? ""} ${comment.author.lastName ?? ""}`.trim() ||
                            (comment.author.username ? `@${comment.author.username}` : `User ${comment.author.telegramUserId}`)}
                        </Link>
                        <time>{new Date(comment.createdAt).toLocaleString("ru-RU")}</time>
                      </div>
                      {comment.canDelete ? (
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

          {!user && !isSessionLoading ? (
            <section className={styles.releaseCommentsSection}>
              <h2 className={styles.sectionTitle}>Авторизация</h2>
              <TelegramLoginWidget
                onAuthorized={() => {
                  void refreshSession();
                }}
              />
            </section>
          ) : null}
        </div>
      </article>
    </div>
  );
}
