"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { BackButtonController } from "@/components/back-button-controller";
import { useGlobalPlayer } from "@/components/player/global-player-provider";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  buildTelegramShareUrl,
  type MintedReleaseNft,
  purchaseReleaseWithWallet,
  profileSlugFromIdentity,
  readMintedReleaseNfts,
  readPurchasedReleaseSlugs,
  readTonWalletAddress,
  readWalletBalanceCents,
  resolveViewerKey,
  writeTonWalletAddress,
} from "@/lib/social-hub";
import { buildReleasePlaybackQueue } from "@/lib/player-release-queue";
import {
  clearReleaseReactionApi,
  createReleaseCommentApi,
  deleteReleaseCommentApi,
  fetchReleaseSocialSnapshot,
  setReleaseReactionApi,
} from "@/lib/release-social-api";
import {
  readFavoriteProductIds,
  toggleFavoriteProductId,
} from "@/lib/product-favorites";
import {
  getDefaultTrackFormat,
  getFormatLabel,
  getProductPriceByFormat,
  getTrackFormats,
} from "@/lib/shop-release-format";
import { formatStarsFromCents } from "@/lib/stars-format";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { mintViaSponsoredTon } from "@/lib/ton-sponsored-api";
import {
  TON_ONCHAIN_NFT_MINT_ENABLED,
  TON_NETWORK_LABEL,
  isTonWalletOnRequiredNetwork,
  toPreferredTonAddress,
} from "@/lib/ton-network";
import {
  RELEASE_REACTION_OPTIONS,
  type ReleaseSocialSnapshot,
} from "@/types/release-social";
import type { ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

const buildWrongTonNetworkMessage = (): string => {
  return `Подключен кошелек не из сети ${TON_NETWORK_LABEL}. Переключите сеть и повторите.`;
};

export function ShopProductPageClient({ product }: { product: ShopProduct }) {
  const router = useRouter();
  const { playQueue } = useGlobalPlayer();
  const tonWallet = useTonWallet();
  const { user, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return process.env.NEXT_PUBLIC_APP_URL ?? "";
    }

    return window.location.origin;
  }, []);

  const [isFavorite, setIsFavorite] = useState(false);
  const [selectedFormat, setSelectedFormat] = useState(() =>
    getDefaultTrackFormat(product),
  );
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [ownedReleaseSlugs, setOwnedReleaseSlugs] = useState<string[]>([]);
  const [mintedReleaseNfts, setMintedReleaseNfts] = useState<
    MintedReleaseNft[]
  >([]);
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [walletMessage, setWalletMessage] = useState("");
  const [minting, setMinting] = useState(false);

  const [socialSnapshot, setSocialSnapshot] =
    useState<ReleaseSocialSnapshot | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");
  const [reactionSubmitting, setReactionSubmitting] = useState(false);
  const [mintDialogOpen, setMintDialogOpen] = useState(false);

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      readFavoriteProductIds(),
      readWalletBalanceCents(viewerKey),
      readPurchasedReleaseSlugs(viewerKey),
      readMintedReleaseNfts(viewerKey),
      readTonWalletAddress(viewerKey),
      fetchReleaseSocialSnapshot(product.slug),
    ]).then(
      ([
        favoriteIds,
        balance,
        purchasedReleaseSlugs,
        mintedReleaseNfts,
        persistedTonWalletAddress,
        releaseSocial,
      ]) => {
        if (!mounted) {
          return;
        }

        setIsFavorite(favoriteIds.includes(product.id));
        setWalletBalanceCents(balance);
        setOwnedReleaseSlugs(purchasedReleaseSlugs);
        setMintedReleaseNfts(mintedReleaseNfts);
        setTonWalletAddress(persistedTonWalletAddress);

        if (releaseSocial.snapshot) {
          setSocialSnapshot(releaseSocial.snapshot);
        }
      },
    );

    return () => {
      mounted = false;
    };
  }, [product.id, product.slug, viewerKey]);

  useEffect(() => {
    const connectedAddress = toPreferredTonAddress(
      String(tonWallet?.account?.address ?? "").trim(),
      tonWallet?.account?.chain,
    );

    if (!connectedAddress) {
      return;
    }

    if (connectedAddress === tonWalletAddress) {
      return;
    }

    void writeTonWalletAddress(viewerKey, connectedAddress);
  }, [
    tonWallet?.account?.address,
    tonWallet?.account?.chain,
    tonWalletAddress,
    viewerKey,
  ]);

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
  const selectedPriceStarsCents = getProductPriceByFormat(
    product,
    selectedFormat,
  );
  const releaseLabel =
    product.releaseType === "album"
      ? "Album"
      : product.releaseType === "ep"
        ? "EP"
        : "Single";
  const releaseTracklist = useMemo(
    () =>
      Array.isArray(product.releaseTracklist) ? product.releaseTracklist : [],
    [product.releaseTracklist],
  );
  const releaseQueue = useMemo(() => {
    return buildReleasePlaybackQueue(product);
  }, [product]);
  const isPurchased = useMemo(
    () => ownedReleaseSlugs.includes(product.slug),
    [ownedReleaseSlugs, product.slug],
  );
  const mintedNft = useMemo(
    () =>
      mintedReleaseNfts.find((entry) => entry.releaseSlug === product.slug) ??
      null,
    [mintedReleaseNfts, product.slug],
  );
  const isMintedInTon = Boolean(mintedNft);
  const resolvedTonWalletAddress = useMemo(
    () =>
      toPreferredTonAddress(
        String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
        tonWallet?.account?.chain,
      ),
    [tonWallet?.account?.address, tonWallet?.account?.chain, tonWalletAddress],
  );

  const handlePlayTrack = (index: number) => {
    if (releaseQueue.length === 0) {
      setWalletMessage("Для этого релиза пока нет доступных preview-ссылок.");
      return;
    }

    const startIndex = Math.max(0, Math.min(index, releaseQueue.length - 1));
    playQueue(releaseQueue, startIndex);
  };

  const handlePlayAll = () => {
    if (releaseQueue.length === 0) {
      setWalletMessage("Для этого релиза пока нет доступных preview-ссылок.");
      return;
    }

    playQueue(releaseQueue, 0);
  };

  const releaseComments = socialSnapshot?.comments ?? [];
  const releaseReactions = socialSnapshot?.reactions;
  const releaseReactionsTotal = useMemo(() => {
    if (!releaseReactions) {
      return 0;
    }

    return Object.values(releaseReactions).reduce(
      (acc, value) => acc + (Number.isFinite(value) ? value : 0),
      0,
    );
  }, [releaseReactions]);
  const commentComposerHint = user?.id
    ? "Короткий отзыв, впечатление от треклиста или любимый момент."
    : "Чтобы оставить комментарий, войдите через Telegram.";

  const resolveMintOwnerAddress = (): string | null => {
    if (!user?.id) {
      setWalletMessage("Для минта войдите через Telegram Widget.");
      return null;
    }

    if (!isPurchased) {
      setWalletMessage(
        "Сначала купите релиз, затем сможете сминтить NFT в TON.",
      );
      return null;
    }

    if (isMintedInTon) {
      setWalletMessage("Для этого релиза NFT уже сминчен в TON.");
      return null;
    }

    if (!TON_ONCHAIN_NFT_MINT_ENABLED) {
      setWalletMessage("On-chain mint выключен в конфиге приложения.");
      return null;
    }

    const connectedChain = String(tonWallet?.account?.chain ?? "").trim();
    if (!isTonWalletOnRequiredNetwork(connectedChain)) {
      setWalletMessage(buildWrongTonNetworkMessage());
      return null;
    }

    const connectedAddress = resolvedTonWalletAddress;
    if (!connectedAddress) {
      setWalletMessage("Подключите TON-кошелек через Ton Connect.");
      return null;
    }

    return connectedAddress;
  };

  const buyWithWallet = async () => {
    setWalletMessage("");

    if (!user?.id) {
      setWalletMessage("Для покупки войдите через Telegram Widget.");
      return;
    }

    if (isPurchased) {
      setWalletMessage("Этот релиз уже куплен. Повторная покупка недоступна.");
      return;
    }

    const payment = await purchaseReleaseWithWallet(viewerKey, {
      releaseSlug: product.slug,
      trackIds: releaseTracklist.map((track) => track.id),
      amountCents: selectedPriceStarsCents,
    });

    if (!payment.ok) {
      setWalletBalanceCents(payment.balanceCents);
      setOwnedReleaseSlugs(payment.releaseSlugs);

      if (payment.reason === "already_owned") {
        setWalletMessage(
          "Этот релиз уже куплен. Повторная покупка недоступна.",
        );
      } else {
        setWalletMessage("Недостаточно средств на внутреннем балансе.");
      }

      hapticNotification("warning");
      return;
    }

    setWalletBalanceCents(payment.balanceCents);
    setOwnedReleaseSlugs(payment.releaseSlugs);
    setWalletMessage(
      "Покупка оформлена с внутреннего баланса. Релиз добавлен в профиль.",
    );
    hapticNotification("success");
  };

  const openMintDialog = () => {
    if (!resolveMintOwnerAddress()) {
      return;
    }

    setWalletMessage("");
    setMintDialogOpen(true);
  };

  const handleMintNft = async () => {
    if (minting) {
      return;
    }

    const connectedAddress = resolveMintOwnerAddress();
    if (!connectedAddress) {
      return;
    }

    setMintDialogOpen(false);
    setMinting(true);
    setWalletMessage("");
    const mintResult = await mintViaSponsoredTon({
      releaseSlug: product.slug,
      ownerAddress: connectedAddress,
      collectionAddress:
        String(
          process.env.NEXT_PUBLIC_TON_NFT_COLLECTION_ADDRESS ?? "",
        ).trim() || undefined,
    });

    setMinting(false);

    if (!mintResult.ok) {
      setWalletBalanceCents(mintResult.walletCents);

      if (mintResult.reason === "insufficient_funds") {
        setWalletMessage(
          "Недостаточно средств на внутреннем балансе для оплаты газа on-chain mint.",
        );
        return;
      }

      if (mintResult.reason === "relay_unavailable") {
        setWalletMessage(
          mintResult.relayError ||
            "On-chain mint сейчас не настроен на сервере.",
        );
        return;
      }

      if (mintResult.reason === "relay_failed") {
        setWalletMessage(
          `Ошибка TON relayer: ${mintResult.relayError ?? "не удалось отправить транзакцию"}`,
        );
        return;
      }

      if (mintResult.reason === "not_purchased") {
        setWalletMessage("Нельзя запросить on-chain mint без покупки.");
        return;
      }

      setWalletMessage(
        mintResult.reason === "wallet_required"
          ? "Для on-chain mint нужен подключенный TON-кошелек."
          : "Не удалось выполнить on-chain mint.",
      );
      return;
    }

    setWalletBalanceCents(mintResult.walletCents);
    setMintedReleaseNfts(mintResult.mintedReleaseNfts);
    setTonWalletAddress(connectedAddress);
    setWalletMessage(
      mintResult.alreadyMinted
        ? "NFT для этого релиза уже был сминчен ранее."
        : `NFT сминчен в ${TON_NETWORK_LABEL}. Списано ${formatStarsFromCents(mintResult.gasDebitedCents)} ⭐ за газ.`,
    );
    hapticNotification("success");
  };

  const sharePurchase = () => {
    const releaseUrl = appOrigin
      ? `${appOrigin}/shop/${product.slug}`
      : `/shop/${product.slug}`;
    const shareUrl = buildTelegramShareUrl(
      releaseUrl,
      `Купил релиз ${product.title} в Culture3k`,
    );
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

  const handleSetReaction = async (
    reactionType: (typeof RELEASE_REACTION_OPTIONS)[number]["key"],
  ) => {
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
        <Image
          src={product.image}
          alt={product.title}
          width={640}
          height={480}
          className={styles.cover}
          priority
        />
        <div className={styles.body}>
          <p className={styles.subtitle}>{product.subtitle}</p>
          <div className={styles.titleRow}>
            <h1>{product.title}</h1>
            <button
              type="button"
              className={styles.favoriteButton}
              onClick={toggleFavorite}
            >
              {isFavorite ? "Сохранено" : "Сохранить"}
            </button>
          </div>
          {product.artistName ? (
            <p className={styles.artistLine}>
              Артист:{" "}
              {product.artistSlug ? (
                <Link href={`/profile/${product.artistSlug}`}>
                  {product.artistName}
                </Link>
              ) : (
                product.artistName
              )}
            </p>
          ) : null}
          <p className={styles.description}>{product.description}</p>
          <p className={styles.price}>
            {formatStarsFromCents(selectedPriceStarsCents)} ⭐
          </p>
          {isPurchased ? (
            <div className={styles.ownedBanner}>
              <span className={styles.ownedBadge}>Уже куплено</span>
              <div>
                <strong>Релиз уже находится в вашей коллекции</strong>
                <small>
                  Можно слушать его без ограничений и улучшить в NFT.
                </small>
              </div>
            </div>
          ) : null}

          <dl className={styles.meta}>
            <div>
              <dt>Релиз</dt>
              <dd>{releaseLabel}</dd>
            </div>
            <div>
              <dt>Жанр</dt>
              <dd>
                {product.subcategoryLabel ?? product.attributes.collection}
              </dd>
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
                  <small>
                    {formatStarsFromCents(entry.priceStarsCents)} ⭐
                  </small>
                </button>
              ))}
            </div>
          </section>

          <section className={styles.tracklistSection}>
            <div className={styles.tracklistHead}>
              <p className={styles.sectionTitle}>Треклист релиза</p>
              <button
                type="button"
                className={styles.playAllButton}
                onClick={handlePlayAll}
                disabled={releaseQueue.length === 0}
              >
                ▶ Слушать релиз
              </button>
            </div>
            <ol className={styles.tracklist}>
              {releaseTracklist.length > 0 ? (
                releaseTracklist.map((track, index) => (
                  <li key={track.id}>
                    <span className={styles.trackIndex}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <div className={styles.trackMeta}>
                      <strong>{track.title}</strong>
                      <small>
                        {track.durationSec
                          ? `${Math.floor(track.durationSec / 60)}:${String(track.durationSec % 60).padStart(2, "0")}`
                          : "Preview по кнопке"}
                      </small>
                    </div>
                    <button
                      type="button"
                      className={styles.trackPlayButton}
                      onClick={() => handlePlayTrack(index)}
                    >
                      ▶
                    </button>
                  </li>
                ))
              ) : (
                <li>
                  <span className={styles.trackIndex}>01</span>
                  <div className={styles.trackMeta}>
                    <strong>{product.title}</strong>
                    <small>Preview по кнопке</small>
                  </div>
                  <button
                    type="button"
                    className={styles.trackPlayButton}
                    onClick={() => handlePlayTrack(0)}
                  >
                    ▶
                  </button>
                </li>
              )}
            </ol>
          </section>

          {!isPurchased ? (
            <section className={styles.socialBuySection}>
              <div className={styles.releaseCommentsHead}>
                <h2>Покупка</h2>
                <p>не куплен</p>
              </div>
              <p>
                Кошелек приложения:{" "}
                <strong>{formatStarsFromCents(walletBalanceCents)} ⭐</strong>
              </p>
              <p className={styles.purchaseState}>
                После покупки релиз сразу появится в вашей коллекции.
              </p>
              <div className={styles.socialBuyActions}>
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={buyWithWallet}
                >
                  Купить с баланса
                </button>
                <button
                  type="button"
                  className={styles.addButton}
                  onClick={sharePurchase}
                >
                  Поделиться покупкой
                </button>
              </div>
              {walletMessage ? (
                <p className={styles.walletMessage}>{walletMessage}</p>
              ) : null}
            </section>
          ) : null}

          <section className={styles.nftSection}>
            <div className={styles.releaseCommentsHead}>
              <h2>NFT upgrade</h2>
              <p>
                {isMintedInTon
                  ? "выпущен"
                  : TON_ONCHAIN_NFT_MINT_ENABLED
                    ? TON_NETWORK_LABEL
                    : "disabled"}
              </p>
            </div>
            <p>
              {TON_ONCHAIN_NFT_MINT_ENABLED
                ? `После улучшения релиз будет выпущен как NFT в сети ${TON_NETWORK_LABEL} и придет на ваш TON-кошелек.`
                : "On-chain mint сейчас выключен. До включения релиз хранится только во внутреннем профиле приложения."}
            </p>
            <div className={styles.nftActions}>
              <TonConnectButton className={styles.tonConnectButton} />
              <button
                type="button"
                className={styles.addButton}
                disabled={
                  !isPurchased ||
                  isMintedInTon ||
                  minting ||
                  !TON_ONCHAIN_NFT_MINT_ENABLED
                }
                onClick={openMintDialog}
              >
                {isMintedInTon
                  ? "NFT уже выпущен"
                  : minting
                    ? "Минтим в TON..."
                    : "Улучшить фиктовку"}
              </button>
            </div>
            {isMintedInTon ? (
              <p className={styles.walletMessage}>
                NFT уже выпущен и закреплен за вашим релизом в{" "}
                {TON_NETWORK_LABEL}.
              </p>
            ) : null}
            {walletMessage && isPurchased ? (
              <p className={styles.walletMessage}>{walletMessage}</p>
            ) : null}
          </section>

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
                    aria-label={option.label}
                  >
                    <span className={styles.reactionEmoji}>{option.emoji}</span>
                    <small className={styles.reactionCount}>{total}</small>
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

            {user?.id ? (
              <div className={styles.commentComposer}>
                <div className={styles.commentComposerMeta}>
                  <p>{commentComposerHint}</p>
                  <span>{commentDraft.length}/600</span>
                </div>
                <textarea
                  value={commentDraft}
                  onChange={(event) => setCommentDraft(event.target.value)}
                  maxLength={600}
                  placeholder="Поделитесь впечатлениями о релизе"
                />
                <button
                  type="button"
                  className={styles.addButton}
                  disabled={
                    commentSubmitting || commentDraft.trim().length === 0
                  }
                  onClick={() => void submitComment()}
                >
                  {commentSubmitting ? "Публикуем..." : "Отправить комментарий"}
                </button>
              </div>
            ) : (
              <div className={styles.commentAuthState}>
                <p>{commentComposerHint}</p>
                <TelegramLoginWidget
                  onAuthorized={() => {
                    void refreshSession();
                  }}
                />
              </div>
            )}

            <div className={styles.commentsList}>
              {releaseComments.length > 0 ? (
                releaseComments.map((comment) => (
                  <article key={comment.id} className={styles.commentCard}>
                    <header>
                      <div className={styles.commentAuthor}>
                        {comment.author.photoUrl ? (
                          <Image
                            src={comment.author.photoUrl}
                            alt=""
                            width={36}
                            height={36}
                            className={styles.commentAvatar}
                          />
                        ) : (
                          <div className={styles.commentAvatarFallback}>
                            {(
                              `${comment.author.firstName ?? ""}${comment.author.lastName ?? ""}`.trim() ||
                              comment.author.username ||
                              "U"
                            )
                              .slice(0, 2)
                              .toUpperCase()}
                          </div>
                        )}

                        <div>
                          <Link
                            href={`/profile/${profileSlugFromIdentity({
                              username: comment.author.username,
                              telegramUserId: comment.author.telegramUserId,
                              fallback: `user-${comment.author.telegramUserId}`,
                            })}`}
                          >
                            {`${comment.author.firstName ?? ""} ${comment.author.lastName ?? ""}`.trim() ||
                              (comment.author.username
                                ? `@${comment.author.username}`
                                : `User ${comment.author.telegramUserId}`)}
                          </Link>
                          <time>
                            {new Date(comment.createdAt).toLocaleString(
                              "ru-RU",
                            )}
                          </time>
                        </div>
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
                <p className={styles.emptyComments}>
                  {user?.id
                    ? "Пока нет комментариев. Откройте обсуждение первым."
                    : "Пока нет комментариев. Авторизуйтесь и начните обсуждение."}
                </p>
              )}
            </div>
          </section>
        </div>
      </article>

      {mintDialogOpen ? (
        <div
          className={styles.modalBackdrop}
          onClick={() => setMintDialogOpen(false)}
        >
          <div
            className={styles.modalCard}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={styles.modalHead}>
              <h2>Улучшить фиктовку</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setMintDialogOpen(false)}
              >
                Закрыть
              </button>
            </div>

            <p className={styles.modalText}>
              Релиз будет выпущен как NFT в сети {TON_NETWORK_LABEL} и после
              подтверждения попадет на этот кошелек.
            </p>

            <div className={styles.modalWallet}>
              <span>Кошелек получателя</span>
              <code>{resolvedTonWalletAddress}</code>
            </div>

            <div className={styles.modalNotes}>
              <p>Mint запускается sponsored relay от имени приложения.</p>
              <p>
                После выпуска релиз останется в вашей коллекции и получит
                on-chain NFT-версию.
              </p>
            </div>

            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={() => setMintDialogOpen(false)}
              >
                Отмена
              </button>
              <button
                type="button"
                className={styles.addButton}
                onClick={() => void handleMintNft()}
                disabled={minting}
              >
                {minting ? "Минтим..." : `Mint NFT в ${TON_NETWORK_LABEL}`}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
