# Production Roadmap to 1M Users

## Цель

Подготовить приложение к реальному production с:

- понятной доменной моделью
- устойчивой платежной логикой
- рабочей artist economy
- надежной TON/NFT интеграцией
- отдельным TON Storage слоем для контента и архивов
- TON-native поверхностью проекта через `TON Site`
- масштабируемой архитектурой

## Связанные ТЗ

- [`ТЗ C3K Storage Node`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/Мечты/ТЗ%20C3K%20Storage%20Node.md)
- [`ТЗ C3K TON Site`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/Мечты/ТЗ%20C3K%20TON%20Site.md)
- [`Sprint Board`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/sprint-board.md)
- [`Project Status Checklist`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/project-status-checklist.md)

## Текущий статус реализации

Уже начат практический groundwork для `Phase 5`:

- поднят storage registry
- поднята storage program membership flow
- поднят storage admin dashboard
- добавлен первый delivery layer для:
  - полного релиза
  - отдельного трека
  - web download
  - Telegram delivery request
- release UI уже подключён к delivery API

Операционная декомпозиция по спринтам теперь ведётся отдельно в [`sprint-board.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/sprint-board.md), чтобы этот файл оставался именно стратегическим.

Это ещё не production-ready `TON Storage`, но уже production-shaped контур, который можно последовательно доводить до:

- ingest pipeline
- bag automation
- Telegram worker delivery
- desktop storage client

## Phase 0. Product Alignment

Сначала нужно окончательно зафиксировать модель продукта.

### Решения, которые должны быть приняты письменно

- что такое `user profile`
- что такое `artist profile`
- что такое `artist page`
- что такое `collection`
- какие релизы mintable, а какие нет
- какой exact hold period на payout
- остается ли cart как основной путь покупки

### Deliverables

- обновленная product spec
- финальная карта экранов
- финальная карта сущностей
- event taxonomy для аналитики

## Phase 1. Domain Model Hardening

### Цель

Убрать главный архитектурный риск: бизнес-критичные сущности не должны жить главным образом в `app_state`.

### Что сделать

- выделить таблицы:
  - `artist_applications`
  - `artist_profiles`
  - `artist_releases`
  - `artist_release_formats`
  - `artist_release_tracks`
  - `user_entitlements`
  - `minted_release_nfts`
  - `artist_earnings_ledger`
  - `artist_payout_requests`
- отделить `release` от generic `product`
- ввести formal entitlement model:
  - track ownership
  - release-format ownership
  - nft ownership marker

### Результат

- бизнес-логика становится наблюдаемой
- проще писать аналитику
- проще дебажить платежи и конфликты

## Phase 2. Payment and Finance Safety

### Цель

Сделать денежный контур безопасным и сверяемым.

### Что сделать

- ввести ledger-first модель для начислений
- разделить:
  - `gross earned`
  - `pending hold`
  - `available`
  - `requested`
  - `paid`
- добавить finance audit log
- добавить export для сверки
- закрепить payout policy
- закрепить refund handling policy
- внедрить cron/worker для release hold window processing

### Результат

- можно безопасно управлять выплатами артистам
- можно подключать finance ops

## Phase 3. Artist Platform Maturity

### Цель

Сделать студию не формой, а полноценным кабинетом артиста.

### Что сделать

- dashboard с real analytics
- release lifecycle:
  - draft
  - pending moderation
  - published
  - rejected
- редактор релиза
- редактор треков и форматов
- release scheduling
- moderation comments
- support inbox для артиста

### KPI результата

- артист может полностью работать с контентом без ручного вмешательства разработчика

## Phase 4. TON / NFT Productionization

### Цель

Перевести blockchain слой из working prototype в production subsystem.

### Что сделать

- разделить testnet/mainnet инфраструктуру
- formalize collection management
- formalize metadata versioning
- хранить on-chain events и mint history в нормализованной таблице
- ввести retry-safe mint jobs
- сделать admin view для mint incidents
- добавить NFT verification layer в UI
- внедрить utility roadmap:
  - collector tiers
  - perks
  - gated drops

### Результат

- NFT становится не декоративным бонусом, а реальным collector asset

## Phase 5. TON Storage and TON Site

### Цель

Добавить в `C3K` TON-native слой хранения и TON-native web-поверхность, не ломая основной consumer flow.

### Что сделать

- поднять `storage registry` и `bag registry`
- поднять минимум один owned `TON Storage provider`
- сделать ingestion pipeline для:
  - релизных архивов
  - lossless audio
  - NFT media
  - collector assets
- сделать delivery fallback между:
  - web storage
  - CDN
  - `TON Storage`
- добавить artist-facing флаги:
  - archive in `C3K Storage`
  - store NFT assets in `TON Storage`
- сделать `C3K Storage Node` desktop beta:
  - macOS
  - Windows
  - Linux
- совместить `C3K Storage Node` и локальный клиент открытия `c3k.ton`
- встроить local gateway для `TON Site` в desktop-клиент
- реализовать программу `C3K Storage`
  - node registration
  - node health
  - badges
  - invite-only onboarding
- реализовать delivery layer для купленных файлов:
  - отправка в личные сообщения через Telegram-бота
  - скачивание на локальную машину в web/desktop
- зарегистрировать `.ton` домен проекта
- собрать и публиковать branded static `C3K TON Site`
- добавить publish / rollback flow для `TON Site`
- связать `TON Site` с:
  - Mini App
  - обычным web
  - storage program
  - collector campaigns

### Результат

- контент проекта получает распределенный storage-слой
- `C3K` получает TON-native брендовый и резервный surface
- появляется основа для community storage program

### Важная оговорка

Эта фаза не должна идти раньше, чем:

- нормализована доменная модель
- стабилизированы выплаты
- production-safe NFT слой уже работает

## Phase 6. Scale Readiness

### Цель

Подготовиться к большой аудитории и операционной нагрузке.

### Что сделать

- pagination на всех больших списках
- cursor-based feeds
- отдельные background jobs
- media CDN strategy
- image/audio optimization
- caching strategy
- read replicas или managed scaling plan
- aggressive rate limiting and abuse prevention
- queue for notifications and heavy tasks
- error monitoring
- distributed tracing
- SLO/SLA definitions

### Обязательно

- no critical business flow should depend on client-only storage
- no financial flow should depend on mutable JSON blob as the only source of truth

### Дополнительно для storage layer

- `TON Storage` не должен быть единственной точкой доставки критичных ассетов
- community nodes не должны быть единственной опорой storage-доступности

## Phase 7. Internationalization and UX Consistency

### Цель

Довести продукт до уровня системного consumer experience.

### Что сделать

- полный словарь для `ru`, `en`, `kk`
- убрать hardcoded строки
- централизовать formatters
- систематизировать design tokens
- зафиксировать единый акцентный цвет и status palette
- унифицировать skeleton states
- унифицировать back navigation patterns

## Phase 8. Security and Compliance

### Цель

Закрыть риски перед большим ростом.

### Что сделать

- аудит admin permissions
- audit log действий админов
- secret rotation policy
- webhook signature verification policy
- fraud rules on top-ups and payouts
- data retention policy
- privacy policy and legal docs
- incident response runbooks
- takedown policy для storage assets
- abuse policy для community storage nodes

## Phase 9. Launch Operations

### Что должно быть готово перед массовым запуском

- production env matrix
- migration playbook
- rollback plan
- support playbook
- content moderation playbook
- payout ops playbook
- TON incident playbook
- storage ops playbook
- TON Site publish playbook
- KPI dashboard

## Минимальный реалистичный порядок работ

1. Зафиксировать продуктовую модель и identity model.
2. Нормализовать artist, release, entitlement и payout сущности.
3. Довести studio, release purchase logic и payout logic.
4. Привести NFT слой к production-safe схеме.
5. Поднять storage registry, owned provider и branded `TON Site`.
6. Запустить private beta `C3K Storage Node`.
7. Довести аналитику, модерацию, очереди и операционные процессы.
8. Затем масштабировать acquisition.

## Что точно не стоит делать раньше времени

- запускать сложную токеномику
- обещать инвестиционную ценность NFT
- строить mainnet growth на сыром payout accounting
- масштабировать artist acquisition без moderation tooling
- запускать public `C3K Storage Program` до появления health scoring и abuse controls
- делать `TON Site` главным surface раньше, чем Mini App и обычный web стабилизированы

## Definition of Ready for Real Production

Приложение можно считать готовым к real production только когда:

- user profile и artist profile окончательно разведены
- purchase entitlements нормализованы
- payout ledger сверяем и прозрачен
- TON mint безопасен и наблюдаем
- если в scope включен `TON Storage`, то storage registry и fallback delivery уже production-safe
- если в scope включен `TON Site`, то publish / rollback и DNS-операции документированы
- критические flows покрыты idempotency и monitoring
- UI не прыгает и не показывает моковые промежуточные состояния
- админка покрывает модерацию и finance ops
