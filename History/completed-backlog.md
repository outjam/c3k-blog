# Completed Backlog

Этот файл хранит уже завершённые задачи проекта в более подробном виде, чем roadmap checklist.

## 2026-03-19

### Migration-safe payment и storage sync

- Telegram payment webhook перестал зависеть только от legacy `artistTracks`:
  - перед начислением artist earnings он умеет подгружать релизы и профили из normalized merge-store
  - это уменьшает риск, что при paid order артист не получит earnings из-за рассинхрона legacy JSON и Postgres
- Admin storage sync релизов тоже переведён на merge-store, а не только на legacy artist catalog

### Artist-domain hydration перед mutation

- Добавлены общие hydration helpers для:
  - `artist_profiles`
  - `artist_tracks`
  - `artist_applications`
- Self-service и admin artist routes теперь перед записью подтягивают normalized snapshot в config, если legacy JSON ещё не догнался.
- Это уменьшило риск того, что модерация, редактирование профиля или редактирование релиза упрутся в частичный migration drift.

### UX и дизайн админки

- Основная admin-панель переведена в более понятный операторский режим:
  - вкладки получили человеческие описания
  - появились пояснения по migration domains
  - backfill-кнопки сгруппированы по смыслу и снабжены реальными кейсами использования
- Экран модерации артистов получил:
  - объяснение логики заявок
  - объяснение логики модерации профилей и релизов
  - пояснения по payout moderation
- Storage dashboard получил:
  - внятную последовательность действий
  - более понятные названия блоков
  - описание, что делают sync, test bags, assets, bags, ingest jobs и deliveries

### Migration-safe finance/support hydration в payment webhook

- Telegram payment webhook теперь перед начислением artist earnings и support side-effects поднимает в config не только merged artist catalog, но и normalized finance/support snapshot.
- Это уменьшает риск, что `paid order` сработает поверх stale legacy JSON, если Postgres уже содержит более свежие earnings, donations, subscriptions или payout requests.
- Для этого в support-domain добавлен отдельный hydration helper, а сам webhook теперь делает payment mutation поверх уже объединённого состояния.

### Fresher normalized state wins during hydration

- Обновлены hydration helpers для mutable доменов:
  - `artist_profiles`
  - `artist_tracks`
  - `artist_applications`
  - `artist_payout_requests`
  - `artist_subscriptions`
- Теперь при гидрации выигрывает более свежая normalized запись по `updatedAt`, а не первое попавшееся legacy значение.
- Это делает cutover к Postgres более честным: route действительно начинает жить от нормализованного state, а не только “видит его рядом”.

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
- Artist self-service routes переведены на ledger-first read model:
  - payout summary считает `total earned / matured / current balance`
  - профиль артиста в self-service API получает finance-aware counters из ledger snapshot
  - профиль пользователя для artist-summary больше не зависит только от старого `lifetimeEarningsStarsCents`
- Admin artist moderation тоже начала получать finance-aware counters для `Баланс / Заработано` из ledger snapshot, а не только из legacy profile fields.
- Order webhook и admin payout moderation перестали держать profile finance counters как инкрементальную правду:
  - earnings/payout history остаются truth-слоем
  - artist profile counters вычисляются через finance overlay helper
  - webhook upsert'ит нормализованный artist profile уже с derived finance numbers
- Те же derived finance counters теперь применяются и в:
  - artist profile save
  - admin artist moderation
  - application approval
  - artist catalog backfill
- Для затронутых артистов legacy profile counters теперь тоже синхронизируются от ledger/request history, а не только живут как stale fallback.
- Кнопка `finance backfill` в админке теперь не только переносит earnings/payout/audit, но и синхронизирует artist profile counters под derived finance values.

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
- Для `artist applications` добавлены dry-run и real backfill triggers в админке.
- В admin dashboard появился отдельный migration status block:
  - source по доменам
  - legacy/postgres counts
  - coverage %
  - cutover readiness по ownership, applications, artist catalog и finance
- Следующим slice `Sprint 08` получил отдельный normalized support-domain:
  - добавлены таблицы `artist_donations` и `artist_subscriptions`
  - public artist route и artist self-service читают merged support snapshot
  - paid-order webhook dual-write'ит donations/subscriptions
  - добавлен admin support backfill
  - migration status теперь учитывает и `artist_support`
- Следующим slice payout self-service был доведён ближе к `ledger-first` модели:
  - `/api/shop/artists/me/payouts` теперь читает artist profile через merge-store
  - payout request перепроверяет eligibility внутри mutation path
  - request creation меньше зависит от stale pre-read finance snapshot
- Следующим slice admin payout moderation тоже стала устойчивее к migration drift:
  - `/api/admin/artist-payouts` умеет гидрировать request из normalized finance snapshot
  - moderation больше не требует, чтобы request уже существовал в legacy JSON слое
- Следующим slice admin artist moderation тоже получила hydration из normalized layers:
  - `/api/admin/artist-applications` умеет брать fallback application/profile из merge-store
  - `/api/admin/artists` умеет модерировать профиль с fallback на normalized artist profile
- Следующим slice self-service artist routes тоже получили hydration из normalized layers:
  - `/api/shop/artists/me/application` умеет брать fallback application/profile
  - `/api/shop/artists/me` умеет сохранять artist profile с fallback на normalized profile
  - `/api/shop/artists/me/tracks` умеет создавать и редактировать релизы с fallback на normalized artist data
- Следующим slice добавлен targeted normalized `trackId` lookup:
  - `artist catalog store` теперь умеет адресно находить релиз по `trackId`
  - admin moderation и self-service edit релиза используют этот lookup вместо широких fallback-выборок

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
- В operational слое админки появилась прозрачная cutover visibility для `Sprint 08`, чтобы миграция больше не зависела от ручного знания разработчика.

## Темы, которые уже начали, но ещё не считаются завершёнными

- Ingest pipeline для storage content
- Production-grade desktop client `Electron`
- Полная нормализация backend-модели без зависимости от `app_state`
