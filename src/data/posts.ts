export interface PostImage {
  src: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
}

export type PostContentBlock =
  | {
      type: "paragraph";
      text: string;
    }
  | {
      type: "heading";
      text: string;
    }
  | {
      type: "quote";
      text: string;
      author?: string;
    }
  | {
      type: "image";
      image: PostImage;
    }
  | {
      type: "gallery";
      title?: string;
      images: PostImage[];
    }
  | {
      type: "list";
      ordered?: boolean;
      items: string[];
    };

export interface BlogPost {
  slug: string;
  title: string;
  excerpt: string;
  tags: string[];
  publishedAt: string;
  readTime: string;
  cover: PostImage;
  content: PostContentBlock[];
}

export const posts: BlogPost[] = [
  {
    slug: "telegram-mini-app-architecture",
    title: "Архитектура Telegram Mini App на Next.js 16",
    excerpt:
      "Как разложить Telegram WebApp интеграцию на provider, hooks и UI-слой без технического долга.",
    tags: ["nextjs", "telegram", "architecture"],
    publishedAt: "2026-02-26",
    readTime: "6 мин",
    cover: {
      src: "/posts/studio-grid.svg",
      alt: "Интерфейс Telegram Mini App",
      caption: "Контент блога, адаптированный под формат Mini App.",
      width: 1200,
      height: 700,
    },
    content: [
      {
        type: "paragraph",
        text: "Telegram Mini App удобно строить как отдельный адаптер между WebApp API и бизнес-логикой. В Next.js 16 хорошо работает связка App Router + Server Components для контента и Client Components для Telegram API.",
      },
      {
        type: "quote",
        text: "Контент не должен зависеть от платформы, а платформа не должна усложнять контент.",
        author: "C3K Notes",
      },
      {
        type: "image",
        image: {
          src: "/posts/workflow-board.svg",
          alt: "Доска workflow блога",
          caption: "Draft -> Review -> Published как отдельные этапы контент-пайплайна.",
          width: 1200,
          height: 700,
        },
      },
      {
        type: "heading",
        text: "Какие части оставить платформенными",
      },
      {
        type: "list",
        items: [
          "MainButton и BackButton должны жить в UI-контроллерах и не проникать в бизнес-логику.",
          "HapticFeedback вызывать только на значимых событиях: переход, подтверждение, ошибка.",
          "Токены темы Telegram держать в CSS-переменных и применять к UI на лету.",
        ],
      },
      {
        type: "gallery",
        title: "Скетчи экранов",
        images: [
          {
            src: "/posts/gallery-01.svg",
            alt: "Первый макет экрана",
            width: 900,
            height: 520,
          },
          {
            src: "/posts/gallery-02.svg",
            alt: "Второй макет экрана",
            width: 900,
            height: 520,
          },
          {
            src: "/posts/gallery-03.svg",
            alt: "Третий макет экрана",
            width: 900,
            height: 520,
          },
        ],
      },
      {
        type: "paragraph",
        text: "BackButton стоит показывать только на внутренних экранах, а MainButton должен подсказывать следующий понятный шаг. Тогда приложение ощущается нативно внутри Telegram.",
      },
    ],
  },
  {
    slug: "scss-design-system-mini-blog",
    title: "SCSS дизайн-система для персонального блога",
    excerpt:
      "Переменные, модульные стили и живой визуальный язык без шаблонного UI.",
    tags: ["scss", "ui", "design-system"],
    publishedAt: "2026-02-24",
    readTime: "5 мин",
    cover: {
      src: "/posts/cover-pattern.svg",
      alt: "Обложка с визуальными блоками контента",
      caption: "Один пост, несколько типов контента и единый стиль.",
      width: 1200,
      height: 700,
    },
    content: [
      {
        type: "paragraph",
        text: "Если интерфейс блога живет в Telegram, он должен выглядеть нативно и при этом узнаваемо. SCSS помогает организовать токены, слои и повторно используемые элементы без лишней магии.",
      },
      {
        type: "heading",
        text: "Основа структуры",
      },
      {
        type: "list",
        ordered: true,
        items: [
          "Глобальные токены: цвета, радиусы, типографика.",
          "Компонентные модули: карточки, галереи, цитаты, кнопки.",
          "Локальные адаптивные правила только там, где реально нужно.",
        ],
      },
      {
        type: "quote",
        text: "Хороший дизайн-системный SCSS не ограничивает креатив, а ускоряет его.",
      },
      {
        type: "paragraph",
        text: "Добавляй движения осмысленно: плавный вход карточек, легкий tap-scale на кнопках, четкие состояния фокуса. Это особенно заметно в мобильном WebView Telegram.",
      },
    ],
  },
  {
    slug: "haptic-feedback-patterns",
    title: "Паттерны тактильного отклика в Telegram WebApp",
    excerpt:
      "Когда использовать impact, selection и notification, чтобы обратная связь работала на UX.",
    tags: ["telegram", "haptic", "ux"],
    publishedAt: "2026-02-20",
    readTime: "4 мин",
    cover: {
      src: "/posts/gallery-03.svg",
      alt: "Абстрактная иллюстрация haptic-паттернов",
      caption: "Тактильный отклик должен быть дозированным.",
      width: 900,
      height: 520,
    },
    content: [
      {
        type: "paragraph",
        text: "Тактильный отклик должен поддерживать действие, а не мешать ему. Impact подходит для явных кнопок и переходов между экранами.",
      },
      {
        type: "paragraph",
        text: "Selection полезен в фильтрах и переключателях. Notification стоит оставить для ошибок и успешных подтверждений.",
      },
      {
        type: "quote",
        text: "Если каждое нажатие вибрирует, пользователь перестает это замечать.",
      },
      {
        type: "list",
        items: [
          "Используй impact для навигации и CTA-действий.",
          "Используй selection в изменении выбора.",
          "Используй notification для финального результата операции.",
        ],
      },
    ],
  },
];

export const getPostBySlug = (slug: string): BlogPost | undefined => {
  return posts.find((post) => post.slug === slug);
};
