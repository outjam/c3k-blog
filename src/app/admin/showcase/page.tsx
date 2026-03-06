"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  deleteAdminShowcaseCollection,
  fetchAdminSession,
  fetchAdminShowcaseCollections,
  fetchPublicCatalog,
  upsertAdminShowcaseCollection,
  type AdminSession,
} from "@/lib/admin-api";
import type { ShowcaseCollection } from "@/types/shop";

import styles from "./page.module.scss";

interface ShowcaseDraft {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  coverImage: string;
  productIds: string;
  trackIds: string;
  order: string;
  isPublished: boolean;
}

const toDraft = (collection: ShowcaseCollection): ShowcaseDraft => {
  return {
    id: collection.id,
    title: collection.title,
    subtitle: collection.subtitle ?? "",
    description: collection.description ?? "",
    coverImage: collection.coverImage ?? "",
    productIds: collection.productIds.join(","),
    trackIds: collection.trackIds.join(","),
    order: String(collection.order),
    isPublished: collection.isPublished,
  };
};

const parseIds = (value: string): string[] => {
  return Array.from(
    new Set(
      value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean),
    ),
  );
};

export default function AdminShowcasePage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [collections, setCollections] = useState<ShowcaseCollection[]>([]);
  const [drafts, setDrafts] = useState<Record<string, ShowcaseDraft>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [productPool, setProductPool] = useState<Array<{ id: string; title: string }>>([]);

  const canView = Boolean(session?.permissions.includes("showcase:view"));
  const canManage = Boolean(session?.permissions.includes("showcase:manage"));

  const productSuggestions = useMemo(() => productPool.slice(0, 80), [productPool]);

  const load = async () => {
    setLoading(true);
    setError("");

    const [sessionResponse, showcaseResponse, catalogResponse] = await Promise.all([
      fetchAdminSession(),
      fetchAdminShowcaseCollections(),
      fetchPublicCatalog(),
    ]);

    if (sessionResponse.error || !sessionResponse.session) {
      setSession(null);
      setError(sessionResponse.error ?? "Unauthorized");
      setLoading(false);
      return;
    }

    setSession(sessionResponse.session);

    if (showcaseResponse.error) {
      setError(showcaseResponse.error);
      setCollections([]);
      setDrafts({});
    } else {
      setCollections(showcaseResponse.collections);
      setDrafts(Object.fromEntries(showcaseResponse.collections.map((collection) => [collection.id, toDraft(collection)])));
    }

    setProductPool((catalogResponse.products ?? []).map((product) => ({ id: product.id, title: product.title })));
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

  const saveCollection = async (collectionId: string) => {
    const draft = drafts[collectionId];
    if (!draft) {
      return;
    }

    const response = await upsertAdminShowcaseCollection({
      collection: {
        id: draft.id,
        title: draft.title,
        subtitle: draft.subtitle || undefined,
        description: draft.description || undefined,
        coverImage: draft.coverImage || undefined,
        productIds: parseIds(draft.productIds),
        trackIds: parseIds(draft.trackIds),
        order: Math.max(1, Math.round(Number(draft.order || "1"))),
        isPublished: draft.isPublished,
      },
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    setCollections(response.collections);
    setDrafts(Object.fromEntries(response.collections.map((collection) => [collection.id, toDraft(collection)])));
  };

  const createCollection = async () => {
    const title = newTitle.trim();

    if (!title) {
      setError("Введите название подборки.");
      return;
    }

    const response = await upsertAdminShowcaseCollection({
      collection: {
        title,
        productIds: [],
        trackIds: [],
        isPublished: true,
      },
    });

    if (response.error) {
      setError(response.error);
      return;
    }

    setNewTitle("");
    setCollections(response.collections);
    setDrafts(Object.fromEntries(response.collections.map((collection) => [collection.id, toDraft(collection)])));
  };

  const removeCollection = async (id: string) => {
    const response = await deleteAdminShowcaseCollection(id);

    if (response.error) {
      setError(response.error);
      return;
    }

    setCollections(response.collections);
    setDrafts(Object.fromEntries(response.collections.map((collection) => [collection.id, toDraft(collection)])));
  };

  if (loading) {
    return <div className={styles.page}>Загрузка...</div>;
  }

  if (!session?.isAdmin || !canView) {
    return (
      <div className={styles.page}>
        <section className={styles.card}>
          <h1>Доступ запрещен</h1>
          <p>У вас нет прав на просмотр подборок витрины.</p>
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
            <h1>Подборки витрины</h1>
            <p>Кастомизация storefront блоков для магазина</p>
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

        {canManage ? (
          <div className={styles.createRow}>
            <input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} placeholder="Новая подборка" />
            <button type="button" onClick={() => void createCollection()}>
              Создать
            </button>
          </div>
        ) : null}

        {collections.length === 0 ? <p className={styles.empty}>Подборки пока не созданы.</p> : null}

        <div className={styles.list}>
          {collections.map((collection) => {
            const draft = drafts[collection.id];
            if (!draft) {
              return null;
            }

            return (
              <article key={collection.id} className={styles.collectionCard}>
                <div className={styles.row}>
                  <label>
                    ID
                    <input value={draft.id} disabled />
                  </label>
                  <label>
                    Порядок
                    <input
                      type="number"
                      min={1}
                      value={draft.order}
                      onChange={(event) =>
                        setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, order: event.target.value } }))
                      }
                    />
                  </label>
                </div>
                <label>
                  Заголовок
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, title: event.target.value } }))
                    }
                  />
                </label>
                <label>
                  Подзаголовок
                  <input
                    value={draft.subtitle}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, subtitle: event.target.value } }))
                    }
                  />
                </label>
                <label>
                  Описание
                  <textarea
                    value={draft.description}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, description: event.target.value } }))
                    }
                  />
                </label>
                <label>
                  Cover URL
                  <input
                    value={draft.coverImage}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, coverImage: event.target.value } }))
                    }
                  />
                </label>
                <label>
                  Product IDs (comma separated)
                  <input
                    value={draft.productIds}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, productIds: event.target.value } }))
                    }
                  />
                </label>
                <label>
                  Track IDs (comma separated)
                  <input
                    value={draft.trackIds}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, trackIds: event.target.value } }))
                    }
                  />
                </label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={draft.isPublished}
                    onChange={(event) =>
                      setDrafts((prev) => ({ ...prev, [collection.id]: { ...draft, isPublished: event.target.checked } }))
                    }
                  />
                  Опубликована
                </label>

                <div className={styles.actionsRow}>
                  {canManage ? (
                    <button type="button" onClick={() => void saveCollection(collection.id)}>
                      Сохранить
                    </button>
                  ) : null}
                  {canManage ? (
                    <button type="button" className={styles.danger} onClick={() => void removeCollection(collection.id)}>
                      Удалить
                    </button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>

        <section className={styles.suggestions}>
          <h2>Подсказки ID для подборок</h2>
          <div className={styles.suggestionsList}>
            {productSuggestions.map((item) => (
              <p key={item.id}>
                <code>{item.id}</code> — {item.title}
              </p>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}
