# Completed Backlog

Этот файл хранит уже завершённые задачи проекта в более подробном виде, чем roadmap checklist.

## 2026-03-19

### Batched sync для admin storage

- `/api/admin/storage/sync-tracks` больше не синхронизирует весь каталог одним длинным прогоном.
- Sync разбит на батчи с cursor-based проходом и per-track error summary.
- Кнопка в storage dashboard теперь последовательно прогоняет весь sync батчами и не падает целиком из-за одного проблемного релиза.

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

### Fresher state wins и на read-side merge-store

- Тот же принцип перенесён и в merge-store readers:
  - `artist_profiles`
  - `artist_tracks`
  - `artist_applications`
  - `artist_payout_requests`
  - `artist_subscriptions`
- Теперь даже при чтении snapshot система не просто берёт “Postgres first”, а сравнивает свежесть mutable записи по времени обновления.
- Это уменьшает случаи, когда UI или route видит stale состояние, хотя более новая запись уже существует во втором слое.

### Sprint 08 закрыт полностью

- Добавлен unified migration backfill suite для всех уже нормализованных критичных доменов:
  - ownership и NFT
  - artist applications
  - artist catalog
  - artist finance
  - artist support
- В админке появилась одна операторская кнопка, которая запускает весь cutover process и сразу показывает новый migration status.
- Artist profile mutation routes доведены до ledger-first поведения:
  - self-service profile save
  - application approval
  - admin profile moderation
- После этого `Sprint 08` переведён в `done`, а активным стал `Sprint 09 — Production hardening`.

### Дополнительный дизайн-спринт перед Sprint 09 hardening

- В админке выделен главный операторский action для полного cutover/backfill.
- В студии finance-layer стал читаться визуально:
  - source pills
  - отдельные finance cards
  - человеческие статусы релизов и выплат
- В библиотеке файлов delivery flow стал понятнее:
  - статусные тона
  - channel/format/file pills
  - признаки готовности к desktop/direct delivery

### Ручной recovery worker-ов из админки

- Добавлен единый execution layer для worker jobs, чтобы run history и ручной запуск использовали одну и ту же логику записи результата.
- На `Dashboard` появились две реальные recovery-кнопки:
  - `Прогнать notifications`
  - `Прогнать storage delivery`
- После ручного запуска администратор сразу видит:
  - новый run в истории
  - обновлённый incident status
  - понятное текстовое резюме по обработке очереди
- Это убирает лишний разрыв между operator visibility и operator action: теперь админка не только показывает проблему, но и даёт минимальный recovery-инструмент.

### Provenance для worker run-ов

- История worker run-ов теперь хранит provenance:
  - `worker_route`
  - `admin_manual`
- Если worker запускался вручную из админки, в run history сохраняется `telegramUserId` администратора.
- В UI это выведено отдельными pills внутри карточки запуска, поэтому оператор сразу видит:
  - это был автоматический прогон
  - или ручной recovery
  - и кем именно он был инициирован
- Это делает background job audit заметно полезнее для production hardening и операторских разборов.

### Operator guide и go-live слой

- В админке появился отдельный operator guide, который собирает в одном месте:
  - incidents
  - deployment readiness
  - migration status
  - TON environment
- Теперь оператор видит не только отдельные статусы, но и:
  - release mode (`test_only`, `mainnet_blocked`, `mainnet_ready`)
  - список конкретных next actions
  - короткие runbooks по recovery и go-live
- Для TON collection deploy добавлен `confirmNetwork` guard, чтобы deploy не уходил в неверную сеть по ошибке.
- После этого `Sprint 09` можно считать закрытым: есть visibility, recovery, audit, go-live guidance и жёстче выраженный network split.

### Старт Sprint 10: target UI для C3K Storage Node

- Пользовательский экран `/storage` больше не выглядит как форма-заявка с парой статусов.
- Он переведён в target dashboard будущей storage-ноды:
  - статус участия и readiness
  - swarm/bags preview
  - wallet card для `C3K Credit`
  - health и contribution goals
  - связь с desktop runtime
- Это зафиксировало визуальную цель для всего следующего storage runtime workstream.
- Теперь можно делать реальный `TON Storage` test contour уже под конкретный product UI, а не под абстрактные данные.

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
- Следующим slice `Sprint 09` получила live incident visibility в админке:
  - добавлен `admin incident snapshot` по оплатам, payouts, delivery, ingest и NFT runtime
  - появился новый route `/api/admin/incidents`
  - dashboard теперь показывает не только cutover/migration status, но и реальные operational сигналы
- Следующим slice `Sprint 09` storage delivery worker получил retry-safe claim/lease слой:
  - request теперь может быть захвачен worker-ом через `workerLockId` и `workerLockedAt`
  - конкурентные worker-запуски должны пропускать уже занятый request
  - после `delivered/failed` lock очищается, а `workerAttemptCount` сохраняет число реальных попыток
- Следующим slice проведён consumer UI/UX pass по профилю, каталогу и релизу:
  - коллекция в профиле теперь показывает owned formats, если релиз куплен в нескольких качествах
  - карточки каталога стали показывать ownership/format/progress полезнее и без лишнего описательного шума
  - страница релиза переведена в более track-first layout: компактный format block, tracklist выше, collection/delivery/NFT собраны в utility panels
- Следующим slice проведён creator-facing UI/UX pass по странице артиста и `Студии`:
  - страница артиста теперь яснее показывает два support-сценария: донат и подписка
  - hero артиста отражает доступность поддержки и число релизов с превью
  - каталог артиста стал показывать тип релиза, число треков, число форматов и NFT availability
  - `Студия` получила quick actions, next-step guidance и более явные правила профиля, релизов и выплат
- Следующим slice `Sprint 09` получил TON environment visibility и active-network guard:
  - runtime collection теперь сохраняется с явной сетью
  - sponsored mint и TON collection routes используют runtime collection только для активной сети
  - в админке появился отдельный TON environment block с active network, collection source, relay readiness и warning'ами о testnet/mainnet drift
- Следующим slice `Sprint 09` получил deployment readiness snapshot:
  - в админке появился preflight по public URLs, auth, Postgres, worker secrets, TON runtime и storage/desktop flags
  - operator теперь видит не только инциденты, но и базовую готовность окружения к rollout
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

### Sprint 10: runtime-aware storage ingest

- добавлен runtime abstraction для `test_prepare` и `tonstorage_testnet`
- admin storage dashboard показывает активный runtime, pointer readiness и upload-worker requirement
- admin может запускать ingest в двух режимах
- bags и ingest jobs теперь получают runtime metadata
- user-facing `/storage` начал отражать реальный storage runtime contour, а не только future-state copy

### Sprint 10: Telegram retrieval через storage runtime

- добавлен `storage-runtime-fetch` helper
- Telegram worker теперь умеет доставлять файл по:
  - `deliveryUrl`
  - `resolvedSourceUrl`
  - `storagePointer`/bag mapping
- storage runtime начал использоваться не только для pointer-prep, но и для реального retrieval path

### Sprint 10: web retrieval через storage runtime

- добавлен auth-protected route `/api/storage/downloads/[id]/file`
- web download helper теперь скачивает файл через server proxy, а не только через прямой `deliveryUrl`
- релиз, storage screen и downloads center переведены на новый flow
- browser delivery теперь тоже умеет работать через `storagePointer`/bag mapping storage runtime

### Sprint 10: runtime diagnostics в админке

- runtime fetch helper теперь умеет резолвить target из уже загруженного registry snapshot
- добавлен diagnostics helper по assets/bags
- storage dashboard показывает:
  - сколько assets и bags уже готовы к runtime delivery
  - pointer-ready bags
  - unresolved assets/bags с причинами
