export interface PostImage {
  src: string;
  alt: string;
  caption?: string;
  width: number;
  height: number;
}

export interface PostVideo {
  src: string;
  poster?: string;
  caption?: string;
}

export interface PostAudio {
  src: string;
  title: string;
  caption?: string;
}

export interface PostModel3D {
  src: string;
  iosSrc?: string;
  poster?: string;
  alt: string;
  caption?: string;
}

export type TsxDemoId = "webapp-ready" | "theme-chip" | "haptic-actions";
export type AnimationDemoId = "parallax-cards" | "reading-progress" | "pulse-grid";

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
      type: "video";
      video: PostVideo;
    }
  | {
      type: "audio";
      audio: PostAudio;
    }
  | {
      type: "model3d";
      model: PostModel3D;
    }
  | {
      type: "tsx";
      title: string;
      code: string;
      demoId: TsxDemoId;
    }
  | {
      type: "animation";
      title: string;
      caption?: string;
      demoId: AnimationDemoId;
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
  cardVariant: "feature" | "glass" | "minimal";
  publishedAt: string;
  readTime: string;
  cover: PostImage;
  content: PostContentBlock[];
}

const galleryImages: PostImage[] = [
  { src: "/posts/gallery-01.svg", alt: "Экран выбора команды", width: 900, height: 520 },
  { src: "/posts/gallery-02.svg", alt: "Экран каталога фич", width: 900, height: 520 },
  { src: "/posts/gallery-03.svg", alt: "Экран настроек App", width: 900, height: 520 },
];

const covers: PostImage[] = [
  {
    src: "/posts/studio-grid.svg",
    alt: "Telegram WebApp системный экран",
    width: 1200,
    height: 700,
  },
  {
    src: "/posts/workflow-board.svg",
    alt: "Пайплайн разработки Mini App",
    width: 1200,
    height: 700,
  },
  {
    src: "/posts/cover-pattern.svg",
    alt: "Контентная карточка в ленте",
    width: 1200,
    height: 700,
  },
];

const topics = [
  "Архитектура Telegram WebApp без технического долга",
  "Роутинг и deep links внутри Mini App",
  "Паттерны безопасной авторизации initData",
  "Кастомный splash-screen и prefetch данных",
  "Оптимизация WebView под iOS",
  "Работа с MainButton как state machine",
  "BackButton и логика вложенных экранов",
  "Безопасные платежные сценарии в WebApp",
  "UX-правила для тактильных сценариев",
  "Работа с безопасной зоной и notch",
  "Мобильные анимации без jank",
  "Модульная тема light/dark в Telegram App",
  "Стриминг контента внутри длинных статей",
  "Кастомный видеоплеер в постах",
  "Аудио-секции и voice snippets",
  "Галерея, оптимизированная под свайпы",
  "3D модели в статье через model-viewer",
  "Интерактивный TSX-контент внутри поста",
  "Кэширование API и offline UX",
  "Push-уведомления и реактивация сессий",
  "Сбор метрик продукта в Mini App",
  "Анти-фрод и ограничения платформы",
  "Дизайн-система для мобильного WebApp",
  "Миграция legacy mini app на Next.js",
  "Production checklist перед релизом",
];

const toSlug = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-zа-я0-9\s-]/gi, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
};

const buildTsxCode = (title: string): string => {
  return `function ${title.replace(/[^a-zA-Z]/g, "") || "Demo"}Widget() {\n  return <button onClick={() => Telegram.WebApp.HapticFeedback.selectionChanged()}>Action</button>;\n}`;
};

const buildPostContent = (index: number, title: string): PostContentBlock[] => {
  const blocks: PostContentBlock[] = [
    {
      type: "paragraph",
      text: `${title}: разбор практических решений для мобильного Telegram WebApp с упором на плавность интерфейса, стабильность и быстрый отклик.`,
    },
    {
      type: "quote",
      text: "Если сценарий не удобен в одной руке, это не mobile-first.",
      author: "C3K Mobile Lab",
    },
    {
      type: "heading",
      text: "Что важно на проде",
    },
    {
      type: "list",
      items: [
        "Оптимизировать каждый экран под gesture-first взаимодействие.",
        "Делать так, чтобы ключевые действия были доступны большим пальцем.",
        "Поддерживать устойчивость интерфейса при любых системных темах.",
      ],
    },
    {
      type: "image",
      image: covers[index % covers.length],
    },
  ];

  if (index % 5 === 0) {
    blocks.push({
      type: "video",
      video: {
        src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        poster: "/posts/cover-pattern.svg",
        caption: "Видео с double-tap seek, как в YouTube.",
      },
    });
  }

  if (index % 5 === 1) {
    blocks.push({
      type: "gallery",
      title: "Галерея экранов (swipe friendly)",
      images: galleryImages,
    });
  }

  if (index % 5 === 2) {
    blocks.push({
      type: "audio",
      audio: {
        src: "https://interactive-examples.mdn.mozilla.net/media/cc0-audio/t-rex-roar.mp3",
        title: "Аудио-комментарий архитектора",
        caption: "Кастомный мобильный плеер с прогрессом.",
      },
    });
    blocks.push({
      type: "animation",
      title: "Демо анимации чтения",
      caption: "Анимационный блок для сторителлинга внутри статьи.",
      demoId: "reading-progress",
    });
  }

  if (index % 5 === 3) {
    blocks.push({
      type: "model3d",
      model: {
        src: "https://modelviewer.dev/shared-assets/models/Astronaut.glb",
        iosSrc: "https://modelviewer.dev/shared-assets/models/Astronaut.usdz",
        poster: "/posts/studio-grid.svg",
        alt: "3D модель для демонстрации продукта",
        caption: "Поворачивайте модель жестом прямо в статье.",
      },
    });
    blocks.push({
      type: "tsx",
      title: "TSX demo: интерактивный блок",
      code: buildTsxCode(title),
      demoId: "webapp-ready",
    });
  }

  if (index % 5 === 4) {
    blocks.push({
      type: "video",
      video: {
        src: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
        poster: "/posts/workflow-board.svg",
        caption: "Шорт-демо UX сценария в реальном устройстве.",
      },
    });
    blocks.push({
      type: "gallery",
      title: "UI детали и анимации",
      images: galleryImages,
    });
    blocks.push({
      type: "tsx",
      title: "TSX demo: theme switcher chip",
      code: "const ThemeChip = ({active}: {active:boolean}) => <button className={active ? 'on' : 'off'}>Theme</button>;",
      demoId: "theme-chip",
    });
    blocks.push({
      type: "animation",
      title: "Параллакс-карточки",
      caption: "Композиционный эффект для hero-секций.",
      demoId: "parallax-cards",
    });
  }

  return blocks;
};

export const posts: BlogPost[] = topics.map((title, index) => {
  const day = 28 - index;
  const cardVariant = (["feature", "glass", "minimal"] as const)[index % 3];

  return {
    slug: toSlug(`${title}-${index + 1}`),
    title,
    excerpt: `Практический гайд №${index + 1}: мобильные паттерны, жесты, мультимедиа и производительность для Telegram WebApp.`,
    tags: ["telegram", "webapp", "mobile", `guide-${index + 1}`],
    cardVariant,
    publishedAt: `2026-02-${day.toString().padStart(2, "0")}`,
    readTime: `${4 + (index % 5)} мин`,
    cover: covers[index % covers.length],
    content: buildPostContent(index, title),
  };
});

export const getPostBySlug = (slug: string): BlogPost | undefined => {
  return posts.find((post) => post.slug === slug);
};
