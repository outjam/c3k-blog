import { NextResponse } from "next/server";

import { checkRateLimit } from "@/lib/server/rate-limit";
import { getShopApiAuth, requireJsonRequest, unauthorizedResponse } from "@/lib/server/shop-api-auth";
import {
  appendSocialPurchasedReleaseSlug,
  appendSocialPurchasedReleaseWithTracks,
  appendSocialPurchasedTrackKey,
  appendSocialPurchasedTrackKeys,
  clearSocialTonWalletAddress,
  getSocialUserPublicPurchasesBySlug,
  getSocialUserSnapshot,
  mintSocialPurchasedReleaseNft,
  purchaseSocialReleaseWithWallet,
  redeemSocialTopupPromoCode,
  setSocialPurchasesVisibility,
  setSocialTonWalletAddress,
  spendSocialWalletBalanceCents,
  topUpSocialWalletBalanceFromTonCents,
  topUpSocialWalletBalanceCents,
} from "@/lib/server/social-user-state-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface StateMutateBody {
  action?: unknown;
  amountCents?: unknown;
  isVisible?: unknown;
  releaseSlug?: unknown;
  trackId?: unknown;
  trackIds?: unknown;
  code?: unknown;
  address?: unknown;
  txHash?: unknown;
  collectionAddress?: unknown;
  ownerAddress?: unknown;
  itemAddress?: unknown;
  itemIndex?: unknown;
}

const normalizePositiveInt = (value: unknown): number => {
  const parsed = Math.round(Number(value ?? 0));
  return Number.isFinite(parsed) ? Math.max(1, parsed) : 1;
};

const normalizeBoolean = (value: unknown): boolean => {
  return Boolean(value);
};

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

const normalizeTrackId = (value: unknown): string => {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]+/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
};

const normalizePromoCode = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 24);
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

const normalizeTrackIdList = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();

  return value
    .map((entry) => normalizeTrackId(entry))
    .filter((entry) => {
      if (!entry || seen.has(entry)) {
        return false;
      }

      seen.add(entry);
      return true;
    });
};

const serverError = (message: string) => {
  return NextResponse.json({ error: message }, { status: 502 });
};

const resolvePublicRateLimitIdentifier = (request: Request): string => {
  const forwardedFor = request.headers.get("x-forwarded-for") ?? "";
  const firstForwardedIp = forwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .find(Boolean);
  const realIp = request.headers.get("x-real-ip")?.trim();
  const candidate = firstForwardedIp || realIp || "anonymous";

  return candidate
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "_")
    .slice(0, 120);
};

export async function GET(request: Request) {
  const searchParams = new URL(request.url).searchParams;
  const slug = normalizeSlug(searchParams.get("slug"));

  if (slug) {
    const rate = await checkRateLimit({
      scope: "social_state_public_get",
      identifier: `${resolvePublicRateLimitIdentifier(request)}:${slug}`,
      limit: 240,
      windowSec: 60,
    });

    if (!rate.ok) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
        { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
      );
    }

    const snapshot = await getSocialUserPublicPurchasesBySlug(slug);

    if (!snapshot) {
      return serverError("Failed to load public social user state");
    }

    return NextResponse.json(snapshot);
  }

  const auth = getShopApiAuth(request);

  if (!auth) {
    return unauthorizedResponse();
  }

  const rate = await checkRateLimit({
    scope: "social_state_get",
    identifier: auth.telegramUserId,
    limit: 240,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  const snapshot = await getSocialUserSnapshot(auth.telegramUserId);

  if (!snapshot) {
    return serverError("Failed to load social user state");
  }

  return NextResponse.json(snapshot);
}

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
    scope: "social_state_mutate",
    identifier: auth.telegramUserId,
    limit: 240,
    windowSec: 60,
  });

  if (!rate.ok) {
    return NextResponse.json(
      { error: "Rate limit exceeded", retryAfterSec: rate.retryAfterSec },
      { status: 429, headers: { "retry-after": String(rate.retryAfterSec) } },
    );
  }

  let payload: StateMutateBody;

  try {
    payload = (await request.json()) as StateMutateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = String(payload.action ?? "").trim().toLowerCase();

  switch (action) {
    case "wallet_topup": {
      const walletCents = await topUpSocialWalletBalanceCents(auth.telegramUserId, normalizePositiveInt(payload.amountCents));

      if (walletCents === null) {
        return serverError("Failed to top up wallet balance");
      }

      return NextResponse.json({ walletCents });
    }
    case "wallet_topup_ton": {
      const amountCents = normalizePositiveInt(payload.amountCents);
      const result = await topUpSocialWalletBalanceFromTonCents(auth.telegramUserId, amountCents);

      if (!result) {
        return serverError("Failed to top up wallet balance from TON");
      }

      return NextResponse.json(result);
    }
    case "wallet_spend": {
      const result = await spendSocialWalletBalanceCents(auth.telegramUserId, normalizePositiveInt(payload.amountCents));

      if (!result) {
        return serverError("Failed to spend wallet balance");
      }

      return NextResponse.json(result);
    }
    case "purchases_visibility_set": {
      const purchasesVisible = await setSocialPurchasesVisibility(auth.telegramUserId, normalizeBoolean(payload.isVisible));

      if (purchasesVisible === null) {
        return serverError("Failed to update purchases visibility");
      }

      return NextResponse.json({ purchasesVisible });
    }
    case "ton_wallet_set": {
      const address = normalizeTonAddress(payload.address);
      if (!address) {
        return NextResponse.json({ error: "address is required" }, { status: 400 });
      }

      const tonWalletAddress = await setSocialTonWalletAddress(auth.telegramUserId, address);
      if (!tonWalletAddress) {
        return serverError("Failed to set TON wallet address");
      }

      return NextResponse.json({ tonWalletAddress });
    }
    case "ton_wallet_clear": {
      const cleared = await clearSocialTonWalletAddress(auth.telegramUserId);
      if (!cleared) {
        return serverError("Failed to clear TON wallet address");
      }

      return NextResponse.json({ tonWalletAddress: null });
    }
    case "release_wallet_purchase": {
      const releaseSlug = normalizeSlug(payload.releaseSlug);
      const trackIds = normalizeTrackIdList(payload.trackIds);
      const amountCents = normalizePositiveInt(payload.amountCents);

      if (!releaseSlug || amountCents < 1) {
        return NextResponse.json({ error: "releaseSlug and amountCents are required" }, { status: 400 });
      }

      const result = await purchaseSocialReleaseWithWallet(auth.telegramUserId, releaseSlug, trackIds, amountCents);

      if (!result) {
        return serverError("Failed to purchase release with wallet");
      }

      return NextResponse.json(result);
    }
    case "release_append": {
      const releaseSlug = normalizeSlug(payload.releaseSlug);
      if (!releaseSlug) {
        return NextResponse.json({ error: "releaseSlug is required" }, { status: 400 });
      }

      const purchasedReleaseSlugs = await appendSocialPurchasedReleaseSlug(auth.telegramUserId, releaseSlug);

      if (!purchasedReleaseSlugs) {
        return serverError("Failed to update purchased releases");
      }

      return NextResponse.json({ purchasedReleaseSlugs });
    }
    case "track_append": {
      const releaseSlug = normalizeSlug(payload.releaseSlug);
      const trackId = normalizeTrackId(payload.trackId);

      if (!releaseSlug || !trackId) {
        return NextResponse.json({ error: "releaseSlug and trackId are required" }, { status: 400 });
      }

      const purchasedTrackKeys = await appendSocialPurchasedTrackKey(auth.telegramUserId, releaseSlug, trackId);

      if (!purchasedTrackKeys) {
        return serverError("Failed to update purchased track keys");
      }

      return NextResponse.json({ purchasedTrackKeys });
    }
    case "tracks_append": {
      const releaseSlug = normalizeSlug(payload.releaseSlug);
      const trackIds = normalizeTrackIdList(payload.trackIds);

      if (!releaseSlug || trackIds.length === 0) {
        return NextResponse.json({ error: "releaseSlug and trackIds are required" }, { status: 400 });
      }

      const purchasedTrackKeys = await appendSocialPurchasedTrackKeys(auth.telegramUserId, releaseSlug, trackIds);

      if (!purchasedTrackKeys) {
        return serverError("Failed to update purchased track keys");
      }

      return NextResponse.json({ purchasedTrackKeys });
    }
    case "release_with_tracks_append": {
      const releaseSlug = normalizeSlug(payload.releaseSlug);
      const trackIds = normalizeTrackIdList(payload.trackIds);

      if (!releaseSlug && trackIds.length === 0) {
        return NextResponse.json({ error: "releaseSlug or trackIds are required" }, { status: 400 });
      }

      const result = await appendSocialPurchasedReleaseWithTracks(auth.telegramUserId, releaseSlug, trackIds);

      if (!result) {
        return serverError("Failed to update purchased release with tracks");
      }

      return NextResponse.json(result);
    }
    case "release_nft_mint": {
      const releaseSlug = normalizeSlug(payload.releaseSlug);
      if (!releaseSlug) {
        return NextResponse.json({ error: "releaseSlug is required" }, { status: 400 });
      }

      const result = await mintSocialPurchasedReleaseNft(auth.telegramUserId, {
        releaseSlug,
        ownerAddress: normalizeTonAddress(payload.ownerAddress),
        txHash: normalizeOptionalText(payload.txHash, 256),
        collectionAddress: normalizeTonAddress(payload.collectionAddress),
        itemAddress: normalizeTonAddress(payload.itemAddress),
        itemIndex: normalizeOptionalText(payload.itemIndex, 40),
      });

      if (!result) {
        return serverError("Failed to mint release NFT");
      }

      return NextResponse.json(result);
    }
    case "promo_redeem": {
      const code = normalizePromoCode(payload.code);
      if (!code) {
        return NextResponse.json({ error: "code is required" }, { status: 400 });
      }

      const result = await redeemSocialTopupPromoCode(auth.telegramUserId, code);

      if (!result) {
        return serverError("Failed to redeem promo code");
      }

      return NextResponse.json(result);
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }
}
