# Architecture and Storage

## 1. Текущий технологический стек

- `Next.js 16` на App Router
- `React 19`
- `TypeScript`
- `Sass`
- `motion`
- `@ton/core`, `@ton/ton`, `@tonconnect/ui-react`
- `Supabase Postgres` через REST/RPC
- `Telegram Mini App SDK` через `telegram-web-app.js`

## 2. Общая схема слоев

### Клиент

На клиенте живут:

- UI
- Telegram Mini App integration
- playback
- часть локального состояния
- часть social/user state кешируется локально

### BFF / Server routes

В `src/app/api` реализован backend-for-frontend:

- auth
- catalog
- social
- blog
- artist self-service
- admin
- TON
- Telegram webhooks

### Данные

Данные хранятся в трех формах:

1. Нормализованные таблицы Postgres
2. Snapshot-состояние в `app_state`
3. Клиентские persisted storage keys

Это рабочая схема для текущей стадии, но не конечная для масштаба.

## 3. Базовые таблицы Supabase/Postgres

Базовый baseline лежит в [`db/schema.sql`](/Users/culture3k/Documents/GitHub/c3k-blog/db/schema.sql).

### Основные таблицы

- `users`
- `categories`
- `subcategories`
- `products`
- `orders`
- `order_items`
- `order_status_history`
- `payments`
- `promo_usage`
- `admin_members`
- `blog_posts`
- `post_comments`
- `post_reactions`
- `app_state`

## 4. Что сейчас хранится в `app_state`

`app_state` используется как контейнер для JSON snapshot-конфигов и слоев, которые еще не вынесены в полноценные таблицы.

### Ключи

- `shop_admin_config_v1`
  - главный конфиг каталога и артистской части
  - artist profiles
  - artist applications
  - artist tracks
  - promo rules
  - settings
  - donations, subscriptions, earnings, payouts
- `social_user_state_v1`
  - баланс пользователя
  - видимость покупок
  - купленные релизы
  - купленные треки
  - привязанный TON wallet
  - minted NFTs
- `social_follow_graph_v1`
  - follow graph
  - followers/following counters
- `release_social_v1`
  - реакции и комментарии к релизам
- `ton_runtime_config_v1`
  - текущая runtime collection для NFT

## 5. Что хранится локально на клиенте

### Локальные ключи

- `c3k-social-hub-v1`
- `c3k-shop-cart-v1`
- `c3k-product-favorites-v1`
- `c3k-post-bookmarks-v1`
- `c3k-app-theme`
- `c3k-app-locale`

Это удобно для UX, но важно помнить:

- локальное состояние не является source of truth для денег
- локальное состояние не должно быть единственным источником покупки или минта

## 6. Серверные сервисы по доменам

### Shop / Catalog

- `src/lib/server/shop-catalog.ts`
- `src/lib/server/shop-admin-config-store.ts`
- `src/lib/server/shop-artist-market.ts`

### Orders / Payments

- `src/lib/server/shop-orders-store.ts`
- `src/lib/server/idempotency-store.ts`
- `src/lib/server/rate-limit.ts`

### Social

- `src/lib/server/social-user-state-store.ts`
- `src/lib/server/social-follow-store.ts`
- `src/lib/server/release-social-store.ts`
- `src/lib/server/blog-social-store.ts`

### Artist Studio / Payouts

- `src/lib/server/shop-artist-studio.ts`
- `src/lib/server/shop-artist-notify.ts`

### TON

- `src/lib/server/ton-sponsored-relay.ts`
- `src/lib/server/ton-runtime-config-store.ts`
- `src/lib/server/ton-nft-reference.ts`
- `src/lib/server/ton-reference-nft-contract.ts`

### Telegram

- `src/lib/server/telegram-bot.ts`
- `src/lib/server/telegram-init-data.ts`
- `src/lib/server/telegram-browser-auth.ts`
- `src/lib/server/telegram-notification-queue.ts`

## 7. Runtime environment

Критические env-группы:

### Supabase

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `POSTGRES_STRICT_MODE`

### Telegram

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WORKER_SECRET`
- `CRON_SECRET`

### TON

- `NEXT_PUBLIC_TON_NETWORK`
- `NEXT_PUBLIC_TON_ONCHAIN_NFT_MINT_ENABLED`
- `TON_SPONSOR_WALLET_MNEMONIC`
- `TON_NFT_COLLECTION_ADDRESS` или runtime collection
- `TONCENTER_API_KEY`

## 8. Главные архитектурные сильные стороны

- есть единый App Router и BFF слой
- есть idempotency и rate limit на чувствительных маршрутах
- есть отдельный artist application/payout flow
- есть разделение between admin, user and artist zones
- есть уже работающий TON sponsored mint контур

## 9. Главные архитектурные слабости

### 1. Смешанный storage strategy

Сейчас данные распределены между:

- SQL таблицами
- `app_state` JSON blobs
- local persisted state

Для MVP это допустимо, но для growth это усложняет:

- аналитику
- отладку
- сверку платежей
- reporting
- конкурентные обновления

### 2. Генерик-термин `products`

Музыкальные релизы хранятся и обрабатываются через общий commerce-слой `products`, что наследует старую универсальную модель магазина.

Для production это стоит развести на:

- `releases`
- `release_formats`
- `release_tracks`
- `orders`
- `entitlements`

### 3. Identity split

`user profile` и `artist profile` уже разнесены как сущности, но часть UI еще собирает их в один self-profile слой.

### 4. App state growth risk

`shop_admin_config_v1` становится слишком большим контейнером. При росте числа артистов, релизов и выплат это будет bottleneck.

## 10. Что нужно считать целевой архитектурой

### Вынести из `app_state` в нормализованные таблицы

- artist applications
- artist profiles
- artist releases
- release tracks
- earnings ledger
- payout requests
- release entitlements
- minted NFTs

### Оставить в `app_state` только то, что реально годится для snapshot

- runtime toggles
- small configuration blobs
- feature flags

## 11. Что уже пригодно для production, а что нет

### Уже можно опираться

- BFF routes
- auth через Telegram
- базовый orders layer
- artist approval workflow
- sponsored mint flow

### Нельзя считать production-final

- большая часть `app_state`-модели
- payout accounting
- i18n слой без полных словарей
- смешение user/artist identity на self-profile
