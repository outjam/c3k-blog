# Documentation

Эта папка нужна как внутренняя карта продукта и кода. Ее цель: зафиксировать, как приложение устроено сейчас, где проходит бизнес-логика, какие есть пользовательские и административные флоу, где лежат данные, и что нужно сделать для выхода в реальный production.

## Структура

- `business/`
  - бизнес-сущности
  - пользовательские сценарии
  - монетизация артистов, TON и NFT
- `backend/`
  - архитектура
  - хранение данных
  - инвентарь API
- `product/`
  - экраны
  - навигация
  - user cases по разделам
- `audit/`
  - инвентаризация продукта
  - лишние или спорные зоны
  - архитектурные и продуктовые риски
- `roadmap/`
  - технический roadmap
  - шаги к production и масштабу
- `process/`
  - журнал реализации
  - ADR по архитектурным решениям
  - фиксация текущих инженерных допущений
- `Мечты/`
  - стратегические гипотезы по заработку
  - сценарии роста
  - отдельные рассуждения по TON Site и альтернативным поверхностям доступа

Отдельно рядом с этой папкой существует [`History/`](/Users/culture3k/Documents/GitHub/c3k-blog/History/README.md):

- хронология рабочих сессий
- completed backlog
- более операционная память проекта

## Как читать эту документацию

1. Начать с [`business/core-business-flows.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/business/core-business-flows.md)
2. Затем открыть [`backend/architecture-and-storage.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/backend/architecture-and-storage.md)
3. Потом пройти [`product/navigation-and-screens.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/product/navigation-and-screens.md)
4. Для планирования работ использовать [`roadmap/production-roadmap.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/production-roadmap.md)
5. Для ежедневного контроля статуса использовать [`roadmap/project-status-checklist.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/roadmap/project-status-checklist.md)

## Правило обновления

При изменении одного из следующих слоев документация должна обновляться в том же PR:

- маршрут пользователя или экрана
- бизнес-правило покупки, минта, выплат, подписок
- структура artist/profile данных
- новый API route
- новый `app_state` key
- новая внешняя интеграция
- изменение production roadmap

## Что считать source of truth

- Бизнес-логика: документы в `Documentation/business`
- Реальная техническая реализация: код в `src/` и `db/`
- Production storage baseline: [`db/schema.sql`](/Users/culture3k/Documents/GitHub/c3k-blog/db/schema.sql)
- Актуальные продуктовые долги: [`audit/inventory-and-excess.md`](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/audit/inventory-and-excess.md)

## Важная оговорка

Эта документация описывает:

- текущее состояние кода
- целевую логику продукта там, где она уже явно определена
- известные рассинхроны между текущей реализацией и целевой моделью

Если в документе есть формулировка `Текущее состояние` и `Целевое состояние`, приоритет для разработки имеет `Целевое состояние`, но только после явного внедрения в код.
