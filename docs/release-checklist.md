# Чеклист Релиза

## 1. Окружение

- В Vercel (Production) заданы:
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
- Для стабильности очередей/лимитов рекомендованы:
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`

## 2. База данных

- `db/schema.sql` применен в production-проекте Supabase.
- RPC-функции существуют:
  - `c3k_get_app_state`
  - `c3k_put_app_state`
  - `c3k_upsert_order_snapshot`
  - `c3k_get_order_snapshot`
  - `c3k_list_order_snapshots`
- Таблицы заполнены актуальными данными:
  - `products`
  - `blog_posts`
  - `post_comments`
  - `post_reactions`

## 3. Telegram

- Webhook установлен на `https://<prod-domain>/api/telegram/webhook`.
- Secret в Telegram совпадает с `TELEGRAM_WEBHOOK_SECRET`.
- `POST /api/telegram/setup-webhook?key=<TELEGRAM_ADMIN_KEY>` возвращает `ok: true`.

## 4. Quality Gates

- На целевом коммите CI полностью green:
  - `lint`
  - `typecheck`
  - `test:unit`
  - `test:integration`
  - `test:e2e:payment`
  - `build`

## 5. Smoke-тест

- Каталог отдается из БД (`/api/shop/catalog`).
- Stars invoice открывается, `pre_checkout_query` проходит.
- Успешная оплата переводит заказ в `paid` только через webhook.
- На странице поста работают реакции и комментарии.
- Удаление комментария доступно только автору/админу.

## 6. Проверка после деплоя

- Мониторинг логов Vercel минимум 15 минут.
- Проверка worker и размера очереди:
  - `GET /api/telegram/notifications/worker?mode=status`
- Нет всплеска `401` на `/api/telegram/webhook`.
