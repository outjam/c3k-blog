# Implementation Log

## 2026-03-24

### Sprint 10 slice: live bridge preflight and honest runtime probe messaging

- Добавлен отдельный bridge preflight:
  - [storage-ton-runtime-preflight.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ton-runtime-preflight.ts)
  - [bridge-preflight route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/bridge-preflight/route.ts)
- [bridge env/status helper](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ton-runtime-bridge.ts) теперь отдаёт общий env-config для live preflight
- В [storage admin api](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts) появился client helper `runAdminStorageBridgePreflight()`
- [storage dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) теперь умеет:
  - запускать проверку `storage-daemon-cli`
  - проверять доступность gateway base
  - показывать `cli ok/failed`, число известных bag id, gateway HTTP status и next actions
- `upload once` summary теперь возвращает:
  - `runtimeFetchStatus`
  - `runtimeFetchError`
- В `Runtime probe` UI теперь прямо объясняется, является ли текущий `via`:
  - реальным `TON Storage gateway`
  - или ещё только fallback source path

### Зачем это сделано

- по старому UI можно было увидеть `Runtime fetch доступен`, хотя фактически это был лишь `bag_meta` fallback
- для первого живого testnet-прогона оператору нужен честный ответ:
  - CLI вообще запускается?
  - gateway вообще отвечает?
  - pointer реально подтверждён через runtime или система всё ещё качает файл по старому URL?
- этот слой сокращает ложные “почти готово” состояния перед настоящим `TON Storage` тестом

### Sprint 10 slice: per-asset prepare and upload flow in storage admin

- [storage dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) теперь показывает на карточке asset:
  - последний ingest job status
  - job mode
  - bag status
  - runtime fetch status
- Для каждого asset появились operator actions:
  - `Подготовить этот asset`
  - `Загрузить этот asset`
  - `Подготовить + загрузить`

### Зачем это сделано

- раньше `Загрузить этот asset` мог честно ответить `Prepared jobs не найдены`, и оператору приходилось вручную догадываться, что сначала нужен targeted ingest
- теперь storage admin даёт короткий и предсказуемый путь на одном asset:
  - подготовить pointer/job
  - сразу же попробовать upload
- это особенно важно для первого живого testnet-прогона, когда проверяется один конкретный релиз или трек, а не весь каталог

### Sprint 10 slice: server-side one-shot prepare+upload route

- [storage upload worker](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts) теперь умеет выполнять объединённый цикл:
  - targeted ingest
  - targeted upload
  - итоговый `runtimeFetchStatus`
- Для этого добавлен:
  - [prepare-and-upload route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/prepare-and-upload/route.ts)
  - [client helper](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
- [storage dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) переведён с client-side склейки на единый server-side one-shot flow

### Зачем это сделано

- раньше `Подготовить + загрузить` был двумя отдельными клиентскими запросами
- это было достаточно для теста, но не давало одного операторского результата и не было похоже на настоящий runtime operation
- теперь у storage admin есть единый one-shot action для конкретного asset, который ближе к будущему live worker cycle

### Sprint 10 slice: runtime pointer verification and bag-file manifest

- [storage upload completion](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts) теперь не заканчивается просто записью `bagId/pointer`:
  - после completion создаётся `bag file` запись
  - runtime pointer пробуется через gateway
  - bag получает статус `runtimeFetchStatus`
  - в `healthEvents` пишется `verified` или `failed`
- Для этого добавлен отдельный helper:
  - [storage-ton-runtime-verification.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ton-runtime-verification.ts)
- [storage registry](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts) расширен:
  - `runtimeFetchStatus`
  - `runtimeFetchCheckedAt`
  - `runtimeFetchVerifiedAt`
  - `runtimeFetchUrl`
  - `runtimeFetchError`
  - `appendStorageHealthEvent(...)`
- [runtime diagnostics](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-diagnostics.ts) теперь считают:
  - `realPointerBags`
  - `verifiedPointerBags`
  - `failedPointerBags`
- [storage admin API](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/route.ts) и [client types](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts) теперь отдают ещё и `bagFiles`
- [storage dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) теперь показывает:
  - verified/failed runtime pointers
  - bag file manifest
  - per-bag runtime fetch status и gateway URL
- [external worker route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/ingest/worker/route.ts) и [local worker script](/Users/culture3k/Documents/GitHub/c3k-blog/scripts/storage-testnet-worker.mjs) расширены полем `filePath`

### Sprint 10 slice: verified runtime pointer wins in delivery

- [storage-runtime-fetch.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-fetch.ts) теперь умеет:
  - читать `bagFiles`
  - выбирать основной путь файла внутри bag
  - по флагу `preferRuntimePointer` отдавать `tonstorage gateway` раньше legacy `sourceUrl`
- Это подключено в:
  - [storage delivery service](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts)
  - [web auth-proxy download route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/[id]/file/route.ts)
  - [runtime probe](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-probe.ts)
  - [runtime diagnostics](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-diagnostics.ts)
- В результате verified bag теперь не просто отображается в админке, а реально начинает влиять на:
  - web download
  - Telegram delivery queue
  - operator runtime checks

### Зачем это сделано

- раньше bag мог быть verified, но user-facing delivery всё равно продолжал брать старый `deliveryUrl`
- это оставляло `TON Storage` рядом с продуктом, а не внутри самого delivery layer
- теперь verified runtime действительно становится приоритетным источником выдачи

### Sprint 10 slice: upload completion wakes pending delivery requests

- [storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts) получил `reconcileStorageDeliveryRequestsForRuntimeAsset(...)`
- [storage-upload-worker.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts) теперь вызывает reconcile после upload completion
- Это означает, что как только asset/bag становится delivery-ready, старые запросы по нему могут автоматически перейти:
  - из `pending_asset_mapping` в `ready`
  - из `pending_asset_mapping` в `processing` для Telegram

### Зачем это сделано

- раньше upload completion улучшал runtime state, но уже созданные user requests оставались в старом статусе до ручного retry
- это создавало лишний разрыв между storage runtime и пользовательским опытом
- теперь storage contour ведёт себя ближе к живой системе: runtime появился — ожидающие запросы ожили

### Sprint 10 slice: delivery keeps runtime provenance

- [storage delivery state](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery-store.ts) теперь хранит:
  - `lastDeliveredVia`
  - `lastDeliveredSourceUrl`
- [web download route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/[id]/file/route.ts) после успешного fetch обновляет request как `delivered`
- [Telegram delivery worker](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts) тоже сохраняет реальный runtime path отправки
- [client delivery api](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-delivery-api.ts) после скачивания подтягивает обновлённый request
- User-facing экраны получили новый след доставки:
  - [downloads](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx)
  - [storage](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx)
  - [release page](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/[slug]/shop-product-page-client.tsx)

### Зачем это сделано

- теперь видно не только что файл доставлен, но и как именно он был получен
- это критично для переходного периода, где часть файлов ещё идёт через fallback, а часть уже через `TON Storage gateway`
- user-facing история стала полезной и как UX, и как реальный runtime telemetry layer

### Sprint 10 slice: server-side upload cycle from admin storage

- [storage-upload-worker.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts) получил `runSingleTonStorageUploadCycle()`
- Новый admin route:
  - [upload-run-once route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/upload-run-once/route.ts)
- Новый client helper:
  - [runAdminStorageUploadOnce](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
- [storage dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) получил кнопку `Прогнать upload once`

### Зачем это сделано

- раньше для реального CLI-контура нужен был отдельный внешний процесс
- это остаётся правильной моделью для постоянного runtime, но для локального теста слишком длинно
- теперь в test-среде можно быстро проверить:
  - есть ли prepared job
  - может ли сервер получить source bytes
  - отвечает ли текущий bridge mode
  - может ли `storage-daemon-cli` создать реальный bag

### Sprint 10 slice: targeted upload by asset

- [storage ingest store](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ingest-store.ts) теперь умеет claim'ить job не только по mode, но и по:
  - `assetId`
  - `bagId`
  - `jobId`
- [storage-upload-worker.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts) расширен targeted-режимом для `claim/run once`
- [upload-run-once route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/upload-run-once/route.ts) теперь принимает filters
- [storage dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) получил action `Загрузить этот asset`

### Зачем это сделано

- для первого живого testnet-прогона неудобно стрелять в “следующую prepared job”
- оператору обычно нужно проверить конкретный релиз или конкретный track asset
- targeted upload делает storage testing намного предсказуемее и короче по циклу

### Зачем это сделано

- bag/pointer сам по себе ещё не доказывает, что пользователь реально сможет скачать файл
- для delivery layer важно знать не только `BagID`, но и конкретный путь файла внутри bag
- оператору нужен честный ответ:
  - pointer уже реально читается через gateway
  - или upload завершился, но runtime fetch ещё не подтверждён

### Проверка

- `npm run typecheck`
- targeted `eslint` по storage registry/runtime/upload/admin файлам

## 2026-03-19

### Sprint 09 bugfix: batched admin storage sync

- [admin storage sync route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/sync-tracks/route.ts) переведён на batched sync с `cursorTrackId` и `limit`
- route больше не валит весь sync из-за одного проблемного релиза:
  - каждый track sync оборачивается в per-track error summary
  - ответ возвращает `processedTracks`, `failedTracks`, `remainingTracks`, `nextCursorTrackId`
- [admin client helper](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts) расширен под batched response
- [admin storage page](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) теперь автоматически прогоняет sync батчами по `40` релизов

### Зачем это сделано

- `POST /api/admin/storage/sync-tracks` мог отвечать `500` на большом каталоге из-за слишком длинного прогона в одном request
- один битый релиз или конфликт записи не должен валить весь operator action
- batched sync лучше соответствует реальному размеру каталога и serverless-ограничениям

### Проверка

- `npm run typecheck`
- targeted `eslint` по admin storage route/page/api

### Дополнительный sprint slice: migration-safe payout and storage sync

- [telegram webhook](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/webhook/route.ts) теперь перед начислением artist earnings подгружает fallback artist catalog через merge-store
- это закрывает реальный migration-risk: релиз уже есть в Postgres, но legacy `artistTracks` ещё не догнался, а значит payout мог не начислиться
- [admin storage sync](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/sync-tracks/route.ts) теперь тоже читает merged artist tracks, а не только `config.artistTracks`
- [shop-artist-market.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-market.ts) расширен fallback-hydration для `artistProfiles` и `artistTracks` в payment flow

### Зачем это сделано

- уменьшен риск потери artist earnings в переходный период между `app_state` и `Postgres`
- storage sync стал устойчивее к migration drift
- cutover стал ближе не только на read side, но и на боевых mutation routes

### Проверка

- `npm run typecheck`
- targeted `eslint` по webhook/storage-sync/artist-market

### Дополнительный sprint slice: artist-domain hydration before mutation

- [artist-catalog-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-store.ts) получил `hydrateArtistCatalogStateInConfig(...)`
- [artist-application-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-application-store.ts) получил `hydrateArtistApplicationsInConfig(...)`
- это подключено в self-service artist routes:
  - [me profile](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [me application](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/application/route.ts)
  - [me tracks](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts)
- и в admin moderation routes:
  - [admin artist applications](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-applications/route.ts)
  - [admin artists](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)

### Зачем это сделано

- mutation routes перестали полагаться только на наличие записи в legacy JSON
- если профиль, релиз или заявка уже живут в Postgres, route сначала гидрирует это состояние в config, а потом применяет изменение
- это сокращает ещё один класс migration-bugs при частичном cutover artist-domain

### Проверка

- `npm run typecheck`
- targeted `eslint` по artist store и artist routes

### Дополнительный sprint slice: admin UX and operator clarity

- Основная admin-панель получила:
  - человеческие описания вкладок
  - operator intro block
  - пояснения по migration domains
  - разложенные по смыслу backfill cards вместо безличного набора кнопок
- Экран [admin artists](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/artists/page.tsx) получил:
  - пояснение логики заявок
  - пояснение логики модерации профилей и релизов
  - пояснение payout moderation с реальными кейсами
- Экран [admin storage](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx) получил:
  - понятный порядок действий `sync -> test bags -> deliveries`
  - пояснения, что такое assets, bags, ingest jobs и deliveries
  - более человечный язык для storage-операций

### Зачем это сделано

- admin UI начал выглядеть как рабочий операторский пульт, а не как внутренний dev-screen
- снизился риск неправильного запуска backfill и storage actions
- project owner и команда теперь могут быстрее понимать назначение кнопок без чтения кода или отдельной документации

### Проверка

- `npm run typecheck`
- targeted `eslint` по admin-экранам

### Дополнительный sprint slice: webhook hydration для finance и support

- [telegram webhook](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/webhook/route.ts) теперь перед `applyArtistPayoutsForPaidOrder(...)` гидрирует:
  - fallback artist catalog snapshot
  - normalized finance snapshot
  - normalized support snapshot
- [artist-support-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-support-store.ts) получил `hydrateArtistSupportStateInConfig(...)`
- webhook теперь не опирается только на legacy `artistDonations`, `artistSubscriptions`, `artistEarningsLedger` и `artistPayoutRequests`, если Postgres уже содержит более свежие записи

### Зачем это сделано

- закрыт следующий migration-risk: `paid order` мог начислить earnings/support side-effects поверх stale JSON-состояния
- переходный период между `app_state` и `Postgres` стал безопаснее не только для catalog lookup, но и для finance/support mutation path
- cutover к normalized слоям стал ближе на боевом payment route

### Проверка

- `npm run typecheck`
- targeted `eslint` по webhook/support-store

### Дополнительный sprint slice: mutable hydration prefers fresher normalized state

- [artist-catalog-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-store.ts) теперь при гидрации `artist_profiles` и `artist_tracks` заменяет legacy entry, если normalized snapshot новее по `updatedAt`
- [artist-application-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-application-store.ts) делает то же для `artist_applications`
- [shop-artist-studio.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-studio.ts) теперь умеет заменять `artist_payout_requests` более свежими normalized версиями
- [artist-support-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-support-store.ts) делает то же для mutable `artist_subscriptions`

### Зачем это сделано

- раньше hydration helper мог сохранить устаревший legacy JSON просто потому, что запись с тем же `id` уже существовала
- это мешало cutover-логике: route вроде бы гидрировался из Postgres, но stale mutable запись всё равно оставалась победителем
- теперь normalized слой действительно может перезаписать legacy snapshot там, где сущность обновляема во времени

### Проверка

- `npm run typecheck`
- targeted `eslint` по artist/webhook hydration helpers

### Дополнительный sprint slice: freshness-aware merge-store readers

- [artist-catalog-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-store.ts) теперь на read-side сравнивает `updatedAt` для `artist_profiles` и `artist_tracks`
- [artist-application-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-application-store.ts) делает то же для `artist_applications`
- [artist-finance-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-finance-store.ts) теперь freshness-aware мержит `artist_payout_requests`
- [artist-support-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-support-store.ts) теперь freshness-aware мержит `artist_subscriptions`

### Зачем это сделано

- раньше read-side merge-store всё ещё мог показывать stale snapshot только потому, что одна из сторон пришла первой
- после исправления и read-side, и mutation-side используют одинаковый принцип: mutable запись побеждает по свежести, а не по источнику
- это делает transition между `app_state` и `Postgres` заметно честнее и снижает drift не только на записи, но и на чтении

### Проверка

- `npm run typecheck`
- targeted `eslint` по artist/finance/support merge-store файлам

### Финальный sprint slice: unified cutover suite и ledger-first profile mutations

- Добавлен единый backfill runner:
  - [migration-backfill-suite.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/migration-backfill-suite.ts)
  - [admin migration backfill route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/migrations/backfill/route.ts)
  - [admin client helper](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
  - [admin dashboard action](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx)
- Оператор теперь может одним действием прогнать:
  - entitlements
  - artist applications
  - artist catalog
  - artist finance
  - artist support
  и сразу получить новый `migrationStatus`
- Доведены profile mutation routes до ledger-first поведения:
  - [artist self-service profile save](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [admin application approval](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-applications/route.ts)
  - [admin artist moderation](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)
- Эти route'ы теперь гидрируют finance snapshot и строят profile counters из ledger/request state, а не переносят stale `balance/lifetime` из сохранённого profile

### Зачем это сделано

- это закрыло два последних незакрытых пункта Sprint 08:
  - полный ledger-first finance model
  - единый migration layer / cutover process по критичным доменам
- после этого `Sprint 08` можно перевести в `done`, а следующий активный этап — production hardening

### Проверка

- `npm run typecheck`
- targeted `eslint` по новым migration route/helper и artist/admin profile routes

### Sprint 09 slice: UI alignment for admin, studio and downloads

- [admin dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx) получил выделенный primary-card для полного `cutover/backfill` действия
- [studio](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx) теперь:
  - показывает source-pills вместо сырой строки `Artist source / Finance source / Support source`
  - выносит finance contour в hero и overview
  - использует человекочитаемые статусы релизов и payout requests
- [downloads](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx) получил более явные delivery states:
  - status tone
  - channel/format/file pills
  - понятный timestamp и признаки `storagePointer` / direct delivery
- Обновлены стили:
  - [admin page styles](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.module.scss)
  - [studio styles](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.module.scss)
  - [downloads styles](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.module.scss)

### Зачем это сделано

- backend-логика уже стала сложнее, чем UI-подача
- оператору, артисту и покупателю нужно быстрее считывать состояние без чтения сырого технического текста
- это подготавливает интерфейс к дальнейшему `Sprint 09`, где появятся production/hardening flows и их тоже нужно будет ясно показывать

### Проверка

- `npm run typecheck`
- targeted `eslint` по admin/studio/downloads и связанным helper/routes

### Sprint 09 slice: manual worker recovery from admin

- Добавлен единый execution helper для worker jobs:
  - [admin-worker-execution.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-worker-execution.ts)
- На него переведены existing worker routes:
  - [storage delivery worker](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/worker/route.ts)
  - [telegram notifications worker](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/notifications/worker/route.ts)
- [admin worker runs route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/workers/runs/route.ts) теперь умеет не только читать историю запусков, но и вручную запускать:
  - `telegram_notifications`
  - `storage_delivery_telegram`
- [admin dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx) получил recovery-кнопки для обоих worker-ов и operator-copy с объяснением, когда их использовать
- [admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts) расширен helper-ом `runAdminWorker(...)`

### Зачем это сделано

- до этого оператор видел только incident status и history прошлых запусков, но не мог из UI сам перезапустить очередь
- recovery после деплоя, временного падения cron или застрявшей delivery queue требовал ручного обращения к worker routes
- единый execution helper уменьшает дублирование логики между cron/worker routes и ручным админским запуском

### Проверка

- `npm run typecheck`
- targeted `eslint` по worker routes, admin route, admin page и client helper

### Sprint 09 slice: worker run provenance and operator audit

- [admin worker run types](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/admin.ts) расширены полями:
  - `trigger`
  - `triggeredByTelegramUserId`
- [admin-worker-run-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-worker-run-store.ts) теперь сохраняет и нормализует provenance worker run-ов
- [admin-worker-execution.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-worker-execution.ts) принимает trigger-source и actor
- automated worker routes записывают `worker_route`, а manual trigger из админки пишет `admin_manual` и `telegramUserId` администратора:
  - [admin worker runs route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/workers/runs/route.ts)
  - [storage delivery worker](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/worker/route.ts)
  - [telegram notifications worker](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/notifications/worker/route.ts)
- [admin dashboard](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx) теперь показывает provenance pills внутри run history:
  - `Автоматический route`
  - `Ручной recovery`
  - `admin <telegramUserId>`, если запуск был ручным

### Зачем это сделано

- history worker jobs без provenance плохо подходит для production hardening: оператор видит факт запуска, но не видит, это cron/route или ручной recovery
- после ручного восстановления очереди важно иметь след в UI, кто именно его инициировал
- это подготавливает `Пульт C3K` к более полному operational audit слою без отдельной таблицы и без усложнения infra на этом этапе

### Проверка

- `npm run typecheck`
- targeted `eslint` по admin worker run типам, store, helper, routes и admin page

### Финальный Sprint 09 slice: operator guide, go-live status и TON deploy guard

- Добавлен единый operator cockpit helper:
  - [admin-operator-guide.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-operator-guide.ts)
  - [admin operator guide route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/operator-guide/route.ts)
- В админке появился новый блок:
  - release mode `test_only / mainnet_blocked / mainnet_ready`
  - next actions по incidents / deployment / migration / TON
  - runbooks для post-deploy, delivery recovery, TON drift и mainnet go-live
- [admin page](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx) и [styles](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.module.scss) теперь подают deployment hardening как операторский процесс, а не набор разрозненных статусов
- [ton collection route](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/ton/collection/route.ts) теперь требует `confirmNetwork=<activeNetwork>` при deploy action

### Зачем это сделано

- до этого `Sprint 09` уже дал visibility, recovery и audit, но не давал цельного go/no-go слоя перед mainnet
- operator guide собирает incidents, migration status, TON environment и deployment readiness в понятный следующий шаг
- confirmNetwork guard делает deploy NFT collection менее опасным и жёстче разводит `testnet / mainnet`

### Проверка

- `npm run typecheck`
- targeted `eslint` по operator guide, admin page и TON collection route

## 2026-03-23

### Sprint 10 slice: target UI для C3K Storage Node

- [storage page](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx) перестроена из `foundation/program form` в целевой user-facing dashboard
- На одном экране теперь показан target state будущей ноды:
  - статус участия и node readiness
  - swarm/bags preview
  - будущая reward-модель `C3K Credit`
  - desktop runtime readiness
  - текущий delivery layer как уже живой operational слой
- [storage styles](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.module.scss) полностью пересобраны под новый layout и более зрелый product-layer

### Что именно изменилось в UI

- Hero теперь показывает не просто программу, а `C3K Storage Node` как продукт:
  - node state
  - release mode
  - tier
  - desktop readiness
- Добавлен отдельный wallet/reward card для `C3K Credit`, чтобы было видно, как будет считываться мотивация пользователя
- Появился `Node control center`:
  - выделенное место
  - цель по bags
  - health target
  - Telegram delivery readiness
- Добавлен `swarm`-блок с preview раздаваемых bags и ожидаемого вклада
- Добавлен блок правил начисления rewards
- Участие и заявка сохранены, но встроены в новый product-dashboard, а не висят как отдельная форма без контекста

### Зачем это сделано

- перед real `TON Storage` runtime нужен не только backend, но и понятный target UI, к которому движется storage workstream
- теперь у storage sprint есть визуальная цель:
  - что пользователь видит
  - зачем он держит ноду
  - за что получает будущую монету
- это позволяет следующие backend/runtime slices делать уже под конкретную модель интерфейса, а не под абстрактный storage layer

### Проверка

- `npm run typecheck`
- `npx eslint src/app/storage/page.tsx`

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

### Sprint 08 slice: normalized artist support layer

- В `db/schema.sql` добавлены таблицы:
  - `artist_donations`
  - `artist_subscriptions`
- Добавлен отдельный merge-store:
  - [src/lib/server/artist-support-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-support-store.ts)
- Artist self-service и public artist routes теперь читают donations/subscriptions через merged support snapshot:
  - [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts)
  - [src/app/api/shop/artists/[slug]/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/[slug]/route.ts)
- Support checkout route больше не зависит только от raw legacy artist lookup:
  - [src/app/api/shop/artists/[slug]/support/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/[slug]/support/route.ts)
- Paid-order webhook теперь dual-write'ит donations/subscriptions в новый слой:
  - [src/lib/server/shop-artist-market.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-artist-market.ts)
  - [src/app/api/telegram/webhook/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/telegram/webhook/route.ts)
- Добавлен support backfill:
  - [src/lib/server/artist-support-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-support-backfill.ts)
  - [src/app/api/admin/artists/support-backfill/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/support-backfill/route.ts)
- Admin dashboard и migration status теперь видят отдельный домен `artist_support`.
- `Студия` получила source visibility и для support layer.

### Результат support slice

- donations/subscriptions больше не сидят только в `shop_admin_config_v1`
- публичный artist screen и artist self-service уже читают merged support state
- support-домен получил такой же migration/backfill operational слой, как catalog и finance

### Проверка support slice

- `npm run typecheck`
- targeted `eslint` по support store/backfill/routes/admin/webhook файлам

### Sprint 08 slice: ledger-first payout self-service path

- Route [src/app/api/shop/artists/me/payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/payouts/route.ts) переведён на merged reads:
  - artist profile берётся через normalized artist catalog snapshot
  - application snapshot тоже поднимается рядом с payout flow
  - finance продолжает читаться через normalized finance snapshot
- Payout request теперь валидируется повторно внутри `mutateShopAdminConfig(...)`, а не только до mutation:
  - проверяется approved artist profile
  - проверяется TON wallet
  - проверяется minimum payout threshold
  - проверяется available balance по актуальному request/ledger state на момент записи
- Это уменьшает race между предварительным read и actual payout request creation.

### Результат payout self-service slice

- artist payout self-service сильнее приближен к `ledger-first` модели
- payout request больше не полагается только на legacy profile snapshot до mutation
- read-side и write-side payout flow теперь лучше согласованы между собой

### Проверка payout self-service slice

- `npm run typecheck`
- targeted `eslint` по payout/support/admin/backend файлам

### Sprint 08 slice: admin payout moderation hydration from normalized finance

- Route [src/app/api/admin/artist-payouts/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-payouts/route.ts) теперь предварительно читает:
  - merged finance snapshot
  - merged artist catalog snapshot
- Если payout request уже есть в normalized finance layer, но ещё не попал в legacy `artistPayoutRequests`, admin PATCH может:
  - гидрировать request в legacy config
  - применить moderation status/note
  - пересчитать finance counters
- При profile overlay для уведомлений и upsert'а route теперь использует и normalized artist profile как fallback.

### Результат admin payout moderation slice

- admin payout moderation стала устойчивее во время переходного периода
- еще один write-path перестал требовать полного совпадения legacy JSON и Postgres, чтобы работать корректно

### Проверка admin payout moderation slice

- `npm run typecheck`
- targeted `eslint` по admin payout route и связанным finance/catalog store файлам

### Sprint 08 slice: admin artist moderation hydration from normalized layers

- Route [src/app/api/admin/artist-applications/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artist-applications/route.ts) теперь перед mutation читает:
  - normalized application snapshot
  - normalized artist profile snapshot
- Если legacy `artistApplications` или `artistProfiles` ещё не догнали Postgres, moderation PATCH всё равно может:
  - взять fallback application/profile из merge-store
  - применить moderation status
  - создать или обновить artist profile
- Route [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts) теперь умеет модерировать профиль артиста с fallback на normalized artist profile.

### Результат admin artist moderation slice

- artist moderation меньше зависит от совпадения legacy JSON и Postgres
- ещё два admin write-path стали устойчивее в переходный период `Sprint 08`

### Проверка admin artist moderation slice

- `npm run typecheck`
- targeted `eslint` по admin artist routes и application/catalog stores

### Sprint 08 slice: self-service artist hydration from normalized layers

- Self-service application route [src/app/api/shop/artists/me/application/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/application/route.ts):
  - `GET` теперь читает profile через normalized artist snapshot
  - `POST` использует fallback application/profile из normalized layers, если legacy JSON не синхронизирован
- Self-service artist profile route [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts):
  - `GET` теперь использует normalized application snapshot вместо прямого чтения только из `artistApplications`
  - `POST` умеет сохранять профиль с fallback на normalized artist profile
- Self-service release route [src/app/api/shop/artists/me/tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts):
  - `POST` умеет создавать релиз с fallback на normalized artist profile
  - `PATCH` умеет редактировать релиз с fallback на normalized artist track

### Результат self-service hydration slice

- artist-side mutation paths стали устойчивее в transition-период
- ещё один заметный блок пользовательских действий больше не зависит от полного совпадения `app_state` и Postgres

### Проверка self-service hydration slice

- `npm run typecheck`
- targeted `eslint` по self-service artist routes и application/catalog stores

### Sprint 08 slice: targeted normalized track lookup

- В [src/lib/server/artist-catalog-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-store.ts) `readArtistCatalogSnapshot(...)` получил поддержку `trackId`.
- Store теперь умеет:
  - таргетированно находить track через normalized layer
  - определять `artist_telegram_user_id` для track-first сценариев
  - подтягивать связанный artist profile без широкой выборки каталога
- Это использовано в:
  - [src/app/api/shop/artists/me/tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts)
  - [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts)

### Результат targeted track lookup slice

- self-service edit и admin moderation релиза стали устойчивее к migration drift
- заодно убрана необходимость широкого чтения artist tracks для одного track update path

### Проверка targeted track lookup slice

- `npm run typecheck`
- targeted `eslint` по artist catalog store и track routes

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
- `artist finance backfill` теперь тоже выравнивает derived finance counters и в Postgres artist profiles, и в legacy config:
  - [src/lib/server/artist-finance-backfill.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-finance-backfill.ts)
  - [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx)

### Что это дало

- write-side artist finance стал меньше зависеть от ручной арифметики внутри `artistProfiles`
- ledger/request history ещё сильнее приблизились к роли единственного источника правды по finance
- profile counters теперь становятся производным представлением, а не самостоятельной truth-моделью
- backfill и profile mutation paths тоже перестали затирать normalized `artist_profiles` устаревшими finance полями
- fallback config тоже начал синхронизироваться от ledger derivation для затронутых артистов, что делает legacy read-path безопаснее на переходном этапе
- finance backfill превратился в полноценный reconciliation step, а не только в перенос ledger tables

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

### Sprint 09 slice: admin incident/status overview

- Добавлен отдельный server-side incident snapshot для operator dashboard:
  - [src/lib/server/admin-incident-status.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-incident-status.ts)
  - [src/types/admin.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/admin.ts)
- Snapshot собирает live-сигналы по:
  - оплатам и stuck checkout
  - payout requests
  - failed/stale delivery requests
  - failed/stale ingest jobs
  - NFT runtime readiness
- Добавлен admin API route:
  - [src/app/api/admin/incidents/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/incidents/route.ts)
- Client admin API расширен новым fetch helper:
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
- В [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx) dashboard теперь показывает:
  - число открытых инцидентов
  - число critical/warning сигналов
  - по каждому operational домену:
    - human summary
    - action hint
    - source state
    - список свежих сигналов

### Что это даёт

- админка теперь показывает не только migration coverage, но и реальные operational risk-сигналы
- у project owner появился быстрый ответ на вопрос “что сейчас сломано или требует внимания”
- `Sprint 09` получил первый настоящий production-hardening UI slice, а не только backend groundwork

### Sprint 09 slice: retry-safe storage delivery worker

- Добавлен worker claim/lease слой для delivery requests:
  - [src/lib/server/storage-delivery-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery-store.ts)
  - [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts)
  - [src/types/storage.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/storage.ts)
- У delivery request появились поля:
  - `workerLockId`
  - `workerLockedAt`
  - `workerAttemptCount`
- Telegram worker теперь перед отправкой файла:
  - claim-ит request через lock/lease
  - пропускает уже занятые requests
  - очищает lock после `delivered` или `failed`

### Что это даёт

- параллельные worker-запуски больше не должны отправлять один и тот же файл дважды
- storage delivery стал ближе к retry-safe production-поведению
- `Sprint 09` получил первый backend slice именно в направлении job safety, а не только operator visibility

### UI/UX pass: profile, catalog and release page alignment

- Проведён отдельный consumer-facing UI pass по:
  - [src/app/profile/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.tsx)
  - [src/app/profile/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.module.scss)
  - [src/components/shop/shop-product-card.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/shop/shop-product-card.tsx)
  - [src/components/shop/shop-product-card.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/shop/shop-product-card.module.scss)
  - [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/[slug]/shop-product-page-client.tsx)
  - [src/app/shop/[slug]/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/[slug]/page.module.scss)
- В профиле коллекция теперь показывает не только сам релиз, но и форматы, если полный релиз был куплен в нескольких качествах.
- В каталоге карточки релизов стали менее текстовыми и больше показывают полезную personal state информацию:
  - ownership progress
  - owned formats
  - тип релиза и число треков
- Экран релиза перестроен в более `track-first` сценарий:
  - формат релиза вынесен в компактный control block
  - tracklist поднят выше и получил более ясный контекст
  - шумный отдельный purchase/delivery слой убран
  - коллекция, выдача файлов и NFT сведены в более собранные utility panels

### Что это даёт

- реализованные purchase/delivery/NFT фичи теперь лучше читаются на основных consumer-экранах
- страница релиза стала менее шумной и лучше соответствует реальному пользовательскому сценарию
- каталог и профиль стали лучше показывать разницу между:
  - полным релизом
  - частично купленными треками
  - NFT-улучшением

### UI/UX pass: artist page and studio alignment

- Проведён следующий consumer/creator-facing UI pass по:
  - [src/app/shop/artist/[slug]/shop-artist-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/artist/[slug]/shop-artist-page-client.tsx)
  - [src/app/shop/artist/[slug]/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/artist/[slug]/page.module.scss)
  - [src/app/studio/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx)
  - [src/app/studio/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.module.scss)
- Страница артиста теперь лучше отражает уже существующие product flows:
  - support availability вынесен в hero-pills
  - донаты и подписка объясняются как два разных сценария поддержки
  - каталог артиста показывает тип релиза, число треков, число форматов и NFT availability
- `Студия` перестроена ближе к dashboard-поверхности:
  - появились quick actions из hero
  - overview показывает не только числа, но и следующий рабочий шаг артиста
  - profile/release/payout tabs получили human banners с правилами работы
  - список релизов стал лучше показывать цену и состояние NFT

### Что это даёт

- artist-facing интерфейсы перестали заметно отставать от уже реализованной бизнес-логики
- студия стала ближе к рабочему инструменту артиста, а не к длинной форме
- страница артиста визуально лучше синхронизирована с уже обновлёнными профилем, каталогом и релизом

### Sprint 09 slice: TON environment visibility and active-network runtime guard

- В runtime config TON collection появился явный `network`, чтобы runtime collection была привязана к конкретной сети:
  - [src/lib/server/ton-runtime-config-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/ton-runtime-config-store.ts)
- Добавлены active-network helper'ы:
  - runtime collection теперь используется только если её сеть совпадает с текущим `NEXT_PUBLIC_TON_NETWORK`
  - это подключено в:
    - [src/app/api/ton/sponsored-mint/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/ton/sponsored-mint/route.ts)
    - [src/app/api/ton/collection/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/ton/collection/route.ts)
    - [src/lib/server/admin-incident-status.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-incident-status.ts)
- Добавлен отдельный operator snapshot по TON environment:
  - [src/lib/server/admin-ton-environment-status.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-ton-environment-status.ts)
  - [src/app/api/admin/ton/status/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/ton/status/route.ts)
- Admin dashboard теперь показывает:
  - активную сеть
  - runtime/env collection source
  - relay readiness
  - public base URL
  - warning'и о runtime/env drift
  - это в [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx) и [src/app/admin/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.module.scss)

### Что это даёт

- operator теперь видит, какой именно TON contour активен сейчас, без чтения env и runtime state вручную
- sponsored mint и collection status больше не подхватывают runtime collection из другой сети по ошибке
- это первый реальный production-hardening slice по направлению `testnet / mainnet split`, а не только по worker safety

### Sprint 09 slice: deployment readiness snapshot

- Добавлен отдельный deployment preflight snapshot:
  - [src/lib/server/admin-deployment-readiness.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/admin-deployment-readiness.ts)
  - [src/app/api/admin/deployment/readiness/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/deployment/readiness/route.ts)
- Snapshot проверяет базовые production/test rollout контуры:
  - public URLs
  - Telegram core
  - admin/session auth
  - Postgres
  - worker auth
  - TON runtime
  - storage/desktop flags
- Admin dashboard теперь показывает отдельный `Deployment readiness` блок:
  - [src/app/admin/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.tsx)
  - [src/app/admin/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/page.module.scss)
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)

### Что это даёт

- operator получает не только incident view, но и preflight-картину по env/infra readiness
- перед rollout больше не нужно вручную сверять базовые секреты и флаги по нескольким местам
- `Sprint 09` продвинулся от точечных hardening-fix'ов к реальному deployment-oriented operator flow

### Sprint 10 slice: runtime-aware storage contour

- storage ingest больше не жёстко привязан только к placeholder `test_prepare`
- добавлен runtime abstraction для:
  - `test_prepare`
  - `tonstorage_testnet`
- bags и ingest jobs теперь сохраняют runtime metadata:
  - `runtimeMode`
  - `runtimeLabel`
- user-facing `/storage` и admin storage dashboard теперь видят активный `runtimeStatus`
- admin storage dashboard умеет запускать ingest в выбранном режиме
- `tonstorage_testnet` сейчас честно делает только:
  - testnet-style pointer
  - bag metadata
  - runtime visibility
- фактический upload/replication всё ещё остаётся задачей следующего storage worker slice

### Sprint 10 slice: first runtime retrieval path for Telegram

- Добавлен отдельный runtime fetch helper:
  - [src/lib/server/storage-runtime-fetch.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-fetch.ts)
- Telegram delivery worker теперь может:
  - брать файл по прямому `deliveryUrl`
  - брать файл по `resolvedSourceUrl`
  - восстанавливать fetchable source через `storagePointer`, `bagId` и `assetId`
- Это подключено в:
  - [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts)
- Важный эффект:
  - Telegram delivery больше не требует только прямой URL
  - первый retrieval contour начинает реально использовать storage runtime mapping
  - это всё ещё не daemon bridge, но уже шаг от pointer-prep к runtime consumption

### Sprint 10 slice: first runtime retrieval path for web download

- Добавлен auth-protected proxy route для выдачи storage delivery request в браузер:
  - [src/app/api/storage/downloads/[id]/file/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/[id]/file/route.ts)
- Client helper для web download теперь скачивает файл через этот route, а не только через прямой `deliveryUrl`:
  - [src/lib/storage-delivery-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-delivery-api.ts)
- Страница релиза, экран `C3K Storage` и `downloads center` теперь используют новый proxy flow:
  - [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/[slug]/shop-product-page-client.tsx)
  - [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx)
  - [src/app/downloads/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx)
- Важный эффект:
  - web download теперь может работать даже когда у delivery request нет прямого `deliveryUrl`, но есть `storagePointer`/bag mapping
  - storage runtime начинает использоваться уже и для browser delivery, а не только для Telegram worker
  - это первый user-facing retrieval contour для web до полноценного daemon bridge

### Sprint 10 slice: runtime diagnostics for operator

- storage runtime fetch helper теперь умеет резолвить fetch target из уже загруженного registry snapshot:
  - [src/lib/server/storage-runtime-fetch.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-fetch.ts)
- Добавлен отдельный diagnostics helper:
  - [src/lib/server/storage-runtime-diagnostics.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-diagnostics.ts)
- Admin storage route и dashboard теперь показывают:
  - сколько `assets` уже резолвятся в fetchable source
  - сколько `bags` уже резолвятся в fetchable source
  - сколько bags pointer-ready
  - первые unresolved assets/bags с человеческой причиной
  - это подключено в:
    - [src/app/api/admin/storage/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/route.ts)
    - [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- Важный эффект:
  - operator видит не только runtime mode, но и реальную готовность registry к выдаче файлов
  - следующий storage step теперь проще диагностировать до user-теста, не дожидаясь падения delivery request

### Sprint 10 slice: external upload worker handoff

- В ingest jobs добавлены `uploaded` status и worker lock metadata:
  - [src/types/storage.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/storage.ts)
  - [src/lib/server/storage-ingest-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ingest-store.ts)
- Добавлен отдельный handoff helper для `tonstorage_testnet`:
  - [src/lib/server/storage-upload-worker.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts)
- Новый worker route:
  - [src/app/api/storage/ingest/worker/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/ingest/worker/route.ts)
  - умеет:
    - отдавать queue status
    - claim следующего `prepared` job
    - принимать completion/failure от внешнего upload worker
- Admin storage dashboard теперь показывает отдельную upload queue для внешнего worker:
  - [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- Важный эффект:
  - `tonstorage_testnet` contour получил честный внешний upload stage
  - теперь система умеет не только готовить bags/pointers, но и принимать назад подтверждённый upload result
  - это ещё не встроенный daemon bridge, но уже реальный handoff между приложением и внешним storage runtime

### Sprint 10 slice: simulated upload pass for free testing

- Добавлен test-only simulated upload helper:
  - [src/lib/server/storage-upload-worker.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts)
- Добавлен admin route:
  - [src/app/api/admin/storage/upload-simulate/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/upload-simulate/route.ts)
- Admin storage dashboard получил кнопку `Симулировать upload`:
  - [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- Важный эффект:
  - storage contour теперь можно прогонять end-to-end в test-only режиме без реального daemon bridge
  - prepared jobs переходят в `uploaded` через тот же handoff слой, который потом будет использовать настоящий внешний worker

### Sprint 10 slice: protected source endpoint for external upload worker

- Claim response worker route теперь отдаёт готовые endpoints:
  - `source`
  - `complete`
  - `status`
  - это подключено в [src/app/api/storage/ingest/worker/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/ingest/worker/route.ts)
- Добавлен защищённый source route:
  - [src/app/api/storage/ingest/worker/[id]/source/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/ingest/worker/[id]/source/route.ts)
- Upload worker helper теперь умеет выдавать bytes из:
  - `asset.sourceUrl`
  - `asset.audioFileId` через Telegram file API
  - это в [src/lib/server/storage-upload-worker.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-upload-worker.ts)
- Важный эффект:
  - внешний worker получил полный цикл `claim -> source -> complete`
  - следующий настоящий testnet worker уже может работать не только по metadata, но и забирать сам payload файла

### Sprint 10 slice: local external worker scaffold

- Добавлен локальный worker script:
  - [scripts/storage-testnet-worker.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/scripts/storage-testnet-worker.mjs)
- Добавлены npm scripts:
  - `npm run storage:worker:once`
  - `npm run storage:worker:loop`
  - это в [package.json](/Users/culture3k/Documents/GitHub/c3k-blog/package.json)
- В `.env.example` добавлены:
  - `C3K_STORAGE_WORKER_SECRET`
  - `C3K_STORAGE_WORKER_BASE_URL`
  - это в [\.env.example](/Users/culture3k/Documents/GitHub/c3k-blog/.env.example)
- Важный эффект:
  - storage contour теперь можно гонять не только через admin simulation, но и отдельным внешним процессом
  - это максимально близкий к реальному worker опыт без отдельной инфраструктуры и без боевого `TON Storage daemon`

### Sprint 10 slice: TON Storage bridge status and CLI mode

- Добавлен server-side bridge helper:
  - [src/lib/server/storage-ton-runtime-bridge.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-ton-runtime-bridge.ts)
- В `.env.example` добавлены env для реального testnet bridge:
  - `C3K_STORAGE_TON_UPLOAD_BRIDGE_MODE`
  - `C3K_STORAGE_TON_DAEMON_CLI_BIN`
  - `C3K_STORAGE_TON_DAEMON_CLI_ARGS_JSON`
  - `C3K_STORAGE_TON_HTTP_GATEWAY_BASE`
  - это в [\.env.example](/Users/culture3k/Documents/GitHub/c3k-blog/.env.example)
- Storage runtime fetch теперь умеет резолвить `tonstorage://<BagID>/...` через настроенный HTTP gateway:
  - [src/lib/server/storage-runtime-fetch.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-fetch.ts)
  - [src/lib/server/storage-runtime-diagnostics.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-diagnostics.ts)
- Storage admin route/dashboard теперь показывают:
  - upload mode
  - real upload readiness
  - gateway retrieval readiness
  - CLI bin и gateway base
  - это подключено в:
    - [src/app/api/admin/storage/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/route.ts)
    - [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- Локальный worker script получил режим `tonstorage_cli`:
  - [scripts/storage-testnet-worker.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/scripts/storage-testnet-worker.mjs)
  - теперь он может:
    - забрать claimed source
    - вызвать `storage-daemon-cli`
    - создать реальный BagID
    - вернуть в приложение настоящий `tonstorage://<BagID>/...` pointer
- Важный эффект:
  - между simulated contour и реальным `TON Storage` появился честный bridge layer
  - следующий шаг уже не переписывание storage-кода, а подключение рабочего daemon/gateway конфига

### Sprint 10 slice: runtime probe for concrete bag/asset

- Добавлен probe helper:
  - [src/lib/server/storage-runtime-probe.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-probe.ts)
- Добавлен admin route:
  - [src/app/api/admin/storage/runtime-probe/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/runtime-probe/route.ts)
- Admin API и storage dashboard получили операторский `Runtime probe`:
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
  - [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- Probe умеет:
  - выбрать конкретный `assetId` или `bagId`
  - резолвить fetch target через runtime
  - проверить HTTP-доступность через `HEAD`, а при необходимости через короткий `GET`
  - показать `via`, `HTTP status`, `content-type`, `content-length`
- Важный эффект:
  - operator больше не ограничен общими readiness-счётчиками
  - переход к реальному `TON Storage` теперь можно валидировать на уровне конкретного релиза/файла

### Desktop node map preview slice

- Desktop screen получил визуальную карту нод:
  - [src/app/storage/desktop/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.tsx)
  - [src/app/storage/desktop/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.module.scss)
- Desktop node map переведена на реальную open-source геокарту через `maplibre-gl`:
  - [package.json](/Users/culture3k/Documents/GitHub/c3k-blog/package.json)
  - [package-lock.json](/Users/culture3k/Documents/GitHub/c3k-blog/package-lock.json)
- Теперь `C3K Desktop Client` показывает:
  - локальную desktop-ноду пользователя
  - gateway для `c3k.ton`
  - archive/collector/site cache точки
  - реальные координаты на карте вместо условной схемы
- Важный эффект:
  - storage node в desktop больше не выглядит как чисто технический onboarding screen
  - пользователь уже видит, к какой сети он подключается и как будет выглядеть swarm-раздача на настоящей географии

### Desktop node map stabilization slice

- Исправлен баг, из-за которого MapLibre-карта растягивалась по высоте:
  - у карты теперь жёсткий viewport height и нормализованные `maplibregl` container/canvas styles
  - это в [src/app/storage/desktop/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.module.scss)
- Node map вынесена в desktop runtime contract:
  - [src/lib/server/desktop-runtime.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/desktop-runtime.ts)
  - [src/types/desktop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/desktop.ts)
- Важный эффект:
  - карта больше не живёт page-local hardcode
  - следующий шаг уже не UI refactor, а замена preview node points на реальные runtime данные

### Desktop/runtime storage nodes slice

- `StorageNode` расширен публичными geo-полями:
  - `publicLabel`
  - `city`
  - `countryCode`
  - `latitude`
  - `longitude`
  - это в [src/types/storage.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/storage.ts)
- В storage registry добавлен `upsertStorageNode(...)`:
  - [src/lib/server/storage-registry-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts)
- Добавлен admin route для нод:
  - [src/app/api/admin/storage/nodes/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/storage/nodes/route.ts)
- Admin storage dashboard теперь умеет:
  - создавать storage-ноду с координатами
  - показывать текущий список нод
  - это в [src/app/admin/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/admin/storage/page.tsx)
- `desktop runtime contract` переведён на async и теперь строит карту из реальных storage nodes, если они есть:
  - [src/lib/server/desktop-runtime.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/desktop-runtime.ts)
  - [src/app/api/desktop/runtime/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/desktop/runtime/route.ts)
  - [src/types/desktop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/desktop.ts)
- Важный эффект:
  - карта нод в desktop больше не зависит только от preview-фолбэка
  - как только в registry появляются реальные ноды с координатами, они автоматически попадают в runtime contract
