# ADR-0003: Storage Delivery Resource Keys

## Статус

Принято.

## Контекст

`C3K` уже умеет:

- продавать полный релиз в конкретном формате
- продавать отдельные треки
- хранить ownership в social-user-state

Но для `C3K Storage delivery` возникли две системные проблемы:

1. Storage asset нельзя надёжно найти только по `releaseSlug`, потому что одному релизу соответствуют:
   - разные форматы
   - release bundle целиком
   - отдельные track assets
2. Историческая track purchase модель хранит только `releaseSlug::trackId`, без формата покупки.

## Решение

### 1. Для storage assets вводится `resourceKey`

`StorageAsset` получает поле `resourceKey`, которое становится главным ключом сопоставления продукта и storage-ресурса.

Принятые ключи:

- полный релиз: `release:{releaseSlug}:{format}`
- трек: `track:{releaseSlug}:{trackId}:{format}`

Это позволяет:

- не завязывать delivery только на внутренние `assetId`
- хранить release bundle и track assets в одной registry модели
- отдельно маппить один и тот же релиз на несколько storage assets

### 2. Для track delivery вводится legacy fallback

Так как старые покупки треков не сохраняют формат, в первой реализации delivery для отдельно купленного трека разрешён только `default format` релиза.

Если пользователь купил:

- весь релиз в конкретном формате, он может выгрузить трек в этом формате
- только отдельный трек, delivery идёт в `default format`

## Последствия

### Плюсы

- delivery слой можно развивать независимо от UI
- админ и ingest pipeline получают явную модель сопоставления контента и storage assets
- release/track download получают стабильный server contract

### Минусы

- старые track purchases не дают точного знания формата
- для полной точности в будущем нужно мигрировать entitlement model на `track + format`

## Следующий шаг

- перевести entitlements из JSON state в нормализованную таблицу
- начать сохранять track purchases с форматом
- подключить реальный `TON Storage gateway/client`, чтобы `telegram_bot` мог забирать файл не только по `sourceUrl`, но и напрямую по storage pointer
