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
- Текущий спринт: `Sprint 10 — Real TON Storage test runtime`
- Следующий спринт: `Sprint 11 — Desktop node runtime and storage program prep`

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

Status: done

Цель:
- вынести критичную доменную модель из `app_state`

Что должно быть доставлено:
- [x] Первый нормализованный finance slice для `artist_earnings_ledger` и `artist_payout_requests`
- [x] Нормализованные таблицы и merge-store для user entitlements и NFT mint history
- [x] Первый backfill/migration path для ownership и mint history из legacy social state
- [x] Payout audit log в Postgres и merged finance snapshot
- [x] Нормализованные таблицы и merge-store для `artist_profiles`, `artist_tracks` и `artist_applications`
- [x] Нормализованные таблицы и merge-store для `artist_donations` и `artist_subscriptions`
- [x] Ledger-first finance read model для artist self-service routes и studio/profile summary
- [x] Write-side finance overlay для order webhook и payout moderation без инкрементальной правды в profile counters
- [x] Payment webhook и storage sync routes теперь умеют гидрировать artist catalog из merge-store, если legacy `artistTracks` ещё не догнался
- [x] Payment webhook теперь гидрирует ещё и normalized finance/support snapshot перед payout/support mutation path
- [x] Artist self-service и admin moderation routes теперь гидрируют `artist_profiles`, `artist_tracks` и `artist_applications` в config перед mutation path
- [x] Mutable hydration helpers теперь предпочитают более свежий normalized snapshot для artist/application/payout/subscription state
- [x] Merge-store readers теперь тоже предпочитают более свежий snapshot для mutable artist/application/payout/subscription state
- [x] Admin migration status по доменам: source, legacy/postgres counts, coverage и cutover readiness
- [x] Отдельный admin UX/design slice: человеческие пояснения по вкладкам, backfill-кнопкам, artist moderation и storage dashboard
- [x] Полный ledger-first finance model
- [x] Backfill/migration jobs для ownership, artist applications, artist catalog, finance и artist support domains
- [x] Слой миграции с JSON state в таблицы для оставшихся доменов

Критерий выхода:
- критичные artist/payment/support/ownership домены уже имеют normalized tables, merge-store, backfill и admin visibility
- mutable read/write paths больше не побеждают только по legacy JSON, а работают по свежести snapshot
- оператор может одним действием прогнать unified backfill suite и увидеть общий cutover state по доменам

### Sprint 09 — Production Hardening

Status: done

Цель:
- подготовить систему к реальному production rollout

Что уже доставлено в этом спринте:
- [x] Дополнительный UX/design pass для admin cutover, studio finance и downloads library
- [x] Incident/admin обзор по оплатам, payout, delivery, ingest и NFT runtime
- [x] Retry-safe claim/lease слой для Telegram storage delivery worker
- [x] Operator visibility по TON environment: active network, runtime/env collection source и предупреждения о testnet/mainnet drift
- [x] Deployment readiness snapshot по базовым env/infra контурам в админке
- [x] Manual recovery triggers для worker queues из админки через единый execution layer и общую run history
- [x] Provenance/audit для worker run-ов: видно, был ли запуск автоматическим или ручным и каким админом инициирован
- [x] Operator guide с next actions, runbooks и release mode (`test_only / mainnet_blocked / mainnet_ready`)
- [x] TON collection deploy guard через `confirmNetwork`, чтобы deploy не уходил в неверный contour

Что должно быть доставлено:
- [x] Наблюдаемость, аудит и retry-safe jobs
- [x] Чистое разделение `testnet / mainnet`
- [x] Подготовка mainnet-ready TON contour
- [x] Production deployment checklist

### Sprint 10 — Real TON Storage Test Runtime

Status: current

Цель:
- перейти от test placeholders к реальному `TON Storage` на тестовом контуре

Что должно быть доставлено:
- [x] Target UI для user-facing `C3K Storage Node`: статус ноды, swarm/bags, будущие rewards и desktop readiness
- [x] Runtime abstraction для `test_prepare` и `tonstorage_testnet`
- [x] `runtimeStatus` в user storage snapshot и admin storage dashboard
- [x] Admin ingest mode selector для `test_prepare / tonstorage_testnet`
- [x] Runtime-aware ingest jobs и bags с `runtimeMode/runtimeLabel`
- [x] Honest messaging про `real pointers` и `external upload worker`
- [x] Первый Telegram retrieval contour через `storagePointer` и runtime bag mapping
- [x] Первый web retrieval contour через auth-proxy и storage runtime mapping
- [x] Operator runtime diagnostics: resolvable assets/bags, pointer readiness и unresolved runtime issues
- [x] External upload worker handoff: claim/complete queue для `tonstorage_testnet`
- [x] Simulated upload pass для бесплатного end-to-end теста storage contour
- [x] Protected source endpoint для внешнего upload worker
- [x] Local external worker scaffold для `claim -> source -> complete`
- [x] TON Storage bridge status: upload mode, CLI readiness и gateway retrieval readiness
- [x] Runtime probe для конкретного asset/bag прямо из storage admin
- [ ] Реальный upload выбранных assets в `TON Storage` test environment
- [ ] Реальные bag/storage pointer для delivery layer

### Sprint 11 — Desktop Node Runtime and Storage Program Prep

Status: queued

Цель:
- превратить desktop scaffold в реальный companion-клиент для `C3K Storage Node` и подготовки community storage program

Что должно быть доставлено:
- [ ] Реальный desktop retrieval path для storage pointers
- [ ] Локальный статус node/gateway/runtime
- [ ] Базовая модель выделенного места, health и participation state
- [ ] Подготовка UI и backend к reward-layer для storage participants
- [ ] Telegram/file delivery из реального storage runtime
- [ ] Desktop retrieval по `storagePointer`

## Как обновлять sprint board

При каждом заметном рабочем сдвиге нужно:

1. Обновить статус текущего спринта
2. Отметить чекбоксы уже доставленных задач
3. Если спринт завершён, перевести следующий в `Status: current`
4. Зафиксировать детали в [`History/completed-backlog.md`](/Users/culture3k/Documents/GitHub/c3k-blog/History/completed-backlog.md)
5. При необходимости дополнить [`project-status-checklist.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/project-status-checklist.md), если изменилась пользовательская ценность
