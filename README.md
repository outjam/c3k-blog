# C3K Blog Mini App

Персональный блог на Next.js 16 в формате Telegram Mini App.

## Что внутри

- Next.js 16 + React 19 + TypeScript
- App Router + SSG для постов
- SCSS modules + кастомный UI
- Поддержка Telegram WebApp API:
  - MainButton
  - BackButton
  - HapticFeedback
  - нативные цвета темы Telegram (`themeParams`, включая реакцию на `themeChanged`)
- Богатый контент постов:
  - параграфы
  - цитаты
  - фото
  - галерея-слайдер
  - списки

## Локальный запуск

Требуется Node.js 20+.

```bash
npm install
npm run dev
```

Открыть: [http://localhost:3000](http://localhost:3000)

## Переменные окружения

Скопируй `.env.example` в `.env.local` и укажи значения:

- `NEXT_PUBLIC_APP_URL` — публичный URL приложения (Vercel URL)
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` — username бота (без `@`)

## Деплой на Vercel

1. Запушь проект в GitHub/GitLab/Bitbucket.
2. В Vercel выбери `Add New -> Project` и импортируй репозиторий.
3. Framework: `Next.js` (определяется автоматически).
4. Добавь Environment Variables из `.env.example`.
5. Нажми `Deploy`.

После деплоя получишь URL вида `https://your-project.vercel.app`.

## Привязка к Telegram

1. В [@BotFather](https://t.me/BotFather) выбери своего бота.
2. Настрой Mini App URL на адрес из Vercel.
3. Убедись, что бот открывает именно HTTPS URL.
4. Протестируй в Telegram-клиенте:
   - главная страница показывает MainButton
   - страница поста показывает BackButton
   - тактильный отклик работает на нажатиях и слайдере
   - тема Telegram (light/dark) применяется к цветам интерфейса

## Проверка качества

```bash
npm run lint
npm run build
```
