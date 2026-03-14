"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  TonConnectButton,
  useTonConnectUI,
  useTonWallet,
} from "@tonconnect/ui-react";

import { BackButtonController } from "@/components/back-button-controller";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { StarsIcon } from "@/components/stars-icon";
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

type TopUpTab = "stars" | "ton";
type NoticeTone = "success" | "error" | "neutral";

const PRESET_STARS = [10, 25, 50] as const;
const TON_NANO_PER_TON = 1_000_000_000;
const TON_TOPUP_STARS_CENTS_PER_TON = Math.max(
  1,
  Math.round(
    Number(process.env.NEXT_PUBLIC_TON_TOPUP_STARS_CENTS_PER_TON ?? "12000"),
  ),
);

interface PromoRule {
  code: string;
  label: string;
  discountType: PromoDiscountType;
  discountValue: number;
}

function TonGlyph() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M6.5 6.75c0-.69.56-1.25 1.25-1.25h8.5c.69 0 1.25.56 1.25 1.25 0 .22-.06.44-.17.64l-4.25 7.25a1.25 1.25 0 0 1-2.16 0L6.67 7.39a1.25 1.25 0 0 1-.17-.64Zm2.3.25L12 12.44 15.2 7H8.8Z"
        fill="currentColor"
      />
      <path
        d="M12 3.5c-4.7 0-8.5 3.8-8.5 8.5s3.8 8.5 8.5 8.5 8.5-3.8 8.5-8.5-3.8-8.5-8.5-8.5Zm0 1.5a7 7 0 1 1 0 14 7 7 0 0 1 0-14Z"
        fill="currentColor"
      />
    </svg>
  );
}

interface NoticeState {
  tone: NoticeTone;
  text: string;
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

const formatShortTonAddress = (value: string): string => {
  if (value.length <= 14) {
    return value;
  }

  return `${value.slice(0, 6)}...${value.slice(-6)}`;
};

const buildWrongTonNetworkMessage = (): string => {
  return `Подключен кошелек не из сети ${TON_NETWORK_LABEL}. Переключите сеть и повторите.`;
};

export default function BalancePage() {
  const router = useRouter();
  const [tonConnectUI] = useTonConnectUI();
  const tonWallet = useTonWallet();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);

  const [currentTab, setCurrentTab] = useState<TopUpTab>("stars");
  const [walletCents, setWalletCents] = useState(0);
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [promoRules, setPromoRules] = useState<PromoRule[]>([]);
  const [redeemedCodes, setRedeemedCodes] = useState<string[]>([]);
  const [customStars, setCustomStars] = useState("25");
  const [customTon, setCustomTon] = useState("0.2");
  const [promoCodeInput, setPromoCodeInput] = useState("");
  const [loadingStars, setLoadingStars] = useState<number | null>(null);
  const [loadingTon, setLoadingTon] = useState(false);
  const [notice, setNotice] = useState<NoticeState | null>(null);

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

  const normalizedPromoCode = useMemo(
    () => normalizePromoCode(promoCodeInput),
    [promoCodeInput],
  );
  const resolvedTonWalletAddress = useMemo(
    () =>
      toPreferredTonAddress(
        String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
        tonWallet?.account?.chain,
      ),
    [tonWallet?.account?.address, tonWallet?.account?.chain, tonWalletAddress],
  );
  const selectedPromo = useMemo(
    () => promoRules.find((rule) => rule.code === normalizedPromoCode) ?? null,
    [normalizedPromoCode, promoRules],
  );
  const promoAlreadyRedeemed = useMemo(
    () =>
      normalizedPromoCode
        ? redeemedCodes.includes(normalizedPromoCode)
        : false,
    [normalizedPromoCode, redeemedCodes],
  );

  useEffect(() => {
    const connectedAddress = toPreferredTonAddress(
      String(tonWallet?.account?.address ?? "").trim(),
      tonWallet?.account?.chain,
    );

    if (!connectedAddress || connectedAddress === tonWalletAddress) {
      return;
    }

    void writeTonWalletAddress(viewerKey, connectedAddress);
  }, [
    tonWallet?.account?.address,
    tonWallet?.account?.chain,
    tonWalletAddress,
    viewerKey,
  ]);

  const topUpTabs = useMemo(
    () => [
      { id: "stars", label: "Stars" },
      { id: "ton", label: "TON" },
    ],
    [],
  );

  const activeTabIndex = currentTab === "ton" ? 1 : 0;
  const customAmount = Math.max(1, Math.round(Number(customStars || "1")));

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/profile");
  };

  const runTopUp = async (amountStars: number) => {
    if (!user?.id) {
      setNotice({
        tone: "error",
        text: "Чтобы пополнить баланс, сначала войдите через Telegram.",
      });
      return;
    }

    const safeAmountStars = Math.max(1, Math.min(2000, Math.round(amountStars)));
    const baseCents = safeAmountStars * 100;
    const bonusCents = promoAlreadyRedeemed
      ? 0
      : calcBonusCents(baseCents, selectedPromo);

    setLoadingStars(safeAmountStars);
    setNotice(null);

    const payment = await topUpWalletWithTelegramStars({
      amountStars: safeAmountStars,
      title: "Пополнение баланса Culture3k",
      description: `Пополнение на ${safeAmountStars} Stars`,
    });

    if (!payment.ok) {
      setLoadingStars(null);
      setNotice({
        tone: "error",
        text: payment.message ?? "Пополнение не завершено.",
      });
      return;
    }

    const creditedCents = baseCents + bonusCents;
    const nextBalance = await topUpWalletBalanceCents(viewerKey, creditedCents);
    setWalletCents(nextBalance);

    if (
      selectedPromo &&
      bonusCents > 0 &&
      normalizedPromoCode &&
      !promoAlreadyRedeemed
    ) {
      const redeemResult = await redeemTopupPromoCode(
        viewerKey,
        normalizedPromoCode,
      );
      setRedeemedCodes(redeemResult.redeemedCodes);
    }

    setLoadingStars(null);
    setNotice({
      tone: "success",
      text:
        bonusCents > 0
          ? `Баланс пополнен. Начислено ${safeAmountStars} Stars и бонус ${formatStarsFromCents(bonusCents)}.`
          : `Баланс пополнен на ${safeAmountStars} Stars.`,
    });
  };

  const runTonTopUp = async () => {
    if (!user?.id) {
      setNotice({
        tone: "error",
        text: "Для крипто-пополнения сначала войдите через Telegram.",
      });
      return;
    }

    const amountTon = Number(customTon);
    if (!Number.isFinite(amountTon) || amountTon <= 0) {
      setNotice({ tone: "error", text: "Введите корректную сумму TON." });
      return;
    }

    const amountNano = Math.max(1, Math.round(amountTon * TON_NANO_PER_TON));
    const connectedChain = String(tonWallet?.account?.chain ?? "").trim();

    if (!isTonWalletOnRequiredNetwork(connectedChain)) {
      setNotice({ tone: "error", text: buildWrongTonNetworkMessage() });
      return;
    }

    const connectedAddress = resolvedTonWalletAddress;
    if (!connectedAddress) {
      setNotice({
        tone: "error",
        text: "Подключите TON-кошелек через Ton Connect.",
      });
      return;
    }

    const { address: recipientAddress, usedSelfFallback } =
      resolveTonTransferRecipient({
        configuredAddress: String(process.env.NEXT_PUBLIC_TON_TOPUP_ADDRESS ?? ""),
        connectedAddress,
        connectedChain,
      });

    if (!recipientAddress) {
      setNotice({
        tone: "error",
        text: "Не настроен TON-адрес для пополнений.",
      });
      return;
    }

    setLoadingTon(true);
    setNotice(null);

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
      setNotice({
        tone: "error",
        text: "Транзакция TON отменена или не подтверждена.",
      });
      return;
    }

    const baseCents = Math.max(
      1,
      Math.round((amountNano / TON_NANO_PER_TON) * TON_TOPUP_STARS_CENTS_PER_TON),
    );
    const bonusCents = promoAlreadyRedeemed
      ? 0
      : calcBonusCents(baseCents, selectedPromo);

    const topup = await topUpWalletBalanceFromTonCents(
      viewerKey,
      baseCents + bonusCents,
      txHash,
    );
    setWalletCents(topup.walletCents);
    setTonWalletAddress(connectedAddress);

    if (
      selectedPromo &&
      bonusCents > 0 &&
      normalizedPromoCode &&
      !promoAlreadyRedeemed
    ) {
      const redeemResult = await redeemTopupPromoCode(
        viewerKey,
        normalizedPromoCode,
      );
      setRedeemedCodes(redeemResult.redeemedCodes);
    }

    setLoadingTon(false);
    setNotice({
      tone: "success",
      text: `TON-пополнение подтверждено. На баланс начислено ${formatStarsFromCents(topup.creditedCents)}.${usedSelfFallback ? " Использован testnet fallback." : ""}`,
    });
  };

  const disconnectTonWallet = async () => {
    try {
      await tonConnectUI.disconnect();
    } catch {
      // ignore disconnect UI errors
    }

    setTonWalletAddress("");
    await clearTonWalletAddress(viewerKey);
    setNotice({
      tone: "neutral",
      text: "TON-кошелёк отключен от аккаунта Culture3k.",
    });
  };

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <main className={styles.container}>
        <header className={styles.header}>
          <button
            type="button"
            className={styles.backButton}
            onClick={handleBack}
          >
            Профиль
          </button>
          <div className={styles.headerCopy}>
            <h1>Пополнение баланса</h1>
            <p>Выберите Stars или TON и пополните кошелёк приложения.</p>
          </div>
        </header>

        <section className={styles.walletHero}>
          <div className={styles.walletHeroMeta}>
            <span>Кошелёк приложения</span>
            <strong className={styles.walletValue}>
              <StarsIcon className={styles.walletValueIcon} />
              {formatStarsFromCents(walletCents)}
            </strong>
            <small>Для релизов, покупок и NFT улучшений.</small>
          </div>

          <Link href="/profile/edit" className={styles.heroLink}>
            Настройки
          </Link>
        </section>

        <section className={styles.tabsWrap}>
          <SegmentedTabs
            activeIndex={activeTabIndex}
            items={topUpTabs}
            onChange={(index) =>
              setCurrentTab(index === 1 ? "ton" : "stars")
            }
            ariaLabel="Способ пополнения"
          />
        </section>

        <section className={styles.panel}>
          <div className={styles.group}>
            <div className={styles.groupHeader}>
              <h2>Промокод</h2>
              <p>Применится к следующему пополнению Stars или TON.</p>
            </div>

            <label className={styles.inputWrap}>
              <span>Код</span>
              <input
                type="text"
                value={promoCodeInput}
                onChange={(event) => setPromoCodeInput(event.target.value)}
                placeholder="Введите промокод"
              />
            </label>

            {normalizedPromoCode ? (
              selectedPromo ? (
                <p className={styles.promoHint}>
                  {promoAlreadyRedeemed ? (
                    "Промокод уже использован в вашем аккаунте."
                  ) : (
                    <>
                      <span>{selectedPromo.label}</span>
                      <strong className={styles.inlineAmount}>
                        <StarsIcon className={styles.inlineAmountIcon} />
                        {selectedPromo.discountType === "percent"
                          ? `${Math.max(1, Math.round(selectedPromo.discountValue))}%`
                          : formatStarsFromCents(
                              Math.max(
                                0,
                                Math.round(selectedPromo.discountValue),
                              ),
                            )}
                      </strong>
                    </>
                  )}
                </p>
              ) : (
                <p className={styles.promoHint}>Промокод не найден или неактивен.</p>
              )
            ) : null}
          </div>

          {currentTab === "stars" ? (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <h2>Пополнение через Stars</h2>
                <p>Быстрый способ пополнить внутренний баланс приложения.</p>
              </div>

              <div className={styles.presetGrid}>
                {PRESET_STARS.map((amount) => (
                  <button
                    key={amount}
                    type="button"
                    className={styles.presetButton}
                    disabled={loadingStars === amount}
                    onClick={() => void runTopUp(amount)}
                  >
                    <StarsIcon className={styles.buttonIcon} />
                    {loadingStars === amount ? "Оплата..." : `+${amount}`}
                  </button>
                ))}
              </div>

              <div className={styles.actionRow}>
                <label className={styles.inputWrap}>
                  <span>Сумма в Stars</span>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={customStars}
                    onChange={(event) => setCustomStars(event.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={loadingStars === customAmount}
                  onClick={() => void runTopUp(customAmount)}
                >
                  <StarsIcon className={styles.buttonIcon} />
                  {loadingStars === customAmount ? "Оплата..." : "Пополнить"}
                </button>
              </div>
            </div>
          ) : null}

          {currentTab === "ton" ? (
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <h2>Пополнение через TON</h2>
                <p>
                  Подключите кошелёк, выберите сумму и отправьте перевод в сети{" "}
                  {TON_NETWORK_LABEL}.
                </p>
              </div>

              <div className={styles.tonHeader}>
                <span className={styles.networkPill}>{TON_NETWORK_LABEL}</span>
                <TonConnectButton className={styles.tonConnectButton} />
              </div>

              <div className={styles.tonWalletCard}>
                <div className={styles.tonWalletMeta}>
                  <span>TON-кошелёк</span>
                  <strong>
                    {resolvedTonWalletAddress
                      ? formatShortTonAddress(resolvedTonWalletAddress)
                      : "Не подключён"}
                  </strong>
                  <small>
                    {resolvedTonWalletAddress
                      ? "Пополнение зачислится на внутренний баланс Culture3k."
                      : "Подключите кошелёк через Ton Connect, чтобы продолжить."}
                  </small>
                </div>

                <TonGlyph />
              </div>

              <div className={styles.actionRow}>
                <label className={styles.inputWrap}>
                  <span>Сумма в TON</span>
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={customTon}
                    onChange={(event) => setCustomTon(event.target.value)}
                  />
                </label>

                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={loadingTon}
                  onClick={() => void runTonTopUp()}
                >
                  <TonGlyph />
                  {loadingTon ? "Транзакция..." : "Перевести"}
                </button>
              </div>

              {resolvedTonWalletAddress ? (
                <button
                  type="button"
                  className={styles.secondaryButton}
                  onClick={() => void disconnectTonWallet()}
                >
                  Отключить кошелёк
                </button>
              ) : null}
            </div>
          ) : null}
        </section>

        {notice ? (
          <div
            className={`${styles.notice} ${notice.tone === "error" ? styles.noticeError : notice.tone === "success" ? styles.noticeSuccess : styles.noticeNeutral}`}
          >
            {notice.text}
          </div>
        ) : null}

        {!user && !isSessionLoading ? (
          <section className={styles.panel}>
            <div className={styles.group}>
              <div className={styles.groupHeader}>
                <h2>Вход через Telegram</h2>
                <p>Пополнение доступно только после авторизации.</p>
              </div>

              <TelegramLoginWidget
                onAuthorized={() => {
                  void refreshSession();
                }}
              />
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
