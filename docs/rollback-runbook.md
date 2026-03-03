# Runbook Отката

## Когда запускать откат

Откат обязателен, если после релиза наблюдается одно из событий:

- Оплаты зависают в `pending_payment` (спиннер Stars без перехода в `paid`).
- Критичный рост 5xx на API.
- Недоступность каталога/блога/social из-за ошибок БД.
- Всплеск `401` на Telegram webhook.

## Немедленные действия (0-5 минут)

1. Остановить новые деплои в production.
2. Найти последний стабильный deployment в Vercel.
3. Выполнить rollback на него через Vercel UI.

## Проверка целостности данных (5-10 минут)

1. Убедиться, что snapshot заказов читается.
2. Проверить корректность последних записей платежей.
3. Проверить чтение `blog_posts`, `post_comments`, `post_reactions`.

## Восстановление Telegram (10-15 минут)

1. Переустановить webhook для откатанной версии:

```bash
curl -X POST "https://<prod-domain>/api/telegram/setup-webhook?key=<TELEGRAM_ADMIN_KEY>"
```

2. Проверить текущую конфигурацию webhook:

```bash
curl "https://<prod-domain>/api/telegram/setup-webhook?key=<TELEGRAM_ADMIN_KEY>"
```

3. Убедиться, что URL и secret корректны.

## Восстановление очереди уведомлений

- Проверить размер очереди:
  - `GET /api/telegram/notifications/worker?mode=status`
- При большом backlog запустить ручную обработку батчами:

```bash
curl -X POST "https://<prod-domain>/api/telegram/notifications/worker" \
  -H "x-worker-key: <TELEGRAM_WORKER_SECRET>"
```

## Закрытие инцидента

1. Зафиксировать root cause.
2. Добавить regression-тест под инцидент.
3. Обновить release checklist с учетом новых проверок.
