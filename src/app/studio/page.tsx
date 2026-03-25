"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { BackButtonController } from "@/components/back-button-controller";
import { SegmentedTabs } from "@/components/segmented-tabs";
import { StarsIcon } from "@/components/stars-icon";
import { TelegramLoginWidget } from "@/components/telegram-login-widget";
import {
  createMyArtistTrack,
  fetchMyArtistProfile,
  requestMyArtistPayout,
  uploadMyArtistAudioFile,
  upsertMyArtistProfile,
} from "@/lib/admin-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import { useAppAuthUser } from "@/hooks/use-app-auth-user";
import type {
  ArtistPayoutAuditEntry,
  ArtistPayoutRequest,
  ArtistPayoutSummary,
  ArtistProfile,
  ArtistReleaseTrackItem,
  ArtistStudioStats,
  ArtistTrack,
} from "@/types/shop";

import styles from "./page.module.scss";

type StudioTab = "overview" | "profile" | "releases" | "payouts";

interface TrackRowDraft {
  id: string;
  title: string;
  previewUrl: string;
  previewFileName: string;
  previewGenerated: boolean;
  audioFileId: string;
  audioFormat: ArtistTrack["formats"][number]["format"];
  audioFileName: string;
  durationSec: string;
  priceStarsCents: string;
}

const createTrackRowDraft = (index: number): TrackRowDraft => ({
  id: `track-${index}`,
  title: "",
  previewUrl: "",
  previewFileName: "",
  previewGenerated: false,
  audioFileId: "",
  audioFormat: "mp3",
  audioFileName: "",
  durationSec: "30",
  priceStarsCents: "",
});

const formatTrackDraftLabel = (row: TrackRowDraft, index: number): string => {
  return row.title.trim() || `Трек #${index + 1}`;
};

const buildTrackPreviewProxyUrl = (input: {
  fileId?: string;
  fileName?: string;
}): string => {
  const fileId = String(input.fileId ?? "").trim();
  const fileName = String(input.fileName ?? "demo-preview.mp3").trim() || "demo-preview.mp3";
  return `/api/media/telegram-preview?fileId=${encodeURIComponent(fileId)}&format=mp3&name=${encodeURIComponent(fileName)}`;
};

const resolveTrackPreviewFallback = (row: Pick<TrackRowDraft, "previewUrl" | "audioFileId" | "audioFormat" | "audioFileName">): string => {
  const explicitPreviewUrl = String(row.previewUrl || "").trim();
  if (explicitPreviewUrl) {
    return explicitPreviewUrl;
  }

  if (String(row.audioFileId || "").trim() && row.audioFormat === "mp3") {
    return buildTrackPreviewProxyUrl({
      fileId: row.audioFileId,
      fileName: row.audioFileName || "demo-preview.mp3",
    });
  }

  return "";
};

const normalizeReleaseTracklistDraft = (rows: TrackRowDraft[]): ArtistReleaseTrackItem[] => {
  return rows.reduce<ArtistReleaseTrackItem[]>((acc, row, index) => {
    const title = row.title.trim();
    if (!title) {
      return acc;
    }

    const item: ArtistReleaseTrackItem = {
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

    const previewUrl = resolveTrackPreviewFallback(row);
    const durationSec = Math.min(30, Math.round(Number(row.durationSec || "30")));
    const priceStarsCents = Math.round(Number(row.priceStarsCents || "0"));

    if (previewUrl) {
      item.previewUrl = previewUrl;
    }

    if (row.audioFileId.trim()) {
      item.audioFileId = row.audioFileId.trim();
      item.audioFormat = row.audioFormat;
    }

    if (row.audioFileName.trim()) {
      item.audioFileName = row.audioFileName.trim();
    }

    if (Number.isFinite(durationSec) && durationSec > 0) {
      item.durationSec = durationSec;
    }

    if (Number.isFinite(priceStarsCents) && priceStarsCents > 0) {
      item.priceStarsCents = priceStarsCents;
    }

    acc.push(item);
    return acc;
  }, []);
};

const formatShortTonAddress = (value: string | undefined): string => {
  const normalized = String(value ?? "").trim();
  if (normalized.length <= 14) {
    return normalized;
  }

  return `${normalized.slice(0, 6)}...${normalized.slice(-6)}`;
};

const formatInputStars = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return "";
  }

  const major = value / 100;
  return Number.isInteger(major) ? String(major) : major.toFixed(2).replace(/\.?0+$/, "");
};

const formatSourceLabel = (value: "postgres" | "legacy"): string => {
  return value === "postgres" ? "Postgres" : "Legacy";
};

const formatReleaseStatusLabel = (value: ArtistTrack["status"]): string => {
  switch (value) {
    case "published":
      return "Опубликован";
    case "pending_moderation":
      return "На модерации";
    case "rejected":
      return "Нужны правки";
    default:
      return "Черновик";
  }
};

const formatPayoutStatusLabel = (value: ArtistPayoutRequest["status"]): string => {
  switch (value) {
    case "approved":
      return "Одобрен";
    case "rejected":
      return "Отклонён";
    case "paid":
      return "Выплачен";
    default:
      return "На проверке";
  }
};

const getStorageStatusTone = (
  value: ArtistTrack["storageSummary"] | undefined,
): "success" | "warning" | "danger" | "default" => {
  switch (value?.status) {
    case "verified":
    case "archived":
      return "success";
    case "prepared":
    case "syncing":
      return "warning";
    case "attention":
      return "danger";
    default:
      return "default";
  }
};

const toToneClassName = (
  stylesMap: Record<string, string>,
  value: "success" | "warning" | "danger" | "default",
): string => {
  switch (value) {
    case "success":
      return stylesMap.toneSuccess;
    case "warning":
      return stylesMap.toneWarning;
    case "danger":
      return stylesMap.toneDanger;
    default:
      return stylesMap.toneDefault;
  }
};

const getReleaseStatusTone = (value: ArtistTrack["status"]): "success" | "warning" | "danger" | "default" => {
  switch (value) {
    case "published":
      return "success";
    case "pending_moderation":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "default";
  }
};

const getPayoutStatusTone = (
  value: ArtistPayoutRequest["status"],
): "success" | "warning" | "danger" | "default" => {
  switch (value) {
    case "paid":
      return "success";
    case "approved":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "default";
  }
};

const tabItems = [
  { id: "overview", label: "Обзор" },
  { id: "profile", label: "Профиль" },
  { id: "releases", label: "Релизы" },
  { id: "payouts", label: "Выплаты" },
] satisfies Array<{ id: StudioTab; label: string }>;

export default function StudioPage() {
  const router = useRouter();
  const { user, isSessionLoading, refreshSession } = useAppAuthUser();

  const [currentTab, setCurrentTab] = useState<StudioTab>("overview");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [tracks, setTracks] = useState<ArtistTrack[]>([]);
  const [stats, setStats] = useState<ArtistStudioStats | null>(null);
  const [payoutSummary, setPayoutSummary] = useState<ArtistPayoutSummary | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<ArtistPayoutRequest[]>([]);
  const [payoutAuditEntries, setPayoutAuditEntries] = useState<ArtistPayoutAuditEntry[]>([]);
  const [artistSource, setArtistSource] = useState<"postgres" | "legacy">("legacy");
  const [financeSource, setFinanceSource] = useState<"postgres" | "legacy">("legacy");
  const [supportSource, setSupportSource] = useState<"postgres" | "legacy">("legacy");
  const [profileSaving, setProfileSaving] = useState(false);
  const [releaseSaving, setReleaseSaving] = useState(false);
  const [payoutSaving, setPayoutSaving] = useState(false);

  const [profileDraft, setProfileDraft] = useState({
    displayName: "",
    bio: "",
    avatarUrl: "",
    coverUrl: "",
    tonWalletAddress: "",
    donationEnabled: true,
    subscriptionEnabled: false,
    subscriptionPriceStarsCents: "100",
  });
  const [releaseDraft, setReleaseDraft] = useState({
    title: "",
    releaseType: "single" as ArtistTrack["releaseType"],
    subtitle: "",
    description: "",
    coverImage: "",
    audioFileId: "",
    audioFormat: "mp3" as ArtistTrack["formats"][number]["format"],
    audioFileName: "",
    genre: "",
    priceStarsCents: "100",
    isMintable: true,
    releaseTracklist: [createTrackRowDraft(1)],
  });
  const [masterUploadPending, setMasterUploadPending] = useState(false);
  const [previewUploadPendingKey, setPreviewUploadPendingKey] = useState("");
  const [payoutDraft, setPayoutDraft] = useState({
    amountStars: "",
    note: "",
  });

  const activeTabIndex = Math.max(
    0,
    tabItems.findIndex((item) => item.id === currentTab),
  );

  const load = async () => {
    setLoading(true);
    setError("");

    const response = await fetchMyArtistProfile();

    if (response.error) {
      setError(response.error);
      setLoading(false);
      return;
    }

    setProfile(response.profile);
    setTracks(response.tracks);
    setStats(response.studioStats);
    setPayoutSummary(response.payoutSummary);
    setPayoutRequests(response.payoutRequests);
    setPayoutAuditEntries(response.payoutAuditEntries);
    setArtistSource(response.artistSource);
    setFinanceSource(response.financeSource);
    setSupportSource(response.supportSource);

    if (response.profile) {
      setProfileDraft({
        displayName: response.profile.displayName,
        bio: response.profile.bio,
        avatarUrl: response.profile.avatarUrl ?? "",
        coverUrl: response.profile.coverUrl ?? "",
        tonWalletAddress: response.profile.tonWalletAddress ?? "",
        donationEnabled: response.profile.donationEnabled,
        subscriptionEnabled: response.profile.subscriptionEnabled,
        subscriptionPriceStarsCents: String(response.profile.subscriptionPriceStarsCents),
      });
    }

    if (response.payoutSummary?.availableStarsCents) {
      setPayoutDraft((current) => ({
        ...current,
        amountStars: current.amountStars || formatInputStars(response.payoutSummary?.availableStarsCents ?? 0),
      }));
    }

    setLoading(false);
  };

  useEffect(() => {
    if (isSessionLoading) {
      return;
    }

    if (!user?.id) {
      return;
    }

    const timerId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [isSessionLoading, user?.id]);

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    router.push("/profile");
  };

  const updateTrackRow = (index: number, patch: Partial<TrackRowDraft>) => {
    setReleaseDraft((current) => ({
      ...current,
      releaseTracklist: current.releaseTracklist.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    }));
  };

  const addTrackRow = () => {
    setReleaseDraft((current) => ({
      ...current,
      releaseTracklist: [...current.releaseTracklist, createTrackRowDraft(current.releaseTracklist.length + 1)],
    }));
  };

  const removeTrackRow = (index: number) => {
    setReleaseDraft((current) => {
      const nextRows = current.releaseTracklist.filter((_, rowIndex) => rowIndex !== index);
      return {
        ...current,
        releaseTracklist: nextRows.length > 0 ? nextRows : [createTrackRowDraft(1)],
      };
    });
  };

  const uploadMasterFile = async (file: File | null) => {
    if (!file) {
      return;
    }

    const shouldAutoPreviewFromPackage = releaseDraft.releaseTracklist.length === 1;

    setMasterUploadPending(true);
    setError("");
    setMessage("");

    const response = await uploadMyArtistAudioFile({
      kind: "master",
      file,
      autoPreview: shouldAutoPreviewFromPackage,
    });

    setMasterUploadPending(false);

    if (response.error || !response.upload) {
      setError(response.error ?? "Не удалось загрузить master-файл.");
      return;
    }

    const resolvedPreview =
      response.generatedPreview?.previewUrl
        ? response.generatedPreview
        : response.upload.detectedFormat === "mp3"
          ? {
              kind: "preview" as const,
              fileId: response.upload.fileId,
              fileName: response.upload.fileName,
              mimeType: "audio/mpeg",
              detectedFormat: "mp3" as const,
              sizeBytes: response.upload.sizeBytes,
              previewUrl: buildTrackPreviewProxyUrl({
                fileId: response.upload.fileId,
                fileName: response.upload.fileName,
              }),
            }
          : null;
    const previewReusedMaster = Boolean(
      resolvedPreview?.previewUrl && resolvedPreview.fileId === response.upload.fileId,
    );

    setReleaseDraft((current) => {
      const nextTracklist =
        current.releaseTracklist.length === 1 && !current.releaseTracklist[0]?.audioFileId
          ? current.releaseTracklist.map((row, index) =>
              index === 0
                ? {
                    ...row,
                    audioFileId: response.upload?.fileId ?? "",
                    audioFormat: response.upload?.detectedFormat ?? row.audioFormat,
                    audioFileName: response.upload?.fileName ?? "",
                    previewUrl: resolvedPreview?.previewUrl ?? row.previewUrl,
                    previewFileName: resolvedPreview?.fileName ?? row.previewFileName,
                    previewGenerated: resolvedPreview?.previewUrl ? !previewReusedMaster : row.previewGenerated,
                  }
                : row,
            )
          : current.releaseTracklist;

      return {
        ...current,
        audioFileId: response.upload?.fileId ?? "",
        audioFormat: response.upload?.detectedFormat ?? current.audioFormat,
        audioFileName: response.upload?.fileName ?? "",
        releaseTracklist: nextTracklist,
      };
    });

    if (resolvedPreview?.previewUrl) {
      setMessage(
        previewReusedMaster
          ? `Master-файл загружен, demo preview подставлен из MP3 master: ${resolvedPreview.fileName}`
          : `Master-файл загружен, demo preview готов: ${resolvedPreview.fileName}`,
      );
      return;
    }

    if (response.generatedPreviewError) {
      setMessage(`Master-файл загружен. Demo preview не создался автоматически: ${response.generatedPreviewError}`);
      return;
    }

    setMessage(`Master-файл загружен: ${response.upload.fileName}`);
  };

  const uploadTrackPreviewFile = async (index: number, file: File | null) => {
    if (!file) {
      return;
    }

    const uploadKey = `track-preview-${index}`;
    setPreviewUploadPendingKey(uploadKey);
    setError("");
    setMessage("");

    const response = await uploadMyArtistAudioFile({
      kind: "preview",
      file,
    });

    setPreviewUploadPendingKey("");

    if (response.error || !response.upload?.previewUrl) {
      setError(response.error ?? "Не удалось загрузить demo preview.");
      return;
    }

    updateTrackRow(index, {
      previewUrl: response.upload.previewUrl,
      previewFileName: response.upload.fileName,
      previewGenerated: false,
      durationSec: "30",
    });
    setMessage(`Demo preview загружен: ${response.upload.fileName}`);
  };

  const uploadTrackMasterFile = async (index: number, file: File | null) => {
    if (!file) {
      return;
    }

    const uploadKey = `track-master-${index}`;
    setPreviewUploadPendingKey(uploadKey);
    setError("");
    setMessage("");

    const response = await uploadMyArtistAudioFile({
      kind: "master",
      file,
      autoPreview: true,
    });

    setPreviewUploadPendingKey("");

    if (response.error || !response.upload) {
      setError(response.error ?? "Не удалось загрузить master-файл трека.");
      return;
    }

    const uploadedTrackMaster = response.upload;
    const resolvedPreview =
      response.generatedPreview?.previewUrl
        ? response.generatedPreview
        : uploadedTrackMaster.detectedFormat === "mp3"
          ? {
              kind: "preview" as const,
              fileId: uploadedTrackMaster.fileId,
              fileName: uploadedTrackMaster.fileName,
              mimeType: "audio/mpeg",
              detectedFormat: "mp3" as const,
              sizeBytes: uploadedTrackMaster.sizeBytes,
              previewUrl: buildTrackPreviewProxyUrl({
                fileId: uploadedTrackMaster.fileId,
                fileName: uploadedTrackMaster.fileName,
              }),
            }
          : null;
    const previewReusedMaster = Boolean(
      resolvedPreview?.previewUrl && resolvedPreview.fileId === uploadedTrackMaster.fileId,
    );

    setReleaseDraft((current) => ({
      ...current,
      releaseTracklist: current.releaseTracklist.map((row, rowIndex) =>
        rowIndex === index
          ? {
              ...row,
              audioFileId: uploadedTrackMaster.fileId,
              audioFormat: uploadedTrackMaster.detectedFormat,
              audioFileName: uploadedTrackMaster.fileName,
              previewUrl: resolvedPreview?.previewUrl ?? row.previewUrl,
              previewFileName: resolvedPreview?.fileName ?? row.previewFileName,
              previewGenerated: resolvedPreview?.previewUrl ? !previewReusedMaster : row.previewGenerated,
              durationSec: "30",
            }
          : row,
      ),
    }));

    if (resolvedPreview?.previewUrl) {
      setMessage(
        previewReusedMaster
          ? `Файл трека загружен, demo preview подставлен из MP3 master: ${resolvedPreview.fileName}`
          : `Файл трека загружен, demo preview готов: ${resolvedPreview.fileName}`,
      );
      return;
    }

    if (response.generatedPreviewError) {
      setError(`Файл трека загружен, но demo preview не создался автоматически. ${response.generatedPreviewError}`);
      return;
    }

    setMessage(`Файл трека загружен: ${response.upload.fileName}`);
  };

  const saveArtistProfile = async () => {
    if (!profile) {
      return;
    }

    setProfileSaving(true);
    setError("");
    setMessage("");

    const response = await upsertMyArtistProfile({
      displayName: profileDraft.displayName.trim(),
      bio: profileDraft.bio.trim() || undefined,
      avatarUrl: profileDraft.avatarUrl.trim() || undefined,
      coverUrl: profileDraft.coverUrl.trim() || undefined,
      tonWalletAddress: profileDraft.tonWalletAddress.trim() || undefined,
      donationEnabled: profileDraft.donationEnabled,
      subscriptionEnabled: profileDraft.subscriptionEnabled,
      subscriptionPriceStarsCents: Math.max(1, Math.round(Number(profileDraft.subscriptionPriceStarsCents || "1"))),
    });

    setProfileSaving(false);

    if (response.error || !response.profile) {
      setError(response.error ?? "Не удалось обновить профиль артиста.");
      return;
    }

    setProfile(response.profile);
    setMessage("Профиль артиста сохранён.");
  };

  const createRelease = async () => {
    if (!profile) {
      return;
    }

    if (!releaseDraft.audioFileId.trim()) {
      setError("Сначала загрузите пакет полного релиза через проводник.");
      return;
    }

    setReleaseSaving(true);
    setError("");
    setMessage("");

    const normalizedTracklist = normalizeReleaseTracklistDraft(releaseDraft.releaseTracklist);
    if (normalizedTracklist.length === 0) {
      setReleaseSaving(false);
      setError("Добавьте хотя бы один трек.");
      return;
    }

    const missingTrackMaster = normalizedTracklist.find((track) => !track.audioFileId || !track.audioFormat);
    if (missingTrackMaster) {
      setReleaseSaving(false);
      setError(`Для "${missingTrackMaster.title}" ещё не загружен master-файл через проводник.`);
      return;
    }

    const releasePrice = Math.max(1, Math.round(Number(releaseDraft.priceStarsCents || "1")));
    const response = await createMyArtistTrack({
      title: releaseDraft.title.trim(),
      releaseType: releaseDraft.releaseType,
      subtitle: releaseDraft.subtitle.trim() || undefined,
      description: releaseDraft.description.trim() || undefined,
      coverImage: releaseDraft.coverImage.trim() || undefined,
      audioFileId: releaseDraft.audioFileId.trim(),
      previewUrl: normalizedTracklist[0]?.previewUrl || undefined,
      genre: releaseDraft.genre.trim() || undefined,
      priceStarsCents: releasePrice,
      isMintable: releaseDraft.isMintable,
      formats: [
        {
          format: releaseDraft.audioFormat,
          audioFileId: releaseDraft.audioFileId.trim(),
          priceStarsCents: releasePrice,
          label: releaseDraft.audioFormat.toUpperCase(),
          isDefault: true,
        },
      ],
      releaseTracklist: normalizedTracklist.length > 0 ? normalizedTracklist : undefined,
    });

    setReleaseSaving(false);

    if (response.error || !response.track) {
      setError(response.error ?? "Не удалось создать релиз.");
      return;
    }

    setTracks((current) => [response.track as ArtistTrack, ...current]);
    setReleaseDraft({
      title: "",
      releaseType: "single",
      subtitle: "",
      description: "",
      coverImage: "",
      audioFileId: "",
      audioFormat: "mp3",
      audioFileName: "",
      genre: "",
      priceStarsCents: "100",
      isMintable: true,
      releaseTracklist: [createTrackRowDraft(1)],
    });
    setMessage("Релиз отправлен в студию.");
    void load();
  };

  const payoutAmountCents = Math.max(0, Math.round(Number(payoutDraft.amountStars || "0") * 100));

  const submitPayoutRequest = async () => {
    setPayoutSaving(true);
    setError("");
    setMessage("");

    const response = await requestMyArtistPayout({
      amountStarsCents: payoutAmountCents,
      note: payoutDraft.note.trim() || undefined,
    });

    setPayoutSaving(false);

    if (response.error || !response.payoutRequest) {
      setError(response.error ?? "Не удалось создать запрос на вывод.");
      return;
    }

    setMessage("Запрос на вывод отправлен в модерацию.");
    setPayoutDraft((current) => ({ ...current, note: "" }));
    void load();
  };

  const statusLabel = useMemo(() => {
    if (!profile) {
      return "Нет доступа";
    }

    if (profile.status === "approved") {
      return "Одобрено";
    }

    if (profile.status === "suspended") {
      return "Приостановлено";
    }

    if (profile.status === "rejected") {
      return "Отклонено";
    }

    return "На модерации";
  }, [profile]);

  const payoutAuditByRequestId = useMemo(() => {
    const map = new Map<string, ArtistPayoutAuditEntry[]>();
    for (const entry of payoutAuditEntries) {
      const current = map.get(entry.payoutRequestId) ?? [];
      current.push(entry);
      map.set(entry.payoutRequestId, current);
    }

    map.forEach((entries) => {
      entries.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    });

    return map;
  }, [payoutAuditEntries]);

  const nextHoldReleaseLabel = useMemo(() => {
    if (!payoutSummary?.nextHoldReleaseAt) {
      return "";
    }

    return new Date(payoutSummary.nextHoldReleaseAt).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
    });
  }, [payoutSummary]);

  const studioPrimaryInsight = useMemo(() => {
    const storageAttentionCount = tracks.filter((track) => track.storageSummary?.status === "attention").length;

    if (storageAttentionCount > 0) {
      return {
        title: "Storage требует внимания",
        body: `У ${storageAttentionCount} релизов есть archive/runtime проблемы. Проверьте storage status перед следующим релизным пушем.`,
      };
    }

    if (!profile?.tonWalletAddress) {
      return {
        title: "Добавьте TON-кошелёк",
        body: "Без кошелька артист не сможет запросить вывод после прохождения hold-периода.",
      };
    }

    if ((stats?.pendingReleasesCount ?? 0) > 0) {
      return {
        title: "На модерации есть релизы",
        body: "Проверьте pending-релизы: после публикации они начнут собирать продажи и статистику.",
      };
    }

    if (payoutSummary?.canRequest) {
      return {
        title: "Можно запросить вывод",
        body: "Часть заработка уже прошла hold. Откройте выплаты и отправьте запрос на TON-кошелёк.",
      };
    }

    return {
      title: "Студия готова к работе",
      body: "Следующий рост даёт регулярный выпуск релизов, обновление профиля и поддержка подписок.",
    };
  }, [payoutSummary?.canRequest, profile?.tonWalletAddress, stats?.pendingReleasesCount, tracks]);

  const storageStats = useMemo(() => {
    return {
      verified: tracks.filter((track) => track.storageSummary?.status === "verified").length,
      archived: tracks.filter((track) => track.storageSummary?.status === "archived").length,
      preparing: tracks.filter((track) => {
        const status = track.storageSummary?.status;
        return status === "prepared" || status === "syncing";
      }).length,
      attention: tracks.filter((track) => track.storageSummary?.status === "attention").length,
    };
  }, [tracks]);

  const formatPayoutAuditAction = (entry: ArtistPayoutAuditEntry): string => {
    if (entry.action === "requested") {
      return "Запрос создан";
    }

    if (entry.action === "note_updated") {
      return "Комментарий обновлён";
    }

    if (entry.statusBefore && entry.statusAfter && entry.statusBefore !== entry.statusAfter) {
      return `${entry.statusBefore} -> ${entry.statusAfter}`;
    }

    return entry.statusAfter ?? "Статус обновлён";
  };

  if (isSessionLoading || (Boolean(user?.id) && loading)) {
    return (
      <div className={styles.page}>
        <main className={styles.container}>
          <section className={styles.card}>
            <div className={styles.skeletonHero} />
            <div className={styles.skeletonGrid}>
              <span />
              <span />
              <span />
              <span />
            </div>
          </section>
        </main>
      </div>
    );
  }

  if (!user?.id) {
    return (
      <div className={styles.page}>
        <main className={styles.container}>
          <section className={styles.card}>
            <h1>Студия артиста</h1>
            <p>Для доступа нужен вход через Telegram.</p>
            <TelegramLoginWidget
              onAuthorized={() => {
                void refreshSession();
              }}
            />
          </section>
        </main>
      </div>
    );
  }

  if (!profile || profile.status !== "approved") {
    return (
      <div className={styles.page}>
        <BackButtonController onBack={handleBack} visible />
        <main className={styles.container}>
          <section className={styles.card}>
            <div className={styles.headerRow}>
              <button type="button" className={styles.backButton} onClick={handleBack}>
                Профиль
              </button>
              <span className={styles.statusChip}>Студия</span>
            </div>
            <h1>Студия недоступна</h1>
            <p>
              Сначала нужно пройти модерацию заявки на артиста. После одобрения здесь появятся
              статистика, релизы и выплаты.
            </p>
            {error ? <p className={styles.error}>{error}</p> : null}
            <Link href="/profile/edit" className={styles.primaryButton}>
              Открыть настройки доступа
            </Link>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <main className={styles.container}>
        <section className={styles.hero}>
          <div className={styles.headerRow}>
            <button type="button" className={styles.backButton} onClick={handleBack}>
              Профиль
            </button>
            <span className={styles.statusChip}>{statusLabel}</span>
          </div>

          <div className={styles.heroMain}>
            <div className={styles.heroMeta}>
              <span>Студия артиста</span>
              <h1>{profile.displayName}</h1>
              <p>{profile.bio || "Управление релизами, витриной и выплатами."}</p>
              <div className={styles.sourceRow}>
                <span className={`${styles.sourcePill} ${artistSource === "postgres" ? styles.toneSuccess : styles.toneDefault}`}>
                  Профиль: {formatSourceLabel(artistSource)}
                </span>
                <span className={`${styles.sourcePill} ${financeSource === "postgres" ? styles.toneSuccess : styles.toneDefault}`}>
                  Финансы: {formatSourceLabel(financeSource)}
                </span>
                <span className={`${styles.sourcePill} ${supportSource === "postgres" ? styles.toneSuccess : styles.toneDefault}`}>
                  Support: {formatSourceLabel(supportSource)}
                </span>
              </div>
              <small>{formatShortTonAddress(profile.tonWalletAddress) || "TON-кошелёк не задан"}</small>
            </div>

            <div className={styles.heroBalance}>
              <span>Финансовый контур</span>
              <strong className={styles.inlineAmount}>
                <StarsIcon className={styles.inlineAmountIcon} />
                {formatStarsFromCents(payoutSummary?.availableStarsCents ?? 0)}
              </strong>
              <small>Доступно к выводу сейчас</small>
              <div className={styles.balanceMetaRow}>
                <span>Hold 21 дней: {formatStarsFromCents(payoutSummary?.pendingHoldStarsCents ?? 0)}</span>
                <span>Всего заработано: {formatStarsFromCents(payoutSummary?.totalEarnedStarsCents ?? 0)}</span>
              </div>
            </div>
          </div>

          <div className={styles.heroActions}>
            <button type="button" className={styles.secondaryButton} onClick={() => setCurrentTab("releases")}>
              Новый релиз
            </button>
            <button type="button" className={styles.secondaryButton} onClick={() => setCurrentTab("payouts")}>
              Выплаты
            </button>
            <Link href={`/shop/artist/${profile.slug}`} className={styles.secondaryButton}>
              Профиль артиста
            </Link>
          </div>
        </section>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? <div className={styles.success}>{message}</div> : null}

        <div className={styles.tabsWrap}>
          <SegmentedTabs
            activeIndex={activeTabIndex}
            items={tabItems}
            onChange={(index) => setCurrentTab(tabItems[index]?.id ?? "overview")}
            ariaLabel="Разделы студии"
          />
        </div>

        {currentTab === "overview" ? (
          <section className={styles.card}>
            <div className={styles.overviewLead}>
              <div>
                <span>Что важно сейчас</span>
                <strong>{studioPrimaryInsight.title}</strong>
              </div>
              <p>{studioPrimaryInsight.body}</p>
            </div>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <span>Статус релизов</span>
                <strong>
                  {stats?.publishedReleasesCount ?? 0} опубликовано · {stats?.pendingReleasesCount ?? 0} на модерации
                </strong>
                <p>Сначала публикуйте релиз, затем проверяйте продажи, реакции и upgrade в релизном экране.</p>
              </article>
              <article className={styles.guideCard}>
                <span>Финансовый цикл</span>
                <strong>
                  Hold 21 дней · минимум {formatStarsFromCents(payoutSummary?.minimumRequestStarsCents ?? 0)}
                </strong>
                <p>
                  Доход сначала попадает в hold, после этого становится доступен к запросу на TON-кошелёк.
                </p>
              </article>
              <article className={styles.guideCard}>
                <span>Публичная витрина</span>
                <strong>{profile.displayName}</strong>
                <p>Обновляйте bio, обложку, кошелёк и поддержку: эти данные сразу видят слушатели.</p>
              </article>
              <article className={styles.guideCard}>
                <span>Storage / archive</span>
                <strong>
                  {storageStats.verified} verified · {storageStats.archived} archived
                </strong>
                <p>
                  Релизы с archive status проще контролировать после публикации: видно, что уже дошло до bags и runtime.
                </p>
              </article>
            </div>

            <div className={styles.financeHeroGrid}>
              <article className={styles.metricCard}>
                <span>Доступно</span>
                <strong className={styles.inlineAmount}>
                  <StarsIcon className={styles.inlineAmountIcon} />
                  {formatStarsFromCents(payoutSummary?.availableStarsCents ?? 0)}
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span>На hold</span>
                <strong>{formatStarsFromCents(payoutSummary?.pendingHoldStarsCents ?? 0)}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Запрошено</span>
                <strong>{formatStarsFromCents(payoutSummary?.requestedStarsCents ?? 0)}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Выплачено</span>
                <strong>{formatStarsFromCents(payoutSummary?.paidOutStarsCents ?? 0)}</strong>
              </article>
            </div>

            <div className={styles.metricGrid}>
              <article className={styles.metricCard}>
                <span>Релизы</span>
                <strong>{stats?.publishedReleasesCount ?? 0}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Продажи</span>
                <strong>{stats?.salesCount ?? 0}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Прослушивания</span>
                <strong>{stats?.playsCount ?? 0}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Реакции</span>
                <strong>{stats?.reactionsCount ?? 0}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Комментарии</span>
                <strong>{stats?.commentsCount ?? 0}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Подписки</span>
                <strong>{stats?.activeSubscriptionsCount ?? 0}</strong>
              </article>
            </div>

            <div className={styles.listSection}>
              <div className={styles.sectionHeader}>
                <h2>Последние релизы</h2>
                <p>{tracks.length}</p>
              </div>

              {tracks.length > 0 ? (
                <div className={styles.releaseList}>
                  {tracks.slice(0, 6).map((track) => (
                    <article key={track.id} className={styles.releaseRow}>
                      <div>
                        <strong>{track.title}</strong>
                        <span>
                          {track.releaseType.toUpperCase()} · {track.releaseTracklist?.length ?? 1} треков
                        </span>
                        {track.storageSummary ? (
                          <span className={styles.releaseMetaLine}>
                            Storage: {track.storageSummary.label} ·{" "}
                            {track.storageSummary.verifiedBagCount > 0
                              ? `${track.storageSummary.verifiedBagCount} verified`
                              : track.storageSummary.bagCount > 0
                                ? `${track.storageSummary.bagCount} bags`
                                : `${track.storageSummary.assetCount} assets`}
                          </span>
                        ) : null}
                      </div>
                      <div className={styles.releaseBadgeRow}>
                        <span
                          className={`${styles.statusBadge} ${toToneClassName(styles, getReleaseStatusTone(track.status))}`}
                        >
                          {formatReleaseStatusLabel(track.status)}
                        </span>
                        {track.storageSummary ? (
                          <span
                            className={`${styles.statusBadge} ${toToneClassName(styles, getStorageStatusTone(track.storageSummary))}`}
                          >
                            {track.storageSummary.label}
                          </span>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>Здесь появятся ваши релизы после первой публикации.</div>
              )}
            </div>
          </section>
        ) : null}

        {currentTab === "profile" ? (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Профиль артиста</h2>
              <p>То, что увидят слушатели и коллекционеры.</p>
            </div>

            <div className={styles.infoBanner}>
              <strong>Публичная карточка артиста</strong>
              <span>
                Эти поля используются на странице артиста, в релизах и в точках поддержки. Кошелёк нужен и для
                профиля, и для вывода средств.
              </span>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Имя артиста</span>
                <input
                  value={profileDraft.displayName}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, displayName: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>TON-кошелёк</span>
                <input
                  value={profileDraft.tonWalletAddress}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, tonWalletAddress: event.target.value }))
                  }
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Описание</span>
                <textarea
                  value={profileDraft.bio}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, bio: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Аватар</span>
                <input
                  value={profileDraft.avatarUrl}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, avatarUrl: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Обложка</span>
                <input
                  value={profileDraft.coverUrl}
                  onChange={(event) => setProfileDraft((current) => ({ ...current, coverUrl: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Цена подписки</span>
                <input
                  type="number"
                  min={1}
                  value={profileDraft.subscriptionPriceStarsCents}
                  onChange={(event) =>
                    setProfileDraft((current) => ({
                      ...current,
                      subscriptionPriceStarsCents: event.target.value,
                    }))
                  }
                />
              </label>
            </div>

            <div className={styles.toggleList}>
              <label className={styles.toggleRow}>
                <span>Принимать донаты</span>
                <input
                  type="checkbox"
                  checked={profileDraft.donationEnabled}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, donationEnabled: event.target.checked }))
                  }
                />
              </label>
              <label className={styles.toggleRow}>
                <span>Включить подписку</span>
                <input
                  type="checkbox"
                  checked={profileDraft.subscriptionEnabled}
                  onChange={(event) =>
                    setProfileDraft((current) => ({ ...current, subscriptionEnabled: event.target.checked }))
                  }
                />
              </label>
            </div>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <span>TON-кошелёк</span>
                <strong>{formatShortTonAddress(profileDraft.tonWalletAddress) || "Не указан"}</strong>
                <p>На этот адрес уходит вывод после ручного approve и прохождения hold-периода.</p>
              </article>
              <article className={styles.guideCard}>
                <span>Поддержка</span>
                <strong>
                  {profileDraft.donationEnabled ? "Донаты включены" : "Донаты выключены"} ·{" "}
                  {profileDraft.subscriptionEnabled ? "Подписка включена" : "Подписка выключена"}
                </strong>
                <p>Цена подписки задаётся здесь и сразу используется на публичной странице артиста.</p>
              </article>
            </div>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void saveArtistProfile()}
              disabled={profileSaving}
            >
              {profileSaving ? "Сохраняем..." : "Сохранить профиль"}
            </button>
          </section>
        ) : null}

        {currentTab === "releases" ? (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Новый релиз</h2>
              <p>Создание нового релиза для модерации и публикации.</p>
            </div>

            <div className={styles.infoBanner}>
              <strong>Как работает релиз</strong>
              <span>
                Слушатель может купить релиз целиком по формату или купить отдельные треки. NFT-upgrade применяется
                только к полному релизу и только если у релиза включён mint.
              </span>
            </div>

            <div className={styles.guideGrid}>
              <article className={styles.guideCard}>
                <span>Опубликовано</span>
                <strong>{stats?.publishedReleasesCount ?? 0}</strong>
                <p>Это релизы, которые уже доступны слушателям в каталоге и на странице артиста.</p>
              </article>
              <article className={styles.guideCard}>
                <span>На модерации</span>
                <strong>{stats?.pendingReleasesCount ?? 0}</strong>
                <p>Их нужно дождаться в админке: после approve релиз попадёт в витрину и в профиль артиста.</p>
              </article>
              <article className={styles.guideCard}>
                <span>Черновики и правки</span>
                <strong>{stats?.draftReleasesCount ?? 0}</strong>
                <p>Если релиз отклонён, обновите поля и треклист, затем отправьте его повторно на модерацию.</p>
              </article>
              <article className={styles.guideCard}>
                <span>Archive status</span>
                <strong>
                  {storageStats.preparing} готовится · {storageStats.attention} требуют проверки
                </strong>
                <p>После sync релиза студия теперь показывает, дошёл ли он до assets, bags и runtime verification.</p>
              </article>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Название</span>
                <input
                  value={releaseDraft.title}
                  onChange={(event) => setReleaseDraft((current) => ({ ...current, title: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Тип релиза</span>
                <select
                  value={releaseDraft.releaseType}
                  onChange={(event) =>
                    setReleaseDraft((current) => ({
                      ...current,
                      releaseType: event.target.value as ArtistTrack["releaseType"],
                    }))
                  }
                >
                  <option value="single">Сингл</option>
                  <option value="ep">EP</option>
                  <option value="album">Альбом</option>
                </select>
              </label>
              <label className={styles.field}>
                <span>Подзаголовок</span>
                <input
                  value={releaseDraft.subtitle}
                  onChange={(event) => setReleaseDraft((current) => ({ ...current, subtitle: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Жанр</span>
                <input
                  value={releaseDraft.genre}
                  onChange={(event) => setReleaseDraft((current) => ({ ...current, genre: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Обложка</span>
                <input
                  value={releaseDraft.coverImage}
                  onChange={(event) => setReleaseDraft((current) => ({ ...current, coverImage: event.target.value }))}
                />
              </label>
              <label className={styles.field}>
                <span>Пакет полного релиза</span>
                <input
                  type="file"
                  accept=".mp3,.ogg,.wav,.flac,.aac,.m4a,.alac,audio/*"
                  onChange={(event) => void uploadMasterFile(event.target.files?.[0] ?? null)}
                />
                <small className={styles.fieldHint}>
                  Полный файл релиза загружается через проводник и потом раздаётся только через storage-сеть.
                </small>
                <small className={styles.fieldValue}>
                        {masterUploadPending
                          ? "Загружаем пакет релиза..."
                          : releaseDraft.audioFileName
                            ? `${releaseDraft.audioFileName} · ${releaseDraft.audioFormat.toUpperCase()}`
                            : "Пакет полного релиза ещё не выбран"}
                </small>
              </label>
              <label className={styles.field}>
                <span>Цена релиза</span>
                <input
                  type="number"
                  min={1}
                  value={releaseDraft.priceStarsCents}
                  onChange={(event) =>
                    setReleaseDraft((current) => ({ ...current, priceStarsCents: event.target.value }))
                  }
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Описание</span>
                <textarea
                  value={releaseDraft.description}
                  onChange={(event) => setReleaseDraft((current) => ({ ...current, description: event.target.value }))}
                />
              </label>
            </div>

            <label className={styles.toggleRow}>
              <span>Разрешить mint NFT для релиза</span>
              <input
                type="checkbox"
                checked={releaseDraft.isMintable}
                onChange={(event) =>
                  setReleaseDraft((current) => ({ ...current, isMintable: event.target.checked }))
                }
              />
            </label>

            <div className={styles.listSection}>
              <div className={styles.sectionHeader}>
                <h2>Треклист</h2>
                <p>{releaseDraft.releaseTracklist.length}</p>
              </div>

              <div className={styles.infoBanner}>
                <strong>Как это работает сейчас</strong>
                <span>
                  Для каждого трека сначала загрузите master-файл через проводник. Студия сама
                  попробует создать demo preview MP3 до 30 секунд. Отдельный preview-файл нужен
                  только если хотите заменить автогенерированное демо вручную. Сам demo preview
                  теперь необязателен и не блокирует публикацию релиза.
                </span>
              </div>

              <div className={styles.trackDraftList}>
                {releaseDraft.releaseTracklist.map((row, index) => (
                  <article key={`${row.id}-${index}`} className={styles.trackDraftRow}>
                    <label className={styles.field}>
                      <span>Трек #{index + 1}</span>
                      <input
                        value={row.title}
                        onChange={(event) => updateTrackRow(index, { title: event.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Master-файл трека</span>
                      <input
                        type="file"
                        accept=".mp3,.ogg,.wav,.flac,.aac,.m4a,.alac,audio/*"
                        onChange={(event) => void uploadTrackMasterFile(index, event.target.files?.[0] ?? null)}
                      />
                      <small className={styles.fieldHint}>
                        Именно этот файл попадёт в storage-сеть и будет выдаваться при покупке отдельного трека. После загрузки студия автоматически попробует собрать MP3 demo.
                      </small>
                      <small className={styles.fieldValue}>
                        {previewUploadPendingKey === `track-master-${index}`
                          ? "Загружаем master и собираем demo..."
                          : row.audioFileName
                            ? `${row.audioFileName} · ${row.audioFormat.toUpperCase()}`
                            : "Файл трека ещё не выбран"}
                      </small>
                    </label>
                    <label className={styles.field}>
                      <span>Demo preview MP3</span>
                      <input
                        type="file"
                        accept=".mp3,audio/mpeg"
                        onChange={(event) => void uploadTrackPreviewFile(index, event.target.files?.[0] ?? null)}
                      />
                      <small className={styles.fieldHint}>
                        Это ручная замена demo preview. Обычно сюда уже автоматически подставляется MP3 после загрузки master-файла, но релиз можно сохранить и без demo.
                      </small>
                      <small className={styles.fieldValue}>
                        {previewUploadPendingKey === `track-preview-${index}`
                          ? "Загружаем manual demo preview..."
                          : row.previewFileName
                            ? row.previewGenerated
                              ? `${row.previewFileName} · demo готов`
                              : row.audioFormat === "mp3" && row.previewFileName === row.audioFileName
                                ? `${row.previewFileName} · взят из MP3 master`
                                : `${row.previewFileName} · загружен вручную`
                            : "Demo preview необязателен"}
                      </small>
                    </label>
                    <label className={styles.field}>
                      <span>Цена трека</span>
                      <input
                        type="number"
                        min={1}
                        value={row.priceStarsCents}
                        onChange={(event) => updateTrackRow(index, { priceStarsCents: event.target.value })}
                      />
                    </label>
                    <label className={styles.field}>
                      <span>Лимит демо</span>
                      <input
                        type="number"
                        min={30}
                        max={30}
                        value={row.durationSec}
                        onChange={() => updateTrackRow(index, { durationSec: "30" })}
                      />
                      <small className={styles.fieldHint}>
                        Для всех demo сейчас жёсткий лимит 30 секунд.
                      </small>
                    </label>
                    <div className={styles.trackDraftMeta}>
                      <span className={`${styles.statusBadge} ${row.audioFileId ? styles.toneSuccess : styles.toneWarning}`}>
                        {row.audioFileId ? "Master готов" : "Нужен master"}
                      </span>
                      <span className={`${styles.statusBadge} ${row.previewUrl ? styles.toneSuccess : styles.toneDefault}`}>
                        {row.previewUrl
                          ? row.previewGenerated
                            ? "Demo готов"
                            : row.audioFormat === "mp3" && row.previewFileName === row.audioFileName
                              ? "Demo взят из MP3 master"
                              : "Demo загружен вручную"
                          : "Demo необязателен"}
                      </span>
                      <small className={styles.trackDraftMetaLabel}>{formatTrackDraftLabel(row, index)}</small>
                    </div>
                    <button type="button" className={styles.secondaryButton} onClick={() => removeTrackRow(index)}>
                      Удалить
                    </button>
                  </article>
                ))}
              </div>

              <div className={styles.actionRow}>
                <button type="button" className={styles.secondaryButton} onClick={addTrackRow}>
                  Добавить трек
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  onClick={() => void createRelease()}
                  disabled={releaseSaving}
                >
                  {releaseSaving ? "Отправка..." : "Создать релиз"}
                </button>
              </div>
            </div>

            <div className={styles.listSection}>
              <div className={styles.sectionHeader}>
                <h2>Ваши релизы</h2>
                <p>{tracks.length}</p>
              </div>
              <div className={styles.releaseList}>
                {tracks.map((track) => (
                  <article key={track.id} className={styles.releaseRow}>
                    <div>
                      <strong>{track.title}</strong>
                      <span>
                        {track.releaseTracklist?.length ?? 1} треков · {track.releaseType.toUpperCase()}
                      </span>
                      <span className={styles.releaseMetaLine}>
                        {formatStarsFromCents(track.priceStarsCents)} · {track.isMintable ? "NFT включён" : "NFT выключен"}
                      </span>
                    </div>
                    <span
                      className={`${styles.statusBadge} ${toToneClassName(styles, getReleaseStatusTone(track.status))}`}
                    >
                      {formatReleaseStatusLabel(track.status)}
                    </span>
                    <Link href={`/shop/${track.slug}`}>Открыть</Link>
                  </article>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {currentTab === "payouts" ? (
          <section className={styles.card}>
            <div className={styles.sectionHeader}>
              <h2>Выплаты</h2>
              <p>Вывод по TON-кошельку после hold 21 дней и ручного admin approval.</p>
            </div>

            <div className={styles.infoBanner}>
              <strong>Правила вывода</strong>
              <span>
                Минимальный запрос: {formatStarsFromCents(payoutSummary?.minimumRequestStarsCents ?? 0)}.{" "}
                {nextHoldReleaseLabel
                  ? `Следующий hold завершится около ${nextHoldReleaseLabel}.`
                  : "Новая доступная сумма появится после завершения hold-периода."}
              </span>
            </div>

            <div className={styles.metricGrid}>
              <article className={styles.metricCard}>
                <span>Доступно</span>
                <strong className={styles.inlineAmount}>
                  <StarsIcon className={styles.inlineAmountIcon} />
                  {formatStarsFromCents(payoutSummary?.availableStarsCents ?? 0)}
                </strong>
              </article>
              <article className={styles.metricCard}>
                <span>На hold</span>
                <strong>{formatStarsFromCents(payoutSummary?.pendingHoldStarsCents ?? 0)}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Запрошено</span>
                <strong>{formatStarsFromCents(payoutSummary?.requestedStarsCents ?? 0)}</strong>
              </article>
              <article className={styles.metricCard}>
                <span>Выплачено</span>
                <strong>{formatStarsFromCents(payoutSummary?.paidOutStarsCents ?? 0)}</strong>
              </article>
            </div>

            <div className={styles.fieldGrid}>
              <label className={styles.field}>
                <span>Сумма запроса</span>
                <input
                  type="number"
                  min={0}
                  value={payoutDraft.amountStars}
                  onChange={(event) =>
                    setPayoutDraft((current) => ({ ...current, amountStars: event.target.value }))
                  }
                />
              </label>
              <label className={`${styles.field} ${styles.fieldWide}`}>
                <span>Комментарий</span>
                <textarea
                  value={payoutDraft.note}
                  onChange={(event) => setPayoutDraft((current) => ({ ...current, note: event.target.value }))}
                />
              </label>
            </div>

            <div className={styles.infoBanner}>
              <strong>TON</strong>
              <span>{formatShortTonAddress(profile.tonWalletAddress) || "Укажите кошелёк в профиле артиста."}</span>
            </div>

            <button
              type="button"
              className={styles.primaryButton}
              onClick={() => void submitPayoutRequest()}
              disabled={payoutSaving || !payoutSummary?.canRequest}
            >
              {payoutSaving ? "Отправляем..." : "Запросить вывод"}
            </button>

            <div className={styles.listSection}>
              <div className={styles.sectionHeader}>
                <h2>История запросов</h2>
                <p>{payoutRequests.length}</p>
              </div>
              {payoutRequests.length > 0 ? (
                <div className={styles.payoutList}>
                  {payoutRequests.map((request) => (
                    <article key={request.id} className={styles.payoutRow}>
                      <div className={styles.payoutRowMain}>
                        <strong>{formatStarsFromCents(request.amountStarsCents)}</strong>
                        <span>{request.note || "Запрос на вывод по TON-кошельку"}</span>
                      </div>
                      <div className={styles.payoutRowMeta}>
                        <span
                          className={`${styles.statusBadge} ${toToneClassName(styles, getPayoutStatusTone(request.status))}`}
                        >
                          {formatPayoutStatusLabel(request.status)}
                        </span>
                        <small>{new Date(request.createdAt).toLocaleDateString("ru-RU")}</small>
                      </div>
                      {payoutAuditByRequestId.get(request.id)?.length ? (
                        <div className={styles.auditTrail}>
                          {payoutAuditByRequestId.get(request.id)?.slice(0, 4).map((entry) => (
                            <div key={entry.id} className={styles.auditRow}>
                              <strong>{formatPayoutAuditAction(entry)}</strong>
                              <span>
                                {entry.actor === "artist" ? "Артист" : entry.actor === "admin" ? "Админ" : "Система"}
                                {" · "}
                                {new Date(entry.createdAt).toLocaleString("ru-RU")}
                              </span>
                              {entry.note ? <small>{entry.note}</small> : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className={styles.emptyState}>Запросов на вывод пока не было.</div>
              )}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
