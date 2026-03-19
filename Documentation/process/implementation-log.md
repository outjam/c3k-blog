# Implementation Log

## 2026-03-18

### Контекст

Старт практической реализации `C3K Storage` и `C3K TON Site` после согласования ТЗ.

### Что зафиксировано на этом этапе

- Создана документация по `C3K Storage Node`
- Создана документация по `C3K TON Site`
- Обновлен production roadmap, чтобы `TON Storage` и `TON Site` стали официальными workstreams
- Зафиксировано решение, что storage node-клиент реализуется как `Electron JS` desktop app
- Зафиксировано решение, что `C3K Desktop Client` совмещает:
  - storage node
  - локальный клиент открытия `c3k.ton`
- Зафиксировано требование по delivery:
  - Telegram-бот отправляет пользователю купленные файлы по запросу
  - web/desktop скачивают файлы локально

### Что делается следующим implementation slice

- базовый storage-domain в коде
- feature flags и server config
- server-side storage registry scaffold
- первые API для storage program

### Что реально сделано в первом кодовом slice

- Добавлены базовые storage-типы в [src/types/storage.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/storage.ts)
- Добавлен storage feature-config в [src/lib/storage-config.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-config.ts)
- Добавлен server-side registry scaffold на `app_state` key `storage_registry_v1` в [src/lib/server/storage-registry-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts)
- Добавлены первые API:
  - [src/app/api/storage/program/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/program/me/route.ts)
  - [src/app/api/storage/program/join/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/program/join/route.ts)
- Добавлены env-флаги в [\.env.example](/Users/culture3k/Documents/GitHub/c3k-blog/.env.example)

### Результат первого slice

- в проекте появился отдельный storage-domain
- появился единый server-side источник для будущего storage registry
- появились первые backend entrypoints для программы `C3K Storage`
- desktop/client и UI-слои теперь можно строить уже поверх готового storage foundation

### Проверка

- `npm run typecheck`
- targeted `eslint` по новым storage-файлам

### Следующий slice после foundation

- расширен admin backend для `storage:view` и `storage:manage`
- добавлены admin APIs для:
  - snapshot
  - assets
  - bags
  - memberships
- добавлен user-facing экран [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx)
- добавлен admin storage dashboard [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- добавлены навигационные ссылки из:
  - настроек профиля
  - главной admin-панели

### Почему выбран именно такой порядок

- сначала нужна живая доменная модель и минимальный backend scaffold
- без этого нельзя нормально строить desktop-клиент
- desktop-клиент и delivery layer должны опираться на единый storage registry

### Что пока сознательно не делается

- реальный upload в `TON Storage`
- provider contract automation
- desktop runtime
- live UI экраны программы `C3K Storage`

### Что реально сделано в delivery slice

- Расширена storage domain model:
  - `StorageAsset` теперь поддерживает `resourceKey`, `trackId`, `audioFileId`, `fileName`, `mimeType`
  - добавлены delivery-типы и отдельный delivery-state
- Добавлен отдельный app-state store `storage_delivery_v1` в [src/lib/server/storage-delivery-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery-store.ts)
- Добавлен server-side delivery orchestrator в [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts)
- Подняты API:
  - [src/app/api/storage/downloads/release/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/release/route.ts)
  - [src/app/api/storage/downloads/track/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/track/route.ts)
  - [src/app/api/storage/downloads/[id]/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/[id]/route.ts)
- Добавлен client API для release/track delivery в [src/lib/storage-delivery-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-delivery-api.ts)
- Обновлен release UI:
  - у полного релиза появились действия `Скачать релиз` и `В Telegram`
  - у купленных треков появились file-actions для web download и Telegram delivery
- Обновлён storage admin dashboard:
  - можно задавать `resourceKey`, `audioFileId`, `fileName`, `mimeType`
  - видно последние delivery requests

### Архитектурные решения delivery slice

- asset mapping строится через `resourceKey`, а не только через внутренний `assetId`
- для исторических track purchases без формата включен legacy fallback на `default format`
- web download считается готовым только при наличии прямой `deliveryUrl`
- desktop delivery допускает `storagePointer`, потому что в будущем это должен потреблять `C3K Desktop Client`
- Telegram delivery пока умеет работать через fetchable URL; прямой retrieval из `TON Storage` daemon/gateway остаётся следующим шагом

### Результат delivery slice

- появился единый серверный contract для выдачи купленных релизов и треков
- release page получила первые реальные точки входа в file delivery
- storage admin может вручную маппить assets на релизы и треки
- подготовлен отдельный след запросов на выдачу, который можно дальше подключать к worker'ам, Telegram delivery queue и desktop client

### Проверка delivery slice

- `npm run typecheck`
- targeted `eslint` по storage/delivery/release/admin файлам

### Что идёт следующим slice

- real asset ingest pipeline и auto-mapping релизов в storage registry
- queue/worker для Telegram delivery
- desktop-facing API для `storagePointer` и будущего `C3K Desktop Client`
- отдельный UI history для скачиваний и delivery requests

### Дополнительный slice: user-facing delivery history

- Добавлен user API для чтения собственных delivery requests:
  - [src/app/api/storage/downloads/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/route.ts)
- Client helper [src/lib/storage-delivery-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-delivery-api.ts) теперь умеет получать список собственных выдач
- На экране [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx) появилась секция `Последние выдачи`
- Пользователь теперь видит:
  - какие запросы ушли в Telegram
  - какие файлы готовы к скачиванию
  - какие requests застряли на `pending_asset_mapping`

### Проверка user-facing history slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/app/storage/page.tsx`
  - `src/lib/storage-delivery-api.ts`
  - `src/app/api/storage/downloads/route.ts`

### Sprint slice: auto-sync storage assets from artist releases

- Добавлен общий helper для storage resource keys и source-url resolution:
  - [src/lib/storage-resource-key.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-resource-key.ts)
- Добавлен server-side sync service:
  - [src/lib/server/storage-asset-sync.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-asset-sync.ts)
- Artist release create/update теперь автоматически синхронизируют базовые storage assets:
  - [src/app/api/shop/artists/me/tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts)
- Artist moderation route тоже запускает sync после изменения релиза:
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
- Добавлен admin backfill route:
  - [src/app/api/admin/storage/sync-tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/sync-tracks/route.ts)
- Добавлен admin action для ручной синхронизации релизов:
  - [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)

### Что именно делает auto-sync

- создаёт deterministic storage assets для release-level master files по форматам релиза
- создаёт preview asset, если у релиза есть доступный preview URL
- обновляет `resourceKey`, `audioFileId`, `sourceUrl`, `fileName`, `mimeType`
- удаляет stale auto-managed assets, если они больше не нужны и не привязаны к bag

### Ограничение текущего sprint slice

- auto-sync пока не создаёт полноценные track-level purchased assets для multi-track релизов
- текущий слой закрывает базовый release-level mapping и подготавливает почву для ingest pipeline

### Проверка sprint slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/storage-resource-key.ts`
  - `src/lib/server/storage-asset-sync.ts`
  - `src/app/api/shop/artists/me/tracks/route.ts`
  - `src/app/api/admin/artists/route.ts`
  - `src/app/api/admin/storage/sync-tracks/route.ts`
  - `src/app/admin/storage/page.tsx`

### Sprint slice: test-mode ingest pipeline

- Добавлен отдельный ingest state `storage_ingest_v1`:
  - [src/lib/server/storage-ingest-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ingest-store.ts)
- Добавлен server-side ingest orchestrator:
  - [src/lib/server/storage-ingest.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ingest.ts)
- Storage registry расширен bag file operations:
  - [src/lib/server/storage-registry-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts)
- Добавлен admin route для запуска ingest:
  - [src/app/api/admin/storage/ingest/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/ingest/route.ts)
- Admin snapshot теперь включает ingest jobs:
  - [src/app/api/admin/storage/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/route.ts)
- Admin storage dashboard получил:
  - action `Подготовить test bags`
  - список ingest jobs
  - отдельный ingest metric

### Что делает test-mode ingest pipeline

- выбирает storage assets, у которых ещё нет активного bag
- создаёт ingest jobs и хранит их отдельной историей
- подготавливает deterministic placeholder bag metadata
- создаёт bag file entry для asset
- не использует реальный `TON Storage` provider и не требует платных on-chain операций
- оставляет `tonstorage://` pointer как runtime-shaped placeholder для следующего этапа

### Зачем это добавлено именно сейчас

- закрыт разрыв между `asset sync` и будущим реальным ingest runtime
- storage registry стал похож на процесс, а не только на ручной реестр
- admin получил управляемый test-only путь подготовки bags в бесплатной среде

### Дополнительное обновление process/documentation слоя

- roadmap layer разделён на:
  - strategic roadmap
  - sprint board
  - product capability checklist
- добавлен [sprint-board.md](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/sprint-board.md) как основной операционный документ по deliverables

### Проверка test-mode ingest slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/types/storage.ts`
  - `src/lib/storage-config.ts`
  - `src/lib/server/storage-registry-store.ts`
  - `src/lib/server/storage-ingest-store.ts`
  - `src/lib/server/storage-ingest.ts`
  - `src/app/api/admin/storage/route.ts`
  - `src/app/api/admin/storage/ingest/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/admin/storage/page.tsx`

### Sprint 06 slice: retryable delivery flow and release-level visibility

- Delivery state теперь поддерживает clean reset optional fields при повторном запуске request:
  - [src/lib/server/storage-delivery-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery-store.ts)
- Delivery service теперь умеет повторно запускать существующий request:
  - [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts)
- Route [src/app/api/storage/downloads/[id]/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/[id]/route.ts) теперь поддерживает:
  - `GET` статуса
  - `POST` retry/reopen
- Client delivery API получил retry helper:
  - [src/lib/storage-delivery-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-delivery-api.ts)
- На экране [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx):
  - появились retry actions для `failed` и `pending_asset_mapping`
  - улучшено отображение channel/status для user-facing delivery history
- На экране релиза [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/[slug]/shop-product-page-client.tsx):
  - появились последние delivery requests по текущему релизу
  - добавлены явные статусы выдачи
  - добавлен retry прямо с экрана релиза

### Что это даёт спринту

- delivery flow стал менее одноразовым
- пользователь теперь видит, что происходит с его файлом, а не только нажимает кнопку
- failed и pending requests можно повторно запускать без ручного админского вмешательства

### Проверка Sprint 06 slice

### Sprint 08 slice: payout audit log

- В `db/schema.sql` добавлена нормализованная таблица:
  - `artist_payout_audit_log`
- В [src/types/shop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/shop.ts) добавлены:
  - `ArtistPayoutAuditEntry`
  - `ArtistPayoutAuditActor`
  - `ArtistPayoutAuditAction`
- В [src/lib/server/shop-admin-config-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-admin-config-store.ts) добавлен legacy-compatible audit log:
  - `artistPayoutAuditLog`
  - sanitize и default config support
- В [src/lib/server/artist-finance-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-finance-store.ts):
  - добавлено чтение audit entries из Postgres
  - добавлен merge с legacy audit state
  - добавлен upsert для payout audit entries
- В [src/app/api/shop/artists/me/payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/payouts/route.ts):
  - payout request теперь dual-write'ит `requested` audit entry
  - `GET` теперь отдаёт payout audit trail
- В [src/app/api/admin/artist-payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-payouts/route.ts):
  - review/status change теперь пишет audit entry
  - `GET` теперь отдаёт payout audit trail
- В UI:
  - [src/app/studio/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx) показывает audit timeline по payout requests
  - [src/app/admin/artists/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/artists/page.tsx) показывает последние payout audit события в moderation flow

### Что это дало

- payout flow впервые стал audit-able без зависимости только от текущего snapshot статуса
- artist и admin теперь видят последовательность изменений payout request
- finance normalization в `Sprint 08` стал ближе к реальному ledger-first контуру

### Проверка payout audit slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/artist-finance-store.ts`
  - `src/lib/server/shop-admin-config-store.ts`
  - `src/app/api/shop/artists/me/route.ts`
  - `src/app/api/shop/artists/me/payouts/route.ts`
  - `src/app/api/admin/artist-payouts/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/studio/page.tsx`
  - `src/app/admin/artists/page.tsx`

### Sprint 08 slice: normalized artist catalog layer

- В `db/schema.sql` добавлены таблицы:
  - `artist_profiles`
  - `artist_tracks`
- Добавлен отдельный merged store:
  - [src/lib/server/artist-catalog-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-store.ts)
- Store умеет:
  - читать artist profiles и artist tracks из Postgres
  - безопасно падать обратно в legacy `shop_admin_config`
  - merge'ить normalized rows с legacy fallback
  - upsert'ить profiles и tracks обратно в Postgres
- Обновлены consumer/admin read paths:
  - [src/lib/server/shop-catalog.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-catalog.ts)
  - [src/app/api/shop/artists/[slug]/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/[slug]/route.ts)
  - [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [src/app/api/shop/artists/me/tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts)
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
- Обновлены dual-write mutation paths:
  - artist profile update
  - artist application approval
  - artist release create/update
  - admin track/profile moderation
  - Telegram paid-order webhook для balance/sales updates
  - admin payout completion для profile balance updates

### Что это дало

- artist-domain больше не живёт только внутри `app_state`
- публичный каталог и artist public routes уже получают normalized snapshot
- changes в artist profile/release flow теперь записываются и в Postgres, и в legacy config
- подготовлен следующий шаг для backfill/cutover artist domain без большого rewrite

### Проверка normalized artist slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/artist-catalog-store.ts`
  - `src/lib/server/shop-catalog.ts`
  - `src/lib/server/shop-artist-market.ts`
  - `src/app/api/shop/artists/me/route.ts`
  - `src/app/api/shop/artists/me/tracks/route.ts`
  - `src/app/api/shop/artists/[slug]/route.ts`
  - `src/app/api/admin/artists/route.ts`
  - `src/app/api/admin/artist-applications/route.ts`
  - `src/app/api/admin/artist-payouts/route.ts`
  - `src/app/api/telegram/webhook/route.ts`

### Sprint 08 slice: operational backfill for artist and finance domains

- Добавлен artist catalog backfill helper:
  - [src/lib/server/artist-catalog-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-backfill.ts)
- Добавлен admin route:
  - [src/app/api/admin/artists/backfill/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/backfill/route.ts)
- Добавлен finance backfill helper:
  - [src/lib/server/artist-finance-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-finance-backfill.ts)
- Добавлен admin route:
  - [src/app/api/admin/artists/finance-backfill/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/finance-backfill/route.ts)
- Обновлён [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts) и [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx):
  - появились `Dry-run` и реальные trigger'ы для artist backfill
  - появились `Dry-run` и реальные trigger'ы для finance backfill

### Что это дало

- migration слой внутри `Sprint 08` перестал быть только кодом и route'ами
- оператор теперь может из админки запускать:
  - ownership/mint backfill
  - artist catalog backfill
  - artist finance backfill
- подготовлен управляемый operational contour для постепенного cutover из legacy state в Postgres

### Проверка operational backfill slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/artist-finance-backfill.ts`
  - `src/lib/server/artist-catalog-backfill.ts`
  - `src/app/api/admin/artists/backfill/route.ts`
  - `src/app/api/admin/artists/finance-backfill/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/admin/page.tsx`

### Sprint 08 slice: migration source visibility

- Admin artist moderation routes теперь отдают `source`:
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
  - [src/app/api/admin/artist-payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-payouts/route.ts)
- Client admin helpers прокидывают `source` в UI:
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
- На экране moderation артистов теперь видно:
  - `Artist source`
  - `Finance source`
  - [src/app/admin/artists/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/artists/page.tsx)

### Что это дало

- оператор сразу видит, читает ли admin contour уже normalized Postgres snapshot
- migration/backfill перестали быть слепыми действиями
- легче понять, где ещё живёт legacy fallback

### Проверка migration visibility slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/app/api/admin/artists/route.ts`
  - `src/app/api/admin/artist-payouts/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/admin/artists/page.tsx`

### Дополнение: source visibility in studio

- [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts) теперь отдаёт:
  - `artistSource`
  - `financeSource`
- [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts) прокидывает эти поля в client layer
- [src/app/studio/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx) показывает source visibility в hero студии

Это даёт ещё один operational сигнал: и админ, и сам артист видят, читает ли их screen уже normalized Postgres state, либо ещё через legacy fallback.

### Sprint 08 slice: normalized artist applications

- В `db/schema.sql` добавлена таблица:
  - `artist_applications`
- Добавлен merge-store:
  - [src/lib/server/artist-application-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-application-store.ts)
- Обновлены routes:
  - [src/app/api/shop/artists/me/application/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/application/route.ts)
  - [src/app/api/admin/artist-applications/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-applications/route.ts)
- Client admin layer и moderation UI теперь тоже видят `source` по application-domain:
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
  - [src/app/admin/artists/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/artists/page.tsx)

### Что это дало

- artist application flow перестал быть legacy-only
- подача заявки и moderation теперь dual-write'ят Postgres слой
- admin moderation видит `Applications` source рядом с artist/finance sources

### Проверка normalized application slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/artist-application-store.ts`
  - `src/app/api/shop/artists/me/application/route.ts`
  - `src/app/api/admin/artist-applications/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/admin/artists/page.tsx`

### Дополнение: application backfill

- Добавлен helper:
  - [src/lib/server/artist-application-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-application-backfill.ts)
- Добавлен admin route:
  - [src/app/api/admin/artist-applications/backfill/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-applications/backfill/route.ts)
- Admin dashboard получил:
  - `Dry-run application backfill`
  - `Запустить application backfill`
  - summary результата
  - [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx)

### Что это дало

- application-domain теперь доведён до того же operational уровня, что ownership, artist catalog и finance
- migration можно запускать из UI, а не только через route

### Проверка application backfill slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/artist-application-backfill.ts`
  - `src/app/api/admin/artist-applications/backfill/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/admin/page.tsx`

### Sprint 08 slice: admin migration status and cutover visibility

- Добавлен общий helper для Postgres row counts:
  - [src/lib/server/postgres-http.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/postgres-http.ts)
- Добавлен server-side migration status service:
  - [src/lib/server/migration-status.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/migration-status.ts)
- Добавлен admin route:
  - [src/app/api/admin/migrations/status/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/migrations/status/route.ts)
- Client admin layer получил новый fetch helper и типы snapshot:
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
- Dashboard админки теперь показывает:
  - общий migration state
  - source по доменам
  - legacy/postgres counts
  - coverage %
  - cutover readiness
  - [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx)
  - [src/app/admin/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.module.scss)

### Что это дало

- `Sprint 08` перестал быть набором отдельных backfill-кнопок без общей картины
- оператор теперь видит, какие домены реально догнали legacy слой, а какие ещё отстают
- cutover visibility стала частью продукта и процесса, а не только внутренней инженерной памяти

### Проверка migration status slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/postgres-http.ts`
  - `src/lib/server/migration-status.ts`
  - `src/app/api/admin/migrations/status/route.ts`
  - `src/lib/admin-api.ts`
  - `src/app/admin/page.tsx`

### Sprint 08 slice: ledger-first finance read model

- `ArtistPayoutSummary` расширен нормализованными finance totals:
  - `totalEarnedStarsCents`
  - `maturedStarsCents`
  - `currentBalanceStarsCents`
  - [src/types/shop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/shop.ts)
- `buildArtistPayoutSummary(...)` теперь считает totals из ledger/request history, а не только `available / hold / requested / paid`:
  - [src/lib/server/shop-artist-studio.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-studio.ts)
- Artist self-service routes начали возвращать finance-aware profile:
  - `balanceStarsCents`
  - `lifetimeEarningsStarsCents`
  - теперь пересчитываются из normalized finance snapshot
  - [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [src/app/api/shop/artists/me/payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/payouts/route.ts)
- Admin artist moderation route тоже начал возвращать finance-aware counters для artist profiles:
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
- Профиль пользователя больше не полагается только на legacy field для метрики `Заработано`:
  - [src/app/profile/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.tsx)

### Что это дало

- artist self-service finance read-side перестал зависеть только от stale counters внутри `artistProfiles`
- admin moderation тоже перестала показывать только stale profile counters по finance
- студия и профиль теперь получают более честные earnings/balance numbers из ledger-среза
- это не завершает полный finance cutover, но закрывает важный read-side этап внутри `Sprint 08`

### Проверка ledger-first finance read slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/types/shop.ts`
  - `src/lib/server/shop-artist-studio.ts`
  - `src/app/api/shop/artists/me/route.ts`
  - `src/app/api/shop/artists/me/payouts/route.ts`
  - `src/app/profile/page.tsx`

### Sprint 08 slice: write-side finance overlay and less profile arithmetic

- Добавлен общий helper finance overlay:
  - [src/lib/server/shop-artist-studio.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-studio.ts)
- Artist/admin read paths переведены на него, чтобы не дублировать ручной overlay:
  - [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [src/app/api/shop/artists/me/payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/payouts/route.ts)
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
- `applyArtistPayoutsForPaidOrder(...)` больше не ведёт `balanceStarsCents / lifetimeEarningsStarsCents` как инкрементальную правду:
  - [src/lib/server/shop-artist-market.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-market.ts)
- Admin payout review больше не вычитает баланс вручную из profile counters:
  - [src/app/api/admin/artist-payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-payouts/route.ts)
- Telegram payment webhook теперь upsert'ит artist profiles в нормализованный слой уже с finance overlay из ledger/request state:
  - [src/app/api/telegram/webhook/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/webhook/route.ts)
- Artist profile mutation paths и catalog backfill тоже больше не проталкивают stale finance counters в нормализованный profile слой:
  - [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
  - [src/app/api/admin/artist-applications/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-applications/route.ts)
  - [src/lib/server/artist-catalog-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-backfill.ts)
- Добавлен sync helper, который приводит legacy artist profile counters к derived значениям из ledger/request history:
  - [src/lib/server/shop-artist-studio.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-studio.ts)
- Этот sync теперь применяется в ключевых finance write-paths:
  - [src/lib/server/shop-artist-market.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-market.ts)
  - [src/app/api/admin/artist-payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-payouts/route.ts)

### Что это дало

- write-side artist finance стал меньше зависеть от ручной арифметики внутри `artistProfiles`
- ledger/request history ещё сильнее приблизились к роли единственного источника правды по finance
- profile counters теперь становятся производным представлением, а не самостоятельной truth-моделью
- backfill и profile mutation paths тоже перестали затирать normalized `artist_profiles` устаревшими finance полями
- fallback config тоже начал синхронизироваться от ledger derivation для затронутых артистов, что делает legacy read-path безопаснее на переходном этапе

### Проверка write-side finance overlay slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/shop-artist-studio.ts`
  - `src/lib/server/shop-artist-market.ts`
  - `src/app/api/shop/artists/me/route.ts`
  - `src/app/api/shop/artists/me/payouts/route.ts`
  - `src/app/api/admin/artists/route.ts`
  - `src/app/api/admin/artist-payouts/route.ts`
  - `src/app/api/telegram/webhook/route.ts`

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/storage-delivery-store.ts`
  - `src/lib/server/storage-delivery.ts`
  - `src/app/api/storage/downloads/[id]/route.ts`
  - `src/lib/storage-delivery-api.ts`
  - `src/app/storage/page.tsx`
  - `src/app/shop/[slug]/shop-product-page-client.tsx`

### Sprint 06 slice: downloads center and profile visibility

- Добавлен отдельный consumer-facing экран файлов:
  - [src/app/downloads/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx)
  - [src/app/downloads/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.module.scss)
  - [src/app/downloads/loading.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/loading.tsx)
- Экран `Файлы` показывает:
  - все delivery requests пользователя
  - фильтры `Все / Готово / В работе / Ошибки`
  - retry для `failed` и `pending_asset_mapping`
  - переход к релизу
- В основном профиле появился компактный summary block по файлам и delivery activity:
  - [src/app/profile/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.tsx)
  - [src/app/profile/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.module.scss)

### Что это даёт спринту

- у пользователя появился отдельный entry point в post-purchase библиотеку
- delivery history больше не привязана только к `C3K Storage` и экрану релиза
- профиль начал показывать реальную file activity, а не только покупки и коллекцию

### Проверка downloads center slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/app/downloads/page.tsx`
  - `src/app/downloads/loading.tsx`
  - `src/app/profile/page.tsx`
  - `src/lib/storage-delivery-api.ts`

### Sprint 06 slice: Telegram delivery worker

- Telegram delivery больше не зависит только от lifecycle user request
- В [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts):
  - Telegram requests теперь ставятся в queue-like `processing` state
  - добавлены:
    - `getTelegramStorageDeliveryQueueSize`
    - `processTelegramStorageDeliveryQueue`
- Delivery store теперь умеет фильтровать requests по `channel/status`:
  - [src/lib/server/storage-delivery-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery-store.ts)
- Добавлен worker route:
  - [src/app/api/storage/downloads/worker/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/worker/route.ts)

### Как работает worker slice

- пользовательский запрос на `telegram_bot` больше не отправляет файл синхронно
- request получает статус `processing`
- worker берёт queued Telegram delivery requests отдельно
- worker пытается скачать файл по `deliveryUrl` и отправить в Telegram
- после этого request обновляется в `delivered` или `failed`

### Почему это важно

- Telegram delivery теперь можно запускать независимо от UI-request
- появляется нормальный путь для cron/manual worker processing
- это закрывает последний крупный deliverable `Sprint 06`

### Проверка Telegram worker slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/storage-delivery-store.ts`
  - `src/lib/server/storage-delivery.ts`
  - `src/app/api/storage/downloads/worker/route.ts`
  - `src/app/api/storage/downloads/release/route.ts`
  - `src/app/api/storage/downloads/track/route.ts`
  - `src/app/api/storage/downloads/[id]/route.ts`
  - `src/lib/storage-delivery-api.ts`

### Sprint 07 slice: desktop runtime contract and shell scaffold

- Вынесен общий worker auth helper, чтобы worker routes больше не дублировали auth/limit contract:
  - [src/lib/server/worker-auth.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/worker-auth.ts)
- На этот helper переведены:
  - [src/app/api/telegram/notifications/worker/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/notifications/worker/route.ts)
  - [src/app/api/storage/downloads/worker/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/worker/route.ts)
- Добавлен desktop domain contract:
  - [src/types/desktop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/desktop.ts)
  - [src/lib/desktop-runtime.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/desktop-runtime.ts)
  - [src/lib/server/desktop-runtime.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/desktop-runtime.ts)
- Поднят runtime API:
  - [src/app/api/desktop/runtime/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/desktop/runtime/route.ts)
- Добавлен desktop onboarding surface:
  - [src/app/storage/desktop/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.tsx)
  - [src/app/storage/desktop/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.module.scss)
- Добавлен client helper для desktop handoff:
  - [src/lib/desktop-runtime-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/desktop-runtime-api.ts)
- Web surfaces теперь умеют передавать `storagePointer` в desktop flow:
  - [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/[slug]/shop-product-page-client.tsx)
  - [src/app/downloads/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx)
  - [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx)
- В репозитории появился отдельный desktop scaffold:
  - [desktop/package.json](/Users/culture3k/Documents/GitHub/c3k-blog/desktop/package.json)
  - [desktop/main.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/desktop/main.mjs)
  - [desktop/preload.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/desktop/preload.mjs)
  - [desktop/gateway.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/desktop/gateway.mjs)
  - [desktop/README.md](/Users/culture3k/Documents/GitHub/c3k-blog/desktop/README.md)

### Что это даёт спринту

- `Sprint 07` больше не существует только на уровне ADR и мечты
- у web и desktop теперь есть единый runtime contract
- `desktop_download` перестал быть чисто серверным enum и стал user-facing handoff path
- local gateway для `c3k.ton` уже оформлен как отдельный runtime stub, который можно дальше развивать без перепридумывания контракта

### Ограничения текущего slice

- desktop scaffold не запускался в этой среде, потому что `electron` dependency не устанавливалась и desktop runtime пока не собирался отдельно
- local gateway пока stub, а не настоящий TON Site runtime
- реальный retrieval из `TON Storage` по `storagePointer` ещё не реализован

### Проверка Sprint 07 slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/worker-auth.ts`
  - `src/app/api/telegram/notifications/worker/route.ts`
  - `src/app/api/storage/downloads/worker/route.ts`
  - `src/types/desktop.ts`
  - `src/lib/desktop-runtime.ts`
  - `src/lib/server/desktop-runtime.ts`
  - `src/app/api/desktop/runtime/route.ts`
  - `src/lib/desktop-runtime-api.ts`
  - `src/app/downloads/page.tsx`
  - `src/app/storage/page.tsx`
  - `src/app/shop/[slug]/shop-product-page-client.tsx`
  - `src/app/storage/desktop/page.tsx`

### Sprint 08 slice: normalized artist finance foundation

- В schema baseline добавлены таблицы:
  - `artist_earnings_ledger`
  - `artist_payout_requests`
  - [db/schema.sql](/Users/culture3k/Documents/GitHub/c3k-blog/db/schema.sql)
- Добавлен normalized finance store с Postgres read/write и legacy fallback:
  - [src/lib/server/artist-finance-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-finance-store.ts)
- `applyArtistPayoutsForPaidOrder(...)` теперь возвращает newly created earnings, чтобы их можно было dual-write'ить в Postgres:
  - [src/lib/server/shop-artist-market.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-market.ts)
- Telegram payment webhook теперь после paid-order dual-write'ит новые earning entries:
  - [src/app/api/telegram/webhook/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/webhook/route.ts)
- Artist payout routes и studio snapshot теперь читают finance state через normalized store:
  - [src/app/api/shop/artists/me/payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/payouts/route.ts)
  - [src/app/api/admin/artist-payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-payouts/route.ts)
  - [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)

### Что это даёт спринту

- `Sprint 08` перестал быть только планом на “когда-нибудь вынести всё из app_state”
- finance-контур впервые получил нормализованное Postgres-представление без немедленного destructive migration
- payout summary и payout admin flows уже могут читать данные из нового слоя и не терять legacy state во время перехода

### Ограничения текущего slice

- artist profiles, releases и entitlements всё ещё живут в legacy JSON config
- finance store пока делает dual-write/fallback, а не окончательный cutover
- migration/backfill существующих finance records в таблицы ещё не реализован

### Проверка Sprint 08 foundation slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/artist-finance-store.ts`
  - `src/lib/server/shop-artist-market.ts`
  - `src/app/api/telegram/webhook/route.ts`
  - `src/app/api/shop/artists/me/payouts/route.ts`
  - `src/app/api/admin/artist-payouts/route.ts`
  - `src/app/api/shop/artists/me/route.ts`

### Sprint 08 slice: normalized social entitlements and mint state

- В schema baseline добавлены таблицы:
  - `user_release_entitlements`
  - `user_track_entitlements`
  - `user_release_nft_mints`
  - [db/schema.sql](/Users/culture3k/Documents/GitHub/c3k-blog/db/schema.sql)
- Добавлен отдельный merge-store для ownership и mint history:
  - [src/lib/server/social-entitlement-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/social-entitlement-store.ts)
- `getSocialUserSnapshot(...)` и public purchases теперь читают entitlements через Postgres-backed fallback layer:
  - [src/lib/server/social-user-state-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/social-user-state-store.ts)
- Все основные server-side mutation paths теперь dual-write'ят normalized ownership:
  - append release grant
  - append track grant
  - append release with tracks
  - release wallet purchase
  - track wallet purchase
  - release NFT mint

### Что это даёт спринту

- `Sprint 08` закрыл следующий критичный кусок после finance: ownership релизов, ownership треков и NFT mint state
- profile, release ownership, delivery entitlement checks и mint flow могут читать данные уже не только из `social_user_state_v1`
- переход сделан без destructive migration: legacy JSON остаётся fallback-слоем, а новый Postgres слой уже становится нормализованным источником для read paths

### Ограничения текущего slice

- artist profiles и release catalog всё ещё не вынесены из legacy config/state
- backfill существующих purchase и mint records из historical JSON в таблицы ещё не реализован
- wallet balance и visibility flags пока остаются в legacy social state

### Проверка Sprint 08 entitlement slice

- `npm run typecheck`
- targeted `eslint` по:
  - `src/lib/server/social-entitlement-store.ts`
  - `src/lib/server/social-user-state-store.ts`

### Sprint 08 slice: ownership and mint backfill path

- Добавлен server-side helper для controlled backfill:
  - [src/lib/server/social-entitlement-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/social-entitlement-backfill.ts)
- Legacy social state теперь можно читать пачками как migration source:
  - [src/lib/server/social-user-state-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/social-user-state-store.ts)
- Добавлен admin route:
  - [src/app/api/admin/social/entitlements/backfill/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/social/entitlements/backfill/route.ts)
- В админке появился trigger для:
  - dry-run ownership backfill
  - real ownership backfill
  - [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx)
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)

### Что это даёт

- migration перестала быть только внутренней реализацией и стала управляемой операцией для тестовой среды
- можно безопасно посмотреть объём переноса через dry-run до записи в таблицы
- ownership и mint normalization получили первый реальный cutover path из legacy JSON state

### Browser auth modernization: Telegram Login OIDC SDK

- Найден и подтверждён новый официальный browser auth flow Telegram:
  - `Log In with Telegram`
  - JS SDK: `https://oauth.telegram.org/js/telegram-login.js?3`
  - OIDC discovery: `https://oauth.telegram.org/.well-known/openid-configuration`
- Старый browser widget flow в приложении был завязан на legacy `telegram-widget.js` payload hash.
- Browser auth обновлён на новый flow:
  - клиент теперь использует актуальный Telegram Login SDK
  - сервер принимает `id_token`
  - сервер валидирует JWT по Telegram JWKS (`RS256`)
  - legacy payload verification оставлен как fallback на переходный период
- Обновлены:
  - [src/components/telegram-login-widget.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/telegram-login-widget.tsx)
  - [src/components/telegram-login-widget.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/telegram-login-widget.module.scss)
  - [src/app/api/auth/telegram/widget/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/auth/telegram/widget/route.ts)
  - [src/lib/server/telegram-browser-auth.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/telegram-browser-auth.ts)

### Что это даёт

- browser login больше не опирается на deprecated Telegram widget script
- Mini App auth через `initData` не затронут и остаётся основным flow внутри Telegram
- web/browser режим теперь ближе к официальному Telegram OIDC-подходу
