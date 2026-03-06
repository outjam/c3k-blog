"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { BackButtonController } from "@/components/back-button-controller";
import { RichPostContent } from "@/components/rich-post-content";
import type { BlogPost } from "@/types/blog";
import {
  clearBlogReactionApi,
  createBlogCommentApi,
  deleteBlogCommentApi,
  fetchBlogSocialSnapshot,
  setBlogReactionApi,
} from "@/lib/blog-social-api";
import { readBookmarkedPostSlugs, toggleBookmarkedPost } from "@/lib/post-bookmarks";
import { profileSlugFromIdentity } from "@/lib/social-hub";
import { hapticImpact, hapticNotification } from "@/lib/telegram";
import { BLOG_REACTION_OPTIONS, type BlogPostSocialSnapshot, type BlogReactionType } from "@/types/blog-social";

import styles from "./page.module.scss";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL;

export function PostPageClient({ post }: { post: BlogPost }) {
  const router = useRouter();
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [social, setSocial] = useState<BlogPostSocialSnapshot | null>(null);
  const [socialLoading, setSocialLoading] = useState(true);
  const [socialError, setSocialError] = useState("");
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSubmitting, setCommentSubmitting] = useState(false);
  const [deletingCommentId, setDeletingCommentId] = useState("");
  const [reactionUpdating, setReactionUpdating] = useState(false);

  useEffect(() => {
    let mounted = true;

    void readBookmarkedPostSlugs().then((slugs) => {
      if (mounted) {
        setIsBookmarked(slugs.includes(post.slug));
      }
    });

    return () => {
      mounted = false;
    };
  }, [post.slug]);

  useEffect(() => {
    let mounted = true;

    void fetchBlogSocialSnapshot(post.slug).then((result) => {
      if (!mounted) {
        return;
      }

      if (result.error) {
        setSocialError(result.error);
        setSocialLoading(false);
        return;
      }

      setSocial(result.snapshot);
      setSocialError("");
      setSocialLoading(false);
    });

    return () => {
      mounted = false;
    };
  }, [post.slug]);

  const handleBack = useCallback(() => {
    hapticImpact("light");
    router.back();
  }, [router]);

  const handleShare = useCallback(async () => {
    try {
      const origin = APP_URL || window.location.origin;
      const url = `${origin}/post/${post.slug}`;
      await navigator.clipboard.writeText(url);
      hapticNotification("success");
    } catch {
      hapticNotification("warning");
    }
  }, [post.slug]);

  const handleBookmark = useCallback(() => {
    void toggleBookmarkedPost(post.slug).then((next) => {
      const saved = next.includes(post.slug);
      setIsBookmarked(saved);
      hapticNotification(saved ? "success" : "warning");
    });
  }, [post.slug]);

  const handleReactionToggle = useCallback(
    (reactionType: BlogReactionType) => {
      if (reactionUpdating) {
        return;
      }

      setReactionUpdating(true);

      const request = social?.myReaction === reactionType ? clearBlogReactionApi(post.slug) : setBlogReactionApi(post.slug, reactionType);

      void request.then((result) => {
        setReactionUpdating(false);

        if (result.error || !result.snapshot) {
          hapticNotification("warning");
          setSocialError(result.error ?? "Не удалось обновить реакцию");
          return;
        }

        setSocial(result.snapshot);
        setSocialError("");
        hapticNotification("success");
      });
    },
    [post.slug, reactionUpdating, social?.myReaction],
  );

  const handleSubmitComment = useCallback(() => {
    if (commentSubmitting) {
      return;
    }

    const text = commentDraft.trim();

    if (text.length < 2) {
      setSocialError("Комментарий слишком короткий");
      hapticNotification("warning");
      return;
    }

    setCommentSubmitting(true);

    void createBlogCommentApi(post.slug, text).then((result) => {
      setCommentSubmitting(false);

      if (result.error || !result.snapshot) {
        setSocialError(result.error ?? "Не удалось отправить комментарий");
        hapticNotification("warning");
        return;
      }

      setCommentDraft("");
      setSocial(result.snapshot);
      setSocialError("");
      hapticNotification("success");
    });
  }, [commentDraft, commentSubmitting, post.slug]);

  const handleDeleteComment = useCallback(
    (commentId: string) => {
      if (!commentId || deletingCommentId) {
        return;
      }

      setDeletingCommentId(commentId);

      void deleteBlogCommentApi(post.slug, commentId).then((result) => {
        setDeletingCommentId("");

        if (result.error || !result.snapshot) {
          setSocialError(result.error ?? "Не удалось удалить комментарий");
          hapticNotification("warning");
          return;
        }

        setSocial(result.snapshot);
        setSocialError("");
        hapticNotification("success");
      });
    },
    [deletingCommentId, post.slug],
  );

  return (
    <div className={styles.page}>
      <BackButtonController onBack={handleBack} visible />

      <article className={styles.article}>
        <header className={styles.header}>
          <Image
            src={post.cover.src}
            alt={post.cover.alt}
            width={post.cover.width}
            height={post.cover.height}
            className={styles.cover}
            priority
          />
          <h1>{post.title}</h1>
          <div className={styles.meta}>
            <span>{post.publishedAt}</span>
            <span>{post.readTime}</span>
          </div>
          <p className={styles.excerpt}>{post.excerpt}</p>
          <div className={styles.actionRow}>
            <button type="button" className={styles.action} onClick={handleBack}>
              Назад
            </button>
            <button type="button" className={styles.action} onClick={handleShare}>
              Копировать ссылку
            </button>
            <button type="button" className={styles.action} onClick={handleBookmark}>
              {isBookmarked ? "Убрать из избранного" : "В избранное"}
            </button>
          </div>
        </header>

        <section className={styles.content}>
          <RichPostContent blocks={post.content} />
        </section>

        <section className={styles.social}>
          <div className={styles.socialHeader}>
            <h2>Реакции</h2>
          </div>
          <div className={styles.reactions}>
            {BLOG_REACTION_OPTIONS.map((item) => {
              const active = social?.myReaction === item.key;
              const count = social?.reactions[item.key] ?? 0;

              return (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.reactionButton} ${active ? styles.reactionButtonActive : ""}`}
                  onClick={() => handleReactionToggle(item.key)}
                  disabled={reactionUpdating}
                >
                  <span>{item.emoji}</span>
                  <span>{count}</span>
                </button>
              );
            })}
          </div>

          <div className={styles.socialHeader}>
            <h2>Комментарии</h2>
            <p>{social?.comments.length ?? 0}</p>
          </div>

          <div className={styles.commentComposer}>
            <textarea
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Напишите комментарий"
              maxLength={500}
            />
            <button type="button" className={styles.action} onClick={handleSubmitComment} disabled={commentSubmitting}>
              {commentSubmitting ? "Отправляем..." : "Отправить"}
            </button>
          </div>

          {socialLoading ? <p className={styles.socialHint}>Загружаем обсуждение...</p> : null}
          {socialError ? <p className={styles.socialError}>{socialError}</p> : null}

          <div className={styles.commentsList}>
            {(social?.comments ?? []).map((comment) => (
              <article key={comment.id} className={styles.commentCard}>
                <header>
                  <div>
                    <Link
                      href={`/profile/${profileSlugFromIdentity({
                        username: comment.author.username,
                        telegramUserId: comment.author.telegramUserId,
                        fallback: comment.author.firstName,
                      })}`}
                      className={styles.commentAuthorLink}
                    >
                      <strong>{comment.author.firstName || comment.author.username || `#${comment.author.telegramUserId}`}</strong>
                    </Link>
                    <time>{new Date(comment.createdAt).toLocaleString("ru-RU")}</time>
                  </div>
                  {comment.canDelete ? (
                    <button
                      type="button"
                      className={styles.commentDelete}
                      disabled={deletingCommentId === comment.id}
                      onClick={() => handleDeleteComment(comment.id)}
                    >
                      {deletingCommentId === comment.id ? "..." : "Удалить"}
                    </button>
                  ) : null}
                </header>
                <p>{comment.text}</p>
              </article>
            ))}
          </div>
        </section>
      </article>
    </div>
  );
}
