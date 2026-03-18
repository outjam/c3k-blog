import type {
  ArtistEarningLedgerEntry,
  ArtistProfile,
  ArtistTrack,
  ShopAdminConfig,
  ShopOrder,
  ShopProduct,
} from "@/types/shop";
import { addArtistPayoutHold } from "@/lib/server/shop-artist-studio";

const DEFAULT_TRACK_IMAGE = "/posts/cover-pattern.svg";
const DIGITAL_TRACK_STOCK = 9999;

const TRACK_REVENUE_SHARE = 0.85;
const DONATION_REVENUE_SHARE = 0.95;
const SUBSCRIPTION_REVENUE_SHARE = 0.9;

const DONATION_PREFIX = "don-";
const SUBSCRIPTION_PREFIX = "sub-";

const clampMoney = (value: number): number => {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.round(value));
};

const normalizeTelegramUserId = (value: unknown): number => {
  const normalized = Math.round(Number(value ?? 0));
  return Number.isFinite(normalized) && normalized > 0 ? normalized : 0;
};

const toPayout = (amountStarsCents: number, share: number): number => {
  if (amountStarsCents <= 0) {
    return 0;
  }

  return Math.max(1, Math.round(amountStarsCents * share));
};

export const parseArtistSyntheticItem = (
  productId: string,
): { kind: "donation" | "subscription"; artistTelegramUserId: number } | null => {
  const normalized = String(productId ?? "").trim().toLowerCase();

  if (normalized.startsWith(DONATION_PREFIX)) {
    const artistTelegramUserId = normalizeTelegramUserId(normalized.slice(DONATION_PREFIX.length));
    return artistTelegramUserId ? { kind: "donation", artistTelegramUserId } : null;
  }

  if (normalized.startsWith(SUBSCRIPTION_PREFIX)) {
    const artistTelegramUserId = normalizeTelegramUserId(normalized.slice(SUBSCRIPTION_PREFIX.length));
    return artistTelegramUserId ? { kind: "subscription", artistTelegramUserId } : null;
  }

  return null;
};

export const toArtistTrackProduct = (track: ArtistTrack, artist: ArtistProfile | undefined): ShopProduct => {
  const artistName = artist?.displayName || `Artist ${track.artistTelegramUserId}`;
  const categoryLabel = "Музыка";
  const subcategoryLabel = track.genre || "Треки";
  const defaultFormat = track.formats.find((entry) => entry.isDefault) ?? track.formats[0];
  const fallbackFormats: ArtistTrack["formats"] = [
    {
      format: "mp3",
      audioFileId: track.audioFileId,
      priceStarsCents: track.priceStarsCents,
      label: "MP3",
      isDefault: true,
    },
  ];
  const formats: ArtistTrack["formats"] = track.formats.length > 0 ? track.formats : fallbackFormats;

  return {
    id: track.id,
    slug: track.slug,
    title: track.title,
    subtitle: track.subtitle || `Трек от ${artistName}`,
    description: track.description || `Релиз артиста ${artistName}`,
    category: "music",
    categoryId: "music",
    subcategoryId: "tracks",
    categoryLabel,
    subcategoryLabel,
    image: track.coverImage || DEFAULT_TRACK_IMAGE,
    priceStarsCents: clampMoney(defaultFormat?.priceStarsCents ?? track.priceStarsCents ?? 1) || 1,
    rating: 5,
    reviewsCount: clampMoney(track.salesCount),
    isNew: true,
    isHit: track.salesCount > 9,
    tags: track.tags,
    kind: "digital_track",
    artistTelegramUserId: track.artistTelegramUserId,
    artistName,
    artistSlug: artist?.slug,
    releaseType: track.releaseType,
    formats,
    releaseTracklist: track.releaseTracklist,
    isMintable: track.isMintable !== false,
    audioFileId: defaultFormat?.audioFileId ?? track.audioFileId,
    previewUrl: track.previewUrl,
    publishedAt: track.publishedAt,
    attributes: {
      material: "Digital",
      technique: "Audio",
      color: "N/A",
      heightCm: 1,
      widthCm: 1,
      weightGr: 1,
      collection: track.genre || "Music",
      sku: track.id.toUpperCase().slice(0, 60),
      stock: DIGITAL_TRACK_STOCK,
    },
  };
};

export const listPublishedArtistProductsFromSnapshot = (
  profiles: ArtistProfile[],
  tracks: ArtistTrack[],
): ShopProduct[] => {
  const profileById = new Map(profiles.map((profile) => [profile.telegramUserId, profile]));

  return tracks
    .filter((track) => track.status === "published")
    .map((track) => {
      const artist = profileById.get(track.artistTelegramUserId);
      if (!artist || artist.status !== "approved") {
        return null;
      }

      return toArtistTrackProduct(track, artist);
    })
    .filter((track): track is ShopProduct => Boolean(track))
    .sort((a, b) => {
      const left = new Date(a.publishedAt ?? 0).getTime();
      const right = new Date(b.publishedAt ?? 0).getTime();
      return right - left;
    });
};

export const listPublishedArtistProducts = (config: ShopAdminConfig): ShopProduct[] => {
  return listPublishedArtistProductsFromSnapshot(
    Object.values(config.artistProfiles),
    Object.values(config.artistTracks),
  );
};

export const applyArtistPayoutsForPaidOrder = (
  config: ShopAdminConfig,
  order: ShopOrder,
): {
  config: ShopAdminConfig;
  touchedArtistIds: number[];
  createdEarnings: ShopAdminConfig["artistEarningsLedger"];
} => {
  const now = new Date().toISOString();
  const profiles = { ...config.artistProfiles };
  const tracks = { ...config.artistTracks };
  const donations = [...config.artistDonations];
  const subscriptions = [...config.artistSubscriptions];
  const earningsLedger = [...config.artistEarningsLedger];
  const createdEarnings: ShopAdminConfig["artistEarningsLedger"] = [];
  const existingEarningIds = new Set(earningsLedger.map((entry) => entry.id));
  const touchedArtistIds = new Set<number>();
  const existingDonationIds = new Set(donations.map((item) => item.id));
  const subscriptionByComposite = new Map<string, number>();

  subscriptions.forEach((entry, index) => {
    subscriptionByComposite.set(`${entry.artistTelegramUserId}:${entry.subscriberTelegramUserId}`, index);
  });

  for (const item of order.items) {
    const lineTotal = clampMoney(item.priceStarsCents * item.quantity);
    if (lineTotal < 1) {
      continue;
    }

    const track = tracks[item.productId];

    if (track && track.status === "published") {
      const payout = toPayout(lineTotal, TRACK_REVENUE_SHARE);
      const profile = profiles[String(track.artistTelegramUserId)];

      if (profile) {
        touchedArtistIds.add(profile.telegramUserId);
        profiles[String(profile.telegramUserId)] = {
          ...profile,
          balanceStarsCents: clampMoney(profile.balanceStarsCents + payout),
          lifetimeEarningsStarsCents: clampMoney(profile.lifetimeEarningsStarsCents + payout),
          updatedAt: now,
        };
        const earningId = `earn-track-${order.id}-${track.id}`.toLowerCase();
        if (!existingEarningIds.has(earningId)) {
          const earningEntry: ArtistEarningLedgerEntry = {
            id: earningId,
            artistTelegramUserId: profile.telegramUserId,
            source: "release_sale",
            sourceId: track.id,
            orderId: order.id,
            buyerTelegramUserId: order.telegramUserId,
            amountStarsCents: payout,
            earnedAt: now,
            holdUntil: addArtistPayoutHold(now),
          };
          earningsLedger.unshift(earningEntry);
          createdEarnings.push(earningEntry);
          existingEarningIds.add(earningId);
        }

        tracks[item.productId] = {
          ...track,
          salesCount: clampMoney(track.salesCount + item.quantity),
          updatedAt: now,
        };
      }

      continue;
    }

    const synthetic = parseArtistSyntheticItem(item.productId);

    if (!synthetic) {
      continue;
    }

    const profile = profiles[String(synthetic.artistTelegramUserId)];
    if (!profile) {
      continue;
    }

    touchedArtistIds.add(profile.telegramUserId);

    if (synthetic.kind === "donation") {
      const donationId = `don-${order.id}-${synthetic.artistTelegramUserId}`.toLowerCase();
      if (!existingDonationIds.has(donationId)) {
        donations.unshift({
          id: donationId,
          artistTelegramUserId: synthetic.artistTelegramUserId,
          fromTelegramUserId: order.telegramUserId,
          amountStarsCents: lineTotal,
          message: order.comment || undefined,
          createdAt: now,
        });
        existingDonationIds.add(donationId);
      }

      const payout = toPayout(lineTotal, DONATION_REVENUE_SHARE);
      profiles[String(profile.telegramUserId)] = {
        ...profile,
        balanceStarsCents: clampMoney(profile.balanceStarsCents + payout),
        lifetimeEarningsStarsCents: clampMoney(profile.lifetimeEarningsStarsCents + payout),
        updatedAt: now,
      };
      const earningId = `earn-donation-${order.id}-${synthetic.artistTelegramUserId}`.toLowerCase();
      if (!existingEarningIds.has(earningId)) {
        const earningEntry: ArtistEarningLedgerEntry = {
          id: earningId,
          artistTelegramUserId: profile.telegramUserId,
          source: "donation",
          sourceId: donationId,
          orderId: order.id,
          buyerTelegramUserId: order.telegramUserId,
          amountStarsCents: payout,
          earnedAt: now,
          holdUntil: addArtistPayoutHold(now),
        };
        earningsLedger.unshift(earningEntry);
        createdEarnings.push(earningEntry);
        existingEarningIds.add(earningId);
      }

      continue;
    }

    const payout = toPayout(lineTotal, SUBSCRIPTION_REVENUE_SHARE);
    profiles[String(profile.telegramUserId)] = {
      ...profile,
      balanceStarsCents: clampMoney(profile.balanceStarsCents + payout),
      lifetimeEarningsStarsCents: clampMoney(profile.lifetimeEarningsStarsCents + payout),
      updatedAt: now,
    };
    const earningId = `earn-subscription-${order.id}-${synthetic.artistTelegramUserId}`.toLowerCase();
    if (!existingEarningIds.has(earningId)) {
      const earningEntry: ArtistEarningLedgerEntry = {
        id: earningId,
        artistTelegramUserId: profile.telegramUserId,
        source: "subscription",
        sourceId: `sub-${synthetic.artistTelegramUserId}-${order.telegramUserId}`,
        orderId: order.id,
        buyerTelegramUserId: order.telegramUserId,
        amountStarsCents: payout,
        earnedAt: now,
        holdUntil: addArtistPayoutHold(now),
      };
      earningsLedger.unshift(earningEntry);
      createdEarnings.push(earningEntry);
      existingEarningIds.add(earningId);
    }

    const compositeKey = `${synthetic.artistTelegramUserId}:${order.telegramUserId}`;
    const existingIndex = subscriptionByComposite.get(compositeKey);

    if (typeof existingIndex === "number") {
      const current = subscriptions[existingIndex];
      if (!current) {
        continue;
      }

      subscriptions[existingIndex] = {
        ...current,
        amountStarsCents: lineTotal,
        status: "active",
        updatedAt: now,
      };
      continue;
    }

    const subscriptionId = `sub-${synthetic.artistTelegramUserId}-${order.telegramUserId}`;
    subscriptions.unshift({
      id: subscriptionId,
      artistTelegramUserId: synthetic.artistTelegramUserId,
      subscriberTelegramUserId: order.telegramUserId,
      amountStarsCents: lineTotal,
      status: "active",
      startedAt: now,
      updatedAt: now,
    });
    subscriptionByComposite.set(compositeKey, 0);
  }

  if (touchedArtistIds.size === 0) {
    return { config, touchedArtistIds: [], createdEarnings: [] };
  }

  return {
    config: {
      ...config,
      artistProfiles: profiles,
      artistTracks: tracks,
      artistDonations: donations.slice(0, 5000),
      artistSubscriptions: subscriptions.slice(0, 5000),
      artistEarningsLedger: earningsLedger.slice(0, 10000),
      updatedAt: now,
    },
    touchedArtistIds: Array.from(touchedArtistIds),
    createdEarnings,
  };
};
