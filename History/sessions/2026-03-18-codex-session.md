# Session Summary — 2026-03-18

## Формат записи

Это не сырой transcript чата, а структурированная запись сессии:

- запросы
- решения
- выполненные работы
- открытые вопросы

## Основные темы сессии

### 1. Product/UI cleanup

Обсуждались и последовательно реализовывались:

- минималистичный редизайн профиля
- перенос настроек в отдельный экран
- улучшение внешнего профиля
- переработка ленты и релизов
- упрощение интерфейса и отказ от лишних декоративных элементов

### 2. Artist model

Зафиксирована целевая модель:

- пользователь по умолчанию является listener
- артист появляется только через заявку и moderation
- studio должна быть dashboard + отдельная artist admin зона
- выплаты артисту должны идти через отдельный approve flow

### 3. TON / NFT

Принято решение двигаться в test-first модели:

- использовать `TON testnet`
- не тратить реальные средства без необходимости
- развивать mint, ownership и collector layer поэтапно

### 4. C3K Storage / TON Site

Сформировано и зафиксировано ТЗ по:

- `C3K Storage Node`
- `C3K TON Site`
- desktop клиенту на `Electron`
- объединению storage node и клиента открытия `c3k.ton`
- delivery купленных файлов через Telegram и web/desktop

## Что было реализовано в коде

### Storage groundwork

- storage types
- storage config flags
- storage registry store
- storage program routes
- storage program UI
- admin storage dashboard

### Delivery groundwork

- delivery state
- release/track delivery API
- Telegram/web delivery requests
- delivery history for user
- admin visibility for delivery requests

## Ключевые решения

### 1. Работаем test-first

На текущем этапе приоритет:

- бесплатная инфраструктура
- testnet
- low-cost development
- максимально безопасная обкатка логики

### 2. Backend пока не переписывается на Go

Зафиксировано понимание, что текущая серверная часть — это:

- `Next.js` BFF / monolith на `Node.js + TypeScript`
- `Supabase Postgres`
- server routes внутри `src/app/api`

Go рассматривается как хороший будущий язык для:

- workers
- storage ingest
- payout services
- blockchain-heavy backend pieces

но не как срочная цель для полного rewrite текущего продукта.

### 3. Delivery mapping строится через `resourceKey`

Принято решение отделить storage mapping от чисто внутренних `assetId` и использовать понятные resource keys:

- `release:{slug}:{format}`
- `track:{slug}:{trackId}:{format}`

## Что осталось открытым после сессии

- auto-sync storage assets из artist releases
- ingest pipeline
- Telegram delivery worker
- desktop client skeleton
- более глубокая нормализация backend-домена

## Следующий логичный шаг

Следующий practical slice:

- auto-sync storage assets из артист-релизов
- manual/admin backfill sync
- подготовка к ingest pipeline

## Дополнение по следующему спринту

В следующем sprint slice было реализовано:

- auto-sync storage assets из artist releases
- sync trigger после create/update artist release
- sync trigger после admin moderation релиза
- admin backfill route и кнопка в storage dashboard

Это закрыло ручную зависимость на первичный storage mapping и сдвинуло storage groundwork ближе к ingest pipeline.

## Дополнение по process layer

Внутри roadmap-документации появился отдельный sprint management слой:

- `production roadmap` оставлен стратегическим
- `project status checklist` оставлен продуктовым статусом по user stories
- добавлен отдельный `sprint board` как рабочий операционный документ для текущего, следующего и завершённых спринтов

## Дополнение по storage ingest

После auto-sync был реализован следующий storage slice:

- отдельный ingest state
- test-mode ingest jobs
- admin action для подготовки placeholder bags
- видимость ingest jobs в storage dashboard

Это закрыло следующий бесплатный/test-first шаг между `asset sync` и будущим real TON Storage runtime.

## Дополнение по Sprint 06

Следующим delivery slice было реализовано:

- retry/reopen flow для delivery requests
- user-facing retry на экране `C3K Storage`
- явная история последних delivery requests по текущему релизу
- повторный запуск выдачи прямо со страницы релиза

Это стало первым реальным шагом внутри `Sprint 06`, где delivery начал выглядеть как управляемый пользовательский процесс, а не как одноразовая кнопка.

Следующим шагом внутри того же спринта было реализовано:

- отдельный экран `Файлы`
- фильтруемая библиотека delivery requests
- summary file activity в основном профиле

Это закрыло пользовательский вход в post-purchase library и дало профилю видимость того, что после покупки у пользователя реально есть файловый слой.

Финальным deliverable `Sprint 06` стало:

- отделение Telegram delivery от request/response цикла
- отдельный worker route для Telegram delivery queue

После этого `Sprint 06` можно считать закрытым:
- retry есть
- release visibility есть
- downloads center есть
- profile file visibility есть
- Telegram delivery worker есть

## Дополнение по Sprint 07

Следующим sprint slice было реализовано:

- общий worker auth contract для queue/worker routes
- desktop runtime contract и `/api/desktop/runtime`
- user-facing экран `/storage/desktop`
- desktop handoff для `storagePointer` на экранах релиза, storage и downloads
- отдельный `desktop/` scaffold в основном репозитории

Это впервые перевело desktop/TON Site направление из чисто документационного состояния в реальный кодовой foundation layer.

## Дополнение по Sprint 08

Следующим sprint slice было реализовано:

- первые нормализованные Postgres-таблицы для artist finance
- normalized finance store с legacy fallback
- dual-write earnings из paid-order webhook
- чтение payout summary и payout requests через новый finance layer

Это стало первым реальным шагом по выносу бизнес-критичного контура из `app_state`, не ломая текущую test-first совместимость.

Следующим slice внутри того же спринта было реализовано:

- нормализованные Postgres-таблицы для:
  - release ownership
  - track ownership
  - minted NFT history
- merge-store для social entitlements с legacy fallback
- чтение merged ownership state через `getSocialUserSnapshot(...)`
- dual-write из purchase и mint mutation flows в новый normalized слой

Это стало вторым крупным шагом `Sprint 08`: consumer ownership и NFT state перестали жить только внутри `social_user_state_v1`, при этом текущий test-mode продукт не потребовал destructive cutover.

## Дополнение по browser auth

Отдельным fix/modernization slice было сделано:

- исследован новый официальный browser auth API Telegram
- подтверждён переход с legacy widget на новый `Log In with Telegram` / OIDC-based SDK
- обновлён browser login компонент
- обновлена серверная валидация на `id_token` + JWKS
- legacy browser widget verification оставлена как fallback

Это убирает зависимость browser-режима от deprecated Telegram widget flow и не затрагивает Mini App `initData` auth внутри Telegram.

## Дополнение по ownership backfill

Следующим slice в `Sprint 08` было сделано:

- чтение legacy social ownership state как migration source
- отдельный backfill helper для release ownership, track ownership и NFT mint history
- admin route для dry-run и реального backfill
- dashboard-trigger в админке для запуска backfill

Это перевело migration слой из purely server-side заготовки в реальный operational инструмент для тестовой среды.

## Дополнение по payout audit

Следующим slice в `Sprint 08` было сделано:

- добавлена нормализованная таблица `artist_payout_audit_log`
- payout request creation теперь пишет audit entry
- admin review/status update теперь пишет audit entry
- finance snapshot теперь читает payout audit trail через Postgres layer с legacy fallback
- payout audit trail выведен в:
  - `Студию` артиста
  - admin payout moderation

Это стало следующим шагом в сторону ledger-first finance модели: payout flow перестал быть только текущим snapshot статуса и получил историю изменений.
