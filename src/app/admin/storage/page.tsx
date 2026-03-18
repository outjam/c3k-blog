"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  createAdminStorageAsset,
  createAdminStorageBag,
  fetchAdminSession,
  fetchAdminStorage,
  patchAdminStorageMembership,
  type AdminSession,
  type AdminStorageSnapshot,
} from "@/lib/admin-api";
import type { StorageProgramMembership } from "@/types/storage";

import styles from "./page.module.scss";

export default function AdminStoragePage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [snapshot, setSnapshot] = useState<AdminStorageSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
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
    };
  }, [snapshot]);

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
            <p>Storage registry, memberships, bags и health events.</p>
          </div>
          <div className={styles.actions}>
            <button type="button" onClick={() => void load()}>
              Обновить
            </button>
            <Link href="/admin" className={styles.linkButton}>
              Админка
            </Link>
          </div>
        </header>

        {error ? <p className={styles.error}>{error}</p> : null}

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
        </section>

        {canManage ? (
          <>
            <section className={styles.block}>
              <div className={styles.blockHeading}>
                <h2>Новый asset</h2>
              </div>
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
          </>
        ) : null}

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Memberships</h2>
          </div>

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
            <h2>Assets</h2>
          </div>
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
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Bags</h2>
          </div>
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
                  <span>
                    {bag.replicasActual} / {bag.replicasTarget}
                  </span>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.block}>
          <div className={styles.blockHeading}>
            <h2>Deliveries</h2>
          </div>
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
