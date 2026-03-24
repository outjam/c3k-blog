"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  createAdminStorageAsset,
  createAdminStorageBag,
  createAdminStorageNode,
  fetchAdminSession,
  fetchAdminStorage,
  patchAdminStorageMembership,
  probeAdminStorageRuntime,
  runAdminStorageBridgePreflight,
  runAdminStorageIngest,
  runAdminStoragePrepareAndUpload,
  runAdminStorageUploadOnce,
  runAdminStorageUploadOnceTargeted,
  runAdminStorageUploadSimulate,
  syncAdminStorageArtistTracks,
  type AdminStorageRuntimeProbe,
  type AdminSession,
  type AdminStorageSnapshot,
} from "@/lib/admin-api";
import type { StorageIngestMode, StorageProgramMembership, StorageTonRuntimePreflightSnapshot } from "@/types/storage";

import styles from "./page.module.scss";

export default function AdminStoragePage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [snapshot, setSnapshot] = useState<AdminStorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [syncMessage, setSyncMessage] = useState("");
  const [ingestMessage, setIngestMessage] = useState("");
  const [assetDraft, setAssetDraft] = useState({
    releaseSlug: "",
    trackId: "",
    resourceKey: "",
    audioFileId: "",
    assetType: "audio_master",
    format: "mp3",
    sourceUrl: "",
    fileName: "",
    mimeType: "",
    sizeBytes: "",
  });
  const [bagDraft, setBagDraft] = useState({
    assetId: "",
    bagId: "",
    tonstorageUri: "",
    status: "draft",
    replicasTarget: "3",
  });
  const [nodeDraft, setNodeDraft] = useState({
    nodeLabel: "",
    publicLabel: "",
    city: "",
    countryCode: "",
    latitude: "",
    longitude: "",
    nodeType: "community_node",
    platform: "linux",
    status: "candidate",
    diskAllocatedBytes: "",
    diskUsedBytes: "",
    bandwidthLimitKbps: "",
  });
  const [membershipDrafts, setMembershipDrafts] = useState<
    Record<
      number,
      {
        status: StorageProgramMembership["status"];
        tier: StorageProgramMembership["tier"];
        moderationNote: string;
      }
    >
  >({});
  const [syncingTracks, setSyncingTracks] = useState(false);
  const [ingestingAssets, setIngestingAssets] = useState(false);
  const [simulatingUpload, setSimulatingUpload] = useState(false);
  const [runningUploadOnce, setRunningUploadOnce] = useState(false);
  const [runningUploadTargetKey, setRunningUploadTargetKey] = useState("");
  const [runningPrepareTargetKey, setRunningPrepareTargetKey] = useState("");
  const [ingestMode, setIngestMode] = useState<StorageIngestMode>("test_prepare");
  const [runtimeProbe, setRuntimeProbe] = useState<AdminStorageRuntimeProbe | null>(null);
  const [probingRuntime, setProbingRuntime] = useState(false);
  const [probeDraft, setProbeDraft] = useState({
    assetId: "",
    bagId: "",
  });
  const [bridgePreflight, setBridgePreflight] = useState<StorageTonRuntimePreflightSnapshot | null>(null);
  const [probingBridge, setProbingBridge] = useState(false);

  const canView = Boolean(session?.permissions.includes("storage:view"));
  const canManage = Boolean(session?.permissions.includes("storage:manage"));

  const load = async () => {
    setLoading(true);
    setError("");

    const [sessionResponse, storageResponse] = await Promise.all([
      fetchAdminSession(),
      fetchAdminStorage(),
    ]);

    if (sessionResponse.error || !sessionResponse.session) {
      setSession(null);
      setSnapshot(null);
      setError(sessionResponse.error ?? "Unauthorized");
      setLoading(false);
      return;
    }

    setSession(sessionResponse.session);

    if (storageResponse.error || !storageResponse.data) {
      setSnapshot(null);
      setError(storageResponse.error ?? "Не удалось загрузить storage dashboard.");
      setLoading(false);
      return;
    }

    setSnapshot(storageResponse.data);
    setIngestMode(storageResponse.data.runtimeStatus.mode);
    setMembershipDrafts(
      Object.fromEntries(
        storageResponse.data.memberships.map((membership) => [
          membership.telegramUserId,
          {
            status: membership.status,
            tier: membership.tier,
            moderationNote: membership.moderationNote ?? "",
          },
        ]),
      ),
    );
    setLoading(false);
  };

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void load();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  const metrics = useMemo(() => {
    return {
      assets: snapshot?.assets.length ?? 0,
      bags: snapshot?.bags.length ?? 0,
      nodes: snapshot?.nodes.length ?? 0,
      memberships: snapshot?.memberships.length ?? 0,
      deliveries: snapshot?.deliveryRequests.length ?? 0,
      ingestJobs: snapshot?.ingestJobs.length ?? 0,
    };
  }, [snapshot]);

  const uploadQueue = useMemo(() => {
    const jobs = (snapshot?.ingestJobs ?? []).filter((job) => job.mode === "tonstorage_testnet");
    return {
      prepared: jobs.filter((job) => job.status === "prepared").length,
      processing: jobs.filter((job) => job.status === "processing").length,
      uploaded: jobs.filter((job) => job.status === "uploaded").length,
      failed: jobs.filter((job) => job.status === "failed").length,
    };
  }, [snapshot]);

  const bagFilesByBagId = useMemo(() => {
    return (snapshot?.bagFiles ?? []).reduce<Record<string, string[]>>((accumulator, entry) => {
      if (!accumulator[entry.bagId]) {
        accumulator[entry.bagId] = [];
      }
      accumulator[entry.bagId]?.push(entry.path);
      return accumulator;
    }, {});
  }, [snapshot]);

  const assetPipelineByAssetId = useMemo(() => {
    const jobs = snapshot?.ingestJobs ?? [];
    const bags = snapshot?.bags ?? [];

    return (snapshot?.assets ?? []).reduce<
      Record<
        string,
        {
          bagStatus?: string;
          runtimeFetchStatus?: string;
          latestJobStatus?: string;
          latestJobMode?: string;
        }
      >
    >((accumulator, asset) => {
      const assetBags = bags.filter((entry) => entry.assetId === asset.id);
      const preferredBag =
        [...assetBags].sort(
          (left, right) =>
            Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt),
        )[0] ?? null;
      const latestJob =
        [...jobs]
          .filter((entry) => entry.assetId === asset.id)
          .sort(
            (left, right) =>
              Date.parse(right.updatedAt || right.createdAt) - Date.parse(left.updatedAt || left.createdAt),
          )[0] ?? null;

      accumulator[asset.id] = {
        bagStatus: preferredBag?.status,
        runtimeFetchStatus: preferredBag?.runtimeFetchStatus,
        latestJobStatus: latestJob?.status,
        latestJobMode: latestJob?.mode,
      };
      return accumulator;
    }, {});
  }, [snapshot]);

  const formatRuntimeFetchStatus = (value: string | undefined): string => {
    switch (value) {
      case "verified":
        return "runtime verified";
      case "failed":
        return "runtime failed";
      case "pending":
        return "runtime pending";
      default:
        return "runtime unknown";
    }
  };

  const formatRuntimeProbeMeaning = (via: AdminStorageRuntimeProbe["via"]): string => {
    switch (via) {
      case "tonstorage_gateway":
        return "Это уже реальный TON Storage runtime path.";
      case "bag_http_pointer":
        return "Это pointer-based HTTP fetch, но ещё не подтверждённый TON Storage gateway.";
      case "bag_meta":
        return "Это fallback через bag metadata/source URL, а не реальный TON Storage gateway.";
      case "asset_source":
        return "Это fallback напрямую к source URL asset, а не TON Storage.";
      case "resolved_source":
        return "Это fallback к заранее резолвленному source URL, а не TON Storage.";
      case "delivery_url":
        return "Это fallback к прямому delivery URL, а не TON Storage.";
      default:
        return "Runtime path пока не определён.";
    }
  };

  const createAsset = async () => {
    const response = await createAdminStorageAsset({
      releaseSlug: assetDraft.releaseSlug || undefined,
      trackId: assetDraft.trackId || undefined,
      resourceKey: assetDraft.resourceKey || undefined,
      audioFileId: assetDraft.audioFileId || undefined,
      assetType: assetDraft.assetType as
        | "audio_master"
        | "audio_preview"
        | "cover"
        | "booklet"
        | "nft_media"
        | "site_bundle",
      format: assetDraft.format as
        | "aac"
        | "alac"
        | "mp3"
        | "ogg"
        | "wav"
        | "flac"
        | "zip"
        | "png"
        | "json"
        | "html_bundle",
      sourceUrl: assetDraft.sourceUrl || undefined,
      fileName: assetDraft.fileName || undefined,
      mimeType: assetDraft.mimeType || undefined,
      sizeBytes: Math.max(0, Math.round(Number(assetDraft.sizeBytes || "0"))),
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    setAssetDraft({
      releaseSlug: "",
      trackId: "",
      resourceKey: "",
      audioFileId: "",
      assetType: "audio_master",
      format: "mp3",
      sourceUrl: "",
      fileName: "",
      mimeType: "",
      sizeBytes: "",
    });
    await load();
  };

  const createBag = async () => {
    const response = await createAdminStorageBag({
      assetId: bagDraft.assetId,
      bagId: bagDraft.bagId || undefined,
      tonstorageUri: bagDraft.tonstorageUri || undefined,
      status: bagDraft.status as
        | "draft"
        | "created"
        | "uploaded"
        | "replicating"
        | "healthy"
        | "degraded"
        | "disabled",
      replicasTarget: Math.max(0, Math.round(Number(bagDraft.replicasTarget || "0"))),
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    setBagDraft({
      assetId: "",
      bagId: "",
      tonstorageUri: "",
      status: "draft",
      replicasTarget: "3",
    });
    await load();
  };

  const createNode = async () => {
    const response = await createAdminStorageNode({
      nodeLabel: nodeDraft.nodeLabel,
      publicLabel: nodeDraft.publicLabel || undefined,
      city: nodeDraft.city || undefined,
      countryCode: nodeDraft.countryCode || undefined,
      latitude: nodeDraft.latitude ? Number(nodeDraft.latitude) : undefined,
      longitude: nodeDraft.longitude ? Number(nodeDraft.longitude) : undefined,
      nodeType: nodeDraft.nodeType as "owned_provider" | "partner_provider" | "community_node",
      platform: nodeDraft.platform as "macos" | "windows" | "linux",
      status: nodeDraft.status as "candidate" | "active" | "degraded" | "suspended",
      diskAllocatedBytes: nodeDraft.diskAllocatedBytes ? Number(nodeDraft.diskAllocatedBytes) : undefined,
      diskUsedBytes: nodeDraft.diskUsedBytes ? Number(nodeDraft.diskUsedBytes) : undefined,
      bandwidthLimitKbps: nodeDraft.bandwidthLimitKbps ? Number(nodeDraft.bandwidthLimitKbps) : undefined,
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    setNodeDraft({
      nodeLabel: "",
      publicLabel: "",
      city: "",
      countryCode: "",
      latitude: "",
      longitude: "",
      nodeType: "community_node",
      platform: "linux",
      status: "candidate",
      diskAllocatedBytes: "",
      diskUsedBytes: "",
      bandwidthLimitKbps: "",
    });
    await load();
  };

  const runRuntimeProbe = async () => {
    setProbingRuntime(true);
    setError("");

    const response = await probeAdminStorageRuntime({
      assetId: probeDraft.assetId || undefined,
      bagId: probeDraft.bagId || undefined,
    });

    if (response.error || !response.probe) {
      setRuntimeProbe(null);
      setError(response.error ?? "Не удалось выполнить runtime probe.");
      setProbingRuntime(false);
      return;
    }

    setRuntimeProbe(response.probe);
    setProbingRuntime(false);
  };

  const runBridgePreflight = async () => {
    setProbingBridge(true);
    setError("");

    const response = await runAdminStorageBridgePreflight();

    if (response.error || !response.preflight) {
      setBridgePreflight(null);
      setError(response.error ?? "Не удалось выполнить bridge preflight.");
      setProbingBridge(false);
      return;
    }

    setBridgePreflight(response.preflight);
    setProbingBridge(false);
  };

  const saveMembership = async (telegramUserId: number) => {
    const draft = membershipDrafts[telegramUserId];

    if (!draft) {
      return;
    }

    const response = await patchAdminStorageMembership({
      telegramUserId,
      status: draft.status,
      tier: draft.tier,
      moderationNote: draft.moderationNote || undefined,
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    await load();
  };

  const syncTracks = async () => {
    setSyncingTracks(true);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    let cursorTrackId: string | undefined;
    let processedTracks = 0;
    let syncedTracks = 0;
    let failedTracks = 0;
    let totalCandidateTracks = 0;
    let fatalError = "";
    let attempts = 0;

    while (attempts < 200) {
      attempts += 1;
      const response = await syncAdminStorageArtistTracks({
        cursorTrackId,
        limit: 40,
      });

      if (response.error) {
        fatalError = response.error;
        break;
      }

      processedTracks += response.processedTracks;
      syncedTracks += response.syncedTracks;
      failedTracks += response.failedTracks;
      totalCandidateTracks = Math.max(totalCandidateTracks, response.totalCandidateTracks);

      if (!response.nextCursorTrackId || response.remainingTracks <= 0 || response.processedTracks === 0) {
        break;
      }

      cursorTrackId = response.nextCursorTrackId;
    }

    setSyncingTracks(false);

    if (fatalError) {
      setError(fatalError);
      return;
    }

    if (failedTracks > 0) {
      setSyncMessage(
        `Sync завершён частично: обновлено ${syncedTracks} из ${processedTracks || totalCandidateTracks}, ошибок ${failedTracks}.`,
      );
    } else {
      setSyncMessage(`Синхронизировано релизов: ${syncedTracks}${totalCandidateTracks ? ` из ${totalCandidateTracks}` : ""}.`);
    }
    await load();
  };

  const ingestAssets = async () => {
    setIngestingAssets(true);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    const response = await runAdminStorageIngest({
      onlyMissingBags: true,
      limit: 25,
      mode: ingestMode,
    });

    setIngestingAssets(false);

    if (!response.ok) {
      setError(response.error);
      return;
    }

    setIngestMessage(
      [
        response.runtimeLabel,
        `Выбрано assets: ${response.selectedAssets}`,
        `prepared: ${response.preparedJobs}`,
        `failed: ${response.failedJobs}`,
        `reused bags: ${response.reusedBags}`,
        response.supportsRealPointers ? "real pointers: yes" : "real pointers: no",
        response.requiresExternalUploadWorker ? "нужен upload worker" : "upload worker не нужен",
      ].join(" · "),
    );
    await load();
  };

  const simulateUpload = async () => {
    setSimulatingUpload(true);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    const response = await runAdminStorageUploadSimulate({ limit: 5 });
    setSimulatingUpload(false);

    if (response.error || !response.summary) {
      setError(response.error ?? "Не удалось выполнить simulated upload pass.");
      return;
    }

    setIngestMessage(
      `Simulated upload · processed ${response.summary.processed} · uploaded ${response.summary.uploaded} · failed ${response.summary.failed} · remaining prepared ${response.summary.remainingPrepared}`,
    );
    await load();
  };

  const runUploadOnce = async () => {
    setRunningUploadOnce(true);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    const response = await runAdminStorageUploadOnce();
    setRunningUploadOnce(false);

    if (response.error || !response.summary) {
      setError(response.error ?? "Не удалось прогнать server-side upload cycle.");
      return;
    }

    const noPreparedJobs = response.summary.processed === 0;
    setIngestMessage(
      [
        `Upload once (${response.summary.mode})`,
        `processed ${response.summary.processed}`,
        `uploaded ${response.summary.uploaded}`,
        `failed ${response.summary.failed}`,
        `remaining prepared ${response.summary.remainingPrepared}`,
        response.summary.bagExternalId ? `bag ${response.summary.bagExternalId}` : "",
        response.summary.runtimeFetchStatus ? `runtime ${response.summary.runtimeFetchStatus}` : "",
        response.summary.runtimeFetchError ? `runtime error ${response.summary.runtimeFetchError}` : "",
        noPreparedJobs ? "prepared jobs не найдены, сначала подготовь runtime bags" : "",
        response.summary.error ? `error ${response.summary.error}` : response.summary.message || "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    await load();
  };

  const runUploadForAsset = async (assetId: string) => {
    setRunningUploadTargetKey(`asset:${assetId}`);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    const response = await runAdminStorageUploadOnceTargeted({ assetId });
    setRunningUploadTargetKey("");

    if (response.error || !response.summary) {
      setError(response.error ?? "Не удалось прогнать targeted upload cycle.");
      return;
    }

    const noPreparedJobs = response.summary.processed === 0;
    setIngestMessage(
      [
        `Upload asset ${assetId}`,
        `mode ${response.summary.mode}`,
        `processed ${response.summary.processed}`,
        `uploaded ${response.summary.uploaded}`,
        `failed ${response.summary.failed}`,
        response.summary.bagExternalId ? `bag ${response.summary.bagExternalId}` : "",
        response.summary.runtimeFetchStatus ? `runtime ${response.summary.runtimeFetchStatus}` : "",
        response.summary.runtimeFetchError ? `runtime error ${response.summary.runtimeFetchError}` : "",
        noPreparedJobs ? "сначала подготовь runtime bags именно для этого asset" : "",
        response.summary.error ? `error ${response.summary.error}` : response.summary.message || "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    await load();
  };

  const prepareAssetForRuntime = async (assetId: string, mode: StorageIngestMode) => {
    setRunningPrepareTargetKey(`asset:${assetId}:${mode}`);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    const response = await runAdminStorageIngest({
      assetIds: [assetId],
      onlyMissingBags: false,
      limit: 1,
      mode,
    });

    setRunningPrepareTargetKey("");

    if (!response.ok) {
      setError(response.error);
      return false;
    }

    setIngestMessage(
      [
        `Prepared asset ${assetId}`,
        `mode ${response.mode}`,
        `selected ${response.selectedAssets}`,
        `prepared ${response.preparedJobs}`,
        `failed ${response.failedJobs}`,
        response.reusedBags ? `reused bags ${response.reusedBags}` : "",
        response.createdBags ? `created bags ${response.createdBags}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
    );
    await load();
    return response.failedJobs === 0;
  };

  const prepareAndUploadAsset = async (assetId: string) => {
    setRunningUploadTargetKey(`asset:${assetId}:prepare-upload`);
    setError("");
    setSyncMessage("");
    setIngestMessage("");

    const uploadResponse = await runAdminStoragePrepareAndUpload({
      assetId,
      mode: "tonstorage_testnet",
    });
    setRunningUploadTargetKey("");

    if (uploadResponse.error || !uploadResponse.summary) {
      setError(uploadResponse.error ?? "Не удалось выполнить prepare + upload для asset.");
      return;
    }

    setIngestMessage(
      [
        `Prepare + upload ${assetId}`,
        `mode ${uploadResponse.summary.mode}`,
        `prepared ${uploadResponse.summary.ingestPreparedJobs}`,
        `failed ingest ${uploadResponse.summary.ingestFailedJobs}`,
        `processed ${uploadResponse.summary.upload.processed}`,
        `uploaded ${uploadResponse.summary.upload.uploaded}`,
        `failed upload ${uploadResponse.summary.upload.failed}`,
        uploadResponse.summary.upload.bagExternalId ? `bag ${uploadResponse.summary.upload.bagExternalId}` : "",
        uploadResponse.summary.upload.runtimeFetchStatus
          ? `runtime ${uploadResponse.summary.upload.runtimeFetchStatus}`
          : "",
        uploadResponse.summary.upload.runtimeFetchError
          ? `runtime error ${uploadResponse.summary.upload.runtimeFetchError}`
          : "",
        uploadResponse.summary.endToEndReady ? "end-to-end ready" : "",
        uploadResponse.summary.upload.error
          ? `error ${uploadResponse.summary.upload.error}`
          : uploadResponse.summary.message,
      ]
        .filter(Boolean)
        .join(" · "),
    );
    await load();
  };

  if (loading) {
    return <div className={styles.page}>Загрузка storage dashboard...</div>;
  }

  if (!session?.isAdmin || !canView) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1>Доступ запрещён</h1>
          <p>У вас нет прав на просмотр storage-операций.</p>
          <Link href="/admin" className={styles.linkButton}>
            Назад в админку
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <section className={styles.card}>
        <header className={styles.header}>
          <div>
            <h1>C3K Storage</h1>
            <p>Storage registry, memberships, runtime ingest и выдача купленных файлов.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => void load()}>
              Обновить
            </button>
            {canManage ? (
              <button type="button" onClick={() => void syncTracks()} disabled={syncingTracks}>
                {syncingTracks ? "Синхронизация..." : "Синхронизировать релизы"}
              </button>
            ) : null}
            {canManage ? (
              <>
                <select
                  value={ingestMode}
                  onChange={(event) => setIngestMode(event.target.value as StorageIngestMode)}
                >
                  <option value="test_prepare">test_prepare</option>
                  <option value="tonstorage_testnet">tonstorage_testnet</option>
                </select>
                <button type="button" onClick={() => void ingestAssets()} disabled={ingestingAssets}>
                  {ingestingAssets ? "Подготовка..." : "Подготовить runtime bags"}
                </button>
                <button type="button" onClick={() => void simulateUpload()} disabled={simulatingUpload}>
                  {simulatingUpload ? "Симулируем..." : "Симулировать upload"}
                </button>
                <button type="button" onClick={() => void runUploadOnce()} disabled={runningUploadOnce}>
                  {runningUploadOnce ? "Гоним worker..." : "Прогнать upload once"}
                </button>
              </>
            ) : null}
            <Link href="/admin" className={styles.linkButton}>
              Админка
            </Link>
          </div>
        </header>

        <section className={styles.runtimeGrid}>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>Текущий runtime</h2>
            </div>
            <p className={styles.blockHint}>
              Именно этот режим сейчас определяет, как будет выглядеть ingest: placeholder bags или testnet-style pointers
              под будущий TON Storage worker.
            </p>
            <div className={styles.itemMeta}>
              <span>{snapshot?.runtimeStatus.label || "Runtime unknown"}</span>
              <span>{snapshot?.runtimeStatus.mode || "mode unknown"}</span>
              <span>
                {snapshot?.runtimeStatus.supportsRealPointers ? "real pointers supported" : "placeholder pointers only"}
              </span>
              <span>
                {snapshot?.runtimeStatus.requiresExternalUploadWorker
                  ? "требуется внешний upload worker"
                  : "внешний upload worker не нужен"}
              </span>
              {snapshot?.runtimeStatus.providerLabel ? <span>{snapshot.runtimeStatus.providerLabel}</span> : null}
              {snapshot?.runtimeStatus.pointerBase ? <span>{snapshot.runtimeStatus.pointerBase}</span> : null}
            </div>
          </article>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>Пояснение</h2>
            </div>
            <p className={styles.blockHint}>
              `test_prepare` нужен, чтобы бесплатно проверить storage UX и delivery. `tonstorage_testnet` уже готовит честные
              testnet-style pointers и bag metadata, но не притворяется полным upload runtime.
            </p>
            <div className={styles.noteList}>
              {(snapshot?.runtimeStatus.notes ?? []).map((note) => (
                <span key={note}>{note}</span>
              ))}
            </div>
          </article>
        </section>

        <section className={styles.runtimeGrid}>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>Runtime readiness</h2>
            </div>
            <p className={styles.blockHint}>
              Этот блок показывает, какая часть registry уже реально резолвится в fetchable source для web и Telegram delivery,
              а что ещё застряло на уровне pointer-prep.
            </p>
            <div className={styles.itemMeta}>
              <span>
                assets ready: {snapshot?.runtimeDiagnostics.assetsResolvable || 0} /{" "}
                {snapshot?.runtimeDiagnostics.assetsTotal || 0}
              </span>
              <span>
                bags ready: {snapshot?.runtimeDiagnostics.bagsResolvable || 0} /{" "}
                {snapshot?.runtimeDiagnostics.bagsTotal || 0}
              </span>
              <span>pointer-ready bags: {snapshot?.runtimeDiagnostics.pointerReadyBags || 0}</span>
              <span>real pointers: {snapshot?.runtimeDiagnostics.realPointerBags || 0}</span>
              <span>verified pointers: {snapshot?.runtimeDiagnostics.verifiedPointerBags || 0}</span>
              <span>failed pointers: {snapshot?.runtimeDiagnostics.failedPointerBags || 0}</span>
              <span>bag files: {snapshot?.bagFiles.length || 0}</span>
            </div>
            <div className={styles.noteList}>
              <span>
                asset source: {snapshot?.runtimeDiagnostics.viaCounts.asset_source || 0}
              </span>
              <span>
                bag meta: {snapshot?.runtimeDiagnostics.viaCounts.bag_meta || 0}
              </span>
              <span>
                bag http pointer: {snapshot?.runtimeDiagnostics.viaCounts.bag_http_pointer || 0}
              </span>
              <span>
                tonstorage gateway: {snapshot?.runtimeDiagnostics.viaCounts.tonstorage_gateway || 0}
              </span>
              <span>
                resolved source: {snapshot?.runtimeDiagnostics.viaCounts.resolved_source || 0}
              </span>
            </div>
          </article>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>TON Storage bridge</h2>
              {canManage ? (
                <button type="button" onClick={() => void runBridgePreflight()} disabled={probingBridge}>
                  {probingBridge ? "Проверяем..." : "Проверить daemon/gateway"}
                </button>
              ) : null}
            </div>
            <p className={styles.blockHint}>
              Этот блок показывает, можно ли уже перейти от локальной симуляции к настоящему testnet upload через
              `storage-daemon` и сможет ли приложение потом читать `tonstorage://` pointer обратно.
            </p>
            <div className={styles.itemMeta}>
              <span>upload mode: {snapshot?.runtimeBridge.uploadMode || "simulated"}</span>
              <span>
                real upload: {snapshot?.runtimeBridge.realUploadReady ? "ready" : "not ready"}
              </span>
              <span>
                gateway retrieval: {snapshot?.runtimeBridge.gatewayRetrievalReady ? "ready" : "not ready"}
              </span>
              {snapshot?.runtimeBridge.daemonCliBin ? <span>cli: {snapshot.runtimeBridge.daemonCliBin}</span> : null}
              {snapshot?.runtimeBridge.gatewayBase ? <span>{snapshot.runtimeBridge.gatewayBase}</span> : null}
            </div>
            <div className={styles.noteList}>
              {(snapshot?.runtimeBridge.notes ?? []).map((note) => (
                <span key={note}>{note}</span>
              ))}
              {(snapshot?.runtimeBridge.missing ?? []).map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            {bridgePreflight ? (
              <div className={styles.noteList}>
                <span>{bridgePreflight.overallReady ? "preflight: ready" : "preflight: not ready"}</span>
                {bridgePreflight.cliChecked ? (
                  <span>cli: {bridgePreflight.cliOk ? "ok" : "failed"}</span>
                ) : (
                  <span>cli: skipped</span>
                )}
                {typeof bridgePreflight.cliKnownBagCount === "number" ? (
                  <span>cli bags: {bridgePreflight.cliKnownBagCount}</span>
                ) : null}
                {bridgePreflight.gatewayChecked ? (
                  <span>
                    gateway: {bridgePreflight.gatewayOk ? "ok" : "failed"}
                    {typeof bridgePreflight.gatewayStatus === "number" ? ` · HTTP ${bridgePreflight.gatewayStatus}` : ""}
                  </span>
                ) : (
                  <span>gateway: skipped</span>
                )}
                {bridgePreflight.cliCommand ? <span>{bridgePreflight.cliCommand}</span> : null}
                {bridgePreflight.cliSample ? <span>{bridgePreflight.cliSample}</span> : null}
                {bridgePreflight.cliError ? <span>{bridgePreflight.cliError}</span> : null}
                {bridgePreflight.gatewayError ? <span>{bridgePreflight.gatewayError}</span> : null}
                {(bridgePreflight.nextActions ?? []).map((step) => (
                  <span key={step}>{step}</span>
                ))}
              </div>
            ) : null}
          </article>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>Операторский смысл</h2>
            </div>
            <p className={styles.blockHint}>
              Если `assets ready` или `bags ready` заметно отстают, значит sync или ingest уже создали записи, но delivery ещё
              не сможет честно достать файл из runtime. Это сигнал проверить source URLs, bag metadata, pointer mapping и
              gateway bridge для реальных `tonstorage://` URI.
            </p>
            <div className={styles.noteList}>
              <span>После sync должны появиться source URLs или resource keys у assets.</span>
              <span>После ingest у bags должны появляться runtime label, bag id или pointer.</span>
              <span>Перед user-тестом смотри, чтобы unresolved списки не росли после нового релиза.</span>
            </div>
          </article>
        </section>

        <section className={styles.runtimeGrid}>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>Upload worker queue</h2>
            </div>
            <p className={styles.blockHint}>
              Это очередь для внешнего testnet upload worker. `prepared` означает, что pointer и bag уже подготовлены, и
              отдельный runtime-процесс может забрать задачу на реальную загрузку.
            </p>
            <div className={styles.itemMeta}>
              <span>prepared: {uploadQueue.prepared}</span>
              <span>processing: {uploadQueue.processing}</span>
              <span>uploaded: {uploadQueue.uploaded}</span>
              <span>failed: {uploadQueue.failed}</span>
            </div>
            <div className={styles.noteList}>
              <span>`Симулировать upload` нужен для бесплатного e2e теста без daemon bridge.</span>
              <span>`Прогнать upload once` пытается выполнить один реальный server-side upload cycle через текущий bridge mode.</span>
              <span>`Подготовить + загрузить` на карточке asset прогоняет весь короткий путь на одном файле.</span>
            </div>
          </article>
          <article className={styles.runtimeCard}>
            <div className={styles.blockHeading}>
              <h2>Следующий шаг</h2>
            </div>
            <p className={styles.blockHint}>
              После `Подготовить runtime bags` внешний worker должен забрать prepared jobs, загрузить файл и вернуть в
              приложение подтверждённый pointer, статус bag и число реплик. Только после этого `TON Storage` contour станет
              честно end-to-end.
            </p>
            <div className={styles.noteList}>
              <span>prepared = metadata готова, но upload ещё не подтверждён</span>
              <span>processing = job уже забран внешним worker</span>
              <span>uploaded = worker подтвердил bag и pointer</span>
              <span>Симуляция позволяет прогнать этот этап локально и бесплатно до реального daemon bridge.</span>
            </div>
          </article>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Runtime probe</h2>
          </div>
          <p className={styles.blockHint}>
            Это точечная проверка конкретного asset или bag. Она показывает, какой fetch target реально выбрал runtime и
            отвечает ли он уже как файл, а не только как запись в registry.
          </p>
          <div className={styles.formGrid}>
            <input
              value={probeDraft.assetId}
              onChange={(event) =>
                setProbeDraft((current) => ({
                  ...current,
                  assetId: event.target.value,
                }))
              }
              placeholder="asset id (необязательно)"
            />
            <input
              value={probeDraft.bagId}
              onChange={(event) =>
                setProbeDraft((current) => ({
                  ...current,
                  bagId: event.target.value,
                }))
              }
              placeholder="bag id (необязательно)"
            />
            <button type="button" onClick={() => void runRuntimeProbe()} disabled={probingRuntime}>
              {probingRuntime ? "Проверяем..." : "Проверить runtime fetch"}
            </button>
          </div>
          {runtimeProbe ? (
            <div className={styles.noteList}>
              <span>{runtimeProbe.ok ? "Runtime fetch доступен" : "Runtime fetch пока не доступен"}</span>
              <span>{formatRuntimeProbeMeaning(runtimeProbe.via)}</span>
              {runtimeProbe.assetLabel ? <span>{runtimeProbe.assetLabel}</span> : null}
              {runtimeProbe.bagLabel ? <span>{runtimeProbe.bagLabel}</span> : null}
              {runtimeProbe.via ? <span>via: {runtimeProbe.via}</span> : null}
              {runtimeProbe.probeMethod ? <span>probe: {runtimeProbe.probeMethod}</span> : null}
              {typeof runtimeProbe.httpStatus === "number" ? <span>HTTP {runtimeProbe.httpStatus}</span> : null}
              {runtimeProbe.contentType ? <span>{runtimeProbe.contentType}</span> : null}
              {typeof runtimeProbe.contentLength === "number" ? (
                <span>content-length: {runtimeProbe.contentLength}</span>
              ) : null}
              {runtimeProbe.sourceUrl ? <span>{runtimeProbe.sourceUrl}</span> : null}
              {runtimeProbe.error ? <span>{runtimeProbe.error}</span> : null}
            </div>
          ) : null}
        </section>

        <section className={styles.guideGrid}>
          <article className={styles.guideCard}>
            <span className={styles.guideEyebrow}>Шаг 1</span>
            <strong>Сначала синхронизация релизов</strong>
            <p>
              Кнопка `Синхронизировать релизы` собирает storage-assets из артист-релизов. Это первый шаг после добавления
              новых релизов или изменения их файлов. Sync идёт батчами, чтобы большой каталог не падал по timeout.
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideEyebrow}>Шаг 2</span>
            <strong>Потом подготовка runtime bags</strong>
            <p>
              Кнопка `Подготовить runtime bags` работает в выбранном режиме: либо делает test-only заготовки, либо готовит
              testnet-style pointers под будущий TON Storage upload worker.
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideEyebrow}>Реальный кейс</span>
            <strong>После выхода нового релиза</strong>
            <p>
              Артист опубликовал релиз, вы синхронизировали assets, подготовили bags в нужном runtime и проверили, что
              delivery requests начинают находить правильные файлы и storage pointers.
            </p>
          </article>
          <article className={styles.guideCard}>
            <span className={styles.guideEyebrow}>Шаг 3</span>
            <strong>Потом внешний upload worker</strong>
            <p>
              Когда runtime работает в `tonstorage_testnet`, отдельный worker забирает prepared jobs, грузит файл в storage и
              возвращает в систему уже подтверждённый pointer. Без этого stage bags остаются только подготовленными.
            </p>
          </article>
        </section>

        {error ? <p className={styles.error}>{error}</p> : null}
        {syncMessage ? <p className={styles.success}>{syncMessage}</p> : null}
        {ingestMessage ? <p className={styles.success}>{ingestMessage}</p> : null}

        <section className={styles.metrics}>
          <article>
            <span>Assets</span>
            <strong>{metrics.assets}</strong>
          </article>
          <article>
            <span>Bags</span>
            <strong>{metrics.bags}</strong>
          </article>
          <article>
            <span>Nodes</span>
            <strong>{metrics.nodes}</strong>
          </article>
          <article>
            <span>Memberships</span>
            <strong>{metrics.memberships}</strong>
          </article>
          <article>
            <span>Deliveries</span>
            <strong>{metrics.deliveries}</strong>
          </article>
          <article>
            <span>Ingest jobs</span>
            <strong>{metrics.ingestJobs}</strong>
          </article>
        </section>

        {canManage ? (
          <>
            <section className={styles.block}>
              <div className={styles.blockHeading}>
                <h2>Новый asset</h2>
              </div>
              <p className={styles.blockHint}>
                Asset описывает конкретный файл: аудио, обложку, booklet или NFT-медиа. Обычно руками его создают только для
                нестандартных кейсов, когда автосинхронизации недостаточно.
              </p>
              <div className={styles.formGrid}>
                <input
                  value={assetDraft.releaseSlug}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      releaseSlug: event.target.value,
                    }))
                  }
                  placeholder="release slug"
                />
                <input
                  value={assetDraft.trackId}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      trackId: event.target.value,
                    }))
                  }
                  placeholder="track id"
                />
                <select
                  value={assetDraft.assetType}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      assetType: event.target.value,
                    }))
                  }
                >
                  <option value="audio_master">audio_master</option>
                  <option value="audio_preview">audio_preview</option>
                  <option value="cover">cover</option>
                  <option value="booklet">booklet</option>
                  <option value="nft_media">nft_media</option>
                  <option value="site_bundle">site_bundle</option>
                </select>
                <select
                  value={assetDraft.format}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      format: event.target.value,
                    }))
                  }
                >
                  <option value="aac">aac</option>
                  <option value="alac">alac</option>
                  <option value="mp3">mp3</option>
                  <option value="ogg">ogg</option>
                  <option value="wav">wav</option>
                  <option value="flac">flac</option>
                  <option value="zip">zip</option>
                  <option value="png">png</option>
                  <option value="json">json</option>
                  <option value="html_bundle">html_bundle</option>
                </select>
                <input
                  value={assetDraft.sizeBytes}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      sizeBytes: event.target.value,
                    }))
                  }
                  placeholder="size bytes"
                />
                <input
                  value={assetDraft.resourceKey}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      resourceKey: event.target.value,
                    }))
                  }
                  placeholder="resource key"
                />
                <input
                  value={assetDraft.audioFileId}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      audioFileId: event.target.value,
                    }))
                  }
                  placeholder="audio file id"
                />
                <input
                  className={styles.wideInput}
                  value={assetDraft.sourceUrl}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      sourceUrl: event.target.value,
                    }))
                  }
                  placeholder="source url"
                />
                <input
                  value={assetDraft.fileName}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      fileName: event.target.value,
                    }))
                  }
                  placeholder="file name"
                />
                <input
                  value={assetDraft.mimeType}
                  onChange={(event) =>
                    setAssetDraft((current) => ({
                      ...current,
                      mimeType: event.target.value,
                    }))
                  }
                  placeholder="mime type"
                />
                <button type="button" onClick={() => void createAsset()}>
                  Создать asset
                </button>
              </div>
            </section>

            <section className={styles.block}>
              <div className={styles.blockHeading}>
                <h2>Новый bag</h2>
              </div>
              <p className={styles.blockHint}>
                Bag связывает asset с storage-контейнером. На test-этапе это в первую очередь операционная сущность, которая
                помогает проверить будущий TON Storage flow без боевого upload.
              </p>
              <div className={styles.formGrid}>
                <input
                  value={bagDraft.assetId}
                  onChange={(event) =>
                    setBagDraft((current) => ({
                      ...current,
                      assetId: event.target.value,
                    }))
                  }
                  placeholder="asset id"
                />
                <input
                  value={bagDraft.bagId}
                  onChange={(event) =>
                    setBagDraft((current) => ({
                      ...current,
                      bagId: event.target.value,
                    }))
                  }
                  placeholder="bag id"
                />
                <select
                  value={bagDraft.status}
                  onChange={(event) =>
                    setBagDraft((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="draft">draft</option>
                  <option value="created">created</option>
                  <option value="uploaded">uploaded</option>
                  <option value="replicating">replicating</option>
                  <option value="healthy">healthy</option>
                  <option value="degraded">degraded</option>
                  <option value="disabled">disabled</option>
                </select>
                <input
                  value={bagDraft.replicasTarget}
                  onChange={(event) =>
                    setBagDraft((current) => ({
                      ...current,
                      replicasTarget: event.target.value,
                    }))
                  }
                  placeholder="replicas target"
                />
                <input
                  className={styles.wideInput}
                  value={bagDraft.tonstorageUri}
                  onChange={(event) =>
                    setBagDraft((current) => ({
                      ...current,
                      tonstorageUri: event.target.value,
                    }))
                  }
                  placeholder="tonstorage://..."
                />
                <button type="button" onClick={() => void createBag()}>
                  Создать bag
                </button>
              </div>
            </section>

            <section className={styles.block}>
              <div className={styles.blockHeading}>
                <h2>Новая нода</h2>
              </div>
              <p className={styles.blockHint}>
                Ноды нужны для desktop swarm и будущей реальной карты сети. Если указать `city` и координаты, точка сможет
                появиться в `C3K Desktop Client` уже не как preview, а как реальная runtime-нода.
              </p>
              <div className={styles.formGrid}>
                <input
                  value={nodeDraft.nodeLabel}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      nodeLabel: event.target.value,
                    }))
                  }
                  placeholder="node label"
                />
                <input
                  value={nodeDraft.publicLabel}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      publicLabel: event.target.value,
                    }))
                  }
                  placeholder="public label"
                />
                <input
                  value={nodeDraft.city}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      city: event.target.value,
                    }))
                  }
                  placeholder="city"
                />
                <input
                  value={nodeDraft.countryCode}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      countryCode: event.target.value,
                    }))
                  }
                  placeholder="country code"
                />
                <input
                  value={nodeDraft.latitude}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      latitude: event.target.value,
                    }))
                  }
                  placeholder="latitude"
                />
                <input
                  value={nodeDraft.longitude}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      longitude: event.target.value,
                    }))
                  }
                  placeholder="longitude"
                />
                <select
                  value={nodeDraft.nodeType}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      nodeType: event.target.value,
                    }))
                  }
                >
                  <option value="community_node">community_node</option>
                  <option value="owned_provider">owned_provider</option>
                  <option value="partner_provider">partner_provider</option>
                </select>
                <select
                  value={nodeDraft.platform}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      platform: event.target.value,
                    }))
                  }
                >
                  <option value="linux">linux</option>
                  <option value="macos">macos</option>
                  <option value="windows">windows</option>
                </select>
                <select
                  value={nodeDraft.status}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="candidate">candidate</option>
                  <option value="active">active</option>
                  <option value="degraded">degraded</option>
                  <option value="suspended">suspended</option>
                </select>
                <input
                  value={nodeDraft.diskAllocatedBytes}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      diskAllocatedBytes: event.target.value,
                    }))
                  }
                  placeholder="disk allocated bytes"
                />
                <input
                  value={nodeDraft.diskUsedBytes}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      diskUsedBytes: event.target.value,
                    }))
                  }
                  placeholder="disk used bytes"
                />
                <input
                  value={nodeDraft.bandwidthLimitKbps}
                  onChange={(event) =>
                    setNodeDraft((current) => ({
                      ...current,
                      bandwidthLimitKbps: event.target.value,
                    }))
                  }
                  placeholder="bandwidth kbps"
                />
                <button type="button" onClick={() => void createNode()}>
                  Создать ноду
                </button>
              </div>
            </section>
          </>
        ) : null}

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Ноды</h2>
          </div>
          <p className={styles.blockHint}>
            Это текущие runtime-точки storage сети. Ноды с координатами и не `suspended` попадают в desktop node map.
          </p>

          <div className={styles.list}>
            {(snapshot?.nodes ?? []).map((node) => (
              <article key={node.id} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <div>
                    <strong>{node.publicLabel || node.city || node.nodeLabel}</strong>
                    <span>{node.nodeType} · {node.platform} · {node.status}</span>
                  </div>
                  <span>{node.id}</span>
                </div>
                <div className={styles.itemMeta}>
                  {node.city ? <span>{node.city}</span> : null}
                  {node.countryCode ? <span>{node.countryCode}</span> : null}
                  {typeof node.latitude === "number" && typeof node.longitude === "number" ? (
                    <span>{node.latitude.toFixed(4)}, {node.longitude.toFixed(4)}</span>
                  ) : (
                    <span>Без координат</span>
                  )}
                  <span>disk: {node.diskUsedBytes} / {node.diskAllocatedBytes}</span>
                  <span>bandwidth: {node.bandwidthLimitKbps} kbps</span>
                </div>
              </article>
            ))}
            {(snapshot?.nodes?.length ?? 0) === 0 ? (
              <div className={styles.emptyState}>Пока нет ни одной storage-ноды.</div>
            ) : null}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Участники программы</h2>
          </div>
          <p className={styles.blockHint}>
            Здесь вы решаете, кто может участвовать в `C3K Storage Program`, на каком tier он находится и есть ли у него
            ограничения или комментарии модерации.
          </p>

          <div className={styles.list}>
            {(snapshot?.memberships ?? []).map((membership) => {
              const draft =
                membershipDrafts[membership.telegramUserId] ?? {
                  status: membership.status,
                  tier: membership.tier,
                  moderationNote: membership.moderationNote ?? "",
                };

              return (
                <article key={membership.telegramUserId} className={styles.itemCard}>
                  <div className={styles.itemRow}>
                    <strong>{membership.telegramUserId}</strong>
                    <span>{membership.walletAddress || "wallet not set"}</span>
                  </div>
                  <div className={styles.controls}>
                    <select
                      value={draft.status}
                      onChange={(event) =>
                        setMembershipDrafts((current) => ({
                          ...current,
                          [membership.telegramUserId]: {
                            ...draft,
                            status: event.target.value as StorageProgramMembership["status"],
                          },
                        }))
                      }
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                      <option value="suspended">suspended</option>
                    </select>
                    <select
                      value={draft.tier}
                      onChange={(event) =>
                        setMembershipDrafts((current) => ({
                          ...current,
                          [membership.telegramUserId]: {
                            ...draft,
                            tier: event.target.value as StorageProgramMembership["tier"],
                          },
                        }))
                      }
                    >
                      <option value="supporter">supporter</option>
                      <option value="keeper">keeper</option>
                      <option value="core">core</option>
                      <option value="guardian">guardian</option>
                    </select>
                    <input
                      value={draft.moderationNote}
                      onChange={(event) =>
                        setMembershipDrafts((current) => ({
                          ...current,
                          [membership.telegramUserId]: {
                            ...draft,
                            moderationNote: event.target.value,
                          },
                        }))
                      }
                      placeholder="moderation note"
                    />
                    {canManage ? (
                      <button
                        type="button"
                        onClick={() => void saveMembership(membership.telegramUserId)}
                      >
                        Сохранить
                      </button>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Assets и файлы</h2>
          </div>
          <p className={styles.blockHint}>
            Это реестр файлов, которые система знает и может потом выдать пользователю или положить в storage pipeline.
          </p>
          <div className={styles.list}>
            {(snapshot?.assets ?? []).slice(0, 20).map((asset) => (
              <article key={asset.id} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{asset.id}</strong>
                  <span>{asset.assetType}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{asset.releaseSlug || "no release"}</span>
                  <span>{asset.trackId || "full release"}</span>
                  <span>{asset.format}</span>
                  <span>{asset.resourceKey || "no key"}</span>
                  <span>{asset.sizeBytes} bytes</span>
                  <span>job: {assetPipelineByAssetId[asset.id]?.latestJobStatus || "none"}</span>
                  <span>job mode: {assetPipelineByAssetId[asset.id]?.latestJobMode || "none"}</span>
                  <span>bag: {assetPipelineByAssetId[asset.id]?.bagStatus || "none"}</span>
                  <span>runtime: {assetPipelineByAssetId[asset.id]?.runtimeFetchStatus || "unknown"}</span>
                </div>
                {canManage ? (
                  <div className={styles.controls}>
                    <button
                      type="button"
                      onClick={() => void prepareAssetForRuntime(asset.id, ingestMode)}
                      disabled={runningPrepareTargetKey === `asset:${asset.id}:${ingestMode}`}
                    >
                      {runningPrepareTargetKey === `asset:${asset.id}:${ingestMode}`
                        ? "Готовим..."
                        : "Подготовить этот asset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void runUploadForAsset(asset.id)}
                      disabled={
                        runningUploadTargetKey === `asset:${asset.id}` ||
                        runningUploadTargetKey === `asset:${asset.id}:prepare-upload`
                      }
                    >
                      {runningUploadTargetKey === `asset:${asset.id}` ? "Гоним..." : "Загрузить этот asset"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void prepareAndUploadAsset(asset.id)}
                      disabled={runningUploadTargetKey === `asset:${asset.id}:prepare-upload`}
                    >
                      {runningUploadTargetKey === `asset:${asset.id}:prepare-upload`
                        ? "Готовим и грузим..."
                        : "Подготовить + загрузить"}
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Bags и контейнеры хранения</h2>
          </div>
          <p className={styles.blockHint}>
            Здесь видно, какие assets уже упакованы в storage bags, в каком они статусе, сколько реплик планируется и
            подтверждён ли runtime pointer через gateway.
          </p>
          <div className={styles.list}>
            {(snapshot?.bags ?? []).slice(0, 20).map((bag) => (
              <article key={bag.id} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{bag.id}</strong>
                  <span>{bag.status}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{bag.assetId}</span>
                  <span>{bag.bagId || "bag id pending"}</span>
                  <span>{bag.runtimeLabel || bag.runtimeMode || "runtime pending"}</span>
                  <span>
                    {bag.replicasActual} / {bag.replicasTarget}
                  </span>
                  <span>{String(bag.tonstorageUri ?? "").trim() ? "pointer set" : "pointer pending"}</span>
                  <span>{formatRuntimeFetchStatus(bag.runtimeFetchStatus)}</span>
                  {bag.runtimeFetchUrl ? <span>{bag.runtimeFetchUrl}</span> : null}
                  {bag.runtimeFetchError ? <span>{bag.runtimeFetchError}</span> : null}
                  {(bagFilesByBagId[bag.id] ?? []).slice(0, 3).map((path) => (
                    <span key={`${bag.id}:${path}`}>{path}</span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Bag files</h2>
          </div>
          <p className={styles.blockHint}>
            Это уже не просто bag id, а конкретные пути файлов внутри bag. Именно их потом использует gateway, когда нужно
            отдать пользователю купленный трек или релиз.
          </p>
          <div className={styles.list}>
            {(snapshot?.bagFiles ?? []).slice(0, 20).map((entry) => (
              <article key={entry.id} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{entry.bagId}</strong>
                  <span>{entry.mimeType || "mime pending"}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{entry.path}</span>
                  <span>{entry.sizeBytes} bytes</span>
                  <span>priority: {entry.priority}</span>
                </div>
              </article>
            ))}
            {(snapshot?.bagFiles?.length ?? 0) === 0 ? (
              <article className={styles.emptyState}>
                <strong>Bag files пока не появились</strong>
                <span>
                  После prepare/upload система должна знать не только bag, но и путь файла внутри него. Без этого real pointer
                  ещё не готов для delivery.
                </span>
              </article>
            ) : null}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Runtime issues</h2>
          </div>
          <p className={styles.blockHint}>
            Здесь собраны первые проблемные assets и bags, которые сейчас не удаётся сопоставить с fetchable source. Это
            короткий operational список для диагностики перед user-тестом.
          </p>
          <div className={styles.list}>
            {(snapshot?.runtimeDiagnostics.unresolvedAssets ?? []).map((entry) => (
              <article key={`asset-${entry.id}`} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{entry.id}</strong>
                  <span>asset</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{entry.label}</span>
                  <span>{entry.reason}</span>
                </div>
              </article>
            ))}
            {(snapshot?.runtimeDiagnostics.unresolvedBags ?? []).map((entry) => (
              <article key={`bag-${entry.id}`} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{entry.id}</strong>
                  <span>bag</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{entry.label}</span>
                  <span>{entry.reason}</span>
                </div>
              </article>
            ))}
            {(snapshot?.runtimeDiagnostics.unresolvedAssets?.length ?? 0) === 0 &&
            (snapshot?.runtimeDiagnostics.unresolvedBags?.length ?? 0) === 0 ? (
              <article className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>Runtime mapping clean</strong>
                  <span>ok</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>Для первых проверенных записей fetchable source уже найден.</span>
                </div>
              </article>
            ) : null}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Ingest jobs</h2>
          </div>
          <p className={styles.blockHint}>
            Очередь подготовки assets к storage. Если job падает или зависает, именно здесь видно, на каком шаге pipeline
            остановился.
          </p>
          <div className={styles.list}>
            {(snapshot?.ingestJobs ?? []).slice(0, 20).map((job) => (
              <article key={job.id} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{job.id}</strong>
                  <span>{job.status}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{job.assetId}</span>
                  <span>{job.bagId || "bag pending"}</span>
                  <span>{job.mode}</span>
                  <span>{job.storagePointer || "pointer pending"}</span>
                  <span>attempt {job.attemptCount}</span>
                  <span>{job.message || job.failureMessage || "no details"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Выдача файлов</h2>
          </div>
          <p className={styles.blockHint}>
            Последние запросы на скачивание и отправку файлов пользователям. Этот блок помогает понять, почему конкретный
            релиз или трек не был доставлен в web, desktop или Telegram.
          </p>
          <div className={styles.list}>
            {(snapshot?.deliveryRequests ?? []).slice(0, 20).map((request) => (
              <article key={request.id} className={styles.itemCard}>
                <div className={styles.itemRow}>
                  <strong>{request.id}</strong>
                  <span>{request.status}</span>
                </div>
                <div className={styles.itemMeta}>
                  <span>{request.targetType}</span>
                  <span>{request.releaseSlug}</span>
                  <span>{request.trackId || "full release"}</span>
                  <span>{request.channel}</span>
                  <span>{request.resolvedFormat || "no format"}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
