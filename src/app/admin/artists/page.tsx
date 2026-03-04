"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  fetchAdminArtists,
  fetchAdminSession,
  patchAdminArtistModeration,
  patchAdminTrackModeration,
  type AdminSession,
} from "@/lib/admin-api";
import { formatStarsFromCents } from "@/lib/stars-format";
import type { ArtistProfile, ArtistTrack } from "@/types/shop";

import styles from "./page.module.scss";

export default function AdminArtistsPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [profiles, setProfiles] = useState<ArtistProfile[]>([]);
  const [tracks, setTracks] = useState<ArtistTrack[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profileStatusDrafts, setProfileStatusDrafts] = useState<Record<number, ArtistProfile["status"]>>({});
  const [profileNoteDrafts, setProfileNoteDrafts] = useState<Record<number, string>>({});
  const [trackStatusDrafts, setTrackStatusDrafts] = useState<Record<string, ArtistTrack["status"]>>({});
  const [trackNoteDrafts, setTrackNoteDrafts] = useState<Record<string, string>>({});

  const canView = Boolean(session?.permissions.includes("artists:view"));
  const canManage = Boolean(session?.permissions.includes("artists:manage"));

  const tracksByArtist = useMemo(() => {
    const map = new Map<number, ArtistTrack[]>();

    for (const track of tracks) {
      const current = map.get(track.artistTelegramUserId) ?? [];
      current.push(track);
      map.set(track.artistTelegramUserId, current);
    }

    map.forEach((list) => {
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
    });

    return map;
  }, [tracks]);

  const load = async () => {
    setLoading(true);
    setError("");

    const [sessionResponse, artistsResponse] = await Promise.all([fetchAdminSession(), fetchAdminArtists()]);

    if (sessionResponse.error || !sessionResponse.session) {
      setSession(null);
      setError(sessionResponse.error ?? "Unauthorized");
      setLoading(false);
      return;
    }

    setSession(sessionResponse.session);

    if (artistsResponse.error) {
      setError(artistsResponse.error);
      setProfiles([]);
      setTracks([]);
      setLoading(false);
      return;
    }

    setProfiles(artistsResponse.profiles);
    setTracks(artistsResponse.tracks);
    setProfileStatusDrafts(
      Object.fromEntries(artistsResponse.profiles.map((profile) => [profile.telegramUserId, profile.status])),
    );
    setProfileNoteDrafts(
      Object.fromEntries(artistsResponse.profiles.map((profile) => [profile.telegramUserId, profile.moderationNote ?? ""])),
    );
    setTrackStatusDrafts(Object.fromEntries(artistsResponse.tracks.map((track) => [track.id, track.status])));
    setTrackNoteDrafts(Object.fromEntries(artistsResponse.tracks.map((track) => [track.id, track.moderationNote ?? ""])));
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const saveProfile = async (profile: ArtistProfile) => {
    const status = profileStatusDrafts[profile.telegramUserId] ?? profile.status;
    const moderationNote = profileNoteDrafts[profile.telegramUserId] ?? "";

    const response = await patchAdminArtistModeration({
      telegramUserId: profile.telegramUserId,
      status,
      moderationNote,
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    await load();
  };

  const saveTrack = async (track: ArtistTrack) => {
    const status = trackStatusDrafts[track.id] ?? track.status;
    const moderationNote = trackNoteDrafts[track.id] ?? "";

    const response = await patchAdminTrackModeration({
      trackId: track.id,
      status,
      moderationNote,
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    await load();
  };

  if (loading) {
    return <div className={styles.page}>Загрузка...</div>;
  }

  if (!session?.isAdmin || !canView) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1>Доступ запрещен</h1>
          <p>У вас нет прав на просмотр модерации артистов.</p>
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
            <h1>Модерация артистов</h1>
            <p>Профили, треки, публикация в витрину</p>
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

        {profiles.length === 0 ? <p className={styles.empty}>Пока нет заявок артистов.</p> : null}

        <div className={styles.profileList}>
          {profiles.map((profile) => {
            const artistTracks = tracksByArtist.get(profile.telegramUserId) ?? [];

            return (
              <article key={profile.telegramUserId} className={styles.profileCard}>
                <div className={styles.profileHead}>
                  <h2>{profile.displayName}</h2>
                  <p>@{profile.slug}</p>
                </div>
                <p className={styles.bio}>{profile.bio || "Без описания"}</p>
                <div className={styles.meta}>
                  <span>Баланс: {formatStarsFromCents(profile.balanceStarsCents)} ⭐</span>
                  <span>Заработано: {formatStarsFromCents(profile.lifetimeEarningsStarsCents)} ⭐</span>
                  <span>Треков: {artistTracks.length}</span>
                </div>

                <div className={styles.row}>
                  <label>
                    Статус профиля
                    <select
                      value={profileStatusDrafts[profile.telegramUserId] ?? profile.status}
                      onChange={(event) =>
                        setProfileStatusDrafts((prev) => ({
                          ...prev,
                          [profile.telegramUserId]: event.target.value as ArtistProfile["status"],
                        }))
                      }
                    >
                      <option value="pending">pending</option>
                      <option value="approved">approved</option>
                      <option value="rejected">rejected</option>
                      <option value="suspended">suspended</option>
                    </select>
                  </label>
                  <label>
                    Комментарий модерации
                    <input
                      value={profileNoteDrafts[profile.telegramUserId] ?? ""}
                      onChange={(event) =>
                        setProfileNoteDrafts((prev) => ({ ...prev, [profile.telegramUserId]: event.target.value }))
                      }
                    />
                  </label>
                </div>

                {canManage ? (
                  <button type="button" className={styles.primary} onClick={() => void saveProfile(profile)}>
                    Сохранить профиль
                  </button>
                ) : null}

                <div className={styles.trackList}>
                  {artistTracks.map((track) => (
                    <article key={track.id} className={styles.trackCard}>
                      <div>
                        <strong>{track.title}</strong>
                        <p>{track.subtitle}</p>
                      </div>
                      <div className={styles.row}>
                        <label>
                          Статус трека
                          <select
                            value={trackStatusDrafts[track.id] ?? track.status}
                            onChange={(event) =>
                              setTrackStatusDrafts((prev) => ({
                                ...prev,
                                [track.id]: event.target.value as ArtistTrack["status"],
                              }))
                            }
                          >
                            <option value="draft">draft</option>
                            <option value="pending_moderation">pending_moderation</option>
                            <option value="published">published</option>
                            <option value="rejected">rejected</option>
                          </select>
                        </label>
                        <label>
                          Комментарий
                          <input
                            value={trackNoteDrafts[track.id] ?? ""}
                            onChange={(event) =>
                              setTrackNoteDrafts((prev) => ({ ...prev, [track.id]: event.target.value }))
                            }
                          />
                        </label>
                      </div>
                      {canManage ? (
                        <button type="button" onClick={() => void saveTrack(track)}>
                          Сохранить трек
                        </button>
                      ) : null}
                    </article>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
