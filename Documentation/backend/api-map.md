# API Map

Ниже список основных API-групп в `src/app/api`.

## 1. Auth

### Session и browser auth

- `/api/auth/session`
  - получить текущую сессию Telegram-пользователя
- `/api/auth/logout`
  - завершить сессию
- `/api/auth/telegram/widget`
  - `GET`: отдать browser Telegram Login config
  - `POST`: принять и проверить Telegram Login `id_token` / legacy widget payload

## 2. Social

### User social state

- `/api/social/state`
  - чтение и запись social user state
  - баланс
  - купленные релизы
  - купленные треки
  - NFT markers
  - TON wallet address

### Follows

- `/api/social/follows`
  - follow/unfollow
- `/api/social/follows/relations`
  - followers/following relations snapshot

### Own profile

- `/api/social/profile/me`
  - чтение и обновление собственного user profile

## 3. Feed and Blog

### Unified feed

- `/api/feed/social`
  - feed snapshot для news screen

### Blog content

- `/api/blog/posts`
  - список постов
- `/api/blog/posts/[slug]/social`
  - social snapshot поста
- `/api/blog/posts/[slug]/reaction`
  - реакция на пост
- `/api/blog/posts/[slug]/comments`
  - комментарии к посту
- `/api/blog/posts/[slug]/comments/[commentId]`
  - обновление или удаление комментария

## 4. Catalog and Shop

### Catalog

- `/api/shop/catalog`
  - публичный каталог релизов, артистов, promo rules, showcase, settings

### Orders

- `/api/shop/orders`
  - `GET`: список заказов текущего пользователя
  - `POST`: создание заказа
- `/api/shop/orders/[id]`
  - детали заказа
- `/api/shop/orders/[id]/payment-failed`
  - фиксация неудачной оплаты

### Release social

- `/api/shop/releases/[slug]/social`
  - social snapshot релиза
- `/api/shop/releases/[slug]/reaction`
  - реакции на релиз
- `/api/shop/releases/[slug]/comments`
  - комментарии к релизу
- `/api/shop/releases/[slug]/comments/[commentId]`
  - обновление или удаление комментария

## 5. Artist public routes

- `/api/shop/artists/[slug]`
  - публичные данные артиста
- `/api/shop/artists/[slug]/support`
  - поддержка артиста, донаты/подписки и related flows

## 6. Artist self-service

### Own artist profile

- `/api/shop/artists/me`
  - чтение approved artist profile
  - обновление artist profile

### Artist application

- `/api/shop/artists/me/application`
  - `GET`: текущая заявка и профиль
  - `POST`: подача заявки на артистский статус

### Artist releases

- `/api/shop/artists/me/tracks`
  - создание и редактирование релизов/треков артиста

### Artist payouts

- `/api/shop/artists/me/payouts`
  - `GET`: payout summary, history и payout audit trail
  - `POST`: запрос на вывод и запись audit entry

## 7. Admin

### Session and dashboard

- `/api/admin/session`
- `/api/admin/dashboard`

### Catalog and settings

- `/api/admin/products`
- `/api/admin/product-categories`
- `/api/admin/promos`
- `/api/admin/settings`
- `/api/admin/showcase`

### Customers and admins

- `/api/admin/customers`
- `/api/admin/admins`

### Blog

- `/api/admin/blog/posts`

### Artists

- `/api/admin/artists`
  - общий artist moderation/data route
- `/api/admin/artist-applications`
  - список заявок
  - approve / reject / needs_info
- `/api/admin/artist-payouts`
  - список payout requests и payout audit trail
  - approve / reject / paid
  - запись audit entries при review/status changes
- `/api/admin/social/entitlements/backfill`
  - dry-run и запуск backfill ownership/mint history из legacy `social_user_state_v1`
- `/api/admin/storage/sync-tracks`
  - backfill и повторная синхронизация storage assets из artist releases
- `/api/admin/storage/ingest`
  - запуск test-mode ingest pipeline
  - подготовка placeholder bags и ingest jobs

### Shop operations

- `/api/shop/admin/orders`
- `/api/shop/admin/orders/[id]/status`

## 8. Telegram

- `/api/telegram/webhook`
  - входящий Telegram webhook
- `/api/telegram/setup-webhook`
  - настройка webhook
- `/api/telegram/stars-invoice`
  - создание Telegram Stars invoice
- `/api/telegram/notifications/worker`
  - worker для очереди уведомлений

## 9. TON

- `/api/tonconnect/manifest`
  - manifest для Ton Connect
- `/api/ton/sponsored-mint`
  - sponsored mint NFT для релиза
- `/api/ton/collection`
  - deploy/status collection runtime operations
- `/api/ton/nft/metadata/collection`
  - metadata коллекции
- `/api/ton/nft/metadata/releases/[slug]`
  - metadata релиза как NFT item

## 10. Wallet / top-up

- `/api/wallet/topup/invoice`
  - top-up related invoice flow

## 11. Storage program and delivery

- `/api/storage/program/me`
  - snapshot участия в `C3K Storage`
- `/api/storage/program/join`
  - подача заявки в storage program
- `/api/storage/downloads`
  - список собственных delivery requests пользователя
- `/api/storage/downloads/release`
  - запрос выдачи файла полного релиза
- `/api/storage/downloads/track`
  - запрос выдачи файла отдельного трека
- `/api/storage/downloads/[id]`
  - `GET`: статус конкретного delivery request
  - `POST`: retry/reopen delivery request
- `/api/storage/downloads/worker`
  - worker для Telegram delivery queue
  - `mode=status` возвращает размер очереди
- `/api/desktop/runtime`
  - runtime contract для `C3K Desktop Client`
  - единая конфигурация для Electron shell, local gateway и web onboarding

## 12. Tools

- `/api/tools/track-cover/search`
- `/api/tools/track-cover/profile-audios`
- `/api/tools/track-cover/send-to-chat`

Это служебный контур для контентных инструментов.

## 13. Что важно про API-дизайн

### Хорошо

- есть четкое деление на public, self-service и admin
- есть отдельные домены `social`, `shop`, `ton`, `telegram`
- есть idempotency и rate-limit для чувствительных purchase/mint flows

### Нужно усилить

- документировать body/response схемы формально
- добавить OpenAPI или хотя бы hand-written contracts
- вынести бизнес-критичные сущности из generic `products` и `tracks`
- стабилизировать naming между `track`, `release`, `product`, `artist`
