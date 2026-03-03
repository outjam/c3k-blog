# Production Refactor Roadmap (10k MAU)

## Текущий статус (проверка на 03.03.2026)

- [x] Этап 1 (P0): Payment hardening
- [x] Этап 2: Data layer refactor
- [~] Этап 3: API contract & scalability
- [~] Этап 4: Telegram production features
- [x] Этап 5: Social для блога
- [~] Этап 6: UX/A11y/Apple quality
- [~] Этап 7: Quality gates

## Фактическая верификация

Проверки, выполненные по коду и локально:

- `npm run typecheck` -> `OK`
- `npm run test:unit` -> `OK`
- `npm run test:integration` -> `OK`
- `npm run test:e2e:payment` -> `OK`
- `npm run build` -> `OK`
- `npm run lint` -> `FAIL` (есть открытые ошибки React Hooks/immutability)

Это означает, что quality gates уже внедрены инфраструктурно, но acceptance Этапа 7 еще не закрыт до конца из-за красного lint.

## Этап 1 (P0): Payment hardening

### Выполнено

- Создание заказа только сервером в статусе `created`.
- Переход к оплате только через `pending_payment`.
- Статус `paid` ставится только в `POST /api/telegram/webhook`.
- Валидация webhook-secret (`TELEGRAM_WEBHOOK_SECRET`) обязательна.
- Платежные поля сохраняются:
  - `telegram_payment_charge_id`
  - `provider_payment_charge_id`
  - `currency`
  - `amount`
  - `invoice_payload_hash`
- Реализована ветка `failed` через `POST /api/shop/orders/[id]/payment-failed`.

### Acceptance

- Нельзя создать `paid` заказ без валидного платежа из webhook.

## Этап 2: Data layer refactor

### Выполнено

- Базовая production-схема добавлена в `db/schema.sql`:
  - `users`, `products`, `categories`, `subcategories`
  - `orders`, `order_items`, `order_status_history`, `payments`, `promo_usage`
  - `admin_members`
  - `blog_posts`, `post_comments`, `post_reactions`
- Добавлены RPC-функции:
  - `c3k_upsert_order_snapshot`
  - `c3k_get_order_snapshot`
  - `c3k_list_order_snapshots`
  - `c3k_get_app_state`
  - `c3k_put_app_state`
- `shop-orders-store`, `shop-admin-config-store`, `shop-catalog` работают в DB-only режиме (без fallback на Redis/memory для бизнес-данных).
- Конкурентные мутации заказов и admin state идут через optimistic locking + retry.

### Acceptance

- Атомарность и отсутствие потерь данных при конкурентных апдейтах по ключевым сущностям подтверждены архитектурно.

## Этап 3: API contract & scalability

### Выполнено частично

- Для `GET /api/shop/admin/orders` есть cursor pagination, сортировка и фильтры.
- Есть rate limit для чувствительных endpoint-ов.
- Есть idempotency для операций создания заказа/инвойса/ошибки оплаты.

### Не закрыто

- `customers` и часть admin-list endpoint-ов пока агрегируют данные в памяти после полной выборки.
- Нет полного набора cursor pagination для всех тяжелых admin endpoint-ов.
- На 100k+ заказов риск деградации пока сохраняется.

## Этап 4: Telegram production features

### Выполнено частично

- Реализована очередь уведомлений с retries/backoff/dedupe.
- Есть worker endpoint для batch processing.
- Добавлены `web_app` deep-links в заказ/магазин.

### Не закрыто

- SLA `>99%` доставки пока не подтвержден метриками.
- На Vercel Hobby нет частых cron-расписаний, поэтому надежность повторных отправок без внешнего триггера ограничена.

## Этап 5: Social для блога

### Выполнено

- Реализованы endpoints:
  - `GET /api/blog/posts/[slug]/social`
  - `POST /api/blog/posts/[slug]/comments`
  - `DELETE /api/blog/posts/[slug]/comments/[commentId]`
  - `PUT/DELETE /api/blog/posts/[slug]/reaction`
- Удаление комментария ограничено автором или админом.
- Реакция ограничена 1 раз на пользователя (`upsert` по `(post_id, user_id)`).
- Добавлены анти-спам ограничения и rate-limit.
- UI поста подключен к реальным social-данным из БД.

### Acceptance

- Критерии этапа закрыты.

## Этап 6: UX/A11y/Apple quality

### Выполнено частично

- Убраны глобальные ограничения zoom/select.
- Добавлены базовые focus-visible состояния.

### Не закрыто

- Нет формального WCAG AA audit-отчета.
- Нужен системный проход по контрасту, фокус-навигации и интерактивным зонам.

## Этап 7: Quality gates

### Выполнено частично

- Добавлен CI pipeline (`lint`, `typecheck`, `unit`, `integration`, `e2e payment`, `build`).
- Добавлены `docs/release-checklist.md` и `docs/rollback-runbook.md`.
- Тестовые скрипты и базовые наборы тестов подключены.

### Не закрыто

- `lint` пока не проходит полностью, значит merge-gate до green pipeline формально не выполнен.

## До релизного состояния: блокеры

- Закрыть ошибки lint (в первую очередь `react-hooks/*` errors и `immutability` errors).
- Довести Stage 3 до server-side масштабируемых выборок без in-memory full-scan.
- Подтвердить Stage 4 по метрикам доставки и стабильному фоновой обработке очереди.
- Провести формальный WCAG AA smoke-аудит и зафиксировать результаты.
