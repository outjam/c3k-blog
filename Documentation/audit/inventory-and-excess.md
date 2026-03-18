# Product Inventory and Excess

## 1. Ядро продукта

Это то, что действительно формирует ценность приложения:

- новости
- релизы
- страница релиза
- профиль пользователя
- внешний профиль пользователя
- публичная страница артиста
- artist application
- studio
- баланс
- TON wallet binding
- NFT mint
- admin moderation

## 2. Операционные зоны

Это важно для бизнеса, но не является consumer core:

- `/admin`
- `/admin/artists`
- `/admin/showcase`
- Telegram worker / webhook routes
- payout moderation

## 3. Служебные и побочные зоны

Это полезно, но не должно размывать продуктовый фокус:

- `/tools`
- `/tools/track-cover`
- внутренние контентные инструменты

## 4. Что выглядит лишним или спорным прямо сейчас

### 1. Слишком generic e-commerce наследие

Проект уже музыкальный, но в коде много универсального магазинного наследия:

- `products`
- `cart`
- `checkout`
- old-style commerce naming

Это не критично, но мешает ясности доменной модели.

### 2. Две публичные сущности идентичности

Сейчас есть:

- внешний профиль пользователя
- отдельная страница артиста

Обе сущности нужны, но между ними легко получить рассинхрон.

### 3. Self profile все еще частично смешивает user data и artist data

На уровне хранения сущности уже разнесены, но на уровне собственного профиля артиста визуальная логика еще не до конца разведена.

### 4. `shop_admin_config_v1` стал слишком широким контейнером

Там аккумулируется слишком много разнородной бизнес-логики:

- artist profiles
- applications
- releases
- donations
- subscriptions
- earnings
- payouts
- showcase
- promos

Для команды и production support это со временем станет тяжелым.

### 5. `app_state` перегружен как основная база бизнеса

Для быстрых итераций это удобно. Для million-scale нет.

### 6. Имеется продуктовая неоднозначность по экранам

Нужно финально решить:

- что такое `public profile`
- что такое `artist page`
- должен ли artist page быть разновидностью profile
- где заканчивается consumer-путь и начинается artist admin

## 5. Что точно стоит сохранить

- Telegram-first вход
- простая social механика
- коллекция и NFT как часть профиля
- studio как отдельный artist workspace
- payout approval через админа
- sponsored mint, а не самостоятельный on-chain UX для обычного пользователя

## 6. Что стоит упрощать

### Навигация

- меньше вторичных путей к одним и тем же сущностям
- меньше e-commerce терминов в music-продукте

### Данные

- меньше критического состояния в local storage
- меньше бизнес-логики в JSON snapshots

### Профили

- четко развести:
  - user profile
  - artist profile
  - studio dashboard

## 7. Что выглядит незавершенным

- полный i18n слой
- полное theme coverage
- formal contract docs for API
- аналитика и event taxonomy
- anti-fraud layer
- finance reconciliation
- moderation SLAs

## 8. Продуктовые решения, которые надо закрепить явно

- hold period: `21 день` или другое число
- public profile и artist page: это две сущности или одна сущность с режимами
- остается ли `cart` как долгий сценарий или покупка становится mostly inline
- что считать минимальной unit of ownership:
  - track
  - release format
  - NFT upgrade

## 9. Рекомендованный фокус на ближайшее время

### Оставить в ядре

- Новости
- Релизы
- Релиз
- Профиль
- Баланс
- Studio
- TON/NFT

### Заморозить как второстепенное

- tools
- часть старой e-commerce оболочки
- неиспользуемые showcase и auxiliary admin flows, если они не нужны каждый день

### Довести до цельной модели

- identity
- entitlements
- payouts
- release ownership
