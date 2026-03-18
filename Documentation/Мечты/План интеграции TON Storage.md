# План интеграции TON Storage для C3K

## 1. Цель

Сделать в `C3K` отдельный storage-слой на базе `TON Storage`, чтобы:

- хранить аудио и часть системных ресурсов не только на классическом web-хостинге
- получить более устойчивую модель дистрибуции файлов
- дать проекту реальный web3/storage narrative
- запустить программу `C3K Storage`, в которой пользователи выделяют место на своих устройствах и помогают хранить и раздавать данные

Главная идея:

`TON Storage` не должен заменять весь основной backend, но может стать отдельным распределенным слоем хранения и доставки контента.

## 2. Что важно понять сразу

### TON Storage не равно “просто S3 в блокчейне”

По официальной документации TON:

- TON Storage использует torrent-like модель
- данные передаются по `ADNL` и `RLDP`
- каждый bag распространяется через свою overlay network
- peer discovery идет через `TON DHT`

Источник:

- [Storage daemon](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-daemon)

### Storage provider в TON — это не абстракция, а реальный сервис

Официально storage provider состоит из:

- смарт-контракта
- daemon-приложения, которое хранит и раздает файлы

Provider:

- принимает storage request
- активирует storage contract
- регулярно отправляет storage proofs
- получает оплату из client balance storage-контракта

Источник:

- [Storage provider](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-provider)

### Telegram Mini App сам по себе не может быть storage node

Это критический продуктовый вывод.

Mini App в Telegram и обычный браузер не подходят как среда, в которой пользователь просто “по нажатию кнопки” начинает полноценно сидировать bags.

Причины:

- `storage-daemon` — это отдельный daemon, а не браузерный API
- для daemon официально ожидаются:
  - минимум `2 GB RAM`
  - SSD
  - `10 Mb/s` bandwidth
  - лучше статический IP

Источник:

- [Storage daemon](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-daemon)

Итог:

- для программы `C3K Storage` нужен не только Mini App
- нужен отдельный native helper:
  - desktop app
  - или отдельный node-client

## 3. Что я рекомендую хранить в TON Storage

Не все данные проекта подходят для TON Storage одинаково хорошо.

## Приоритет 1. Релизные аудиофайлы

Подходит:

- full release packages
- lossless файлы
- редкие версии
- бонусные материалы

Почему:

- это тяжелые файлы
- они естественно подходят под bag-модель
- это основной ценностный контент проекта

## Приоритет 2. Обложки, буклеты, архивные ассеты релиза

Подходит:

- cover images
- digital booklets
- artwork packs
- дополнительные pdf/zip assets

## Приоритет 3. NFT metadata assets

Особенно хорошо подходит для:

- изображений NFT
- статических metadata bundles
- immutable релизных коллекций

Официально TON docs отдельно описывают миграцию NFT content в `tonstorage://<BagID>/`.

Источник:

- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)

## Приоритет 4. Статический TON Site или collector-landing

Можно хранить:

- статический TON Site
- collector landing
- архив сезонных дропов

Официально это поддерживается через bag + DNS record `site`.

Источник:

- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)
- [How to run TON Sites](https://docs.ton.org/v3/guidelines/web3/ton-proxy-sites/how-to-run-ton-site)

## Что не стоит хранить в TON Storage как primary source

- transactional database
- social comments
- live counters
- session data
- payout ledger
- admin config

То есть:

`TON Storage = слой контента и distribution, но не оперативная база приложения`.

## 4. Целевая архитектура для C3K

Я бы строил hybrid-модель.

## Layer A. Primary operational backend

Остается обычный backend:

- Next.js
- Supabase/Postgres
- TON integration
- Telegram flows

Этот слой отвечает за:

- auth
- права доступа
- покупки
- entitlements
- payouts
- social
- admin

## Layer B. C3K Content Registry

Новый логический слой в твоей БД:

- `storage_assets`
- `storage_bags`
- `storage_variants`
- `storage_replication_jobs`
- `storage_nodes`
- `storage_provider_contracts`

Этот слой будет знать:

- какой release asset лежит в каком bag
- какой формат к какому bag относится
- какой bag доступен через web gateway
- какой bag лежит в TON Storage и сколько у него replicas/provider contracts

## Layer C. C3K Storage Providers

Это уже инфраструктурный слой:

- твои собственные provider nodes
- доверенные partner nodes
- пользовательские nodes из программы `C3K Storage`

## Layer D. Delivery layer

На выдаче клиенту ты решаешь, откуда грузить файл:

- web CDN
- primary object storage
- TON Storage gateway
- direct TON Storage path, если пользователь умеет им пользоваться

То есть сначала нужен `smart delivery fallback`, а не жесткий перенос всего на один механизм.

## 5. Модель программы C3K Storage

Ниже то, как я бы реально это строил.

## Роль пользователя в программе

Пользователь вступает в `C3K Storage Program` и получает роль:

- community node
- collector node
- artist node

### Что он делает

- устанавливает `C3K Storage Node`
- выделяет лимит места, например:
  - `10 GB`
  - `50 GB`
  - `200 GB`
- разрешает использовать интернет-канал для сидирования
- подключает TON wallet

### Что получает

- статус в профиле
- награды
- collector badge
- доступ к special drops
- возможно, скидки или NFT perks
- в будущем — токенизированные или Stars-награды, если экономика сойдется

## Мой важный вывод

На старте я бы не платил пользователям реальные деньги за storage.

Я бы делал мотивацию через:

- статус
- perks
- награды
- доступ

Почему:

- иначе ты резко усложняешь антифрод
- поднимаешь юрнагрузку
- получаешь не фанатов, а opportunistic node-farmers

## 6. Что нужно разработать технически

## A. Asset manifest layer

Каждый релиз должен уметь ссылаться не только на URL, но и на storage-идентификаторы:

- `bagId`
- `bagHash`
- `tonstorage://` URI
- список файлов внутри bag
- размер bag
- статус репликации

### Предлагаемая сущность

`storage_assets`

Поля:

- `id`
- `release_slug`
- `asset_type`
  - `audio_master`
  - `audio_preview`
  - `cover`
  - `booklet`
  - `nft_media`
  - `static_site`
- `format`
- `source_url`
- `bag_id`
- `tonstorage_uri`
- `size_bytes`
- `status`
  - `draft`
  - `uploaded`
  - `replicating`
  - `healthy`
  - `degraded`
- `created_at`
- `updated_at`

## B. Ingestion pipeline

### Flow

1. Артист загружает файл в текущую систему.
2. Backend валидирует файл.
3. Файл кладется во временное primary storage.
4. Отдельный worker:
   - собирает bag
   - публикует его в TON Storage
   - сохраняет `bagId`
   - начинает replication monitoring

Это важно:

`TON Storage ingestion должен быть асинхронным job flow, а не частью синхронного HTTP upload запроса`.

## C. Provider management

Тебе нужен внутренний модуль управления provider nodes:

- список provider contracts
- состояние daemon
- total size
- max contracts
- acceptance on/off
- rate
- balances
- proof health

Официальные параметры provider подтверждены в docs:

- `accept`
- `min/max file size`
- `rate`
- `max span`
- `max contracts`
- `max total size`

Источник:

- [Storage provider](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-provider)

## D. Node program for users

Нужен отдельный продукт:

- `C3K Storage Node`

Минимально это desktop helper для:

- macOS
- Windows
- Linux

Функции:

- установка и обновление `storage-daemon`
- авторизация через C3K account
- привязка TON wallet
- выбор объема диска
- сетевые лимиты
- подключение к storage program
- health reporting в C3K backend

## E. Health and reputation layer

Нельзя просто считать, что пользователь выделил место и все работает.

Нужен node score:

- uptime
- proof freshness
- bandwidth quality
- storage actually allocated
- number of bags served

И статусы:

- `candidate`
- `active`
- `degraded`
- `suspended`

## 7. Как встроить это в твой продукт

## Первый пользовательский сценарий

### Для слушателя

- на странице релиза есть marker:
  - `Хранится в C3K Storage`
- в профиле есть раздел:
  - `C3K Storage`
- пользователь может вступить в программу

### Для коллекционера

- за хранение редких дропов он получает collector perks

### Для артиста

- артист может включить:
  - `Архивировать релиз в C3K Storage`
  - `Держать NFT assets в TON Storage`

## 8. Продуктовые ограничения и риски

## Ограничение 1. Мобильный Telegram не станет полноценной storage-node средой

Это нужно принять сразу.

То есть сценарий:

- “нажал кнопку в Mini App”
- “телефон начал хранить bags в фоне”

в реальности очень слабый.

Практический вывод:

- программу `C3K Storage` лучше запускать как desktop-first

## Ограничение 2. Сидирование не должно мешать UX пользователя

Нужно дать:

- лимиты по диску
- лимиты по сети
- pause/resume
- ночной режим

## Ограничение 3. Нельзя класть в TON Storage всё подряд без правовой модели

Если проект хранит оригинальный контент, нужно отдельно продумать:

- кто имеет право загружать
- кто отвечает за нарушения
- как обрабатывается takedown
- как отключается bag из активной выдачи продукта

Это не юридическая консультация, а архитектурное предупреждение.

## Ограничение 4. Нужен fallback

Даже если bag опубликован в TON Storage, у продукта должен оставаться fallback:

- web object storage
- CDN
- internal mirror

Особенно на раннем этапе.

## 9. Предлагаемый phased plan

## Phase 1. Read-only archival integration

### Цель

Научиться публиковать часть контента в TON Storage без пользовательских нод.

### Что делаем

- выбрать типы файлов:
  - full release packages
  - NFT media
  - collector assets
- поднять один свой provider
- сделать internal worker для bag creation
- хранить `bagId` в БД
- сделать internal admin screen:
  - upload
  - replicate
  - health

### Результат

- у тебя появляется первый реальный TON Storage слой
- без риска и без зависимости от community nodes

## Phase 2. Delivery and fallback

### Что делаем

- web gateway для bags
- fallback на обычное хранилище
- правила выдачи:
  - сначала normal web
  - потом TON Storage mirror
  - или наоборот, если bag healthy

### Результат

- можно использовать TON Storage в production без слепой зависимости от него

## Phase 3. Artist-facing storage option

### Что делаем

- в studio добавляем опцию:
  - `Архивировать релиз в C3K Storage`
  - `Хранить NFT assets в TON Storage`
- на release screen показываем:
  - `Stored in C3K Storage`

### Результат

- storage становится частью продуктовой ценности

## Phase 4. Private beta of C3K Storage Program

### Что делаем

- запускаем desktop helper
- зовем 20-50 trusted users
- даем им badges и perks
- собираем uptime and node health

### Результат

- проверяем, работает ли вообще community-node модель

## Phase 5. Public C3K Storage Program

### Что делаем

- запускаем onboarding
- добавляем storage badges
- делаем leaderboard или reputation
- связываем со special drops

### Важно

На этом этапе лучше использовать мотивацию:

- статус
- награды
- доступ

а не денежные rewards.

## Phase 6. Economic layer, только если beta реально удалась

### Что можно добавить потом

- priority access за storage contribution
- fee discounts
- special NFT
- возможно, TON-based reward pool

Но только если:

- есть anti-fraud
- есть node scoring
- есть реальное sustained usage

## 10. Что я бы рекомендовал реализовать в кодовой базе C3K

## Новый backend модуль

- `storage-registry`
- `storage-provider-manager`
- `storage-health-monitor`
- `storage-ingestion-worker`

## Новые API

- `POST /api/storage/assets`
- `POST /api/storage/bags/replicate`
- `GET /api/storage/assets/[id]`
- `GET /api/storage/health`
- `POST /api/storage/nodes/join`
- `POST /api/storage/nodes/heartbeat`

## Новые экраны

- admin storage dashboard
- studio storage section
- profile section `C3K Storage`

## Новые сущности

- `storage_assets`
- `storage_nodes`
- `storage_node_sessions`
- `storage_bag_health`
- `storage_program_memberships`

## 11. Моя рекомендованная бизнес-модель для C3K Storage

Я бы делал storage не как самостоятельный бизнес сначала, а как:

- infra moat
- collector program
- brand differentiation

### Прямая monetization позже

Потом можно думать о:

- premium archival storage for artists
- paid immortal releases
- paid collector vaults
- paid TON-native hosting for special drops

То есть сначала:

`storage as differentiation`

потом:

`storage as premium service`

## 12. Мой прямой вывод

Идея хорошая, но в правильной форме.

Не так:

- “любой пользователь телефона в Telegram станет storage node”

А так:

- `C3K` строит собственный TON Storage слой
- потом запускает desktop-first программу community nodes
- использует это для хранения релизов, NFT assets и архивов
- превращает участие в storage program в статус, доступ и инфраструктурный вклад в экосистему

Если коротко:

`TON Storage для C3K имеет смысл как архивно-дистрибуционный слой и community program, но не как замена основного backend и не как чисто браузерная функция.`

## 13. Источники

- [Storage daemon](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-daemon)
- [Storage provider](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-provider)
- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)
- [How to run TON Sites](https://docs.ton.org/v3/guidelines/web3/ton-proxy-sites/how-to-run-ton-site)

Выводы про продуктовую модель `C3K Storage Program`, phased rollout и мотивацию пользователей выше являются моей инженерной и продуктовой интерпретацией этих официальных возможностей.
