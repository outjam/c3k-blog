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
