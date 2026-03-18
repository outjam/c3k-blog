# Техническое задание: C3K Storage Node

## 1. Название проекта

`C3K Storage Node`

## 2. Назначение

`C3K Storage Node` — это отдельный инфраструктурный слой экосистемы `C3K`, позволяющий:

- хранить аудио, NFT-ресурсы и архивные файлы релизов в `TON Storage`
- раздавать эти данные через сеть `TON Storage`
- подключать к хранению не только инфраструктуру владельца платформы, но и участников программы `C3K Storage`
- сформировать community-driven storage network вокруг музыкального продукта

## 3. Основание для реализации

Официальные материалы TON подтверждают:

- `storage-daemon` — это отдельная программа для загрузки и раздачи файлов в TON network
- данные в `TON Storage` распространяются в torrent-like модели через `ADNL`, `RLDP`, overlay network и `TON DHT`
- storage provider состоит из смарт-контракта и daemon-приложения
- provider обязан подавать storage proofs, чтобы получать оплату

Источники:

- [Storage daemon](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-daemon)
- [Storage provider](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-provider)
- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)

## 4. Проблема, которую решает система

Сейчас музыкальное приложение в стандартной web-архитектуре зависит от:

- централизованного файлового хранения
- CDN
- обычной web-раздачи

Для `C3K` этого недостаточно, потому что продукт строится вокруг:

- ownership
- collector identity
- TON
- устойчивого хранения оригинальных релизов

`C3K Storage Node` должен решить следующие задачи:

- снизить зависимость от единственного централизованного storage provider
- превратить хранение контента в часть продукта и экосистемы
- подготовить слой для хранения lossless и архивных музыкальных ассетов
- дать инфраструктурную базу под `TON Site`, NFT media и collector archives

## 5. Цели

### 5.1 Основные цели

- Реализовать production-ready слой интеграции `TON Storage` в `C3K`
- Реализовать собственные provider nodes `C3K`
- Реализовать отдельный node-client для участников программы `C3K Storage`
- Зафиксировать реализацию node-клиента как `Electron JS` desktop app
- Добавить registry и health-monitoring для storage assets и bags
- Добавить delivery fallback между web-storage и TON Storage
- Совместить storage node-клиент с локальным клиентом открытия `c3k.ton`
- Реализовать выдачу купленного файла через Telegram-бота из `TON Storage`

### 5.2 Продуктовые цели

- сделать хранение релизов частью ценности экосистемы
- дать пользователям роль инфраструктурных участников
- дать артистам более устойчивую среду хранения релизов
- усилить narrative “музыка принадлежит сцене и участникам, а не только платформе”

## 6. Не-цели

В первую версию не входит:

- замена основной транзакционной базы на TON Storage
- перенос social comments, follows, payouts и admin state в TON Storage
- запуск mobile-only node режима в Telegram Mini App
- browser-only реализация storage-node клиента без desktop runtime
- автоматические денежные награды storage-участникам
- peer-to-peer шифрованный private content exchange между пользователями

## 7. Пользовательские роли

### 7.1 Listener

Получает контент, который может храниться и доставляться из `TON Storage`, но сам node не запускает.

### 7.2 Collector Storage Member

Устанавливает `C3K Storage Node`, выделяет место на диске и участвует в хранении bags.

### 7.3 Artist

Публикует релизы, может включить архивирование в `C3K Storage`, хранение NFT assets и collector bundles.

### 7.4 Platform Operator

Управляет:

- провайдерами
- bags
- ingest-пайплайном
- node moderation
- fallback delivery

### 7.5 Moderator / Storage Ops

Следит за:

- состоянием bags
- доступностью node
- злоупотреблениями
- спорным контентом

## 8. Ключевые продуктовые сценарии

### 8.1 Публикация релиза в C3K Storage

1. Артист создает релиз в `C3K`.
2. Загружает:
   - релизные файлы
   - обложку
   - дополнительные архивные материалы
3. В студии включает флаг `Archive in C3K Storage`.
4. Backend помещает файлы во временное primary storage.
5. Worker создает bag.
6. Bag публикуется в `TON Storage`.
7. Bag ID и связанные метаданные сохраняются в registry.
8. UI показывает, что релиз архивирован в `C3K Storage`.

### 8.2 Участие пользователя в программе C3K Storage

1. Пользователь открывает экран `C3K Storage Program`.
2. Видит описание программы, системные требования и риски.
3. Скачивает `C3K Storage Node`.
4. Проходит login/device binding.
5. Привязывает TON wallet.
6. Выбирает:
   - размер диска
   - лимит сети
   - режим автозапуска
7. Node регистрируется в backend.
8. Backend назначает ноде bags на хранение.
9. Пользователь получает статус и награды внутри `C3K`.

### 8.3 Выдача релизного файла пользователю

1. Пользователь открывает релиз.
2. Backend проверяет entitlement.
3. Delivery layer определяет лучший источник:
   - web storage
   - CDN
   - TON Storage gateway
   - direct bag flow, если клиент поддерживает
4. Пользователь получает файл.

### 8.3.1 Выдача файла в Telegram через бота

1. Пользователь нажимает `Получить файл в Telegram`.
2. Backend проверяет:
   - entitlement на релиз или трек
   - формат покупки
   - доступность asset в `TON Storage`
3. Backend/worker находит соответствующий `bag` и файл внутри bag.
4. Файл извлекается из `TON Storage` через внутренний storage delivery layer.
5. Telegram-бот отправляет файл пользователю в личные сообщения.

### 8.3.2 Выдача файла в desktop/web

1. Пользователь нажимает `Скачать файл`.
2. Backend проверяет entitlement.
3. Delivery layer отдает файл:
   - либо напрямую на локальную машину пользователя
   - либо через signed download URL / stream
4. Файл сохраняется на локальное устройство пользователя.

### 8.4 Репликация и деградация

1. Health monitor видит падение реплик bag.
2. Система назначает новые ноды или активирует резервный provider.
3. Если TON Storage слой деградирован, выдача уходит на fallback storage.

## 9. Общая архитектура

## 9.1 Логическая схема

### Слой 1. Main App

- Next.js приложение
- Supabase/Postgres
- Telegram auth
- TON wallet / NFT

### Слой 2. Storage Registry

Новый backend-домен:

- registry assets
- bag metadata
- node registry
- replication health
- provider contracts

### Слой 3. C3K Providers

- owned provider nodes
- partner providers
- selected community nodes

### Слой 4. C3K Storage Node Client

Отдельное desktop-приложение на `Electron JS`, работающее поверх `storage-daemon`.

Это же приложение должно выступать локальным клиентом для открытия `c3k.ton`.

### Слой 5. Delivery Layer

Выбор источника контента по стратегии:

- primary web
- CDN
- TON Storage
- fallback mirror

### Слой 6. Telegram Bot Delivery Layer

- проверка entitlements
- выбор файла по release / track / format
- получение файла из `TON Storage`
- отправка файла пользователю в личные сообщения через Telegram-бота

## 9.2 Почему нужен отдельный desktop client

Согласно официальной документации TON, `storage-daemon` — это отдельное daemon-приложение с собственными сетевыми и аппаратными требованиями.

Официальные hardware requirements:

- `1 GHz dual-core CPU`
- `2 GB RAM`
- `2 GB SSD` плюс место под torrents
- `10 Mb/s` bandwidth и желательно статический IP

Источник:

- [Storage daemon](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-daemon)

Вывод:

- Telegram Mini App не может быть основным runtime для storage-node
- браузерный режим может существовать только как control plane, но не как реальная node-среда
- для первой целевой реализации node-клиента принимается стек `Electron JS + TypeScript`

## 10. Состав системы

## 10.1 Компонент A: Storage Registry Backend

Назначение:

- хранить метаданные storage assets
- хранить состояние bags
- знать, где и как выдается файл
- отслеживать node health

### Предлагаемые таблицы

#### `storage_assets`

- `id`
- `release_slug`
- `artist_telegram_user_id`
- `asset_type`
  - `audio_master`
  - `audio_preview`
  - `cover`
  - `booklet`
  - `nft_media`
  - `site_bundle`
- `format`
  - `mp3`
  - `wav`
  - `flac`
  - `zip`
  - `png`
  - `json`
  - `html_bundle`
- `source_url`
- `size_bytes`
- `checksum_sha256`
- `created_at`
- `updated_at`

#### `storage_bags`

- `id`
- `bag_id`
- `asset_id`
- `description`
- `tonstorage_uri`
- `meta_file_url`
- `status`
  - `draft`
  - `created`
  - `uploaded`
  - `replicating`
  - `healthy`
  - `degraded`
  - `disabled`
- `replicas_target`
- `replicas_actual`
- `created_at`
- `updated_at`

#### `storage_bag_files`

- `id`
- `bag_id`
- `path`
- `size_bytes`
- `priority`
- `mime_type`

#### `storage_nodes`

- `id`
- `user_telegram_id`
- `wallet_address`
- `node_label`
- `node_type`
  - `owned_provider`
  - `partner_provider`
  - `community_node`
- `platform`
  - `macos`
  - `windows`
  - `linux`
- `status`
  - `candidate`
  - `active`
  - `degraded`
  - `suspended`
- `disk_allocated_bytes`
- `disk_used_bytes`
- `bandwidth_limit_kbps`
- `last_seen_at`
- `created_at`

#### `storage_node_assignments`

- `id`
- `node_id`
- `bag_id`
- `assignment_status`
  - `pending`
  - `replicating`
  - `serving`
  - `failed`
- `assigned_at`
- `updated_at`

#### `storage_provider_contracts`

- `id`
- `provider_node_id`
- `provider_contract_address`
- `accepting_new_contracts`
- `min_bag_size_bytes`
- `max_bag_size_bytes`
- `rate_nano_ton_per_mb_day`
- `max_span_sec`
- `max_contracts`
- `max_total_size_bytes`
- `last_synced_at`

#### `storage_health_events`

- `id`
- `entity_type`
  - `node`
  - `bag`
  - `provider`
- `entity_id`
- `severity`
  - `info`
  - `warning`
  - `critical`
- `code`
- `message`
- `created_at`

## 10.2 Компонент B: Ingestion Worker

Назначение:

- подготавливать bags
- публиковать files в `TON Storage`
- сохранять bag metadata в registry

### Функции

- принять asset из upload queue
- сформировать folder structure
- вызвать `storage-daemon-cli create`
- получить `BagID`
- сохранить metadata file
- прикрепить bag к provider layer
- обновить статус asset и bag

### Важное требование

Весь ingest — только через async jobs.

Нельзя:

- создавать bag в рамках HTTP запроса пользователя
- держать upload request открытым до окончания публикации bag

## 10.3 Компонент C: Provider Manager

Назначение:

- управлять owned providers
- синхронизировать параметры provider contracts
- собирать balances и contract states

### Функции

- deploy/register provider
- sync provider params
- list provider contracts
- withdraw earnings
- close bad contracts
- detect overload

### Основание

Официальная provider-модель TON включает:

- main provider smart contract
- storage contracts per bag
- proof submission
- withdraw from contracts

Источник:

- [Storage provider](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-provider)

## 10.4 Компонент D: C3K Storage Node App

Назначение:

- дать пользователю удобную desktop-оболочку поверх `storage-daemon`
- дать `C3K` контролируемый desktop runtime для установки, управления и наблюдения за node

### Обязательное архитектурное решение

Клиент `C3K Storage Node` должен быть реализован как `Electron JS` приложение.

Это решение фиксируется как базовое для MVP и beta.

### Причины выбора Electron

- нужен desktop runtime с доступом к файловой системе
- нужен запуск и управление `storage-daemon` как локальным процессом
- нужен системный tray/background режим
- нужен автостарт и автообновление
- нужен единый кроссплатформенный стек для macOS, Windows и Linux
- нужен быстрый выпуск desktop-клиента силами web-команды

### Базовый стек desktop-клиента

- `Electron`
- `TypeScript`
- renderer UI на `React`
- secure `preload` bridge
- main process для:
  - lifecycle приложения
  - управления локальными процессами
  - работы с файловой системой
  - автообновления
  - логирования

### Процессная модель

#### Main process

Отвечает за:

- запуск окна приложения
- запуск и остановку `storage-daemon`
- запуск локального механизма открытия `c3k.ton`
- контроль child-process
- хранение локальной конфигурации
- обновление приложения
- системный tray
- background режим

#### Preload layer

Отвечает за:

- узкий и безопасный IPC bridge между renderer и main
- запрет прямого доступа renderer к Node.js API

#### Renderer process

Отвечает за:

- UI onboarding
- dashboard node
- настройки
- логи и диагностику
- отображение статуса bags и contribution
- встроенный экран открытия `c3k.ton`

#### Local daemon wrapper

Отдельный модуль внутри desktop-клиента должен:

- запускать `storage-daemon`
- проверять его доступность
- читать stdout/stderr
- уметь перезапускать daemon при ошибках
- собирать метрики состояния

#### Local TON Site gateway wrapper

Отдельный модуль внутри desktop-клиента должен:

- поднимать локальный gateway для открытия `c3k.ton`
- открывать `TON Site` внутри `Electron`
- не требовать стороннего TON browser
- не требовать ручного подключения к публичным proxy

### Платформы

- macOS
- Windows
- Linux

### Обязательные функции

- onboarding
- авторизация через `C3K`
- wallet binding
- установка и обновление `storage-daemon`
- управление локальным `storage-daemon` из `Electron main process`
- открытие `c3k.ton` внутри desktop-клиента
- настройка диска
- настройка bandwidth
- просмотр статуса node
- логирование
- pause / resume
- удаление node и graceful decommission
- tray mode
- автозапуск приложения после login
- автообновление desktop-клиента
- встроенный `TON Site`-режим

### Desktop-specific требования

- `renderer` не должен иметь прямой `nodeIntegration`
- все filesystem и process операции доступны только через `preload` / IPC
- приложение должно уметь работать в фоне без постоянно открытого окна
- приложение должно уметь восстанавливать node после system reboot
- конфигурация node должна храниться локально и переживать перезапуск

### Требования к локальной конфигурации

Локально должны храниться:

- `device_id`
- `node_id`
- `storage_path`
- `disk_limit_bytes`
- `bandwidth_limit_kbps`
- `wallet_binding_state`
- `autostart_enabled`
- `run_in_tray`
- `daemon_binary_version`
- `app_version`
- `ton_site_gateway_enabled`
- `last_opened_ton_site_url`

### IPC-контракты

Минимальный набор IPC-команд:

- `node:get-status`
- `node:start`
- `node:stop`
- `node:pause`
- `node:resume`
- `node:get-logs`
- `node:set-storage-path`
- `node:set-disk-limit`
- `node:set-bandwidth-limit`
- `node:bind-wallet`
- `node:check-daemon`
- `node:install-daemon`
- `node:update-daemon`
- `node:open-storage-folder`
- `ton-site:open-c3k`
- `ton-site:get-status`

### Пакетирование и дистрибуция

Нужно подготовить:

- signed build для macOS
- installer для Windows
- package для Linux

Приложение должно поддерживать:

- release channels:
  - `alpha`
  - `beta`
  - `stable`
- desktop auto-update
- rollback на предыдущий стабильный build при критическом сбое

### Интерфейсные экраны

#### Экран 1. Welcome

- описание программы
- требования
- риски
- ссылка на условия участия

#### Экран 2. Sign in

- login через device code или deep-link в `C3K`

#### Экран 3. Node setup

- выбор каталога хранения
- размер выделяемого места
- режим автозапуска
- лимит сети

#### Экран 4. Wallet binding

- привязка TON wallet

#### Экран 5. Node dashboard

- uptime
- bags count
- used disk
- current status
- rewards/perks status

#### Экран 6. Logs and diagnostics

- ошибки daemon
- connection status
- provider connectivity

#### Экран 7. Application settings

- автозапуск
- запуск в tray
- канал обновлений
- папка хранения
- экспорт diagnostics bundle

#### Экран 8. C3K TON Site

- кнопка `Открыть c3k.ton`
- статус локального gateway
- переход между `TON Site` и основным web

## 10.5 Компонент E: App Control Plane

Это web-часть внутри `C3K`:

- профиль storage-участника
- программа `C3K Storage`
- badges
- node status
- perks

## 11. Интеграция с существующим C3K

## 11.1 Изменения в Studio

В `Студии` артиста добавить:

- чекбокс `Архивировать релиз в C3K Storage`
- чекбокс `Хранить NFT assets в TON Storage`
- блок состояния storage:
  - uploaded
  - replicating
  - healthy
  - degraded

## 11.2 Изменения в Release Page

Добавить:

- статус `Stored in C3K Storage`
- индикатор доступности архива
- при необходимости кнопку `Скачать архив`
- кнопку `Получить файл в Telegram`
- кнопку `Скачать на устройство`

## 11.3 Изменения в Profile

Добавить:

- раздел `C3K Storage`
- статус участника программы
- badge
- число активных bags / contribution level

## 11.4 Изменения в Admin

Нужен новый storage dashboard:

- список bags
- список nodes
- provider status
- degraded assets
- stuck jobs
- bad actors

## 12. Функциональные требования

## 12.1 Asset lifecycle

Система должна:

- уметь регистрировать asset
- создавать для него bag
- публиковать bag в `TON Storage`
- хранить bag metadata
- отслеживать репликацию
- переводить bag в `healthy` / `degraded`

## 12.2 Node lifecycle

Система должна:

- регистрировать node
- валидировать device binding
- принимать heartbeat
- определять статус node
- назначать или отзывать assignments
- уметь отключать node
- уметь восстанавливать node после локального рестарта приложения
- уметь перезапускать `storage-daemon` при штатном recoverable failure

## 12.3 Delivery lifecycle

Система должна:

- хранить delivery policy
- выбирать источник файла по приоритету
- fallback на обычный storage при деградации

## 12.4 Telegram bot file delivery lifecycle

Система должна:

- принимать запрос пользователя на отправку купленного файла в личные сообщения
- проверять entitlement на релиз, трек и формат
- извлекать файл из `TON Storage`
- отправлять файл пользователю через Telegram-бота
- логировать факт выдачи файла

## 12.5 Desktop / web local download lifecycle

Система должна:

- выдавать купленный файл на локальную машину пользователя
- поддерживать download релиза и отдельного трека
- учитывать формат покупки
- fallback на резервный storage при недоступности `TON Storage`

## 12.4 Program lifecycle

Система должна:

- принимать заявку пользователя в программу
- активировать node после проверки
- начислять badges и perks
- уметь блокировать злоупотребляющие node

## 13. Нефункциональные требования

## 13.1 Надежность

- ни один релиз не должен стать недоступным только из-за падения `TON Storage`
- обязательно наличие primary fallback storage

## 13.2 Наблюдаемость

Нужно собирать:

- heartbeat lag
- number of healthy bags
- number of degraded bags
- storage usage
- replication deficit
- provider proof failures

## 13.3 Безопасность

- node auth через short-lived tokens
- wallet binding с верификацией
- rate limit на node registration и heartbeat
- signed assignments
- anti-abuse policy

## 13.4 Производительность

- registry API должен отдавать статус asset < `300 ms` при p95
- ingestion jobs не должны блокировать основной продуктовый трафик

## 13.5 Совместимость

- node app должен работать на macOS, Windows, Linux
- web UI должен быть control-plane only и не требовать локального storage runtime
- desktop runtime для node-клиента должен быть стандартизирован как `Electron JS`

## 13.6 Desktop security

- `contextIsolation = true`
- `nodeIntegration = false` в renderer
- все IPC channels должны быть whitelisted
- внешние ссылки должны открываться через системный браузер
- auto-update канал должен быть подписан и доверенный

## 14. API-контракты

## 14.1 Internal operator APIs

- `POST /api/storage/assets`
- `GET /api/storage/assets/:id`
- `POST /api/storage/bags/:id/rebuild`
- `POST /api/storage/bags/:id/disable`
- `GET /api/storage/providers`
- `POST /api/storage/providers/:id/sync`

## 14.2 Node APIs

- `POST /api/storage/nodes/register`
- `POST /api/storage/nodes/:id/heartbeat`
- `GET /api/storage/nodes/:id/assignments`
- `POST /api/storage/nodes/:id/assignments/:assignmentId/ack`
- `POST /api/storage/nodes/:id/metrics`

## 14.3 User APIs

- `GET /api/storage/program/me`
- `POST /api/storage/program/join`
- `GET /api/storage/program/download`

## 14.4 Artist APIs

- `POST /api/storage/releases/:slug/archive`
- `GET /api/storage/releases/:slug/status`

## 14.5 Delivery APIs

- `POST /api/storage/downloads/release`
- `POST /api/storage/downloads/track`
- `POST /api/storage/downloads/telegram`
- `GET /api/storage/downloads/:id/status`

## 15. Node assignment strategy

## 15.1 Базовое правило

Каждый bag должен иметь:

- минимум `N` owned/provider replicas
- плюс `M` community replicas

### Рекомендуемая стартовая конфигурация

- `2` owned replicas
- `0-2` partner/provider replicas
- `2-5` community replicas

## 15.2 Приоритеты

Выше всего реплицируются:

- NFT media
- full release archives
- lossless files
- active collector drops

Ниже:

- previews
- второстепенные system assets

## 16. Модель мотивации участников

На первом этапе мотивация неденежная:

- badge в профиле
- perks
- приоритетный доступ
- special drops
- reputation level

### Уровни

- `Storage Supporter`
- `Storage Keeper`
- `Storage Core`
- `Storage Guardian`

Денежная мотивация или reward pool допускается только после:

- появления антифрода
- reputation score
- устойчивого node health

## 17. Риски

## 17.1 Технические

- TON Storage tooling не должен быть единственной точкой доставки
- community nodes могут иметь плохой uptime
- desktop runtime support дорогой

## 17.2 Продуктовые

- пользователи могут не захотеть устанавливать отдельное приложение
- storage program может быть интересна только ядру сообщества

## 17.3 Операционные

- требуется support pipeline для node issues
- требуется moderation на вредоносные node

## 17.4 Правовые

- нужен policy layer на авторские права и takedown
- нельзя обещать “анонимность” как юридическую гарантию

## 18. Этапы реализации

## Этап 1. Internal Storage Layer

- registry
- ingest worker
- own provider
- admin dashboard
- archive selected assets

## Этап 2. Delivery Layer

- routing
- fallback delivery
- asset health scoring

## Этап 3. Artist-facing Storage

- studio integration
- release storage status

## Этап 4. Private Beta of Node App

- desktop node
- invite-only storage program

## Этап 5. Public Program

- badges
- program UI
- broader onboarding

## 19. Acceptance criteria

Система считается принятой, если:

- можно заархивировать релиз в `TON Storage`
- bag получает `bagID` и хранится в registry
- минимум один owned provider обслуживает bag
- при деградации bag продукт не теряет доступ к файлам
- пользователь может установить `Electron` desktop node и пройти onboarding
- node регулярно отправляет heartbeat
- админ видит nodes, bags и деградации
- артист видит статус хранения релиза в студии
- desktop-клиент умеет:
  - запускать `storage-daemon`
  - переживать перезапуск ОС
  - работать через tray
  - обновляться без ручной переустановки
- пользователь может открыть `c3k.ton` через собственный desktop-клиент `C3K`
- пользователь может запросить отправку купленного файла в личные сообщения Telegram-ботом
- desktop и web могут скачать купленный файл на локальное устройство

## 20. Open questions

- будет ли `C3K Storage Node` open-source или закрытым клиентом
- будет ли community program доступна всем или только invite-only
- будет ли desktop-клиент полностью отдельным репозиторием или mono-repo workspace
- будет ли reward layer на TON/Stars
- будет ли хранение previews тоже уходить в TON Storage
- какая точная политика takedown и emergency disable

## 21. Приоритет реализации

Если сжать до одного приоритета:

сначала строится `storage registry + own provider + fallback delivery`, и только потом `community node program`.
