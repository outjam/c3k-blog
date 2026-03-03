import { getPostgresHttpConfig, postgresTableRequest } from "@/lib/server/postgres-http";
import type { BlogPost, PostContentBlock, PostImage } from "@/data/posts";

interface BlogPostDbRow {
  slug?: string;
  title?: string;
  excerpt?: string;
  cover?: unknown;
  tags?: unknown;
  content?: unknown;
  published_at?: string;
  is_hidden?: boolean;
  updated_at?: string;
}

const POSTGRES_STRICT = process.env.POSTGRES_STRICT_MODE === "1";

const DEFAULT_COVER: PostImage = {
  src: "/posts/cover-pattern.svg",
  alt: "Обложка поста",
  width: 1200,
  height: 700,
};

const normalizeSlug = (value: unknown): string => {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9а-яё_-]/gi, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
};

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

const normalizeSlugValue = (value: string): string => {
  return normalizeSlug(safeDecode(value).normalize("NFC"));
};

const normalizePublishedDate = (value: unknown): string => {
  const raw = String(value ?? "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const timestamp = new Date(raw).getTime();

  if (!Number.isFinite(timestamp)) {
    return new Date().toISOString().slice(0, 10);
  }

  return new Date(timestamp).toISOString().slice(0, 10);
};

const sanitizeCover = (raw: unknown): { image: PostImage; cardVariant: BlogPost["cardVariant"]; readTime?: string } => {
  if (!raw || typeof raw !== "object") {
    return { image: DEFAULT_COVER, cardVariant: "minimal" };
  }

  const source = raw as Record<string, unknown>;
  const src = String(source.src ?? "").trim() || DEFAULT_COVER.src;
  const alt = String(source.alt ?? DEFAULT_COVER.alt).slice(0, 220);
  const width = Math.max(1, Math.round(Number(source.width ?? DEFAULT_COVER.width)));
  const height = Math.max(1, Math.round(Number(source.height ?? DEFAULT_COVER.height)));
  const cardVariant = source.cardVariant;
  const readTime = typeof source.readTime === "string" ? source.readTime.slice(0, 20) : undefined;

  return {
    image: {
      src,
      alt,
      caption: typeof source.caption === "string" ? source.caption.slice(0, 320) : undefined,
      width,
      height,
    },
    cardVariant: cardVariant === "feature" || cardVariant === "glass" || cardVariant === "minimal" ? cardVariant : "minimal",
    readTime,
  };
};

const sanitizeContentBlock = (raw: unknown): PostContentBlock | null => {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  const block = raw as Record<string, unknown>;

  if (block.type === "paragraph" && typeof block.text === "string") {
    return { type: "paragraph", text: block.text.slice(0, 6000) };
  }

  if (block.type === "heading" && typeof block.text === "string") {
    return { type: "heading", text: block.text.slice(0, 240) };
  }

  if (block.type === "quote" && typeof block.text === "string") {
    return {
      type: "quote",
      text: block.text.slice(0, 1200),
      author: typeof block.author === "string" ? block.author.slice(0, 120) : undefined,
    };
  }

  if (block.type === "list" && Array.isArray(block.items)) {
    const items = block.items
      .map((item) => String(item ?? "").trim())
      .filter(Boolean)
      .slice(0, 50)
      .map((item) => item.slice(0, 220));

    if (items.length === 0) {
      return null;
    }

    return {
      type: "list",
      ordered: Boolean(block.ordered),
      items,
    };
  }

  if (block.type === "image" && block.image && typeof block.image === "object") {
    const image = block.image as Record<string, unknown>;
    const src = String(image.src ?? "").trim();

    if (!src) {
      return null;
    }

    return {
      type: "image",
      image: {
        src,
        alt: String(image.alt ?? "Изображение").slice(0, 220),
        caption: typeof image.caption === "string" ? image.caption.slice(0, 320) : undefined,
        width: Math.max(1, Math.round(Number(image.width ?? 1200))),
        height: Math.max(1, Math.round(Number(image.height ?? 700))),
      },
    };
  }

  if (block.type === "gallery" && Array.isArray(block.images)) {
    const images = block.images
      .map((item) => {
        if (!item || typeof item !== "object") {
          return null;
        }

        const image = item as Record<string, unknown>;
        const src = String(image.src ?? "").trim();

        if (!src) {
          return null;
        }

        return {
          src,
          alt: String(image.alt ?? "Изображение").slice(0, 220),
          caption: typeof image.caption === "string" ? image.caption.slice(0, 320) : undefined,
          width: Math.max(1, Math.round(Number(image.width ?? 1200))),
          height: Math.max(1, Math.round(Number(image.height ?? 700))),
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .slice(0, 24);

    if (images.length === 0) {
      return null;
    }

    return {
      type: "gallery",
      title: typeof block.title === "string" ? block.title.slice(0, 180) : undefined,
      images,
    };
  }

  if (block.type === "video" && block.video && typeof block.video === "object") {
    const video = block.video as Record<string, unknown>;
    const src = String(video.src ?? "").trim();

    if (!src) {
      return null;
    }

    return {
      type: "video",
      video: {
        src,
        poster: typeof video.poster === "string" ? video.poster.slice(0, 3000) : undefined,
        caption: typeof video.caption === "string" ? video.caption.slice(0, 320) : undefined,
      },
    };
  }

  if (block.type === "audio" && block.audio && typeof block.audio === "object") {
    const audio = block.audio as Record<string, unknown>;
    const src = String(audio.src ?? "").trim();

    if (!src) {
      return null;
    }

    return {
      type: "audio",
      audio: {
        src,
        title: String(audio.title ?? "Аудио").slice(0, 120),
        caption: typeof audio.caption === "string" ? audio.caption.slice(0, 320) : undefined,
      },
    };
  }

  if (block.type === "model3d" && block.model && typeof block.model === "object") {
    const model = block.model as Record<string, unknown>;
    const src = String(model.src ?? "").trim();

    if (!src) {
      return null;
    }

    return {
      type: "model3d",
      model: {
        src,
        iosSrc: typeof model.iosSrc === "string" ? model.iosSrc.slice(0, 3000) : undefined,
        poster: typeof model.poster === "string" ? model.poster.slice(0, 3000) : undefined,
        alt: String(model.alt ?? "3D модель").slice(0, 220),
        caption: typeof model.caption === "string" ? model.caption.slice(0, 320) : undefined,
      },
    };
  }

  if (block.type === "tsx" && typeof block.title === "string" && typeof block.code === "string") {
    const demoId = block.demoId;

    if (demoId !== "webapp-ready" && demoId !== "theme-chip" && demoId !== "haptic-actions") {
      return null;
    }

    return {
      type: "tsx",
      title: block.title.slice(0, 180),
      code: block.code.slice(0, 12000),
      demoId,
    };
  }

  if (block.type === "animation" && typeof block.title === "string") {
    const demoId = block.demoId;

    if (demoId !== "parallax-cards" && demoId !== "reading-progress" && demoId !== "pulse-grid") {
      return null;
    }

    return {
      type: "animation",
      title: block.title.slice(0, 180),
      caption: typeof block.caption === "string" ? block.caption.slice(0, 320) : undefined,
      demoId,
    };
  }

  return null;
};

const toContentBlocks = (raw: unknown): PostContentBlock[] => {
  const source =
    Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { blocks?: unknown[] }).blocks)
        ? (raw as { blocks: unknown[] }).blocks
        : [];

  const blocks = source
    .map((item) => sanitizeContentBlock(item))
    .filter((item): item is PostContentBlock => Boolean(item));

  if (blocks.length > 0) {
    return blocks;
  }

  return [{ type: "paragraph", text: "Контент пока не добавлен." }];
};

const estimateReadTime = (blocks: PostContentBlock[]): string => {
  const text = blocks
    .map((block) => {
      if (block.type === "paragraph" || block.type === "heading" || block.type === "quote") {
        return block.text;
      }

      if (block.type === "list") {
        return block.items.join(" ");
      }

      if (block.type === "tsx") {
        return block.title;
      }

      if (block.type === "animation") {
        return block.title;
      }

      if (block.type === "audio") {
        return block.audio.title;
      }

      return "";
    })
    .join(" ");

  const words = text.split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  return `${minutes} мин`;
};

const rowToBlogPost = (row: BlogPostDbRow): BlogPost | null => {
  const slug = normalizeSlug(row.slug);

  if (!slug) {
    return null;
  }

  const title = String(row.title ?? "").trim().slice(0, 180);
  const excerpt = String(row.excerpt ?? "").trim().slice(0, 420);
  const tags = Array.isArray(row.tags)
    ? row.tags.map((tag) => String(tag ?? "").trim().slice(0, 32)).filter(Boolean).slice(0, 12)
    : [];
  const content = toContentBlocks(row.content);
  const cover = sanitizeCover(row.cover);

  return {
    slug,
    title: title || "Без названия",
    excerpt: excerpt || "Описание отсутствует",
    tags: tags.length > 0 ? tags : ["telegram", "webapp"],
    cardVariant: cover.cardVariant,
    publishedAt: normalizePublishedDate(row.published_at),
    readTime: cover.readTime || estimateReadTime(content),
    cover: cover.image,
    content,
  };
};

const toTimestamp = (value: string): number => {
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const toRowList = (value: unknown): BlogPostDbRow[] => {
  if (Array.isArray(value)) {
    return value as BlogPostDbRow[];
  }

  if (value && typeof value === "object") {
    return [value as BlogPostDbRow];
  }

  return [];
};

const listBlogRows = async (includeHidden: boolean): Promise<BlogPostDbRow[] | null> => {
  const query = new URLSearchParams();
  query.set("select", "slug,title,excerpt,cover,tags,content,published_at,is_hidden,updated_at");

  if (!includeHidden) {
    query.set("is_hidden", "eq.false");
  }

  query.set("order", "published_at.desc.nullslast,updated_at.desc");

  return postgresTableRequest<BlogPostDbRow[]>({
    method: "GET",
    path: "/blog_posts",
    query,
  });
};

const upsertBlogRow = async (post: BlogPost): Promise<BlogPostDbRow[] | null> => {
  const normalizedSlug = normalizeSlug(post.slug);
  const publishedAt = normalizePublishedDate(post.publishedAt);

  if (!normalizedSlug) {
    return null;
  }

  const query = new URLSearchParams();
  query.set("on_conflict", "slug");

  const response = await postgresTableRequest<unknown>({
    method: "POST",
    path: "/blog_posts",
    query,
    body: {
      slug: normalizedSlug,
      title: String(post.title ?? "").trim().slice(0, 180),
      excerpt: String(post.excerpt ?? "").trim().slice(0, 420),
      cover: {
        ...post.cover,
        cardVariant: post.cardVariant,
        readTime: post.readTime,
      },
      tags: post.tags.map((tag) => String(tag ?? "").trim().slice(0, 32)).filter(Boolean).slice(0, 12),
      content: post.content,
      published_at: publishedAt,
      is_hidden: false,
    },
    prefer: "resolution=merge-duplicates,return=representation",
  });

  if (response === null) {
    return null;
  }

  return toRowList(response);
};

const hideBlogRow = async (slug: string): Promise<BlogPostDbRow[] | null> => {
  const normalizedSlug = normalizeSlug(slug);

  if (!normalizedSlug) {
    return null;
  }

  const query = new URLSearchParams();
  query.set("slug", `eq.${normalizedSlug}`);

  return postgresTableRequest<BlogPostDbRow[]>({
    method: "PATCH",
    path: "/blog_posts",
    query,
    body: { is_hidden: true },
    prefer: "return=representation",
  });
};

export const getBlogPostsSnapshot = async (): Promise<BlogPost[]> => {
  if (!getPostgresHttpConfig()) {
    if (POSTGRES_STRICT) {
      throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for blog posts");
    }

    return [];
  }

  const rows = await listBlogRows(false);

  if (!rows) {
    if (POSTGRES_STRICT) {
      throw new Error("Failed to read blog posts from Postgres");
    }

    return [];
  }

  return rows
    .map((row) => rowToBlogPost(row))
    .filter((post): post is BlogPost => Boolean(post))
    .sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));
};

export const getAdminBlogPostsSnapshot = async (): Promise<{ posts: BlogPost[]; hiddenPostSlugs: string[]; customSlugs: string[] }> => {
  if (!getPostgresHttpConfig()) {
    if (POSTGRES_STRICT) {
      throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for blog posts");
    }

    return { posts: [], hiddenPostSlugs: [], customSlugs: [] };
  }

  const rows = await listBlogRows(true);

  if (!rows) {
    if (POSTGRES_STRICT) {
      throw new Error("Failed to read blog posts from Postgres");
    }

    return { posts: [], hiddenPostSlugs: [], customSlugs: [] };
  }

  const hiddenPostSlugs = Array.from(
    new Set(
      rows
        .filter((row) => Boolean(row.is_hidden))
        .map((row) => normalizeSlug(row.slug))
        .filter(Boolean),
    ),
  );

  const posts = rows
    .filter((row) => !row.is_hidden)
    .map((row) => rowToBlogPost(row))
    .filter((post): post is BlogPost => Boolean(post))
    .sort((a, b) => toTimestamp(b.publishedAt) - toTimestamp(a.publishedAt));

  const customSlugs = rows
    .map((row) => normalizeSlug(row.slug))
    .filter(Boolean)
    .filter((slug, index, list) => list.indexOf(slug) === index);

  return { posts, hiddenPostSlugs, customSlugs };
};

export const upsertBlogPost = async (post: BlogPost): Promise<BlogPost | null> => {
  if (!getPostgresHttpConfig()) {
    if (POSTGRES_STRICT) {
      throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for blog posts");
    }

    return null;
  }

  const rows = await upsertBlogRow(post);

  if (!rows || !rows[0]) {
    if (POSTGRES_STRICT) {
      throw new Error("Failed to upsert blog post in Postgres");
    }

    return null;
  }

  return rowToBlogPost(rows[0]);
};

export const hideBlogPostBySlug = async (slug: string): Promise<boolean> => {
  if (!getPostgresHttpConfig()) {
    if (POSTGRES_STRICT) {
      throw new Error("Missing SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY for blog posts");
    }

    return false;
  }

  const updated = await hideBlogRow(slug);

  if (!updated) {
    if (POSTGRES_STRICT) {
      throw new Error("Failed to hide blog post in Postgres");
    }

    return false;
  }

  return true;
};

export const getBlogPostBySlug = async (slug: string): Promise<BlogPost | null> => {
  const posts = await getBlogPostsSnapshot();
  const candidates = Array.from(new Set([slug, safeDecode(slug)].map((value) => normalizeSlugValue(value)).filter(Boolean)));

  return (
    posts.find((post) => {
      const normalizedPostSlug = normalizeSlugValue(post.slug);
      return candidates.includes(normalizedPostSlug);
    }) ?? null
  );
};
