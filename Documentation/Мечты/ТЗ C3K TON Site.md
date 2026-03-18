# Техническое задание: C3K как TON Site

## 1. Название проекта

`C3K TON Site`

## 2. Назначение

Создать отдельную TON-native web-поверхность проекта `C3K`, доступную как `TON Site`, которая:

- усиливает бренд `C3K`
- дает резервный и независимый web3-адрес проекта
- выступает collector-first и community-first входом в экосистему
- использует `TON DNS` и `TON Storage`

## 3. Основание для реализации

Официальная документация TON подтверждает:

- TON Sites могут выступать точками входа в TON services
- HTML страницы TON Sites могут содержать `ton://...` ссылки
- для приложений поддержка TON Sites должна строиться через локальный `entry proxy`
- публичные entry proxies предназначены только для demo/testing и не рекомендуются для production
- статический сайт может быть размещен в `TON Storage` и привязан к домену через DNS `site` record

Источники:

- [Proxy & sites](https://docs.ton.org/guidelines/proxy-and-sites)
- [TON Sites for applications](https://docs.ton.org/v3/guidelines/web3/ton-proxy-sites/ton-sites-for-applications)
- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)

## 4. Проблема, которую решает система

Основное приложение `C3K` живет как:

- Telegram Mini App
- обычный web

Но у проекта нет отдельной TON-native поверхности, которая:

- подчеркивает принадлежность к TON-экосистеме
- может жить как TON DNS актив
- использует `TON Storage` для хостинга
- служит collector и community entrypoint

## 5. Цели

### 5.1 Основные цели

- Получить рабочий `TON Site` для `C3K`
- Привязать сайт к `.ton` домену через `TON DNS`
- Хранить статический bundle сайта в `TON Storage`
- Открывать `c3k.ton` через собственный `C3K` desktop-клиент
- Интегрировать в TON Site deep links:
  - в Telegram Mini App
  - в обычный web
  - в wallet actions через `ton://`

### 5.2 Продуктовые цели

- усилить бренд
- дать резервный и независимый адрес проекта
- сделать web3-facing витрину для коллекционеров и артистов

## 6. Не-цели

В первую версию не входит:

- полный перенос основного приложения в TON Site
- запуск TON Site как единственного основного способа пользоваться `C3K`
- хранение динамического backend state в TON Site
- complex client-side purchase flow внутри TON Site

## 7. Принципиальная позиция по роли TON Site

`TON Site` для `C3K` не является заменой:

- Telegram Mini App
- обычного web
- основного backend

Он должен быть:

- брендовой поверхностью
- резервным входом
- collector landing
- web3-витриной

### Принцип доступа

Основной поддержанный путь открытия `c3k.ton` должен идти через собственный `C3K` desktop-клиент на `Electron`, совмещенный с `C3K Storage Node`.

## 8. Почему TON Site нельзя делать основным surface

Согласно официальной документации TON:

- поддержка TON Site внутри приложений должна строиться через локальный `entry proxy`
- публичные entry proxies не рекомендуется использовать в production

Источник:

- [TON Sites for applications](https://docs.ton.org/v3/guidelines/web3/ton-proxy-sites/ton-sites-for-applications)

Вывод:

- основной массовый вход продукта должен оставаться через:
  - Telegram Mini App
  - обычный web
- `TON Site` — это дополнительный слой
- production-удобный способ открытия `c3k.ton` для ядра пользователей должен обеспечиваться самим `C3K Desktop Client`

## 9. Целевые сценарии использования

### 9.1 Collector entry

Пользователь открывает `c3k.ton` и видит:

- манифест проекта
- featured drops
- TON/NFT narrative
- ссылки на Mini App и web

### 9.2 Community landing

Пользователь открывает `c3k.ton` и видит:

- что такое `C3K`
- как стать артистом
- как вступить в `C3K Storage`
- как участвовать в дропах

### 9.3 Emergency / mirror

TON Site служит резервной витриной:

- главная страница
- список ключевых релизов
- инструкции по входу в основной продукт

### 9.4 NFT / TON-native surface

TON Site может выступать как вход в:

- collector campaigns
- NFT seasons
- branded archival pages

## 10. Архитектурная модель

## 10.1 Общая схема

### Surface A. Main App

- Telegram Mini App
- обычный Next.js web

### Surface B. TON Site Static Mirror

- статический bundle
- размещен в `TON Storage`
- привязан к `.ton` домену через `TON DNS`

### Surface C. C3K Desktop Client

- `Electron` desktop app
- локальный gateway для открытия `c3k.ton`
- единый клиент с `C3K Storage Node`

### Surface D. TON-native links

TON Site должен содержать:

- `ton://` ссылки
- deep links в Mini App
- ссылки на обычный web

## 10.2 Почему сайт должен быть статическим

Официальная TON Storage FAQ описывает TON Site как static site, размещаемый из папки с `index.html`, привязанной через DNS `site` field.

Источник:

- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)

Вывод:

- первая версия `C3K TON Site` должна быть статическим bundle
- динамика должна приходить либо через:
  - заранее собранные snapshots
  - client-side fetch к обычному backend

## 11. Состав TON Site

## 11.1 Обязательные страницы

### 1. Главная

Содержит:

- позиционирование `C3K`
- тезис об ownership и collector culture
- CTA в Mini App
- CTA в обычный web

### 2. Releases

Статическая или semi-static витрина:

- featured drops
- новые релизы
- коллекционные релизы

### 3. Artists

Витрина ключевых артистов сцены.

### 4. Storage

Объяснение программы `C3K Storage`.

### 5. Manifesto / About

Культурное объяснение проекта:

- почему ownership важен
- почему `C3K` строится на Telegram + TON

## 11.2 Дополнительные страницы

- season landing
- NFT campaign landing
- artist-specific drop pages

## 12. Функциональные требования

## 12.1 Static bundle generation

Система должна уметь:

- собирать отдельный статический bundle для TON Site
- включать `index.html`
- включать assets
- формировать metadata и manifest

## 12.2 Publishing to TON Storage

Система должна:

- собирать сайт в папку
- создавать bag
- публиковать bag в `TON Storage`
- сохранять `bagID`
- привязывать `bagID` к DNS `site` record

Основание:

- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)

## 12.3 DNS management

Система должна:

- хранить текущий `.ton` domain
- хранить текущий active `bagID`
- иметь историю публикаций
- поддерживать rollback на предыдущий `bagID`

## 12.4 Deep link support

TON Site должен поддерживать:

- ссылки в Mini App
- ссылки на обычный web
- `ton://` links

Основание:

- [Proxy & sites](https://docs.ton.org/guidelines/proxy-and-sites)

## 12.5 Snapshot content model

Сайт должен уметь публиковать:

- featured releases
- artist cards
- top collector campaigns
- storage program blocks

через статический snapshot из основного backend.

## 13. Нефункциональные требования

## 13.1 Production safety

Нельзя использовать публичные entry proxies как production основу продукта.

Основание:

- [TON Sites for applications](https://docs.ton.org/v3/guidelines/web3/ton-proxy-sites/ton-sites-for-applications)

## 13.2 Content portability

Сайт должен быть полностью publishable как directory bundle.

## 13.3 Rollback capability

Любая публикация TON Site должна уметь:

- откатиться на предыдущий bag
- восстановить предыдущий DNS `site` record

## 13.4 Brand consistency

TON Site должен соответствовать визуальному языку `C3K`, но быть легче и статичнее основного приложения.

## 13.5 Native access

`TON Site` должен иметь поддержанный native access path через собственный `C3K Desktop Client`, без требования установки стороннего TON browser.

## 14. Компоненты системы

## 14.1 TON Site Builder

Новый build target:

- `build:ton-site`

Функции:

- собрать статический bundle
- вытащить данные из `C3K`
- сформировать landing pages

## 14.2 TON Site Publisher

CLI/worker, который:

- берет собранный bundle
- создает bag
- публикует в `TON Storage`
- получает `bagID`
- сохраняет publish record

## 14.3 DNS Manager

Компонент, который:

- хранит информацию о домене
- подготавливает инструкции или automation для обновления DNS `site` record
- умеет rollback

## 14.4 TON Site Admin Panel

Новый admin screen:

- current domain
- current live bag
- preview builds
- publish history
- rollback button

## 14.5 C3K Desktop TON Gateway

Компонент внутри desktop-клиента, который:

- поднимает локальный gateway для `TON Site`
- открывает `c3k.ton` внутри `Electron`
- скрывает от пользователя сложность TON proxy-слоя

## 15. Изменения в текущем проекте

## 15.1 New folder / app target

Рекомендуется вынести отдельный buildable target, например:

- `src/ton-site/`

или отдельный static export layer.

## 15.2 New publish metadata table

### `ton_site_releases`

- `id`
- `domain_name`
- `bag_id`
- `status`
  - `draft`
  - `published`
  - `rolled_back`
- `published_at`
- `published_by`
- `notes`

### `ton_site_snapshots`

- `id`
- `generated_at`
- `featured_releases`
- `featured_artists`
- `campaign_blocks`
- `storage_program_block`
- `source_revision`

## 15.3 New admin APIs

- `POST /api/ton-site/build`
- `POST /api/ton-site/publish`
- `GET /api/ton-site/releases`
- `POST /api/ton-site/rollback`

## 16. Контентная модель первой версии

## 16.1 Hero

- краткий манифест
- CTA `Открыть Mini App`
- CTA `Открыть web`

## 16.2 Featured releases

- 6-12 релизов
- статус коллекционный / NFT / limited

## 16.3 Artists

- 6-20 ключевых артистов

## 16.4 Storage program

- блок про `C3K Storage`
- CTA на программу

## 16.5 About TON / ownership

- объяснение, почему `C3K` использует TON

## 17. Контентная политика

TON Site не должен тянуть весь runtime приложения.

Он должен показывать:

- curated data
- snapshots
- limited dynamic fetch

Это нужно для:

- устойчивости
- простоты публикации
- меньшей зависимости от live backend

## 18. UX-требования

Сайт должен:

- быстро открываться
- быть понятным без знания TON
- не заставлять пользователя сразу понимать proxy details
- объяснять путь:
  - в Mini App
  - в обычный web
  - в wallet

Desktop-клиент должен:

- иметь кнопку `Открыть c3k.ton`
- открывать `TON Site` внутри себя
- не требовать от пользователя внешнего TON browser

## 19. Ограничения доступа

Следует учитывать:

- обычный пользователь чаще всего не умеет открывать TON Sites напрямую
- поддержка внутри приложений требует local entry proxy
- публичные прокси не production-grade

Следовательно:

- `TON Site` нельзя считать универсальным main entrance
- production-friendly вход для core users должен идти через `C3K Desktop Client`

## 20. Интеграция с TON DNS

Официальная TON Storage FAQ описывает:

- bag можно привязать к domain
- для site используется DNS record `sha256("site")`
- static site должен содержать `index.html`

Источник:

- [TON Storage FAQ](https://docs.ton.org/v3/guidelines/web3/ton-storage/storage-faq)

## 21. Rollout plan

## Этап 1. Domain and static landing

- зарегистрировать `.ton` домен
- собрать статический landing
- положить в TON Storage
- привязать DNS `site`

## Этап 2. Content mirror

- добавить featured releases
- добавить artists
- добавить collector blocks

## Этап 3. Admin publishing flow

- build
- preview
- publish
- rollback

## Этап 4. C3K ecosystem integration

- links to Mini App
- links to storage program
- links to drops and NFT campaigns

## Этап 5. Desktop native access

- встроить открытие `c3k.ton` в `C3K Desktop Client`
- объединить `TON Site access` и `Storage Node` в одном приложении

## 22. Acceptance criteria

Система считается принятой, если:

- у `C3K` есть рабочий `.ton` домен
- есть статический bundle сайта с `index.html`
- bundle загружается в `TON Storage`
- `bagID` привязывается к DNS `site` record
- можно опубликовать новую версию и откатить предыдущую
- `c3k.ton` можно открыть через собственный `C3K Desktop Client`
- для открытия `c3k.ton` не требуется сторонний TON browser
- сайт содержит deep links:
  - в Mini App
  - в web
  - в wallet actions

## 23. Риски

## 23.1 Product risk

Пользователи могут не понимать, зачем им отдельный TON Site.

## 23.2 UX risk

Вход в TON Site сложнее обычного web.

## 23.3 Infra risk

Если строить стратегию вокруг public entry proxies, это будет против официальной production-рекомендации TON.

## 23.4 Strategic risk

Если делать TON Site слишком ранним фокусом, он может отвлечь ресурсы от главного продукта.

## 24. Open questions

- какой `.ton` домен берется за primary
- будет ли сайт только статическим или частично dynamic
- нужен ли multilingual bundle
- нужен ли отдельный TON Site только под collector drops
- нужен ли отдельный TON Site для каждой кампании

## 25. Приоритет реализации

Если сжать:

сначала делается `static branded TON Site`, потом `content mirror`, и только потом возможны более глубокие TON-native интеграции.
