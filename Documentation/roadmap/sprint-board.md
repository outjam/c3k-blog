# Sprint Board

## Зачем нужен этот файл

Это операционный roadmap проекта.

Он нужен, чтобы `project owner` и разработчики в любой момент видели:

- какой спринт идёт сейчас
- что именно должно быть доставлено в спринте
- что уже закрыто
- что идёт следующим
- как спринты связаны с большими фазами продукта

## Как этот файл сочетается с остальной документацией

- [`production-roadmap.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/production-roadmap.md)
  - стратегические фазы и путь к production
- [`project-status-checklist.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/project-status-checklist.md)
  - статус по пользовательским и бизнес-сценариям
- [`History/completed-backlog.md`](/Users/culture3k/Documents/GitHub/c3k-blog/History/completed-backlog.md)
  - подробный журнал уже завершённых задач

Коротко:

- `Production roadmap` отвечает на вопрос `куда идём`
- `Project status checklist` отвечает на вопрос `что уже умеет продукт`
- `Sprint board` отвечает на вопрос `что делаем прямо сейчас и следующим шагом`

## Статусы

- `[x]` закрыто и уже доставлено
- `[ ]` ещё не доставлено
- `Status: current` означает активный спринт
- `Status: queued` означает следующий или запланированный спринт

## Текущий фокус

- Текущая большая фаза: `Phase 5 groundwork`
- Текущий спринт: `Sprint 08 — Backend normalization and ledger hardening`
- Следующий спринт: `Sprint 09 — Production hardening`

## Спринты

### Sprint 00 — Product and Process Foundation

Status: done

Цель:
- собрать базовый слой документации, истории и контроля статуса проекта

Что доставлено:
- [x] Базовая структура `Documentation/`
- [x] Бизнес-документация по user/artist/payment/NFT/storage flows
- [x] Техническая документация по backend и API
- [x] `History/` как журнал проекта
- [x] `project-status-checklist.md` как карта пользовательских сценариев

### Sprint 01 — Core Product UX Baseline

Status: done

Цель:
- привести основные consumer-экраны к новому минималистичному UI

Что доставлено:
- [x] Редизайн основного профиля
- [x] Редизайн публичного профиля
- [x] Редизайн ленты и карточек контента
- [x] Редизайн каталога релизов
- [x] Базовый редизайн экрана релиза
- [x] Skeleton/loading states на основных пользовательских экранах

### Sprint 02 — Artist Model and Studio Foundation

Status: done

Цель:
- развести listener и artist model и заложить artist-side workflow

Что доставлено:
- [x] `artist application` вместо прямого превращения пользователя в артиста
- [x] Admin moderation flow для artist applications
- [x] Базовый artist profile
- [x] `Студия` как dashboard-слой
- [x] Отдельная artist-admin зона
- [x] Базовый payout request flow с hold и review

### Sprint 03 — TON and NFT Testnet Groundwork

Status: done

Цель:
- собрать рабочий testnet blockchain contour без mainnet-зависимости

Что доставлено:
- [x] Ton Connect и wallet state в приложении
- [x] Sponsored mint для полного релиза
- [x] Runtime config для NFT collection
- [x] Mintability flag на релизе
- [x] Testnet-first NFT flow в UI

### Sprint 04 — Storage Foundation and Delivery Groundwork

Status: done

Цель:
- поднять storage-domain и первый контур выдачи файлов

Что доставлено:
- [x] Storage registry и storage program membership flow
- [x] Admin storage dashboard
- [x] Delivery requests для полного релиза и отдельного трека
- [x] Web download и Telegram delivery request contour
- [x] User-facing history delivery requests
- [x] Базовый storage delivery orchestrator

### Sprint 05 — Storage Ingest Test Mode

Status: done

Цель:
- убрать ручную зависимость на storage mapping и подготовить test-only ingest без реальных TON Storage затрат

Связь с пользовательской ценностью:
- оператор видит, какие assets готовы к storage-подготовке
- storage registry начинает жить как процесс, а не как ручная таблица
- delivery layer получает следующую ступень к реальному storage runtime

Что уже закрыто в этом спринте:
- [x] Auto-sync storage assets из artist releases
- [x] Backfill sync релизов из admin storage dashboard

Что должно быть доставлено в этом спринте:
- [x] Отдельный ingest state и ingest jobs
- [x] Admin action для test-mode подготовки bags
- [x] Видимость ingest jobs в storage dashboard
- [x] Deterministic test-only bag preparation из существующих assets
- [x] Обновление документации и статусов под ingest slice
- [x] Проверка `typecheck` и `eslint` после ingest slice

Критерий выхода из спринта:
- администратор может из UI запустить test-mode ingest
- ingest оставляет историю job-ов
- для assets появляются prepared bags без реального TON Storage провайдера

### Sprint 06 — Telegram Delivery Worker and Library Visibility

Status: done

Цель:
- довести выдачу файлов до отдельного устойчивого delivery flow и показать её в интерфейсе пользователя

Что должно быть доставлено:
- [x] Отдельный Telegram delivery worker
- [x] Retry/reopen flow для failed delivery requests
- [x] Явный статус выдачи на экране релиза
- [x] История скачиваний и delivery requests в профиле
- [x] Library/download center без привязки только к экрану релиза

Критерий выхода:
- запросы на выдачу файлов не зависят только от route execution
- пользователь видит свои выдачи и их статусы в одном месте

### Sprint 07 — Desktop Client Skeleton and c3k.ton Gateway

Status: done

Цель:
- собрать первый рабочий desktop contour для `C3K Storage Node` и локального клиента открытия `c3k.ton`

Что должно быть доставлено:
- [x] Первый `Electron` shell
- [x] Local gateway для `c3k.ton`
- [x] Storage node onboarding screen
- [x] Desktop handling для `storagePointer`
- [x] Первый desktop settings/runtime contract

### Sprint 08 — Backend Normalization and Ledger Hardening

Status: current

Цель:
- вынести критичную доменную модель из `app_state`

Что должно быть доставлено:
- [x] Первый нормализованный finance slice для `artist_earnings_ledger` и `artist_payout_requests`
- [ ] Нормализованные таблицы для artist/release/entitlement/payment flows
- [ ] Ledger-first finance model
- [ ] Mint history и payout audit log
- [ ] Слой миграции с JSON state в таблицы

### Sprint 09 — Production Hardening

Status: queued

Цель:
- подготовить систему к реальному production rollout

Что должно быть доставлено:
- [ ] Incident/admin обзор по mint, delivery и payout проблемам
- [ ] Наблюдаемость, аудит и retry-safe jobs
- [ ] Чистое разделение `testnet / mainnet`
- [ ] Подготовка mainnet-ready TON contour
- [ ] Production deployment checklist

## Как обновлять sprint board

При каждом заметном рабочем сдвиге нужно:

1. Обновить статус текущего спринта
2. Отметить чекбоксы уже доставленных задач
3. Если спринт завершён, перевести следующий в `Status: current`
4. Зафиксировать детали в [`History/completed-backlog.md`](/Users/culture3k/Documents/GitHub/c3k-blog/History/completed-backlog.md)
5. При необходимости дополнить [`project-status-checklist.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/project-status-checklist.md), если изменилась пользовательская ценность
