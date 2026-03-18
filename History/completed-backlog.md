# Completed Backlog

Этот файл хранит уже завершённые задачи проекта в более подробном виде, чем roadmap checklist.

## 2026-03-18

### Профиль и публичный профиль

- Завершён большой редизайн основного профиля:
  - минималистичный hero
  - переработанные метрики
  - единый блок коллекции
  - sticky tabs
  - свайп между вкладками
  - отдельные настройки
- Публичный профиль приведён к логике основного профиля.
- Добавлены награды как отдельная вкладка.
- Добавлена история копирования `@username`.
- Убрана лишняя карточность и тяжёлые визуальные контейнеры.

### Лента, релизы и экран релиза

- Переработан экран ленты под новый визуальный язык.
- Убраны лишние текстовые элементы, хэштеги и перегруженные действия в карточках релизов.
- Экран релиза переработан в более минималистичную структуру.
- Реализована новая логика покупки:
  - покупка релиза по формату
  - покупка отдельных треков
  - повторная покупка релиза в другом формате
- В ownership-модели учтены:
  - полный релиз
  - отдельные треки
  - NFT marker

### Артист и студия

- Реализован artist application flow вместо прямого превращения пользователя в артиста.
- Реализован moderation flow для заявок артиста.
- В студии появился dashboard-слой.
- Добавлен отдельный artist-admin contour.
- Заложен payout flow с hold period и admin approval.

### TON и NFT

- Реализован testnet-ready sponsored mint NFT для полного релиза.
- Добавлена runtime config логика для NFT collection.
- Подготовлен metadata contour для NFT release и collection.
- В release flow учтена mintability релиза.

### Storage foundation

- Создан отдельный storage domain.
- Поднят storage registry на `app_state`.
- Добавлены storage program API.
- Добавлен user-facing экран `C3K Storage Program`.
- Добавлен admin storage dashboard.
- Добавлены storage memberships, assets, bags и health view.
- Реализована автоматическая синхронизация базовых storage assets из artist releases.
- Добавлен admin backfill для повторной синхронизации релизов в storage registry.
- Добавлен test-mode ingest pipeline:
  - ingest jobs
  - admin action для подготовки bags
  - placeholder bag metadata без real TON Storage затрат

### Delivery layer

- Добавлен отдельный delivery state для файлов.
- Реализован delivery orchestrator:
  - entitlement check
  - release/track delivery request
  - Telegram delivery request
  - web download request
- На релизе появились entry points для:
  - скачивания полного релиза
  - отправки полного релиза в Telegram
  - скачивания купленного трека
  - отправки купленного трека в Telegram
- Добавлена user-facing history выдач в `C3K Storage Program`.
- Добавлен retry/reopen flow для failed и pending delivery requests.
- На экране релиза появилась видимость последних delivery requests по текущему релизу.
- Добавлен отдельный экран `Файлы` как post-purchase library/download center.
- В основном профиле появилась видимость file activity и переход в библиотеку загрузок.
- Telegram delivery переведён на отдельный worker route и queue-подобную обработку.

### Desktop foundation

- Добавлен общий worker auth helper для background/worker routes.
- Поднят desktop runtime contract и публичный `/api/desktop/runtime`.
- Добавлен отдельный экран `Desktop beta` внутри storage flow.
- В release/download/storage экранах появился первый desktop handoff по `storagePointer`.
- В репозитории появился отдельный `desktop/` scaffold:
  - Electron shell
  - preload bridge
  - local gateway stub для `c3k.ton`
  - desktop README и runtime scripts

### Finance normalization foundation

- В `db/schema.sql` добавлены первые нормализованные finance-таблицы:
  - `artist_earnings_ledger`
  - `artist_payout_requests`
- Позже finance contour расширен таблицей:
  - `artist_payout_audit_log`
- Добавлен server-side normalized finance store с Postgres read/write и legacy fallback.
- Earnings от paid-order теперь dual-write'ятся из Telegram payment webhook в новый ledger.
- Artist payout API и studio summary уже читают finance state через новый store, но не ломаются без полной миграции.
- Payout flow получил audit trail:
  - создание payout request
  - смена payout status
  - обновление admin note
- Audit trail выведен и в `Студию`, и в admin payout moderation.

### Artist catalog normalization foundation

- В `db/schema.sql` добавлены таблицы:
  - `artist_profiles`
  - `artist_tracks`
- Позже artist-domain расширен таблицей:
  - `artist_applications`
- Добавлен отдельный normalized artist merge-store.
- Публичный каталог, публичная страница артиста, artist self-service и admin artist routes начали читать artist snapshot через новый слой.
- Ключевые artist mutation flows теперь dual-write'ят profile/release state в Postgres:
  - application approval
  - artist profile update
  - release create/update
  - admin moderation
  - paid-order webhook
  - payout completion balance update
- Добавлены operational backfill helpers и admin triggers для:
  - `artist_profiles` / `artist_tracks`
  - `artist_earnings_ledger` / `artist_payout_requests` / `artist_payout_audit_log`
- В admin artist moderation появилась source visibility:
  - видно, читает ли artist-domain и finance-domain уже `postgres`, либо ещё работает `legacy fallback`
- Source visibility дополнительно выведена в `Студию` артиста.
- `artist applications` переведены на merge-store и dual-write.

### Entitlement and mint normalization foundation

- В `db/schema.sql` добавлены таблицы:
  - `user_release_entitlements`
  - `user_track_entitlements`
  - `user_release_nft_mints`
- Добавлен отдельный server-side store для:
  - release ownership
  - track ownership
  - minted NFT history
- `getSocialUserSnapshot(...)` и public purchase reads теперь собирают merged snapshot из:
  - legacy `social_user_state_v1`
  - Postgres normalized tables
- Purchase и mint mutations теперь dual-write'ят ownership/mint records в новый слой.
- Это закрыло следующий реальный slice `Sprint 08` после finance foundation и уменьшило зависимость consumer flows от `app_state`.

### Browser Telegram auth modernization

- Старый browser login обновлён с legacy `telegram-widget.js` на новый официальный Telegram Login SDK.
- Серверная валидация переведена на `id_token` и Telegram JWKS (`RS256`).
- Legacy verification старого widget payload оставлена как переходный fallback.
- `/api/auth/telegram/widget` теперь умеет:
  - отдавать browser login config
  - принимать новый Telegram Login payload

### Ownership and mint backfill path

- Добавлен controlled backfill из legacy `social_user_state_v1` в:
  - `user_release_entitlements`
  - `user_track_entitlements`
  - `user_release_nft_mints`
- Добавлен admin route для dry-run и реального запуска backfill.
- В dashboard admin-панели появился user-facing trigger backfill, чтобы migration можно было выполнять без ручного вызова API.

### Admin и документация

- Расширена документация по бизнес-логике, backend, навигации и roadmap.
- Добавлены ADR по:
  - desktop storage node
  - desktop gateway для `c3k.ton`
  - resource keys и delivery mapping
- Добавлен project status checklist.
- Отдельно выделен roadmap layer по уровням:
  - strategic roadmap
  - sprint board
  - product capability status

## Темы, которые уже начали, но ещё не считаются завершёнными

- Ingest pipeline для storage content
- Production-grade desktop client `Electron`
- Полная нормализация backend-модели без зависимости от `app_state`
