"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getTelegramAuthHeaders } from "@/lib/telegram-init-data-client";
import { markShopOrderPaymentFailed } from "@/lib/shop-orders-api";
import { payWithTelegramStars } from "@/lib/shop-payment";
import { readShopCart, writeShopCart } from "@/lib/shop-storage";
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

export function ShopArtistPageClient({ slug }: { slug: string }) {
  const router = useRouter();
  const [artist, setArtist] = useState<ArtistProfile | null>(null);
  const [tracks, setTracks] = useState<ShopProduct[]>([]);
  const [stats, setStats] = useState({ donationsTotal: 0, activeSubscribers: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [donationAmount, setDonationAmount] = useState("100");
  const [isPayingDonation, setIsPayingDonation] = useState(false);
  const [isPayingSubscription, setIsPayingSubscription] = useState(false);

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

  const donationAmountCents = useMemo(() => {
    const parsed = Math.round(Number(donationAmount));
    if (!Number.isFinite(parsed)) {
      return 100;
    }

    return Math.max(1, parsed);
  }, [donationAmount]);

  const addTrackToCart = async (trackId: string) => {
    const cart = await readShopCart();
    const existing = cart.items.find((item) => item.productId === trackId);

    const nextItems = existing
      ? cart.items.map((item) => (item.productId === trackId ? { ...item, quantity: Math.min(item.quantity + 1, 99) } : item))
      : [...cart.items, { productId: trackId, quantity: 1 }];

    await writeShopCart({
      ...cart,
      items: nextItems,
    });
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

  if (loading) {
    return <div className={styles.page}>Загрузка артиста...</div>;
  }

  if (!artist) {
    return (
      <div className={styles.page}>
        <p>{error || "Артист не найден"}</p>
        <Link href="/shop">Вернуться в магазин</Link>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        {artist.coverUrl ? <img src={artist.coverUrl} alt={artist.displayName} className={styles.cover} /> : null}
        <div className={styles.heroBody}>
          <div className={styles.artistRow}>
            {artist.avatarUrl ? (
              <img src={artist.avatarUrl} alt={artist.displayName} className={styles.avatar} />
            ) : (
              <div className={styles.avatarFallback}>{artist.displayName.slice(0, 2).toUpperCase()}</div>
            )}
            <div>
              <h1>{artist.displayName}</h1>
              <p>{artist.bio || "Автор публикует релизы в витрине C3K."}</p>
            </div>
          </div>
          <div className={styles.stats}>
            <span>Треки: {tracks.length}</span>
            <span>Подписчики: {artist.followersCount}</span>
            <span>Донатов: {formatStarsFromCents(stats.donationsTotal)} ⭐</span>
            <span>Подписок: {stats.activeSubscribers}</span>
          </div>
        </div>
      </section>

      <section className={styles.support}>
        <div className={styles.supportCard}>
          <h2>Поддержать донатом</h2>
          <p>Сумма в cents Stars</p>
          <div className={styles.supportRow}>
            <input
              type="number"
              min={1}
              value={donationAmount}
              onChange={(event) => setDonationAmount(event.target.value)}
            />
            <button type="button" disabled={isPayingDonation || !artist.donationEnabled} onClick={() => void runSupportPayment("donation")}>
              {artist.donationEnabled ? (isPayingDonation ? "Оплата..." : "Донат") : "Донаты отключены"}
            </button>
          </div>
        </div>

        <div className={styles.supportCard}>
          <h2>Подписка</h2>
          <p>{formatStarsFromCents(artist.subscriptionPriceStarsCents)} ⭐ за период</p>
          <button
            type="button"
            disabled={isPayingSubscription || !artist.subscriptionEnabled}
            onClick={() => void runSupportPayment("subscription")}
          >
            {artist.subscriptionEnabled ? (isPayingSubscription ? "Оплата..." : "Оформить подписку") : "Подписка отключена"}
          </button>
        </div>
      </section>

      {error ? <p className={styles.error}>{error}</p> : null}

      <section className={styles.tracks}>
        <div className={styles.tracksHead}>
          <h2>Релизы артиста</h2>
          <Link href="/shop" onClick={() => hapticSelection()}>
            Назад в витрину
          </Link>
        </div>
        {tracks.length === 0 ? (
          <p className={styles.empty}>Пока нет опубликованных треков.</p>
        ) : (
          <div className={styles.trackGrid}>
            {tracks.map((track) => (
              <article key={track.id} className={styles.trackCard}>
                <Link href={`/shop/${track.slug}`}>
                  <img src={track.image} alt={track.title} loading="lazy" />
                </Link>
                <div>
                  <h3>{track.title}</h3>
                  <p>{track.subtitle}</p>
                  <strong>{formatStarsFromCents(track.priceStarsCents)} ⭐</strong>
                </div>
                <button type="button" onClick={() => void addTrackToCart(track.id)}>
                  В корзину
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
