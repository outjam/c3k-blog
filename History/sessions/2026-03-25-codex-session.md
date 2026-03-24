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
