# C3K Mini App: Профессиональный Roadmap Улучшений (2026)

## 1. Executive Summary

Продукт находится в хорошем техническом состоянии по базовым production-функциям: платежный state machine, Postgres-слой, social-модуль, CI-скелет и build/test стабильны.

Основные блокеры до релизной зрелости:

- не закрыт lint gate (pipeline не fully green),
- есть узкие места масштабирования (in-memory full-scan в части admin API),
- надежность Telegram worker ограничена на Vercel Hobby без частого cron,
- отсутствует формальный WCAG AA audit.

## 2. Диагностика текущего состояния

### Payments & Orders

- Сильные стороны:
  - серверный lifecycle заказа,
  - `paid` только из webhook,
  - idempotency и rate-limit на критичных маршрутах.
- Риски:
  - требуется расширенный мониторинг «invoice created -> webhook paid latency».

### Data Layer

- Сильные стороны:
  - базовая нормализованная схема в Postgres,
  - optimistic locking / retry для ключевых мутаций.
- Риски:
  - часть бизнес-логики админки хранится в `app_state` blob, что усложняет аналитические и масштабные сценарии.

### API Scalability

- Сильные стороны:
  - cursor pagination/filters/sort внедрены для admin orders.
- Риски:
  - некоторые admin endpoints работают через полную выборку + агрегацию в памяти.

### Telegram Delivery

- Сильные стороны:
  - queue + retries/backoff + dedupe реализованы.
- Риски:
  - отсутствие постоянного фонового процессинга на Hobby-плане ограничивает SLO доставки.

### UX/A11y

- Сильные стороны:
  - сняты критичные anti-a11y ограничения (zoom/select lock).
- Риски:
  - нет формальной валидации WCAG AA (контраст, клавиатурная навигация, focus order).

### Quality Gates

- Сильные стороны:
  - `typecheck`, `unit`, `integration`, `e2e payment`, `build` проходят.
- Риски:
  - `lint` не green, merge-gate не считается закрытым.

## 3. Приоритетные риски (P0/P1)

## P0

- Негриновый lint в CI.
- Потенциальная деградация на больших объемах данных в части admin API.

## P1

- Недостаточный operational-контур по Telegram queue (SLO/алерты/дренаж очереди).
- Отсутствие формального accessibility-signoff.

## 4. Новый roadmap улучшений

## Фаза A: Release Stabilization (1 неделя)

Цель: получить строго green pipeline и зафиксировать релизный baseline.

### Work items

- Закрыть все lint errors без отключения правил.
- Добавить pre-deploy env validation (health-check endpoint для обязательных secret/URL).
- Добавить smoke-job после деплоя:
  - webhook auth check,
  - queue status check,
  - `shop/catalog`, `shop/orders`, `blog/social` sanity.

### Acceptance

- CI 100% green на main.
- Релизный чеклист выполняется без ручных обходов.

## Фаза B: Scalability Hardening (2 недели)

Цель: подготовить API к реальным нагрузкам 100k+ записей.

### Work items

- Перевести тяжелые admin выборки на server-side pagination/query в БД.
- Вынести customer aggregates в SQL-агрегации (вместо in-memory map по всем заказам).
- Добавить индексы под реальные фильтры и сортировки (по итогам EXPLAIN ANALYZE).
- Добавить load-test профиль:
  - admin orders list,
  - customers list,
  - order status mutate.

### Acceptance

- P95 по admin list endpoint < 300ms на тестовом датасете 100k заказов.
- Нет OOM/latency spikes в serverless логах.

## Фаза C: Telegram Reliability & Ops (1-2 недели)

Цель: достигнуть измеримого уровня надежности уведомлений.

### Work items

- Перенести регулярный worker trigger на инфраструктуру с частым расписанием (Pro cron или внешний scheduler).
- Добавить метрики:
  - queue length,
  - retry depth,
  - delivery success ratio,
  - dead-letter count.
- Ввести алерты по порогам:
  - queue length > N,
  - retry attempts > threshold,
  - webhook 401/5xx spikes.

### Acceptance

- Подтвержденная доставка >99% за 7 дней наблюдения.
- Повторные отправки не дают дублей (проверка по dedupe key).

## Фаза D: UX/A11y Certification (1 неделя)

Цель: закрыть базовый WCAG AA для релиза.

### Work items

- Пройти чек по контрасту (ключевые страницы: лента, пост, shop, cart, profile, admin).
- Пройти keyboard-only сценарии.
- Зафиксировать accessibility tokens и чек-лист в docs.
- Добавить минимум 2 e2e smoke-сценария на focus/keyboard flow.

### Acceptance

- Базовый WCAG AA checklist формально закрыт.
- Критичных accessibility-замечаний не осталось.

## 5. KPI релизной зрелости

- CI success rate: >= 98% за 14 дней.
- Payment success-to-webhook latency P95: <= 10 секунд.
- Admin API P95 (top endpoints): <= 300ms на 100k orders dataset.
- Telegram delivery success: > 99%.
- Critical incidents после релиза: 0.

## 6. Definition of Done для production-ready

- Все 7 этапов roadmap имеют статус `[x]`.
- CI полностью green на main и защищен branch rules.
- Есть подтвержденные метрики стабильности и производительности.
- Есть актуальный rollback runbook и отработанная процедура аварийного отката.
