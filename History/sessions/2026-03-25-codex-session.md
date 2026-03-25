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

## Следующий slice Sprint 13 — Downloads как post-purchase экран

### Что изменено

- На [src/app/downloads/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx):
  - hero теперь яснее показывает split по `runtime / desktop / telegram / web`
  - появился более сильный section `Post-purchase выдача`
  - карточки выдач получили:
    - обложки релизов
    - artist/context eyebrow
    - route summary
    - storage/archive hint по релизу
    - более понятный narrative-слой про текущий delivery path
- На [src/app/downloads/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.module.scss):
  - собран более выразительный hero
  - добавлены полноценные media-card layouts
  - появился более зрелый visual language для runtime/delivery карточек

### Что это даёт

- экран `Downloads` теперь лучше соответствует уже реализованному storage/delivery функционалу
- post-purchase путь стал последовательнее:
  - пользователь видит релиз как объект коллекции
  - понимает, через какой route идёт файл
  - видит, когда нужен retry и когда storage runtime уже реально использовался

## Следующий slice Sprint 13 — каталог и страница артиста под storage/archive

### Что изменено

- На [src/components/shop/shop-product-card.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/shop/shop-product-card.tsx):
  - карточки релизов теперь показывают storage label прямо на обложке
  - появился storage hint под title
  - появился archive/runtime fact в info chips
- На [src/app/shop/artist/[slug]/shop-artist-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/artist/%5Bslug%5D/shop-artist-page-client.tsx):
  - секция каталога получила summary по `storage-ready / archive in work / attention`
  - у каждой карточки релиза появился storage narrative block
- Под это обновлены:
  - [src/components/shop/shop-product-card.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/shop/shop-product-card.module.scss)
  - [src/app/shop/artist/[slug]/page.module.scss](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/artist/%5Bslug%5D/page.module.scss)

### Что это даёт

- storage/archive виден уже не только на detail-screen релиза
- пользователь быстрее понимает:
  - какой релиз уже в archive contour
  - где storage runtime уже ближе к ready
  - какие релизы артиста требуют внимания

## Следующий slice Sprint 13 — новая бизнес-логика upload / preview / storage-only delivery

### Что изменено

- Для артистов:
  - добавлен upload route [src/app/api/shop/artists/me/uploads/audio/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/uploads/audio/route.ts)
  - студия теперь использует file picker для master-файла и demo preview вместо ручного `audioFileId`: [src/app/studio/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx)
  - client helper добавлен в [src/lib/admin-api.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/admin-api.ts)
- Для preview:
  - preview теперь должен быть MP3
  - duration demo ограничен 30 секундами в artist route и player-layer
  - добавлен proxy route [src/app/api/media/telegram-preview/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/media/telegram-preview/route.ts)
  - обновлены [src/app/api/shop/artists/me/tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts), [src/lib/player-release-queue.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/player-release-queue.ts), [src/components/player/global-player-provider.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/components/player/global-player-provider.tsx)
- Для delivery:
  - runtime fetch получил `storageOnly` gate: [src/lib/server/storage-runtime-fetch.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-runtime-fetch.ts)
  - user delivery теперь больше не должна считаться готовой только по fallback/direct source: [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts), [src/app/api/storage/downloads/[id]/file/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/storage/downloads/%5Bid%5D/file/route.ts)
- Для user-facing экранов:
  - релиз теперь честнее говорит про demo preview и получение файла из storage-сети: [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/%5Bslug%5D/shop-product-page-client.tsx)
  - `Downloads` и `/storage` выровнены под storage-only desktop handoff: [src/app/downloads/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/downloads/page.tsx), [src/app/storage/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/page.tsx)
  - desktop client стал проще объяснять роль раздатчика: [src/app/storage/desktop/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/storage/desktop/page.tsx)

### Что это даёт

- теперь продукт ближе к целевой модели:
  - артист загружает файлы как файлы
  - пользователь слушает только demo preview
  - полный контент идёт только через storage/network contour
  - нода для раздатчика подаётся как простая программа с reward-preview, а не как техдемо

## Следующий slice Sprint 13 — per-track master files и track-aware storage delivery

### Что изменено

- Доменные типы релиза расширены под отдельные master-файлы треков:
  - `releaseTracklist` теперь несёт `audioFileId`, `audioFormat`, `audioFileName`
  - обновлены [src/types/shop.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/types/shop.ts), [src/lib/server/artist-catalog-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/artist-catalog-store.ts), [src/lib/server/shop-admin-config-store.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/shop-admin-config-store.ts), [src/app/api/shop/artists/me/tracks/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/shop/artists/me/tracks/route.ts)
- Студия теперь разводит:
  - `пакет полного релиза`
  - `master-файл трека`
  - `demo preview MP3`
  в [src/app/studio/page.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/studio/page.tsx)
- Storage sync теперь создаёт per-track assets:
  - добавлены `track` asset ids/resource keys в [src/lib/storage-resource-key.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/storage-resource-key.ts)
  - sync обновлён в [src/lib/server/storage-asset-sync.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-asset-sync.ts)
- Delivery отдельного трека теперь резолвит track-level master и format, а не пытается брать release-level файл:
  - [src/lib/server/storage-delivery.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-delivery.ts)
  - [src/app/shop/[slug]/shop-product-page-client.tsx](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/shop/%5Bslug%5D/shop-product-page-client.tsx)

### Что это даёт

- теперь отдельный трек — это действительно отдельный файл в бизнес-логике, а не только строка в треклисте
- full release и single-track delivery разведены заметно честнее
- storage registry начинает видеть и готовить реальные track assets под покупку одного трека

## Следующий slice Sprint 13 — publish-time storage automation

### Что изменено

- Добавлен automation helper [src/lib/server/storage-release-automation.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/server/storage-release-automation.ts)
- В [src/app/api/admin/artists/route.ts](/Users/culture3k/Documents/GitHub/c3k-blog/src/app/api/admin/artists/route.ts) publish moderation теперь после `published` автоматически:
  - запускает `syncStorageAssetsForArtistTrack(...)`
  - запускает ingest по upserted assets
  - в `tonstorage_testnet` пытается сразу выполнить upload cycle по этим же assets
  - возвращает `storageAutomation` summary

### Что это даёт

- исчезает главный ручной разрыв между `релиз опубликован` и `storage pipeline стартовал`
- сценарий становится ближе к целевому:
  - артист загрузил
  - админ опубликовал
  - storage runtime стартовал сам
  - покупатель приходит уже к более готовому storage contour
