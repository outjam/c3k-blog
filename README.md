# C3K Blog Mini App

Персональный блог на Next.js 16 в формате Telegram Mini App.

## Что внутри

- Next.js 16 + React 19 + TypeScript
- Telegram Mini App: блог + магазин + админка
- Платежи Telegram Stars (server-side state machine + webhook verification)
- Postgres (Supabase) как основной production storage
- Social для блога: комментарии и реакции (DB-backed)
- CI quality gates: lint, typecheck, unit, integration, e2e payment, build

## Локальный запуск

Требуется Node.js 20+.

```bash
npm install
npm run dev
```

Открыть: [http://localhost:3000](http://localhost:3000)

## Переменные окружения

Скопируй `.env.example` в `.env.local` и задай значения.

Минимально для production:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_STRICT_MODE=1`
- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_WEBHOOK_BASE_URL`
- `TELEGRAM_ADMIN_KEY`
- `TELEGRAM_WORKER_SECRET`
- `CRON_SECRET`
- `SHOP_ADMIN_TELEGRAM_IDS`

Опционально (но рекомендуется для стабильности очередей/rate-limit/idempotency):

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

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
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:e2e:payment
npm run build
```

## Production документация

- [Production Refactor Roadmap](docs/production-refactor-roadmap.md)
- [Roadmap Улучшений 2026](docs/production-improvement-roadmap-2026.md)
- [Release Checklist](docs/release-checklist.md)
- [Rollback Runbook](docs/rollback-runbook.md)
