"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTonWallet } from "@tonconnect/ui-react";

import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import {
  createMyArtistTrack,
  fetchMyArtistProfile,
  fetchPublicCatalog,
  upsertMyArtistProfile,
} from "@/lib/admin-api";
import {
  buildPublicProfiles,
  buildTelegramShareUrl,
  readMintedReleaseNfts,
  readTonWalletAddress,
  profileSlugFromIdentity,
  readFollowOverview,
  readProfileMode,
  readPurchasedReleaseSlugs,
  readPurchasesVisibility,
  readWalletBalanceCents,
  resolveViewerKey,
  resolveViewerName,
  toggleFollowingSlug,
  writeTonWalletAddress,
  type MintedReleaseNft,
} from "@/lib/social-hub";
import { fetchMyShopOrders } from "@/lib/shop-orders-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ProfileMode } from "@/types/social";
import type { ArtistProfile, ArtistReleaseTrackItem, ArtistTrack, ShopCatalogArtist, ShopOrder, ShopProduct } from "@/types/shop";

import styles from "./page.module.scss";

interface SocialPerson {
  slug: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
}

interface TrackRowDraft {
  id: string;
  title: string;
  previewUrl: string;
  durationSec: string;
}

interface CollectionEntry {
  slug: string;
  release: ShopProduct | null;
  nft: MintedReleaseNft | null;
}

type ProfileTab = "collection" | "artist";

const createTrackRowDraft = (index: number): TrackRowDraft => ({
  id: `track-${index}`,
  title: "",
  previewUrl: "",
  durationSec: "",
});

const TONVIEWER_BASE_URL =
  process.env.NEXT_PUBLIC_TON_NETWORK === "mainnet" ? "https://tonviewer.com/" : "https://testnet.tonviewer.com/";

const formatShortTonAddress = (value: string | undefined): string => {
  const normalized = String(value ?? "").trim();

  if (normalized.length <= 14) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
};

const buildTonViewerUrl = (value: string | undefined): string => {
  const normalized = String(value ?? "").trim();
  return normalized ? `${TONVIEWER_BASE_URL}${encodeURIComponent(normalized)}` : "";
};

const normalizeReleaseTracklistDraft = (rows: TrackRowDraft[]): ArtistReleaseTrackItem[] => {
  return rows.reduce<ArtistReleaseTrackItem[]>((acc, row, index) => {
    const title = row.title.trim();
    if (!title) {
      return acc;
    }

    const duration = Math.round(Number(row.durationSec || "0"));
    const hasDuration = Number.isFinite(duration) && duration > 0;
    const previewUrl = row.previewUrl.trim();

    const normalizedItem: ArtistReleaseTrackItem = {
      id:
        String(row.id || `track-${index + 1}`)
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9_-]/g, "-")
          .replace(/-+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 80) || `track-${index + 1}`,
      title,
      position: index + 1,
    };

    if (previewUrl) {
      normalizedItem.previewUrl = previewUrl;
    }

    if (hasDuration) {
      normalizedItem.durationSec = Math.max(1, Math.min(60 * 60 * 12, duration));
    }

    acc.push(normalizedItem);
    return acc;
  }, []);
};

export default function ProfilePage() {
  const tonWallet = useTonWallet();
  const { user, isSessionLoading } = useAppAuthUser();
  const viewerKey = useMemo(() => resolveViewerKey(user), [user]);
  const viewerSlug = useMemo(
    () =>
      profileSlugFromIdentity({
        username: user?.username,
        telegramUserId: user?.id,
        fallback: "me",
      }),
    [user?.id, user?.username],
  );
  const fullName = useMemo(() => resolveViewerName(user), [user]);
  const appOrigin = useMemo(() => {
    if (typeof window === "undefined") {
      return process.env.NEXT_PUBLIC_APP_URL ?? "";
    }

    return window.location.origin;
  }, []);

  const [mode, setMode] = useState<ProfileMode>("listener");
  const [walletCents, setWalletCents] = useState(0);
  const [purchasesVisible, setPurchasesVisible] = useState(true);
  const [followingSlugs, setFollowingSlugs] = useState<string[]>([]);
  const [followerSlugs, setFollowerSlugs] = useState<string[]>([]);
  const [followStatsBySlug, setFollowStatsBySlug] = useState<Record<string, { followersCount: number; followingCount: number }>>({});
  const [followProfilesBySlug, setFollowProfilesBySlug] = useState<
    Record<string, { slug: string; displayName: string; username?: string; avatarUrl?: string; coverUrl?: string; bio?: string }>
  >({});
  const [purchasedReleaseSlugs, setPurchasedReleaseSlugs] = useState<string[]>([]);
  const [tonWalletAddress, setTonWalletAddress] = useState("");
  const [mintedReleaseNfts, setMintedReleaseNfts] = useState<MintedReleaseNft[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>("collection");
  const resolvedTonWalletAddress = useMemo(
    () => String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
    [tonWallet?.account?.address, tonWalletAddress],
  );

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [artists, setArtists] = useState<ShopCatalogArtist[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [orders, setOrders] = useState<ShopOrder[]>([]);

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [artistTracks, setArtistTracks] = useState<ArtistTrack[]>([]);
  const [artistDonationsCount, setArtistDonationsCount] = useState(0);
  const [artistSubscriptionsCount, setArtistSubscriptionsCount] = useState(0);
  const [artistSaving, setArtistSaving] = useState(false);
  const [trackSaving, setTrackSaving] = useState(false);
  const [artistError, setArtistError] = useState("");

  const [socialOverlay, setSocialOverlay] = useState<"followers" | "following" | null>(null);

  const [artistDraft, setArtistDraft] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    coverUrl: "",
    donationEnabled: true,
    subscriptionEnabled: false,
    subscriptionPriceStarsCents: "100",
  });

  const [trackDraft, setTrackDraft] = useState({
    title: "",
    releaseType: "single" as ArtistTrack["releaseType"],
    subtitle: "",
    description: "",
    coverImage: "",
    audioFileId: "",
    previewUrl: "",
    genre: "",
    priceStarsCents: "100",
    releaseTracklist: [createTrackRowDraft(1)],
  });

  useEffect(() => {
    let mounted = true;

    void (async () => {
      setCatalogLoading(true);

      const catalog = await fetchPublicCatalog();

      if (!mounted) {
        return;
      }

      setProducts(catalog.products);
      setArtists(catalog.artists);
      setCatalogLoading(false);
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const refreshFollowOverview = async (subjectSlugs: string[]) => {
    const overview = await readFollowOverview(subjectSlugs);
    setFollowingSlugs(overview.followingSlugs);
    setFollowerSlugs(overview.followerSlugs);
    setFollowStatsBySlug(overview.statsBySlug);
    setFollowProfilesBySlug(overview.profilesBySlug);
  };

  useEffect(() => {
    let mounted = true;

    void (async () => {
      const [savedMode, balance, visibility, followOverview, purchases, connectedTonWalletAddress, mintedNfts] = await Promise.all([
        readProfileMode(viewerKey),
        readWalletBalanceCents(viewerKey),
        readPurchasesVisibility(viewerKey),
        readFollowOverview([viewerSlug]),
        readPurchasedReleaseSlugs(viewerKey),
        readTonWalletAddress(viewerKey),
        readMintedReleaseNfts(viewerKey),
      ]);

      if (!mounted) {
        return;
      }

      setMode(savedMode);
      setWalletCents(balance);
      setPurchasesVisible(visibility);
      setFollowingSlugs(followOverview.followingSlugs);
      setFollowerSlugs(followOverview.followerSlugs);
      setFollowStatsBySlug(followOverview.statsBySlug);
      setFollowProfilesBySlug(followOverview.profilesBySlug);
      setPurchasedReleaseSlugs(purchases);
      setTonWalletAddress(connectedTonWalletAddress);
      setMintedReleaseNfts(mintedNfts);
    })();

    return () => {
      mounted = false;
    };
  }, [viewerKey, viewerSlug]);

  useEffect(() => {
    const connectedAddress = String(tonWallet?.account?.address ?? "").trim();

    if (!connectedAddress) {
      return;
    }

    if (connectedAddress === tonWalletAddress) {
      return;
    }

    void writeTonWalletAddress(viewerKey, connectedAddress);
  }, [tonWallet?.account?.address, tonWalletAddress, viewerKey]);

  useEffect(() => {
    if (isSessionLoading || !user?.id) {
      const timer = window.setTimeout(() => {
        setOrders([]);
        setArtistProfile(null);
        setArtistTracks([]);
        setArtistDonationsCount(0);
        setArtistSubscriptionsCount(0);
      }, 0);

      return () => {
        window.clearTimeout(timer);
      };
    }

    void fetchMyShopOrders().then((response) => {
      setOrders(response.orders);
    });

    void fetchMyArtistProfile().then((response) => {
      if (response.error) {
        setArtistError(response.error);
        return;
      }

      setArtistError("");
      setArtistProfile(response.profile);
      setArtistTracks(response.tracks);
      setArtistDonationsCount(response.donations);
      setArtistSubscriptionsCount(response.subscriptions);

      if (response.profile) {
        setArtistDraft({
          displayName: response.profile.displayName,
          bio: response.profile.bio,
          avatarUrl: response.profile.avatarUrl ?? "",
          coverUrl: response.profile.coverUrl ?? "",
          donationEnabled: response.profile.donationEnabled,
          subscriptionEnabled: response.profile.subscriptionEnabled,
          subscriptionPriceStarsCents: String(response.profile.subscriptionPriceStarsCents),
        });
      } else {
        setArtistDraft((prev) => ({
          ...prev,
          displayName: prev.displayName || fullName,
        }));
      }
    });
  }, [fullName, isSessionLoading, user?.id]);

  const productMapById = useMemo(() => new Map(products.map((item) => [item.id, item])), [products]);

  const orderPurchasedReleaseSlugs = useMemo(() => {
    const fromOrders = orders
      .flatMap((order) => order.items)
      .map((item) => productMapById.get(item.productId)?.slug)
      .filter((slug): slug is string => Boolean(slug));

    return Array.from(new Set(fromOrders));
  }, [orders, productMapById]);

  const allPurchasedReleaseSlugs = useMemo(() => {
    return Array.from(new Set([...purchasedReleaseSlugs, ...orderPurchasedReleaseSlugs]));
  }, [orderPurchasedReleaseSlugs, purchasedReleaseSlugs]);

  const profiles = useMemo(() => {
    return buildPublicProfiles({
      artists,
      products,
      followingSlugs,
      currentViewer: user,
      currentMode: mode,
      currentPurchasesVisible: purchasesVisible,
      currentPurchasedReleaseSlugs: allPurchasedReleaseSlugs,
      followStatsBySlug,
      followProfilesBySlug,
    });
  }, [allPurchasedReleaseSlugs, artists, followingSlugs, followProfilesBySlug, followStatsBySlug, mode, products, purchasesVisible, user]);

  const currentProfile = useMemo(() => {
    return profiles.find((profile) => profile.slug === viewerSlug) ?? null;
  }, [profiles, viewerSlug]);

  const profilesBySlug = useMemo(() => {
    return new Map(profiles.map((profile) => [profile.slug, profile]));
  }, [profiles]);

  const followingPeople = useMemo(() => {
    return followingSlugs
      .filter((slug) => slug !== viewerSlug)
      .map((slug) => {
        const profile = profilesBySlug.get(slug);
        if (profile) {
          return {
            slug: profile.slug,
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          } satisfies SocialPerson;
        }

        const hint = followProfilesBySlug[slug];
        return {
          slug,
          displayName: hint?.displayName || slug,
          username: hint?.username,
          avatarUrl: hint?.avatarUrl,
        } satisfies SocialPerson;
      });
  }, [followingSlugs, viewerSlug, profilesBySlug, followProfilesBySlug]);

  const followerPeople = useMemo(() => {
    return followerSlugs
      .filter((slug) => slug !== viewerSlug)
      .map((slug) => {
        const profile = profilesBySlug.get(slug);
        if (profile) {
          return {
            slug: profile.slug,
            displayName: profile.displayName,
            username: profile.username,
            avatarUrl: profile.avatarUrl,
          } satisfies SocialPerson;
        }

        const hint = followProfilesBySlug[slug];
        return {
          slug,
          displayName: hint?.displayName || slug,
          username: hint?.username,
          avatarUrl: hint?.avatarUrl,
        } satisfies SocialPerson;
      });
  }, [followerSlugs, viewerSlug, profilesBySlug, followProfilesBySlug]);

  const mintedReleaseCards = useMemo(() => {
    const bySlug = new Map(products.map((item) => [item.slug, item]));

    return mintedReleaseNfts.map((nft) => ({
      nft,
      release: bySlug.get(nft.releaseSlug) ?? null,
    }));
  }, [mintedReleaseNfts, products]);
  const onchainMintedReleaseCards = useMemo(() => {
    return mintedReleaseCards.filter(({ nft }) => Boolean(nft.itemAddress && nft.collectionAddress));
  }, [mintedReleaseCards]);
  const collectionEntries = useMemo(() => {
    const releaseBySlug = new Map(products.map((item) => [item.slug, item]));
    const nftBySlug = new Map<string, MintedReleaseNft>();

    onchainMintedReleaseCards.forEach(({ nft }) => {
      if (!nftBySlug.has(nft.releaseSlug)) {
        nftBySlug.set(nft.releaseSlug, nft);
      }
    });

    const orderedSlugs = Array.from(new Set([...allPurchasedReleaseSlugs, ...onchainMintedReleaseCards.map(({ nft }) => nft.releaseSlug)]));

    return orderedSlugs.reduce<CollectionEntry[]>((acc, slug) => {
      const release = releaseBySlug.get(slug) ?? null;
      const nft = nftBySlug.get(slug) ?? null;

      if (!release && !nft) {
        return acc;
      }

      acc.push({
        slug,
        release,
        nft,
      });

      return acc;
    }, []);
  }, [allPurchasedReleaseSlugs, onchainMintedReleaseCards, products]);
  const awards = currentProfile?.awards ?? [];
  const currentProfileBio = String(currentProfile?.bio ?? "").trim();
  const roleLabel = mode === "artist" ? "Артист" : "Покупатель";
  const profileTabs = useMemo(
    () =>
      [
        {
          id: "collection",
          label: "Коллекция",
        },
        ...(mode === "artist"
          ? [
              {
                id: "artist",
                label: "Студия",
              },
            ]
          : []),
      ] as Array<{ id: ProfileTab; label: string }>,
    [mode],
  );
  const currentTab: ProfileTab = mode === "artist" ? activeTab : activeTab === "artist" ? "collection" : activeTab;

  const handleToggleFollowing = async (slug: string) => {
    if (!user?.id) {
      return;
    }

    const targetProfile = profiles.find((profile) => profile.slug === slug);
    const next = await toggleFollowingSlug(slug, {
      displayName: targetProfile?.displayName,
      username: targetProfile?.username,
      avatarUrl: targetProfile?.avatarUrl,
    });
    setFollowingSlugs(next);
    await refreshFollowOverview([viewerSlug, slug, ...next]);
  };

  const handleShareProfile = () => {
    const profileUrl = `${appOrigin}/profile/${viewerSlug}`;
    window.open(buildTelegramShareUrl(profileUrl, "Мой профиль в Culture3k"), "_blank", "noopener,noreferrer");
  };

  const submitArtistProfile = async () => {
    if (!user?.id) {
      setArtistError("Для активации режима артиста нужна авторизация Telegram.");
      return;
    }

    setArtistSaving(true);
    setArtistError("");

    const response = await upsertMyArtistProfile({
      displayName: artistDraft.displayName,
      bio: artistDraft.bio,
      avatarUrl: artistDraft.avatarUrl,
      coverUrl: artistDraft.coverUrl,
      donationEnabled: artistDraft.donationEnabled,
      subscriptionEnabled: artistDraft.subscriptionEnabled,
      subscriptionPriceStarsCents: Math.max(1, Math.round(Number(artistDraft.subscriptionPriceStarsCents || "1"))),
    });

    setArtistSaving(false);

    if (response.error || !response.profile) {
      setArtistError(response.error ?? "Не удалось сохранить профиль артиста.");
      return;
    }

    setArtistProfile(response.profile);
    setArtistDraft({
      displayName: response.profile.displayName,
      bio: response.profile.bio,
      avatarUrl: response.profile.avatarUrl ?? "",
      coverUrl: response.profile.coverUrl ?? "",
      donationEnabled: response.profile.donationEnabled,
      subscriptionEnabled: response.profile.subscriptionEnabled,
      subscriptionPriceStarsCents: String(response.profile.subscriptionPriceStarsCents),
    });
  };

  const updateTrackRow = (index: number, patch: Partial<TrackRowDraft>) => {
    setTrackDraft((prev) => ({
      ...prev,
      releaseTracklist: prev.releaseTracklist.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row)),
    }));
  };

  const addTrackRow = () => {
    setTrackDraft((prev) => ({
      ...prev,
      releaseTracklist: [...prev.releaseTracklist, createTrackRowDraft(prev.releaseTracklist.length + 1)],
    }));
  };

  const removeTrackRow = (index: number) => {
    setTrackDraft((prev) => {
      const nextRows = prev.releaseTracklist.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...prev,
        releaseTracklist: nextRows.length > 0 ? nextRows : [createTrackRowDraft(1)],
      };
    });
  };

  const submitTrack = async () => {
    if (!user?.id) {
      setArtistError("Требуется авторизация Telegram.");
      return;
    }

    if (!artistProfile) {
      setArtistError("Сначала создайте профиль артиста.");
      return;
    }

    const normalizedTracklist = normalizeReleaseTracklistDraft(trackDraft.releaseTracklist);

    setTrackSaving(true);
    setArtistError("");

    const response = await createMyArtistTrack({
      title: trackDraft.title,
      releaseType: trackDraft.releaseType,
      subtitle: trackDraft.subtitle,
      description: trackDraft.description,
      coverImage: trackDraft.coverImage || undefined,
      audioFileId: trackDraft.audioFileId,
      previewUrl: (trackDraft.previewUrl || normalizedTracklist[0]?.previewUrl || "").trim() || undefined,
      genre: trackDraft.genre,
      priceStarsCents: Math.max(1, Math.round(Number(trackDraft.priceStarsCents || "1"))),
      releaseTracklist: normalizedTracklist.length > 0 ? normalizedTracklist : undefined,
    });

    setTrackSaving(false);

    if (response.error || !response.track) {
      setArtistError(response.error ?? "Не удалось отправить релиз.");
      return;
    }

    setArtistTracks((prev) => [response.track as ArtistTrack, ...prev]);
    setTrackDraft({
      title: "",
      releaseType: "single",
      subtitle: "",
      description: "",
      coverImage: "",
      audioFileId: "",
      previewUrl: "",
      genre: "",
      priceStarsCents: "100",
      releaseTracklist: [createTrackRowDraft(1)],
    });
  };

  const followersCount = currentProfile?.followersCount ?? followStatsBySlug[viewerSlug]?.followersCount ?? 0;
  const socialOverlayPeople = socialOverlay === "following" ? followingPeople : followerPeople;

  return (
    <div className={styles.page}>
      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.identityRow}>
            {currentProfile?.avatarUrl ? (
              <Image className={styles.avatarImage} src={currentProfile.avatarUrl} alt={currentProfile.displayName} width={55} height={55} />
            ) : user?.photo_url ? (
              <Image className={styles.avatarImage} src={user.photo_url} alt={fullName} width={55} height={55} />
            ) : (
              <div className={styles.avatarFallback}>{(currentProfile?.displayName || fullName).slice(0, 2).toUpperCase()}</div>
            )}

            <div className={styles.identityMeta}>
              <h1>{currentProfile?.displayName || fullName}</h1>
              <p>@{viewerSlug}</p>
              <span className={styles.kicker}>{roleLabel}</span>

              <div className={styles.heroStats}>
                <article>
                  <span>Подписчики</span>
                  <button type="button" className={styles.statButton} onClick={() => setSocialOverlay("followers")}>
                    {followersCount}
                  </button>
                </article>
                <article>
                  <span>Подписки</span>
                  <button type="button" className={styles.statButton} onClick={() => setSocialOverlay("following")}>
                    {followingSlugs.length}
                  </button>
                </article>
                <article>
                  <span>NFT</span>
                  <strong>{onchainMintedReleaseCards.length}</strong>
                </article>
                <article>
                  <span>Покупки</span>
                  <strong>{allPurchasedReleaseSlugs.length}</strong>
                </article>
              </div>
            </div>
          </div>

          {currentProfileBio ? <p className={styles.heroBio}>{currentProfileBio}</p> : null}

          <div className={styles.heroBalance}>
            <div>
              <span>Баланс</span>
              <strong>{formatStarsFromCents(walletCents)} ⭐</strong>
              {resolvedTonWalletAddress ? <small>{`TON: ${formatShortTonAddress(resolvedTonWalletAddress)}`}</small> : null}
            </div>
            <div className={styles.heroBalanceActions}>
              <Link href="/balance">Пополнить</Link>
              <Link href="/profile/edit">Настройки</Link>
            </div>
          </div>

          <div className={styles.heroActions}>
            <Link href="/profile/edit">
              Редактировать
            </Link>
            <button type="button" onClick={handleShareProfile}>
              Поделиться профилем
            </button>
            <Link href="/shop">Магазин</Link>
          </div>

          <div className={styles.sectionTabs}>
            {profileTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={currentTab === tab.id ? styles.sectionTabActive : styles.sectionTab}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </section>

        {currentTab === "collection" ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Коллекция</h2>
              <p>{collectionEntries.length}</p>
            </div>

            {collectionEntries.length > 0 ? (
              <div className={styles.collectionList}>
                {collectionEntries.map((entry) => {
                  const tonViewerUrl = buildTonViewerUrl(entry.nft?.itemAddress);
                  const releaseHref = entry.release ? `/shop/${entry.release.slug}` : "/shop";

                  return (
                    <article key={`${entry.slug}-${entry.nft?.id ?? "release"}`} className={styles.collectionRow}>
                      {entry.release ? (
                        <Link href={releaseHref}>
                          <Image src={entry.release.image} alt={entry.release.title} width={88} height={88} className={styles.collectionMedia} />
                        </Link>
                      ) : (
                        <div className={styles.collectionFallback}>NFT</div>
                      )}

                      <div className={styles.collectionBody}>
                        <div className={styles.collectionTop}>
                          <Link href={releaseHref}>{entry.release?.title || entry.slug}</Link>
                          {entry.nft ? <span className={styles.collectionBadge}>NFT</span> : null}
                        </div>

                        <p>{entry.release?.artistName || entry.release?.subtitle || "Релиз в коллекции"}</p>
                        <small>
                          {entry.nft
                            ? `В TON · ${new Date(entry.nft.mintedAt).toLocaleDateString("ru-RU")}`
                            : `Покупка · ${formatStarsFromCents(entry.release?.priceStarsCents ?? 0)} ⭐`}
                        </small>

                        <div className={styles.collectionFoot}>
                          <Link href={releaseHref}>Открыть релиз</Link>
                          {tonViewerUrl ? (
                            <a href={tonViewerUrl} target="_blank" rel="noreferrer">
                              В блокчейне
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className={styles.emptyState}>Покупок пока нет. NFT из купленных релизов появятся здесь после минта.</p>
            )}

            {!purchasesVisible ? <p className={styles.inlineHint}>Коллекция сейчас скрыта в публичном профиле.</p> : null}
          </section>
        ) : null}

        {currentTab === "collection" && awards.length > 0 ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Награды</h2>
              <p>{awards.length}</p>
            </div>

            <div className={styles.awardsGrid}>
              {awards.map((award) => (
                <article key={award.id} className={`${styles.awardCard} ${styles[`awardTier${award.tier}`]}`}>
                  <p>{award.icon}</p>
                  <h3>{award.title}</h3>
                  <span>{award.description}</span>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {currentTab === "artist" && mode === "artist" ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Студия артиста</h2>
              <p>{artistProfile?.status ?? "не настроен"}</p>
            </div>

            <div className={styles.artistStats}>
              <span>Баланс артиста: {formatStarsFromCents(artistProfile?.balanceStarsCents ?? 0)} ⭐</span>
              <span>Заработано: {formatStarsFromCents(artistProfile?.lifetimeEarningsStarsCents ?? 0)} ⭐</span>
              <span>Донатов: {artistDonationsCount}</span>
              <span>Подписок: {artistSubscriptionsCount}</span>
            </div>

            <div className={styles.artistFormGrid}>
              <label>
                Имя артиста
                <input
                  value={artistDraft.displayName}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                />
              </label>
              <label>
                Описание
                <textarea
                  value={artistDraft.bio}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, bio: event.target.value }))}
                />
              </label>
              <label>
                Ссылка на аватар
                <input
                  value={artistDraft.avatarUrl}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                />
              </label>
              <label>
                Ссылка на обложку
                <input
                  value={artistDraft.coverUrl}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, coverUrl: event.target.value }))}
                />
              </label>
              <label>
                Цена подписки
                <input
                  type="number"
                  min={1}
                  value={artistDraft.subscriptionPriceStarsCents}
                  onChange={(event) =>
                    setArtistDraft((prev) => ({ ...prev, subscriptionPriceStarsCents: event.target.value }))
                  }
                />
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={artistDraft.donationEnabled}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, donationEnabled: event.target.checked }))}
                />
                Донаты включены
              </label>
              <label className={styles.checkboxRow}>
                <input
                  type="checkbox"
                  checked={artistDraft.subscriptionEnabled}
                  onChange={(event) =>
                    setArtistDraft((prev) => ({ ...prev, subscriptionEnabled: event.target.checked }))
                  }
                />
                Подписка включена
              </label>
            </div>

            <button type="button" className={styles.primaryButton} onClick={() => void submitArtistProfile()} disabled={artistSaving}>
              {artistSaving ? "Сохраняем..." : artistProfile ? "Обновить профиль артиста" : "Активировать профиль артиста"}
            </button>

            <div className={styles.artistFormGrid}>
              <label>
                Название релиза
                <input
                  value={trackDraft.title}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, title: event.target.value }))}
                />
              </label>
              <label>
                Тип релиза
                <select
                  value={trackDraft.releaseType}
                  onChange={(event) =>
                    setTrackDraft((prev) => ({ ...prev, releaseType: event.target.value as ArtistTrack["releaseType"] }))
                  }
                >
                  <option value="single">Сингл</option>
                  <option value="ep">EP</option>
                  <option value="album">Альбом</option>
                </select>
              </label>
              <label>
                Подзаголовок
                <input
                  value={trackDraft.subtitle}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, subtitle: event.target.value }))}
                />
              </label>
              <label>
                Жанр
                <input
                  value={trackDraft.genre}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, genre: event.target.value }))}
                />
              </label>
              <label>
                Ссылка на обложку
                <input
                  value={trackDraft.coverImage}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, coverImage: event.target.value }))}
                />
              </label>
              <label>
                Audio file id
                <input
                  value={trackDraft.audioFileId}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, audioFileId: event.target.value }))}
                />
              </label>
              <label>
                Ссылка на общее превью
                <input
                  value={trackDraft.previewUrl}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, previewUrl: event.target.value }))}
                />
              </label>
              <label>
                Цена
                <input
                  type="number"
                  min={1}
                  value={trackDraft.priceStarsCents}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, priceStarsCents: event.target.value }))}
                />
              </label>
              <label>
                Описание
                <textarea
                  value={trackDraft.description}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, description: event.target.value }))}
                />
              </label>
            </div>

            <div className={styles.tracklistEditor}>
              <div className={styles.sectionHeader}>
                <h2>Треклист релиза</h2>
                <p>{trackDraft.releaseTracklist.length}</p>
              </div>

              <div className={styles.tracklistDraftList}>
                {trackDraft.releaseTracklist.map((row, index) => (
                  <article key={`${row.id}-${index}`} className={styles.tracklistDraftRow}>
                    <label>
                      Трек #{index + 1}
                      <input
                        value={row.title}
                        onChange={(event) => updateTrackRow(index, { title: event.target.value })}
                        placeholder="Название трека"
                      />
                    </label>
                    <label>
                      Ссылка на превью
                      <input
                        value={row.previewUrl}
                        onChange={(event) => updateTrackRow(index, { previewUrl: event.target.value })}
                        placeholder="https://..."
                      />
                    </label>
                    <label>
                      Длительность (сек)
                      <input
                        type="number"
                        min={0}
                        value={row.durationSec}
                        onChange={(event) => updateTrackRow(index, { durationSec: event.target.value })}
                      />
                    </label>
                    <button type="button" onClick={() => removeTrackRow(index)}>
                      Удалить
                    </button>
                  </article>
                ))}
              </div>

              <button type="button" className={styles.primaryButton} onClick={addTrackRow}>
                Добавить трек
              </button>
            </div>

            <button type="button" className={styles.primaryButton} onClick={() => void submitTrack()} disabled={trackSaving}>
              {trackSaving ? "Отправка..." : "Добавить релиз"}
            </button>

            {artistTracks.length > 0 ? (
              <div className={styles.artistTrackList}>
                {artistTracks.slice(0, 8).map((track) => (
                  <article key={track.id} className={styles.artistTrackCard}>
                    <strong>{track.title}</strong>
                    <p>
                      {track.subtitle || track.genre || "Сингл"} · {track.releaseTracklist?.length ?? 1} треков
                    </p>
                    <span>{formatStarsFromCents(track.priceStarsCents)} ⭐</span>
                  </article>
                ))}
              </div>
            ) : (
              <p className={styles.emptyState}>У вас пока нет опубликованных релизов.</p>
            )}

            {artistError ? <p className={styles.warning}>{artistError}</p> : null}
          </section>
        ) : null}

        {catalogLoading ? <p className={styles.loading}>Загружаем профиль...</p> : null}
      </main>

      {socialOverlay ? (
        <div className={styles.socialOverlayBackdrop} onClick={() => setSocialOverlay(null)}>
          <div className={styles.socialOverlayCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.sectionHeader}>
              <h2>{socialOverlay === "following" ? "Подписки" : "Подписчики"}</h2>
              <button type="button" className={styles.overlayCloseButton} onClick={() => setSocialOverlay(null)}>
                Закрыть
              </button>
            </div>

            <div className={styles.socialOverlayList}>
              {socialOverlayPeople.length > 0 ? (
                socialOverlayPeople.map((profile) => (
                  <article key={profile.slug} className={styles.personCard}>
                    <Link href={`/profile/${profile.slug}`} className={styles.personIdentity} onClick={() => setSocialOverlay(null)}>
                      {profile.avatarUrl ? (
                        <Image src={profile.avatarUrl} alt={profile.displayName} width={33} height={33} />
                      ) : (
                        <div className={styles.personIdentityFallback}>{profile.displayName.slice(0, 2).toUpperCase()}</div>
                      )}
                      <span>
                        <strong>{profile.displayName}</strong>
                        <small>@{profile.username || profile.slug}</small>
                      </span>
                    </Link>
                    {profile.slug !== viewerSlug ? (
                      <button type="button" onClick={() => void handleToggleFollowing(profile.slug)}>
                        {followingSlugs.includes(profile.slug) ? "Подписан" : "Подписаться"}
                      </button>
                    ) : null}
                  </article>
                ))
              ) : (
                <p className={styles.emptyState}>Список пока пуст.</p>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
