# Session Summary — 2026-03-23

## Основная тема

UI/UX pass по странице артиста и `Студии` после обновления профиля, каталога и релиза.

Цель:

- синхронизировать creator-side интерфейсы с уже реализованной логикой
- убрать рассинхрон между возможностями backend и тем, как они читаются в UI
- сделать artist page и studio ближе к общему языку приложения

## Что было сделано

### 1. Страница артиста

- hero стал полезнее, а не просто декоративнее:
  - появились pills по доступности поддержки
  - добавлен индикатор релизов с доступным preview
- support section теперь разделяет два реальных сценария:
  - разовый донат
  - регулярная подписка
- для каждого сценария появились:
  - понятное описание
  - status state
  - supporting facts
- каталог артиста стал показывать:
  - тип релиза
  - число треков
  - число форматов
  - включён ли NFT upgrade

### 2. Студия

- hero получил быстрые переходы:
  - новый релиз
  - выплаты
  - профиль артиста
- `Обзор` теперь показывает не только метрики, но и next-step guidance
- `Профиль` получил пояснение, какие поля влияют на публичную витрину и выплаты
- `Релизы` получили явное описание модели:
  - полный релиз
  - отдельные треки
  - NFT только для полного релиза
- `Выплаты` получили человеческое описание правил:
  - minimum request
  - hold 21 дней
  - зависимость от TON-кошелька

## Зачем это было нужно

- до этого profile/catalog/release уже выглядели свежее, чем artist-facing интерфейсы
- студия визуально всё ещё воспринималась как длинная форма, хотя по смыслу уже была dashboard-инструментом
- страница артиста показывала меньше полезной информации, чем реально уже поддерживает продукт

После этого pass artist-side слой стал заметно ближе к общему гайдлайну приложения.

## Дополнение по следующему sprint slice

- `Sprint 09` получил отдельный TON hardening шаг
- runtime config для NFT collection теперь хранит явную сеть
- sponsored mint и collection status больше не используют runtime collection из другой сети
- в админке появился отдельный блок `TON environment`, который показывает:
  - active network
  - runtime/env collection source
  - relay readiness
  - предупреждения о testnet/mainnet drift

## Дополнение по следующему sprint slice

- `Sprint 09` получил deployment readiness layer
- в админке появился preflight по:
  - public URLs
  - Telegram core
  - admin/session auth
  - Postgres
  - worker secrets
  - TON runtime
  - storage/desktop flags
- это превращает `Пульт C3K` не только в incident dashboard, но и в реальный rollout checklist

## Дополнение по следующему sprint slice

- `Sprint 09` получил operator recovery слой для очередей
- worker routes для `Telegram notifications` и `Storage delivery` переведены на общий execution helper
- `/api/admin/workers/runs` теперь умеет:
  - читать историю запусков
  - вручную запускать поддерживаемые worker jobs
- на `Dashboard` появились recovery-кнопки для обоих worker-ов
- после запуска админка сразу обновляет:
  - run history
  - incident status
  - короткое текстовое summary по результату прогона

## Дополнение по следующему sprint slice

- `Sprint 09` получил provenance для background jobs
- worker run history теперь различает:
  - автоматический route run
  - ручной recovery run
- ручной запуск из админки сохраняет `telegramUserId` администратора
- в UI это показывается отдельными pills прямо в карточке запуска, чтобы оператор видел не только результат, но и источник запуска

## Финал Sprint 09

- добавлен единый `Operator guide`
- он показывает:
  - release mode
  - next actions
  - runbooks для post-deploy, worker recovery, TON drift и mainnet go-live
- deploy NFT collection теперь требует `confirmNetwork`, чтобы не перепутать contour
- после этого production hardening sprint закрыт, а следующим активным этапом становится `Sprint 10 — Real TON Storage test runtime`

## Старт Sprint 10

- первым шагом вместо runtime-кода собран целевой UI `C3K Storage Node`
- `/storage` теперь показывает:
  - node dashboard
  - swarm preview
  - будущие rewards в `C3K Credit`
  - desktop readiness
  - текущий delivery layer как уже рабочую часть storage-истории
- это стало визуальной целью для дальнейшей работы по real `TON Storage` test contour

## Следующий slice Sprint 10

- storage runtime стал переключаемым между:
  - `test_prepare`
  - `tonstorage_testnet`
- admin storage dashboard теперь показывает:
  - активный runtime
  - pointer capability
  - нужен ли внешний upload worker
- ingest route больше не жёстко test-only:
  - принимает runtime mode
  - создаёт runtime-aware jobs
  - сохраняет `runtimeMode/runtimeLabel` в bags
- user-facing `/storage` теперь тоже отражает:
  - активный runtime
  - pointer mode
  - необходимость upload worker

## Следующий storage retrieval slice

- Telegram delivery теперь умеет ходить не только в прямой `deliveryUrl`
- worker может восстановить fetchable source через:
  - `resolvedSourceUrl`
  - `storagePointer`
  - `bagId / assetId`
- это первый реальный шаг от runtime metadata к runtime consumption без полного daemon bridge

## Следующий storage retrieval slice

- web download получил auth-proxy route `/api/storage/downloads/[id]/file`
- release page, `/storage` и `/downloads` переведены на proxy-based download flow
- browser delivery теперь тоже умеет использовать `storagePointer` и bag mapping storage runtime
- это первый user-facing web retrieval contour до полноценного daemon bridge и desktop runtime

## Следующий storage diagnostics slice

- storage dashboard теперь показывает runtime readiness, а не только выбранный mode
- operator видит:
  - assets ready
  - bags ready
  - pointer-ready bags
  - unresolved assets/bags с объяснением
- это делает следующий шаг к real `TON Storage` проверяемым ещё до user-facing delivery ошибок

## Следующий storage upload slice

- появился внешний upload handoff для `tonstorage_testnet`
- route `/api/storage/ingest/worker` умеет:
  - отдавать queue status
  - claim prepared job
  - принимать completion/failure от внешнего worker
- storage dashboard теперь показывает upload queue, чтобы было видно, где jobs застряли между pointer-prep и реальным upload

## Следующий storage test slice

- добавлен simulated upload pass
- storage dashboard теперь умеет бесплатно прогонять внешний upload stage без реального daemon bridge
- это даёт первый test-only e2e contour: prepare bags -> simulate upload -> web/telegram retrieval

## Следующий worker source slice

- внешний upload worker теперь получает в claim response готовые endpoints
- появился защищённый source endpoint для claimed job
- worker может забрать реальные bytes исходного файла перед загрузкой в storage

## Следующий local worker slice

- добавлен script `storage-testnet-worker.mjs`
- теперь test contour можно гонять не только кнопкой в админке, но и отдельным процессом
- это следующий шаг к настоящему testnet worker до интеграции с реальным `TON Storage daemon/provider`
