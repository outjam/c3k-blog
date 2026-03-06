"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { topUpWalletWithTelegramStars } from "@/lib/shop-payment";
import {
  readRedeemedTopupPromoCodes,
  readWalletBalanceCents,
  redeemTopupPromoCode,
  resolveViewerKey,
  topUpWalletBalanceCents,
} from "@/lib/social-hub";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { PromoDiscountType } from "@/types/shop";

import styles from "./page.module.scss";

const PRESET_STARS = [10, 25, 50] as const;

interface PromoRule {
  code: string;
  label: string;
  discountType: PromoDiscountType;
  discountValue: number;
}

const normalizePromoCode = (value: string): string => {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
};

const calcBonusCents = (baseCents: number, rule: PromoRule | null): number => {
  if (!rule) {
    return 0;
  }

  if (rule.discountType === "fixed") {
    return Math.max(0, Math.round(rule.discountValue));
  }

  const percent = Math.max(1, Math.min(100, Math.round(rule.discountValue)));
  return Math.max(0, Math.round((baseCents * percent) / 100));
};

export default function BalancePage() {
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);

  const [walletCents, setWalletCents] = useState(0);
  const [promoRules, setPromoRules] = useState<PromoRule[]>([]);
  const [redeemedCodes, setRedeemedCodes] = useState<string[]>([]);
  const [customStars, setCustomStars] = useState("25");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [loadingStars, setLoadingStars] = useState<number | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      readWalletBalanceCents(viewerKey),
      fetchPublicCatalog(),
      readRedeemedTopupPromoCodes(viewerKey),
    ]).then(([balance, catalog, redeemed]) => {
      if (!mounted) {
        return;
      }

      setWalletCents(balance);
      setPromoRules(
        (catalog.promoRules ?? []).map((rule) => ({
          code: normalizePromoCode(rule.code),
          label: rule.label,
          discountType: rule.discountType,
          discountValue: Math.max(0, Math.round(Number(rule.discountValue ?? 0))),
        })),
      );
      setRedeemedCodes(redeemed);
    });

    return () => {
      mounted = false;
    };
  }, [viewerKey]);

  const normalizedPromoCode = useMemo(() => normalizePromoCode(promoCodeInput), [promoCodeInput]);
  const selectedPromo = useMemo(
    () => promoRules.find((rule) => rule.code === normalizedPromoCode) ?? null,
    [normalizedPromoCode, promoRules],
  );
  const promoAlreadyRedeemed = useMemo(
    () => (normalizedPromoCode ? redeemedCodes.includes(normalizedPromoCode) : false),
    [normalizedPromoCode, redeemedCodes],
  );

  const runTopUp = async (amountStars: number) => {
    if (!user?.id) {
      setMessage("Чтобы пополнить баланс, сначала войдите через Telegram.");
      return;
    }

    const safeAmountStars = Math.max(1, Math.min(2000, Math.round(amountStars)));
    const baseCents = safeAmountStars * 100;
    const bonusCents = promoAlreadyRedeemed ? 0 : calcBonusCents(baseCents, selectedPromo);

    setLoadingStars(safeAmountStars);
    setMessage("");

    const payment = await topUpWalletWithTelegramStars({
      amountStars: safeAmountStars,
      title: "Пополнение баланса Culture3k",
      description: `Пополнение на ${safeAmountStars} Stars`,
    });

    if (!payment.ok) {
      setLoadingStars(null);
      setMessage(payment.message ?? "Пополнение не завершено.");
      return;
    }

    const creditedCents = baseCents + bonusCents;
    const nextBalance = await topUpWalletBalanceCents(viewerKey, creditedCents);
    setWalletCents(nextBalance);

    if (selectedPromo && bonusCents > 0 && normalizedPromoCode && !promoAlreadyRedeemed) {
      const redeemResult = await redeemTopupPromoCode(viewerKey, normalizedPromoCode);
      setRedeemedCodes(redeemResult.redeemedCodes);
    }

    setLoadingStars(null);
    setMessage(
      bonusCents > 0
        ? `Баланс пополнен на ${safeAmountStars} ⭐ + бонус ${formatStarsFromCents(bonusCents)} ⭐ по промокоду.`
        : `Баланс пополнен на ${safeAmountStars} ⭐.`,
    );
  };

  const customAmount = Math.max(1, Math.round(Number(customStars || "1")));

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.card}>
          <div className={styles.header}>
            <h1>Пополнение баланса</h1>
            <Link href="/profile">Назад в профиль</Link>
          </div>

          <p className={styles.balanceLine}>
            Текущий баланс: <strong>{formatStarsFromCents(walletCents)} ⭐</strong>
          </p>

          <div className={styles.presetRow}>
            {PRESET_STARS.map((amount) => (
              <button key={amount} type="button" disabled={loadingStars === amount} onClick={() => void runTopUp(amount)}>
                {loadingStars === amount ? "Оплата..." : `+${amount} ⭐`}
              </button>
            ))}
          </div>

          <div className={styles.customRow}>
            <label>
              Сумма пополнения (Stars)
              <input type="number" min={1} max={2000} value={customStars} onChange={(event) => setCustomStars(event.target.value)} />
            </label>
            <button type="button" disabled={loadingStars === customAmount} onClick={() => void runTopUp(customAmount)}>
              {loadingStars === customAmount ? "Оплата..." : "Пополнить"}
            </button>
          </div>

          <div className={styles.promoBlock}>
            <label>
              Промокод
              <input
                type="text"
                value={promoCodeInput}
                onChange={(event) => setPromoCodeInput(event.target.value)}
                placeholder="Введите промокод"
              />
            </label>
            {normalizedPromoCode ? (
              selectedPromo ? (
                promoAlreadyRedeemed ? (
                  <p className={styles.promoHint}>Промокод уже использован в вашем аккаунте.</p>
                ) : (
                  <p className={styles.promoHint}>
                    {selectedPromo.label} · бонус{" "}
                    {selectedPromo.discountType === "percent"
                      ? `${Math.max(1, Math.round(selectedPromo.discountValue))}%`
                      : `${formatStarsFromCents(Math.max(0, Math.round(selectedPromo.discountValue)))} ⭐`}
                  </p>
                )
              ) : (
                <p className={styles.promoHint}>Промокод не найден или неактивен.</p>
              )
            ) : null}
          </div>

          {message ? <p className={styles.message}>{message}</p> : null}
        </section>

        {!user && !isSessionLoading ? (
          <section className={styles.card}>
            <h2>Вход через Telegram</h2>
            <p>Пополнение доступно только после авторизации.</p>
            <TelegramLoginWidget
              onAuthorized={() => {
                void refreshSession();
              }}
            />
          </section>
        ) : null}
      </main>
    </div>
  );
}
