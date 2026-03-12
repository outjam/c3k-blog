import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import {
  getSocialUserSnapshot,
  mintSocialPurchasedReleaseNft,
  spendSocialWalletBalanceCents,
  topUpSocialWalletBalanceCents,
} from "@/lib/server/social-user-state-store";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import { hasSponsoredRelayConfig, resolveSponsoredMintGasFeeCents, sendSponsoredMintRelay } from "@/lib/server/ton-sponsored-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface SponsoredMintBody {
  releaseSlug?: unknown;
  ownerAddress?: unknown;
  collectionAddress?: unknown;
}

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
};

const normalizeTonAddress = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/\s+/g, "")
    .slice(0, 160);
};

const normalizeOptionalText = (value: unknown, maxLength: number): string | undefined => {
  const normalized = String(value ?? "").trim().slice(0, maxLength);
  return normalized || undefined;
};

const serverError = (message: string) => {
  return NextResponse.json({ ok: false, reason: "server_error", error: message }, { status: 502 });
};

const buildMintFailure = (params: {
  reason: "wallet_required" | "not_purchased" | "insufficient_funds" | "relay_unavailable" | "relay_failed";
  walletCents: number;
  gasDebitedCents?: number;
  relayError?: string;
}) => {
  return NextResponse.json({
    ok: false,
    reason: params.reason,
    walletCents: params.walletCents,
    gasDebitedCents: params.gasDebitedCents ?? 0,
    relayError: params.relayError,
  });
};

export async function POST(request: Request) {
  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const contentTypeError = requireJsonRequest(request);
  if (contentTypeError) {
    return contentTypeError;
  }

  const rate = await checkRateLimit({
    scope: "ton_sponsored_mint",
    identifier: auth.telegramUserId,
    limit: 60,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: SponsoredMintBody;

  try {
    payload = (await request.json()) as SponsoredMintBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const releaseSlug = normalizeSlug(payload.releaseSlug);

  if (!releaseSlug) {
    return NextResponse.json({ error: "releaseSlug is required" }, { status: 400 });
  }

  const snapshotBefore = await getSocialUserSnapshot(auth.telegramUserId);

  if (!snapshotBefore) {
    return serverError("Failed to load social user state");
  }

  if (!snapshotBefore.purchasedReleaseSlugs.includes(releaseSlug)) {
    return buildMintFailure({
      reason: "not_purchased",
      walletCents: snapshotBefore.walletCents,
    });
  }

  const alreadyMinted = snapshotBefore.mintedReleaseNfts.find((entry) => entry.releaseSlug === releaseSlug);
  if (alreadyMinted) {
    return NextResponse.json({
      ok: true,
      alreadyMinted: true,
      gasDebitedCents: 0,
      walletCents: snapshotBefore.walletCents,
      relay: null,
      nft: alreadyMinted,
      mintedReleaseNfts: snapshotBefore.mintedReleaseNfts,
    });
  }

  const ownerAddress = normalizeTonAddress(payload.ownerAddress) || normalizeTonAddress(snapshotBefore.tonWalletAddress) || "";

  if (!ownerAddress) {
    return buildMintFailure({
      reason: "wallet_required",
      walletCents: snapshotBefore.walletCents,
    });
  }

  if (!hasSponsoredRelayConfig()) {
    return buildMintFailure({
      reason: "relay_unavailable",
      walletCents: snapshotBefore.walletCents,
      relayError: "TON sponsor wallet or mint recipient is not configured",
    });
  }

  const gasDebitedCents = resolveSponsoredMintGasFeeCents();

  const spendResult = await spendSocialWalletBalanceCents(auth.telegramUserId, gasDebitedCents);

  if (!spendResult) {
    return serverError("Failed to debit wallet balance");
  }

  if (!spendResult.ok) {
    return buildMintFailure({
      reason: "insufficient_funds",
      walletCents: spendResult.balanceCents,
      gasDebitedCents: 0,
    });
  }

  let relayResult: Awaited<ReturnType<typeof sendSponsoredMintRelay>>;

  try {
    relayResult = await sendSponsoredMintRelay({
      releaseSlug,
      telegramUserId: auth.telegramUserId,
      ownerAddress,
    });
  } catch (error) {
    await topUpSocialWalletBalanceCents(auth.telegramUserId, gasDebitedCents);
    const snapshotAfterRefund = await getSocialUserSnapshot(auth.telegramUserId);

    return buildMintFailure({
      reason: "relay_failed",
      walletCents: snapshotAfterRefund?.walletCents ?? spendResult.balanceCents,
      gasDebitedCents: 0,
      relayError: error instanceof Error ? error.message : "unknown relay error",
    });
  }

  const mintResult = await mintSocialPurchasedReleaseNft(auth.telegramUserId, {
    releaseSlug,
    ownerAddress,
    txHash: relayResult.txHash,
    collectionAddress: normalizeOptionalText(normalizeTonAddress(payload.collectionAddress), 160),
  });

  if (!mintResult || !mintResult.ok) {
    await topUpSocialWalletBalanceCents(auth.telegramUserId, gasDebitedCents);
    const snapshotAfterRefund = await getSocialUserSnapshot(auth.telegramUserId);

    return buildMintFailure({
      reason: mintResult?.reason === "wallet_required" ? "wallet_required" : "not_purchased",
      walletCents: snapshotAfterRefund?.walletCents ?? spendResult.balanceCents,
      gasDebitedCents: 0,
    });
  }

  if (mintResult.alreadyMinted) {
    await topUpSocialWalletBalanceCents(auth.telegramUserId, gasDebitedCents);
    const snapshotAfterRefund = await getSocialUserSnapshot(auth.telegramUserId);

    return NextResponse.json({
      ok: true,
      alreadyMinted: true,
      gasDebitedCents: 0,
      walletCents: snapshotAfterRefund?.walletCents ?? spendResult.balanceCents,
      relay: relayResult,
      nft: mintResult.nft,
      mintedReleaseNfts: mintResult.mintedReleaseNfts,
    });
  }

  const snapshotAfter = await getSocialUserSnapshot(auth.telegramUserId);

  return NextResponse.json({
    ok: true,
    alreadyMinted: false,
    gasDebitedCents,
    walletCents: snapshotAfter?.walletCents ?? spendResult.balanceCents,
    relay: relayResult,
    nft: mintResult.nft,
    mintedReleaseNfts: mintResult.mintedReleaseNfts,
  });
}
