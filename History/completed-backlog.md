# Completed Backlog

Этот файл хранит уже завершённые задачи проекта в более подробном виде, чем roadmap checklist.

## 2026-03-18

### Профиль и публичный профиль

- Завершён большой редизайн основного профиля:
  - минималистичный hero
  - переработанные метрики
  - единый блок коллекции
  - sticky tabs
  - свайп между вкладками
  - отдельные настройки
- Публичный профиль приведён к логике основного профиля.
- Добавлены награды как отдельная вкладка.
- Добавлена история копирования `@username`.
- Убрана лишняя карточность и тяжёлые визуальные контейнеры.

### Лента, релизы и экран релиза

- Переработан экран ленты под новый визуальный язык.
- Убраны лишние текстовые элементы, хэштеги и перегруженные действия в карточках релизов.
- Экран релиза переработан в более минималистичную структуру.
- Реализована новая логика покупки:
  - покупка релиза по формату
  - покупка отдельных треков
  - повторная покупка релиза в другом формате
- В ownership-модели учтены:
  - полный релиз
  - отдельные треки
  - NFT marker

### Артист и студия

- Реализован artist application flow вместо прямого превращения пользователя в артиста.
- Реализован moderation flow для заявок артиста.
- В студии появился dashboard-слой.
- Добавлен отдельный artist-admin contour.
- Заложен payout flow с hold period и admin approval.

### TON и NFT

- Реализован testnet-ready sponsored mint NFT для полного релиза.
- Добавлена runtime config логика для NFT collection.
- Подготовлен metadata contour для NFT release и collection.
- В release flow учтена mintability релиза.

### Storage foundation

- Создан отдельный storage domain.
- Поднят storage registry на `app_state`.
- Добавлены storage program API.
- Добавлен user-facing экран `C3K Storage Program`.
- Добавлен admin storage dashboard.
- Добавлены storage memberships, assets, bags и health view.
- Реализована автоматическая синхронизация базовых storage assets из artist releases.
- Добавлен admin backfill для повторной синхронизации релизов в storage registry.

### Delivery layer

- Добавлен отдельный delivery state для файлов.
- Реализован delivery orchestrator:
  - entitlement check
  - release/track delivery request
  - Telegram delivery request
  - web download request
- На релизе появились entry points для:
  - скачивания полного релиза
  - отправки полного релиза в Telegram
  - скачивания купленного трека
  - отправки купленного трека в Telegram
- Добавлена user-facing history выдач в `C3K Storage Program`.

### Admin и документация

- Расширена документация по бизнес-логике, backend, навигации и roadmap.
- Добавлены ADR по:
  - desktop storage node
  - desktop gateway для `c3k.ton`
  - resource keys и delivery mapping
- Добавлен project status checklist.

## Темы, которые уже начали, но ещё не считаются завершёнными

- Ingest pipeline для storage content
- Telegram delivery worker
- Desktop client `Electron`
- Полная нормализация backend-модели без зависимости от `app_state`
