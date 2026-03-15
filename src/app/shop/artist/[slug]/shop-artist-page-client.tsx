"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type SVGProps } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import { useGlobalPlayer } from "@/components/player/global-player-provider";
import { StarsIcon } from "@/components/stars-icon";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { buildReleasePlaybackQueue } from "@/lib/player-release-queue";
import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import { markShopOrderPaymentFailed } from "@/lib/shop-orders-api";
import { payWithTelegramStars } from "@/lib/shop-payment";
import { readWalletBalanceCents, resolveViewerKey, spendWalletBalanceCents } from "@/lib/social-hub";
import { formatStarsFromCents, starsCentsToInvoiceStars } from "@/lib/stars-format";
import { hapticNotification, hapticSelection } from "@/lib/telegram";
import type { ArtistProfile, ShopOrder, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

interface ArtistPayload {
  artist?: ArtistProfile;
  tracks?: ShopProduct[];
  stats?: {
    donationsTotal?: number;
    activeSubscribers?: number;
  };
  error?: string;
}

interface SupportPayload {
  order?: ShopOrder;
  kind?: "donation" | "subscription";
  error?: string;
}

function PlayIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path d="M7 5.25L14.5 10L7 14.75V5.25Z" fill="currentColor" />
    </svg>
  );
}

function QueueIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" {...props}>
      <path
        d="M5 5.5h8.5M5 9.5h8.5M5 13.5h5.5M14.5 12v4M12.5 14h4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ArtistPageSkeleton() {
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

export function ShopArtistPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const { playQueue, enqueueTracks } = useGlobalPlayer();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [tracks, setTracks] = useState<ShopProduct[]>([]);
  const [stats, setStats] = useState({ donationsTotal: 0, activeSubscribers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [donationAmount, setDonationAmount] = useState("100");
  const [isPayingDonation, setIsPayingDonation] = useState(false);
  const [isPayingSubscription, setIsPayingSubscription] = useState(false);
  const [walletBalanceCents, setWalletBalanceCents] = useState(0);
  const [walletSupportMessage, setWalletSupportMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await fetch(`/api/shop/artists/${encodeURIComponent(slug)}`, {
          method: "GET",
          cache: "no-store",
        });
        const payload = (await response.json()) as ArtistPayload;

        if (!mounted) {
          return;
        }

        if (!response.ok || !payload.artist) {
          setError(payload.error ?? "Artist not found");
          setLoading(false);
          return;
        }

        setArtist(payload.artist);
        setTracks(payload.tracks ?? []);
        setStats({
          donationsTotal: Math.max(0, Math.round(Number(payload.stats?.donationsTotal ?? 0))),
          activeSubscribers: Math.max(0, Math.round(Number(payload.stats?.activeSubscribers ?? 0))),
        });
      } catch {
        if (mounted) {
          setError("Network error");
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      mounted = false;
    };
  }, [slug]);

  useEffect(() => {
    let mounted = true;

    void readWalletBalanceCents(viewerKey).then((balance) => {
      if (mounted) {
        setWalletBalanceCents(balance);
      }
    });

    return () => {
      mounted = false;
    };
  }, [viewerKey]);

  const donationAmountCents = useMemo(() => {
    const parsed = Math.round(Number(donationAmount));
    if (!Number.isFinite(parsed)) {
      return 100;
    }

    return Math.max(1, parsed);
  }, [donationAmount]);

  const playbackQueueByTrackId = useMemo(() => {
    return new Map(tracks.map((track) => [track.id, buildReleasePlaybackQueue(track)]));
  }, [tracks]);

  const runWalletSupport = async (kind: "donation" | "subscription") => {
    if (!artist) {
      return;
    }

    if (!user?.id) {
      setWalletSupportMessage("Для поддержки артиста войдите через Telegram Widget.");
      return;
    }

    const amountCents =
      kind === "donation" ? Math.max(1, donationAmountCents) : Math.max(1, artist.subscriptionPriceStarsCents);

    setWalletSupportMessage("");

    const payment = await spendWalletBalanceCents(viewerKey, amountCents);

    if (!payment.ok) {
      setWalletSupportMessage("Недостаточно Stars на внутреннем балансе.");
      hapticNotification("warning");
      return;
    }

    setWalletBalanceCents(payment.balanceCents);

    if (kind === "donation") {
      setStats((prev) => ({ ...prev, donationsTotal: prev.donationsTotal + amountCents }));
      setWalletSupportMessage("Донат отправлен с внутреннего баланса.");
    } else {
      setStats((prev) => ({ ...prev, activeSubscribers: prev.activeSubscribers + 1 }));
      setWalletSupportMessage("Подписка оформлена с внутреннего баланса.");
    }

    hapticNotification("success");
  };

  const runSupportPayment = async (kind: "donation" | "subscription") => {
    if (!artist) {
      return;
    }

    const amountStarsCents =
      kind === "subscription" ? Math.max(1, artist.subscriptionPriceStarsCents) : Math.max(1, donationAmountCents);

    if (kind === "donation") {
      setIsPayingDonation(true);
    } else {
      setIsPayingSubscription(true);
    }

    setError("");

    try {
      const response = await fetch(`/api/shop/artists/${encodeURIComponent(slug)}/support`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...getTelegramAuthHeaders(),
        },
        body: JSON.stringify({
          kind,
          amountStarsCents,
        }),
      });

      const payload = (await response.json()) as SupportPayload;

      if (!response.ok || !payload.order || !payload.kind) {
        setError(payload.error ?? "Не удалось создать оплату.");
        hapticNotification("error");
        return;
      }

      const invoiceStars = Math.max(1, starsCentsToInvoiceStars(amountStarsCents));
      const payment = await payWithTelegramStars({
        amountStars: invoiceStars,
        orderId: payload.order.id,
        title:
          payload.kind === "donation"
            ? `Донат артисту ${artist.displayName}`
            : `Подписка на ${artist.displayName}`,
        description:
          payload.kind === "donation"
            ? `Поддержка артиста ${artist.displayName} в C3K Showcase.`
            : `Ежемесячная подписка на артиста ${artist.displayName}.`,
        productIds: payload.order.items.map((item) => item.productId).slice(0, 3),
      });

      if (!payment.ok) {
        await markShopOrderPaymentFailed({
          orderId: payload.order.id,
          providerStatus: payment.status,
          reason: payment.message,
        });
        setError(payment.message ?? "Платеж не завершен.");
        hapticNotification("warning");
        return;
      }

      hapticNotification("success");
      router.push(`/orders/${encodeURIComponent(payload.order.id)}`);
    } catch {
      setError("Сетевая ошибка при запуске оплаты.");
      hapticNotification("error");
    } finally {
      setIsPayingDonation(false);
      setIsPayingSubscription(false);
    }
  };

  const handlePlayRelease = (trackId: string) => {
    const queue = playbackQueueByTrackId.get(trackId) ?? [];
    if (queue.length === 0) {
      setError("У релиза пока нет доступных preview-ссылок.");
      return;
    }

    setError("");
    playQueue(queue, 0);
    hapticSelection();
  };

  const handleQueueRelease = (trackId: string) => {
    const queue = playbackQueueByTrackId.get(trackId) ?? [];
    if (queue.length === 0) {
      setError("У релиза пока нет доступных preview-ссылок.");
      return;
    }

    setError("");
    enqueueTracks(queue);
    hapticSelection();
  };

  if (loading) {
    return (
      <>
        <BackButtonController onBack={() => router.back()} visible />
        <ArtistPageSkeleton />
      </>
    );
  }

  if (!artist) {
    return (
      <div className={styles.page}>
        <BackButtonController onBack={() => router.back()} visible />
        <p>{error || "Артист не найден"}</p>
        <Link href="/shop">Вернуться в магазин</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <BackButtonController onBack={() => router.back()} visible />
      <section className={styles.hero}>
        {artist.coverUrl ? (
          <Image
            src={artist.coverUrl}
            alt={artist.displayName}
            width={1200}
            height={320}
            className={styles.cover}
          />
        ) : null}

        <div className={styles.heroBody}>
          <div className={styles.identityRow}>
            <div className={styles.identityMeta}>
              <div className={styles.identityHeading}>
                <h1>{artist.displayName}</h1>
                <span className={styles.kicker}>Артист</span>
              </div>
              <p>{artist.bio || "Автор публикует релизы в витрине Culture3k."}</p>
            </div>

            {artist.avatarUrl ? (
              <Image
                src={artist.avatarUrl}
                alt={artist.displayName}
                width={60}
                height={60}
                className={styles.avatar}
              />
            ) : (
              <div className={styles.avatarFallback}>
                {artist.displayName.slice(0, 2).toUpperCase()}
              </div>
            )}
          </div>

          <div className={styles.stats}>
            <article>
              <span>Релизы</span>
              <strong>{tracks.length}</strong>
            </article>
            <article>
              <span>Подписчики</span>
              <strong>{artist.followersCount}</strong>
            </article>
            <article>
              <span>Донаты</span>
              <div className={styles.starsBadge}>
                <StarsIcon className={styles.starsIcon} />
                {formatStarsFromCents(stats.donationsTotal)}
              </div>
            </article>
            <article>
              <span>Подписка</span>
              <strong>{stats.activeSubscribers}</strong>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.supportGrid}>
        <article className={styles.supportPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Поддержка</span>
              <h2>Донат артисту</h2>
            </div>
            <div className={styles.starsBadge}>
              <StarsIcon className={styles.starsIcon} />
              {formatStarsFromCents(walletBalanceCents)}
            </div>
          </div>

          <p className={styles.panelText}>
            Быстрый способ поддержать релизы артиста с баланса приложения или через Stars.
          </p>

          <div className={styles.supportRow}>
            <input
              type="number"
              min={1}
              value={donationAmount}
              onChange={(event) => setDonationAmount(event.target.value)}
            />
            <button
              type="button"
              disabled={isPayingDonation || !artist.donationEnabled}
              onClick={() => void runSupportPayment("donation")}
            >
              {artist.donationEnabled
                ? isPayingDonation
                  ? "Оплата..."
                  : "Через Stars"
                : "Донаты отключены"}
            </button>
          </div>

          <button
            type="button"
            className={styles.walletAction}
            disabled={!artist.donationEnabled}
            onClick={() => void runWalletSupport("donation")}
          >
            С баланса приложения
          </button>
        </article>

        <article className={styles.supportPanel}>
          <div className={styles.sectionHeader}>
            <div>
              <span className={styles.sectionEyebrow}>Подписка</span>
              <h2>Поддержка по подписке</h2>
            </div>
            <div className={styles.starsBadge}>
              <StarsIcon className={styles.starsIcon} />
              {formatStarsFromCents(artist.subscriptionPriceStarsCents)}
            </div>
          </div>

          <p className={styles.panelText}>
            Оформите подписку и поддерживайте новые релизы артиста регулярно.
          </p>

          <button
            type="button"
            disabled={isPayingSubscription || !artist.subscriptionEnabled}
            onClick={() => void runSupportPayment("subscription")}
          >
            {artist.subscriptionEnabled
              ? isPayingSubscription
                ? "Оплата..."
                : "Оформить через Stars"
              : "Подписка отключена"}
          </button>

          <button
            type="button"
            className={styles.walletAction}
            disabled={!artist.subscriptionEnabled}
            onClick={() => void runWalletSupport("subscription")}
          >
            Оформить с баланса
          </button>
        </article>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}
      {walletSupportMessage ? <p className={styles.walletSupportMessage}>{walletSupportMessage}</p> : null}

      {!user && !isSessionLoading ? (
        <section className={styles.supportPanel}>
          <h2>Авторизация</h2>
          <p>Войдите через Telegram Widget, чтобы поддерживать артистов и оформлять подписку.</p>
          <TelegramLoginWidget
            onAuthorized={() => {
              void refreshSession();
            }}
          />
        </section>
      ) : null}

      <section className={styles.catalog}>
        <div className={styles.sectionHeader}>
          <div>
            <span className={styles.sectionEyebrow}>Каталог</span>
            <h2>Релизы артиста</h2>
          </div>
          <Link href="/shop" className={styles.inlineLink} onClick={() => hapticSelection()}>
            В каталог
          </Link>
        </div>
        {tracks.length === 0 ? (
          <p className={styles.empty}>Пока нет опубликованных треков.</p>
        ) : (
          <div className={styles.trackGrid}>
            {tracks.map((track) => (
              <article key={track.id} className={styles.trackCard}>
                <Link href={`/shop/${track.slug}`}>
                  <Image src={track.image} alt={track.title} width={90} height={64} />
                </Link>
                <div className={styles.trackMeta}>
                  <h3>{track.title}</h3>
                  <p>{track.subtitle}</p>
                  <div className={styles.starsBadge}>
                    <StarsIcon className={styles.starsIcon} />
                    {formatStarsFromCents(track.priceStarsCents)}
                  </div>
                </div>
                <div className={styles.trackActions}>
                  <button type="button" onClick={() => handlePlayRelease(track.id)} disabled={!playbackQueueByTrackId.get(track.id)?.length}>
                    <PlayIcon className={styles.actionIcon} />
                    Слушать
                  </button>
                  <button type="button" onClick={() => handleQueueRelease(track.id)} disabled={!playbackQueueByTrackId.get(track.id)?.length}>
                    <QueueIcon className={styles.actionIcon} />
                    В очередь
                  </button>
                  <Link href={`/shop/${track.slug}`}>Открыть релиз</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
