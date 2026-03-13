"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { TonConnectButton, useTonWallet } from "@tonconnect/ui-react";

import { TelegramLoginWidget } from "@/components/telegram-login-widget";
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
  fetchMyUserProfile,
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
  updateMyUserProfile,
  writeProfileMode,
  writePurchasesVisibility,
  writeTonWalletAddress,
  type UserProfileEditorPayload,
  type MintedReleaseNft,
} from "@/lib/social-hub";
import { FINAL_ORDER_STATUSES } from "@/lib/shop-order-status";
import { fetchMyShopOrders } from "@/lib/shop-orders-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { BlogPost } from "@/types/blog";
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

const createTrackRowDraft = (index: number): TrackRowDraft => ({
  id: `track-${index}`,
  title: "",
  previewUrl: "",
  durationSec: "",
});

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
  const { user, source, isSessionLoading, refreshSession } = useAppAuthUser();
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
  const [authHint, setAuthHint] = useState("");
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
  const resolvedTonWalletAddress = useMemo(
    () => String(tonWallet?.account?.address ?? tonWalletAddress).trim(),
    [tonWallet?.account?.address, tonWalletAddress],
  );

  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [artists, setArtists] = useState<ShopCatalogArtist[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);

  const [orders, setOrders] = useState<ShopOrder[]>([]);
  const [ordersError, setOrdersError] = useState("");

  const [artistProfile, setArtistProfile] = useState<ArtistProfile | null>(null);
  const [artistTracks, setArtistTracks] = useState<ArtistTrack[]>([]);
  const [artistDonationsCount, setArtistDonationsCount] = useState(0);
  const [artistSubscriptionsCount, setArtistSubscriptionsCount] = useState(0);
  const [artistSaving, setArtistSaving] = useState(false);
  const [trackSaving, setTrackSaving] = useState(false);
  const [artistError, setArtistError] = useState("");

  const [profileEditorOpen, setProfileEditorOpen] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [socialOverlay, setSocialOverlay] = useState<"followers" | "following" | null>(null);

  const [userDraft, setUserDraft] = useState<UserProfileEditorPayload>(() => ({
    displayName: fullName,
    username: user?.username || "",
    avatarUrl: user?.photo_url || "",
    coverUrl: "",
    bio: "",
  }));

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

      const [postsSnapshot, catalog] = await Promise.all([
        fetch("/api/blog/posts", { cache: "no-store" })
          .then(async (response) => {
            if (!response.ok) {
              return [] as BlogPost[];
            }

            const payload = (await response.json()) as { posts?: BlogPost[] };
            return Array.isArray(payload.posts) ? payload.posts : [];
          })
          .catch(() => [] as BlogPost[]),
        fetchPublicCatalog(),
      ]);

      if (!mounted) {
        return;
      }

      setPosts(postsSnapshot);
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
    if (!user?.id) {
      return;
    }

    let mounted = true;

    void fetchMyUserProfile().then((result) => {
      if (!mounted) {
        return;
      }

      if (result.profile) {
        setUserDraft({
          displayName: result.profile.displayName || fullName,
          username: result.profile.username || user.username || "",
          avatarUrl: result.profile.avatarUrl || user.photo_url || "",
          coverUrl: result.profile.coverUrl || "",
          bio: result.profile.bio || "",
        });
        return;
      }

      setUserDraft({
        displayName: fullName,
        username: user.username || "",
        avatarUrl: user.photo_url || "",
        coverUrl: "",
        bio: "",
      });
    });

    return () => {
      mounted = false;
    };
  }, [fullName, user?.id, user?.photo_url, user?.username]);

  useEffect(() => {
    if (isSessionLoading || !user?.id) {
      const timer = window.setTimeout(() => {
        setOrders([]);
        setOrdersError("");
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
      setOrdersError(response.error ?? "");
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

  const followingProfilesPreview = useMemo(() => followingPeople.slice(0, 10), [followingPeople]);
  const followerProfilesPreview = useMemo(() => followerPeople.slice(0, 10), [followerPeople]);

  const activeOrders = useMemo(() => {
    return orders.filter((order) => !FINAL_ORDER_STATUSES.has(order.status));
  }, [orders]);

  const purchasedReleases = useMemo(() => {
    const bySlug = new Map(products.map((item) => [item.slug, item]));
    return allPurchasedReleaseSlugs.map((slug) => bySlug.get(slug)).filter((item): item is ShopProduct => Boolean(item));
  }, [allPurchasedReleaseSlugs, products]);
  const mintedReleaseCards = useMemo(() => {
    const bySlug = new Map(products.map((item) => [item.slug, item]));

    return mintedReleaseNfts.map((nft) => ({
      nft,
      release: bySlug.get(nft.releaseSlug) ?? null,
    }));
  }, [mintedReleaseNfts, products]);

  const highlightedPosts = useMemo(() => posts.slice(0, 4), [posts]);

  const handleModeChange = async (nextMode: ProfileMode) => {
    if (!user?.id) {
      setAuthHint("Для переключения режима войдите через Telegram Widget.");
      return;
    }

    if (nextMode === mode) {
      return;
    }

    const saved = await writeProfileMode(viewerKey, nextMode);
    setMode(saved);
  };

  const handleTogglePurchasesVisibility = async () => {
    if (!user?.id) {
      setAuthHint("Сначала войдите через Telegram Widget, чтобы управлять приватностью.");
      return;
    }

    const next = await writePurchasesVisibility(viewerKey, !purchasesVisible);
    setPurchasesVisible(next);
  };

  const handleToggleFollowing = async (slug: string) => {
    if (!user?.id) {
      setAuthHint("Чтобы подписываться на пользователей, войдите через Telegram Widget.");
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
    window.open(buildTelegramShareUrl(profileUrl, "Смотрите мой профиль и награды в Culture3k"), "_blank", "noopener,noreferrer");
  };

  const submitUserProfile = async () => {
    if (!user?.id) {
      setProfileMessage("Для редактирования профиля требуется вход через Telegram.");
      return;
    }

    const payload: UserProfileEditorPayload = {
      displayName: userDraft.displayName.trim(),
      username: userDraft.username?.trim() || undefined,
      avatarUrl: userDraft.avatarUrl?.trim() || undefined,
      coverUrl: userDraft.coverUrl?.trim() || undefined,
      bio: userDraft.bio?.trim() || undefined,
    };

    if (!payload.displayName) {
      setProfileMessage("Имя профиля не может быть пустым.");
      return;
    }

    setProfileSaving(true);
    setProfileMessage("");

    const result = await updateMyUserProfile(payload);
    setProfileSaving(false);

    if (result.error || !result.profile) {
      setProfileMessage(result.error ?? "Не удалось сохранить профиль.");
      return;
    }

    setUserDraft({
      displayName: result.profile.displayName,
      username: result.profile.username || "",
      avatarUrl: result.profile.avatarUrl || "",
      coverUrl: result.profile.coverUrl || "",
      bio: result.profile.bio || "",
    });

    await refreshFollowOverview([viewerSlug, ...followingSlugs, ...followerSlugs]);
    setProfileMessage("Профиль обновлён.");
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
              <p className={styles.kicker}>Social Profile</p>
              <h1>{currentProfile?.displayName || fullName}</h1>
              <p>
                @{viewerSlug} · {source === "telegram-webapp" ? "Telegram Mini App" : source === "browser-widget" ? "Telegram Widget" : "Гость"}
              </p>
            </div>

            <div className={styles.roleSwitch}>
              <button
                type="button"
                className={mode === "listener" ? styles.roleSwitchActive : ""}
                onClick={() => void handleModeChange("listener")}
              >
                Покупатель
              </button>
              <button
                type="button"
                className={mode === "artist" ? styles.roleSwitchActive : ""}
                onClick={() => void handleModeChange("artist")}
              >
                Артист
              </button>
            </div>
          </div>

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
              <span>Награды</span>
              <strong>{currentProfile?.awards.length ?? 0}</strong>
            </article>
            <article>
              <span>Куплено релизов</span>
              <strong>{allPurchasedReleaseSlugs.length}</strong>
            </article>
          </div>

          <div className={styles.heroActions}>
            <button type="button" onClick={() => setProfileEditorOpen((prev) => !prev)}>
              {profileEditorOpen ? "Скрыть редактирование" : "Редактировать профиль"}
            </button>
            <button type="button" onClick={handleShareProfile}>
              Поделиться профилем
            </button>
            <Link href="/search">Искать людей и релизы</Link>
            <Link href="/shop">Открыть витрину</Link>
          </div>
        </section>

        {profileEditorOpen ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Редактирование профиля</h2>
              <p>Публичные данные профиля</p>
            </div>

            <div className={styles.artistFormGrid}>
              <label>
                Отображаемое имя
                <input
                  value={userDraft.displayName}
                  onChange={(event) => setUserDraft((prev) => ({ ...prev, displayName: event.target.value }))}
                  maxLength={120}
                />
              </label>
              <label>
                Username
                <input
                  value={userDraft.username ?? ""}
                  onChange={(event) => setUserDraft((prev) => ({ ...prev, username: event.target.value }))}
                  maxLength={64}
                />
              </label>
              <label>
                Avatar URL
                <input
                  value={userDraft.avatarUrl ?? ""}
                  onChange={(event) => setUserDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                  maxLength={3000}
                />
              </label>
              <label>
                Cover URL
                <input
                  value={userDraft.coverUrl ?? ""}
                  onChange={(event) => setUserDraft((prev) => ({ ...prev, coverUrl: event.target.value }))}
                  maxLength={3000}
                />
              </label>
              <label>
                Bio
                <textarea
                  value={userDraft.bio ?? ""}
                  onChange={(event) => setUserDraft((prev) => ({ ...prev, bio: event.target.value }))}
                  maxLength={500}
                />
              </label>
            </div>

            <button type="button" className={styles.primaryButton} onClick={() => void submitUserProfile()} disabled={profileSaving}>
              {profileSaving ? "Сохраняем..." : "Сохранить профиль"}
            </button>
            {profileMessage ? <p className={styles.emptyState}>{profileMessage}</p> : null}
          </section>
        ) : null}

        <section className={styles.walletSection}>
          <div>
            <h2>Внутренний баланс</h2>
            <p>Баланс пополняется Telegram Stars, с него оплачиваются релизы и донаты внутри платформы.</p>
            <p className={styles.tonWalletHint}>
              {resolvedTonWalletAddress
                ? `TON-кошелек: ${resolvedTonWalletAddress.slice(0, 6)}...${resolvedTonWalletAddress.slice(-6)}`
                : "TON-кошелек не подключен"}
            </p>
          </div>

          <div className={styles.walletValue}>{formatStarsFromCents(walletCents)} ⭐</div>

          <div className={styles.walletActions}>
            <Link href="/balance">Пополнить баланс</Link>
            <TonConnectButton className={styles.tonConnectButton} />
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Награды профиля</h2>
            <p>{currentProfile?.awards.length ?? 0}</p>
          </div>

          <div className={styles.awardsGrid}>
            {(currentProfile?.awards ?? []).map((award) => (
              <article key={award.id} className={`${styles.awardCard} ${styles[`awardTier${award.tier}`]}`}>
                <p>{award.icon}</p>
                <h3>{award.title}</h3>
                <span>{award.description}</span>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Подписки и подписчики</h2>
            <p>Ваши связи в сети</p>
          </div>

          <div className={styles.socialColumns}>
            <div>
              <h3>Вы подписаны</h3>
              <div className={styles.socialList}>
                {followingProfilesPreview.length > 0 ? (
                  followingProfilesPreview.map((profile) => (
                    <article key={profile.slug} className={styles.personCard}>
                      <Link href={`/profile/${profile.slug}`} className={styles.personIdentity}>
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
                      <button type="button" onClick={() => void handleToggleFollowing(profile.slug)}>
                        Отписаться
                      </button>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>Подписок пока нет.</p>
                )}
              </div>
            </div>

            <div>
              <h3>Вас читают</h3>
              <div className={styles.socialList}>
                {followerProfilesPreview.length > 0 ? (
                  followerProfilesPreview.map((profile) => (
                    <article key={profile.slug} className={styles.personCard}>
                      <Link href={`/profile/${profile.slug}`} className={styles.personIdentity}>
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
                      <button type="button" onClick={() => void handleToggleFollowing(profile.slug)}>
                        {followingSlugs.includes(profile.slug) ? "Подписан" : "Подписаться"}
                      </button>
                    </article>
                  ))
                ) : (
                  <p className={styles.emptyState}>Подписчиков пока нет.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Купленные релизы</h2>
            <p>{purchasedReleases.length}</p>
          </div>

          <label className={styles.visibilityToggle}>
            <input type="checkbox" checked={purchasesVisible} onChange={() => void handleTogglePurchasesVisibility()} />
            Показывать покупки подписчикам
          </label>

          {purchasesVisible ? (
            <div className={styles.releaseGrid}>
              {purchasedReleases.length > 0 ? (
                purchasedReleases.map((release) => (
                  <article key={release.slug} className={styles.releaseCard}>
                    <Link href={`/shop/${release.slug}`}>
                      <Image src={release.image} alt={release.title} width={360} height={130} />
                    </Link>
                    <div>
                      <Link href={`/shop/${release.slug}`}>{release.title}</Link>
                      <p>{formatStarsFromCents(release.priceStarsCents)} ⭐</p>
                    </div>
                  </article>
                ))
              ) : (
                <p className={styles.emptyState}>Пока пусто. Покупайте релизы и хвастайтесь коллекцией перед друзьями.</p>
              )}
            </div>
          ) : (
            <p className={styles.emptyState}>Витрина покупок скрыта. Откройте её, чтобы друзья видели вашу коллекцию.</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Коллекция в приложении</h2>
            <p>{mintedReleaseCards.length}</p>
          </div>

          {mintedReleaseCards.length > 0 ? (
            <div className={styles.releaseGrid}>
              {mintedReleaseCards.map(({ nft, release }) => (
                <article key={nft.id} className={styles.releaseCard}>
                  {release ? (
                    <Link href={`/shop/${release.slug}`}>
                      <Image src={release.image} alt={release.title} width={360} height={130} />
                    </Link>
                  ) : (
                    <div className={styles.releaseFallback}>OFF</div>
                  )}
                  <div>
                    <Link href={release ? `/shop/${release.slug}` : `/shop`}>{release?.title || nft.releaseSlug}</Link>
                    <p>Off-chain запись • {new Date(nft.mintedAt).toLocaleDateString("ru-RU")}</p>
                    <small>{`${nft.ownerAddress.slice(0, 6)}...${nft.ownerAddress.slice(-6)}`}</small>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>Пока нет записей коллекции. Здесь появятся ваши релизы до подключения реального TON NFT mint.</p>
          )}
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Лента из блога</h2>
            <p>{highlightedPosts.length}</p>
          </div>

          <div className={styles.blogList}>
            {highlightedPosts.map((post) => (
              <Link key={post.slug} href={`/post/${post.slug}`} className={styles.blogCard}>
                <Image src={post.cover.src} alt={post.title} width={120} height={96} />
                <div>
                  <strong>{post.title}</strong>
                  <p>{post.excerpt}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.sectionHeader}>
            <h2>Заказы</h2>
            <p>{activeOrders.length} активных</p>
          </div>

          {ordersError ? <p className={styles.warning}>Ошибка загрузки заказов: {ordersError}</p> : null}

          {activeOrders.length > 0 ? (
            <div className={styles.ordersRow}>
              {activeOrders.map((order) => (
                <article key={order.id} className={styles.orderCard}>
                  <p>#{order.id}</p>
                  <span>{new Date(order.createdAt).toLocaleDateString("ru-RU")}</span>
                  <strong>{formatStarsFromCents(order.totalStarsCents)} ⭐</strong>
                </article>
              ))}
            </div>
          ) : (
            <p className={styles.emptyState}>Активных заказов сейчас нет.</p>
          )}
        </section>

        {mode === "artist" ? (
          <section className={styles.section}>
            <div className={styles.sectionHeader}>
              <h2>Режим артиста</h2>
              <p>{artistProfile?.status ?? "не активирован"}</p>
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
                Bio
                <textarea
                  value={artistDraft.bio}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, bio: event.target.value }))}
                />
              </label>
              <label>
                Avatar URL
                <input
                  value={artistDraft.avatarUrl}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, avatarUrl: event.target.value }))}
                />
              </label>
              <label>
                Cover URL
                <input
                  value={artistDraft.coverUrl}
                  onChange={(event) => setArtistDraft((prev) => ({ ...prev, coverUrl: event.target.value }))}
                />
              </label>
              <label>
                Подписка (cents)
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
                  <option value="single">Single</option>
                  <option value="ep">EP</option>
                  <option value="album">Album</option>
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
                Cover URL
                <input
                  value={trackDraft.coverImage}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, coverImage: event.target.value }))}
                />
              </label>
              <label>
                Telegram audio_file_id
                <input
                  value={trackDraft.audioFileId}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, audioFileId: event.target.value }))}
                />
              </label>
              <label>
                Preview URL (общий)
                <input
                  value={trackDraft.previewUrl}
                  onChange={(event) => setTrackDraft((prev) => ({ ...prev, previewUrl: event.target.value }))}
                />
              </label>
              <label>
                Цена (cents)
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
                      Preview URL
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
                      {track.subtitle || track.genre || "Single"} · {track.releaseTracklist?.length ?? 1} треков
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

        {!user && !isSessionLoading ? (
          <section className={styles.section}>
            <h2>Вход через Telegram</h2>
            <TelegramLoginWidget
              onAuthorized={() => {
                setAuthHint("");
                void refreshSession();
              }}
            />
            <p className={styles.emptyState}>Без авторизации недоступны персональные покупки, баланс и публикация релизов.</p>
          </section>
        ) : null}

        {!user?.id && authHint ? <p className={styles.warning}>{authHint}</p> : null}

        {catalogLoading ? <p className={styles.loading}>Обновляем социальный профиль...</p> : null}
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
