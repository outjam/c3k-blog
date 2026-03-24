# Session Summary — 2026-03-25

## Основная тема

Продолжение `Sprint 11 — Desktop node runtime and storage program prep` с фокусом на том, чтобы локальная нода уже не только жила на устройстве, но и могла сама становиться публичной точкой будущей storage-сети.

## Что было сделано

### Desktop storage program self-service

- На desktop-экране уже был показан membership и привязка локальной ноды к аккаунту.
- Теперь поверх этого добавлен ещё и self-service профиль самой ноды:
  - [src/app/api/storage/program/nodes/[id]/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/program/nodes/%5Bid%5D/route.ts)
  - [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
  - [src/app/storage/desktop/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.tsx)
  - [src/app/storage/desktop/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.module.scss)

### Что теперь умеет пользователь

- войти в desktop через Telegram
- вступить в `C3K Storage Program`
- привязать именно эту локальную desktop-ноду к своему аккаунту
- задать для неё:
  - публичное имя
  - город
  - код страны
  - координаты

### Почему это важно

- storage node теперь становится не просто локальным daemon/runtime на устройстве
- она начинает превращаться в реальную публичную точку будущей storage-сети
- карта нод получает путь от preview к настоящим user-owned точкам без ручной админки

## Итог

- `Sprint 11` продвинут до следующего практического шага: user-owned desktop node profile
- следующий логичный ход: показывать такие пользовательские ноды на карте уже не как fallback-preview, а как живые public points из registry

## Дополнительный срез

### Карта нод теперь уважает локальную registry-ноду

- В [src/lib/server/desktop-runtime.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/desktop-runtime.ts) локальная точка карты теперь строится из реальной storage-ноды пользователя, если у неё уже есть координаты.
- Это убирает старый перекос, где local node могла:
  - получать координаты первой чужой точки
  - или дублироваться рядом с `publicNodes`
- Теперь сохранённый desktop node profile влияет на карту уже не формально, а реально.

### User-facing сеть вышла за пределы desktop

- В [src/lib/server/storage-registry-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts) `StorageProgramSnapshot` теперь включает реальные `nodes` участника и `publicNodes`.
- На [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx) появились новые блоки:
  - `Мои ноды в сети`
  - `Публичные точки сети`
- Это важно, потому что storage-сеть теперь начинает быть видимой не только в desktop runtime, но и в обычном user-facing продукте.

### User-facing summary сети

- `StorageProgramSnapshot` расширен ещё и `networkSummary`.
- Теперь `/storage` показывает:
  - сколько публичных нод уже активно
  - сколько из них degraded
  - соотношение community/provider точек
  - в каких странах и городах сеть уже появилась

### User-facing peer-map

- `StorageProgramNodeSummary` теперь несёт координаты map-ready нод.
- На `/storage` добавлена живая карта сети через `MapLibre`.
- Она показывает:
  - мои ноды
  - публичные peers
  - их статус и роль прямо на карте и в легенде

### Public node page

- Добавлена отдельная public page для storage-ноды на `/storage/nodes/[id]`.
- Теперь пользователь может открыть конкретную ноду как самостоятельную сущность сети, а не только видеть её в списке или на карте.
- Страница показывает:
  - профиль ноды
  - последние health-сигналы
  - соседние публичные peers

### Reliability layer

- В `StorageProgramNodeSummary` добавлен readiness/reliability слой.
- Теперь `/storage` и public node pages показывают:
  - reliability score
  - stable/warming/attention label
  - recent warning/critical counts
- Этим `Sprint 11` закрыт как не только desktop-runtime sprint, но и как первый user-facing network surface sprint.

### Launcher stale-runtime recovery

- `scripts/desktop-node-launcher.mjs` теперь автоматически поднимает свежий local runtime, даже если на `3000` уже висит stale `next-server` из этого же проекта.
- Это убирает ручной шаг с остановкой старого процесса и делает `npm run desktop:node` ближе к настоящему one-click запуску.

## Дополнительный итог — Sprint 12

### Storage network перестала быть просто набором точек

- `StorageProgramSnapshot` и public node snapshot расширены network-level слоем:
  - average reliability
  - average reward
  - weekly `C3K Credit` preview
  - stale heartbeat pressure
  - peer assignment preview
- Это собрано в:
  - [src/types/storage.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/storage.ts)
  - [src/lib/server/storage-registry-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts)

### Что теперь видит пользователь на `/storage`

- На [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx):
  - peer-map теперь показывает линии peer-links между нодами
  - появился network health summary
  - появился network reward preview
  - появился блок `Peer assignments и swarm contour`
- Карточки user/public нод теперь показывают:
  - reward score
  - weekly preview
  - число peer links

### Что теперь видно на public node page

- На [src/app/storage/nodes/[id]/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/nodes/%5Bid%5D/page.tsx) public page теперь показывает:
  - reward label и weekly reward preview
  - peer-links этой ноды
  - network health context вокруг неё

### Итог по спринту

- `Sprint 12 — Storage Network Reliability and Reward Layer` закрыт полностью
- storage-сеть теперь показывает:
  - надёжность сети как целого
  - reward-layer на уровне сети
  - первые swarm-ready связи между peer-точками
- следующий этап уже не про “видимость сети”, а про automation и реальный archive/runtime слой для контента

## Следующий этап — старт Sprint 13

### Artist-facing storage/archive status

- Добавлен [src/lib/server/storage-archive-summary.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-archive-summary.ts), который собирает release-level storage summary из:
  - assets
  - bags
  - bag files
  - ingest jobs
  - runtime verification state
- В [src/types/shop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/shop.ts) у `ArtistTrack` и `ShopProduct` появился `storageSummary`
- В [src/lib/server/storage-asset-sync.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-asset-sync.ts) auto-managed assets теперь сохраняют ещё и `trackId`

### Где это теперь видно

- В [src/app/api/shop/artists/me/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/route.ts) studio tracks теперь приходят уже со storage summary
- В [src/app/studio/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx) студия теперь показывает:
  - verified/archived counts
  - releases requiring attention
  - storage label у каждого релиза
- В [src/lib/server/shop-catalog.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-catalog.ts) и [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/%5Bslug%5D/shop-product-page-client.tsx) archive/storage context появился на самой релизной странице
- В [src/app/api/shop/artists/[slug]/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/%5Bslug%5D/route.ts) и [src/app/shop/artist/[slug]/shop-artist-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/artist/%5Bslug%5D/shop-artist-page-client.tsx) storage label появился и на карточках релизов артиста

### Зачем это важно

- storage перестал быть только backend/admin слоем
- артист теперь видит, попал ли релиз в storage, дошёл ли он до bags и runtime verification и требует ли релиз ручного внимания
- этим `Sprint 13` действительно начался как sprint automation/archive visibility, а не как ещё один чисто инфраструктурный проход

## Следующий slice Sprint 13 — live runtime на user-facing `/storage`

### Что изменено

- В [src/types/storage.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/storage.ts) появился `StorageProgramRuntimeSummary`
- В [src/lib/server/storage-registry-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-registry-store.ts) storage program snapshot теперь собирает live runtime summary из:
  - assets
  - bags
  - ingest jobs
  - delivery requests пользователя
  - runtime/bag health events
- На [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx):
  - hero переведён с preview-copy на живые counts
  - добавлен section `Storage runtime прямо сейчас`
  - показаны последние runtime signals
  - верхний `/storage` теперь говорит языком текущего runtime, а не только будущей ноды

### Что это даёт

- пользователь уже видит не только идею storage-программы, а реальное состояние pipeline:
  - сколько файлов готовы
  - сколько bags verified
  - что в очереди upload
  - как идут его выдачи

## Следующий slice Sprint 13 — profile/release UI под новые storage-фичи

### Что изменено

- На [src/app/profile/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.tsx) коллекция теперь показывает:
  - storage status
  - delivery status
  - runtime route последних выдач
  - summary по full releases / NFT / ready files / storage-ready релизам
- На [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/%5Bslug%5D/shop-product-page-client.tsx):
  - hero и release context выровнены под текущую product-логику
  - delivery/runtime summary вынесен в верхний слой
  - storage/archive и NFT читаются спокойнее и связнее
  - tracklist теперь показывает delivery state купленных треков

### Что это даёт

- user-facing экраны профиля и релиза теперь лучше соответствуют уже реализованным storage/delivery возможностям
- путь `купил -> получил файл -> storage/archive -> NFT` стал заметно понятнее без захода в админку или downloads screen

## Дополнительный UI-pass

- [src/app/profile/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/profile/page.module.scss) усилен как collector dashboard
- [src/app/shop/[slug]/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/%5Bslug%5D/page.module.scss) собран в более спокойную product hierarchy
- визуальный слой теперь лучше соответствует уже реализованной storage/delivery/NFT логике
