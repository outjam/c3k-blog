"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonConnectUI, useTonWallet } from "@tonconnect/ui-react";

import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import { fetchPublicCatalog } from "@/lib/admin-api";
import { topUpWalletWithTelegramStars } from "@/lib/shop-payment";
import {
  clearTonWalletAddress,
  readTonWalletAddress,
  readRedeemedTopupPromoCodes,
  readWalletBalanceCents,
  redeemTopupPromoCode,
  resolveViewerKey,
  topUpWalletBalanceFromTonCents,
  topUpWalletBalanceCents,
  writeTonWalletAddress,
} from "@/lib/social-hub";
import { formatStarsFromCents } from "@/lib/stars-format";
import {
  TON_NETWORK_LABEL,
  TON_REQUIRED_CHAIN,
  isTonWalletOnRequiredNetwork,
  resolveTonTransferRecipient,
  toPreferredTonAddress,
} from "@/lib/ton-network";
import type { PromoDiscountType } from "@/types/shop";

import styles from "./page.module.scss";

const PRESET_STARS = [10, 25, 50] as const;
const TON_NANO_PER_TON = 1_000_000_000;
const TON_TOPUP_STARS_CENTS_PER_TON = Math.max(
  1,
  Math.round(Number(process.env.NEXT_PUBLIC_TON_TOPUP_STARS_CENTS_PER_TON ?? "12000")),
);

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

const buildWrongTonNetworkMessage = (): string => {
  return `Подключен кошелек не из сети ${TON_NETWORK_LABEL}. Переключите сеть и повторите.`;
};

export default function BalancePage() {
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);

  const [walletCents, setWalletCents] = useState(0);
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [promoRules, setPromoRules] = useState<PromoRule[]>([]);
  const [redeemedCodes, setRedeemedCodes] = useState<string[]>([]);
  const [customStars, setCustomStars] = useState("25");
  const [customTon, setCustomTon] = useState("0.2");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [loadingStars, setLoadingStars] = useState<number | null>(null);
  const [loadingTon, setLoadingTon] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    void Promise.all([
      readWalletBalanceCents(viewerKey),
      fetchPublicCatalog(),
      readRedeemedTopupPromoCodes(viewerKey),
      readTonWalletAddress(viewerKey),
    ]).then(([balance, catalog, redeemed, persistedTonWalletAddress]) => {
      if (!mounted) {
        return;
      }

      setWalletCents(balance);
      setTonWalletAddress(persistedTonWalletAddress);
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
  const resolvedTonWalletAddress = useMemo(
    () => toPreferredTonAddress(String(tonWallet?.account?.address ?? tonWalletAddress).trim(), tonWallet?.account?.chain),
    [tonWallet?.account?.address, tonWallet?.account?.chain, tonWalletAddress],
  );
  const selectedPromo = useMemo(
    () => promoRules.find((rule) => rule.code === normalizedPromoCode) ?? null,
    [normalizedPromoCode, promoRules],
  );
  const promoAlreadyRedeemed = useMemo(
    () => (normalizedPromoCode ? redeemedCodes.includes(normalizedPromoCode) : false),
    [normalizedPromoCode, redeemedCodes],
  );

  useEffect(() => {
    const connectedAddress = toPreferredTonAddress(String(tonWallet?.account?.address ?? "").trim(), tonWallet?.account?.chain);

    if (!connectedAddress) {
      return;
    }

    if (connectedAddress === tonWalletAddress) {
      return;
    }

    void writeTonWalletAddress(viewerKey, connectedAddress);
  }, [tonWallet?.account?.address, tonWallet?.account?.chain, tonWalletAddress, viewerKey]);

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

  const runTonTopUp = async () => {
    if (!user?.id) {
      setMessage("Для крипто-пополнения сначала войдите через Telegram.");
      return;
    }

    const amountTon = Number(customTon);
    if (!Number.isFinite(amountTon) || amountTon <= 0) {
      setMessage("Введите корректную сумму TON.");
      return;
    }

    const amountNano = Math.max(1, Math.round(amountTon * TON_NANO_PER_TON));
    const connectedChain = String(tonWallet?.account?.chain ?? "").trim();
    if (!isTonWalletOnRequiredNetwork(connectedChain)) {
      setMessage(buildWrongTonNetworkMessage());
      return;
    }

    const connectedAddress = resolvedTonWalletAddress;
    if (!connectedAddress) {
      setMessage("Подключите TON-кошелек через Ton Connect.");
      return;
    }

    const { address: recipientAddress, usedSelfFallback } = resolveTonTransferRecipient({
      configuredAddress: String(process.env.NEXT_PUBLIC_TON_TOPUP_ADDRESS ?? ""),
      connectedAddress,
      connectedChain,
    });
    if (!recipientAddress) {
      setMessage("Не настроен TON-адрес для пополнений.");
      return;
    }

    setLoadingTon(true);
    setMessage("");

    let txHash = "";
    try {
      const txResult = await tonConnectUI.sendTransaction({
        validUntil: Math.floor(Date.now() / 1000) + 10 * 60,
        network: TON_REQUIRED_CHAIN,
        messages: [
          {
            address: recipientAddress,
            amount: String(amountNano),
          },
        ],
      });

      txHash = typeof txResult?.boc === "string" ? txResult.boc.slice(0, 256) : "";
    } catch {
      setLoadingTon(false);
      setMessage("Транзакция TON отменена или не подтверждена.");
      return;
    }

    const baseCents = Math.max(1, Math.round((amountNano / TON_NANO_PER_TON) * TON_TOPUP_STARS_CENTS_PER_TON));
    const bonusCents = promoAlreadyRedeemed ? 0 : calcBonusCents(baseCents, selectedPromo);
    const topup = await topUpWalletBalanceFromTonCents(viewerKey, baseCents + bonusCents, txHash);
    setWalletCents(topup.walletCents);
    setTonWalletAddress(connectedAddress);

    if (selectedPromo && bonusCents > 0 && normalizedPromoCode && !promoAlreadyRedeemed) {
      const redeemResult = await redeemTopupPromoCode(viewerKey, normalizedPromoCode);
      setRedeemedCodes(redeemResult.redeemedCodes);
    }

    setLoadingTon(false);
    setMessage(
      `TON-пополнение подтверждено: +${formatStarsFromCents(topup.creditedCents)} ⭐ на внутренний баланс.${usedSelfFallback ? " Testnet fallback: перевод выполнен на ваш же кошелек." : ""}`,
    );
  };

  const disconnectTonWallet = async () => {
    try {
      await tonConnectUI.disconnect();
    } catch {
      // ignore disconnect UI errors
    }

    setTonWalletAddress("");
    await clearTonWalletAddress(viewerKey);
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

          <div className={styles.tonBlock}>
            <div className={styles.tonHead}>
              <h2>TON Connect</h2>
              <TonConnectButton className={styles.tonConnectButton} />
            </div>
            <p className={styles.tonHint}>
              {resolvedTonWalletAddress
                ? `Кошелек подключен: ${resolvedTonWalletAddress.slice(0, 6)}...${resolvedTonWalletAddress.slice(-6)}`
                : "Подключите TON-кошелек для крипто-пополнения."}
            </p>
            <div className={styles.customRow}>
              <label>
                Сумма пополнения (TON)
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={customTon}
                  onChange={(event) => setCustomTon(event.target.value)}
                />
              </label>
              <button type="button" disabled={loadingTon} onClick={() => void runTonTopUp()}>
                {loadingTon ? "Транзакция..." : "Пополнить через TON"}
              </button>
            </div>
            {resolvedTonWalletAddress ? (
              <button type="button" className={styles.disconnectButton} onClick={() => void disconnectTonWallet()}>
                Отключить TON-кошелек
              </button>
            ) : null}
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
                    {" · применится к следующему пополнению Stars или TON"}
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
