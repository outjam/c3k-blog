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
