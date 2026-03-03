# Production Refactor Roadmap (10k MAU)

## Status

- [x] Этап 1 (P0): Payment hardening (первая итерация внедрена)
- [x] Этап 2: Data layer refactor (Postgres backend + transactional RPC)
- [~] Этап 3: API contract & scalability (pagination/rate-limit/idempotency в ключевых API)
- [x] Этап 4: Telegram production features (queue worker + retries/backoff + dedupe)
- [ ] Этап 5: Social для блога
- [~] Этап 6: UX/A11y/Apple quality (снят global zoom/select lock + базовый focus-visible)
- [ ] Этап 7: Quality gates

## Этап 1 (выполнено в текущей итерации)

- Заказ создается на сервере только в статусе `created`.
- Инициализация оплаты переводит заказ в `pending_payment` на сервере.
- Статус `paid` ставится только из `POST /api/telegram/webhook`.
- Webhook работает со strict secret (`TELEGRAM_WEBHOOK_SECRET` обязателен).
- Сохраняются платежные метаданные:
  - `telegram_payment_charge_id`
  - `provider_payment_charge_id`
  - `currency`
  - `amount`
  - `invoice payload hash`
- Добавлен endpoint `POST /api/shop/orders/[id]/payment-failed` для ветки `failed`.
- Убрано локальное создание `paid` заказа на клиенте как fallback.

## Этап 2: Data layer refactor (Postgres)

### Progress

- Добавлен стартовый SQL baseline: `db/schema.sql`.
- Добавлены транзакционные Postgres RPC функции:
  - `c3k_upsert_order_snapshot`
  - `c3k_get_order_snapshot`
  - `c3k_list_order_snapshots`
  - `c3k_get_app_state`
  - `c3k_put_app_state`
- `shop-orders-store` переведен на Postgres backend c optimistic locking и retry на version conflict.
- `shop-admin-config-store` переведен на Postgres state store c optimistic locking.
- Для окружений без `SUPABASE_*` сохранен fallback (Upstash/memory).

### Deliverables

- Внедрить Postgres (Neon/Supabase) + migration tool.
- Схема таблиц:
  - `users`
  - `products`
  - `categories`
  - `subcategories`
  - `orders`
  - `order_items`
  - `order_status_history`
  - `payments`
  - `promo_usage`
  - `admin_members`
  - `blog_posts`
  - `post_comments`
  - `post_reactions`
- Перевести blob-операции `read-modify-write` на транзакции.
- Добавить optimistic locking (версионирование) для конкурентных апдейтов.

### Acceptance

- Атомарные транзакции на заказ+оплата+история.
- Нет потери данных при конкурентных апдейтах одного заказа.

## Этап 3: API contract & scalability

### Progress

- Для `GET /api/shop/admin/orders` добавлены:
  - cursor pagination (`cursor`, `limit`)
  - server-side сортировка (`sort`)
  - фильтры (`status`, `query`)
- Добавлен rate-limit на чувствительные endpoints:
  - `GET/POST /api/shop/orders`
  - `GET /api/shop/admin/orders`
  - `POST /api/telegram/stars-invoice`
  - `POST /api/shop/orders/[id]/payment-failed`
- Добавлена поддержка `Idempotency-Key` для:
  - `POST /api/shop/orders`
  - `POST /api/telegram/stars-invoice`
  - `POST /api/shop/orders/[id]/payment-failed`

### Deliverables

- Ввести cursor pagination для админских списков заказов/клиентов/постов.
- Серверные фильтры и сортировки (status/date/customer/query).
- Добавить rate limit на чувствительные endpoints.
- Ввести `Idempotency-Key` для мутаций оплаты/заказов.

### Acceptance

- Админка не деградирует на 100k+ заказов.

## Этап 4: Telegram production features

### Deliverables

- Вынести уведомления в очередь + worker.
- Настроить retries/backoff и дедупликацию отправок.
- Унифицировать web_app deep links (`/orders/:id`, `/shop`).

### Progress

- Добавлена очередь уведомлений Telegram с persisted store и retry/backoff:
  - `enqueueTelegramMessageNotification`
  - `enqueueTelegramDocumentNotification`
  - `processTelegramNotificationQueue`
- Добавлен worker API:
  - `GET /api/telegram/notifications/worker` (queue size)
  - `POST /api/telegram/notifications/worker` (process batch)
- Нотификации заказов (`new order`, `status change`, payment receipt) переключены на enqueue с dedupe key.

### Required Env

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TELEGRAM_WORKER_SECRET`
- `POSTGRES_STRICT_MODE=1` (рекомендуется на production)

### Acceptance

- Доставка уведомлений >99%, повторные попытки не создают дублей.

## Этап 5: Social для блога

### Deliverables

- CRUD комментариев (`create/read/delete`) с авторизацией.
- Реакции 1 раз на пользователя на пост.
- Anti-spam: rate-limit + минимальная модерация.

### Acceptance

- Удаление комментария: только автор или админ.
- Реакция учитывается однократно на пользователя.

## Этап 6: UX/A11y/Apple quality

### Progress

- Убран запрет масштабирования viewport (`userScalable: false`, `maximumScale: 1`).
- Убран global `user-select: none`.
- Добавлены базовые `:focus-visible` стили.

### Deliverables

- Убрать глобальный `user-select: none` и запрет zoom (`user-scalable=false`, `maximumScale=1`).
- Добавить accessibility tokens (focus ring, контраст, размер интерактивных зон).
- Проверить клавиатурную навигацию и видимые focus-состояния.

### Acceptance

- Проходит базовый WCAG AA чек (цвет, фокус, масштабирование, семантика).

## Этап 7: Quality gates

### Deliverables

- CI pipeline: `lint`, `typecheck`, `unit`, `integration`, `e2e payment`.
- Release checklist + rollback runbook.
- Блок merge в `main` без зеленого pipeline.

### Acceptance

- Merge в `main` разрешен только при полностью green CI.
