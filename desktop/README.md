# C3K Desktop Skeleton

Это первый desktop scaffold для `Sprint 07`.

Что здесь уже есть:

- `main.mjs`
  - минимальный Electron shell
- `preload.mjs`
  - безопасный bridge для renderer
- `gateway.mjs`
  - local gateway stub для `c3k.ton` и `storagePointer`

Что здесь пока сознательно не сделано:

- реальный запуск `storage-daemon`
- реальный retrieval из `TON Storage`
- auto-update
- packaging/signing

Ожидаемый контракт:

1. Electron shell получает runtime через `/api/desktop/runtime`
2. Поднимает local gateway на `127.0.0.1:3467` по умолчанию
3. Открывает `startUrl`, который ведёт в desktop onboarding flow

Папка добавлена в основной репозиторий, а не в отдельный nested repo, чтобы не дробить `Sprint 07` между двумя git-источниками.

## Как запустить локально в test-only режиме

### 1. Поднять web-приложение

Из корня проекта:

```bash
npm install
npm run dev
```

По умолчанию desktop runtime ожидает web API на:

`http://127.0.0.1:3000/api/desktop/runtime`

### 2. Установить desktop dependencies

Из корня проекта:

```bash
npm run desktop:install
```

Это установит `electron` только внутри папки `desktop/`.

### 3. Запустить desktop shell

Из корня проекта:

```bash
npm run desktop:dev
```

Что произойдёт:

1. Electron запросит runtime contract у web-приложения
2. Поднимет local gateway на `127.0.0.1:3467`
3. Откроет экран `/storage/desktop`

### 4. Проверить gateway отдельно

Если нужно отдельно проверить local gateway stub без Electron:

```bash
npm run desktop:gateway
```

После этого можно открыть:

- `http://127.0.0.1:3467/health`
- `http://127.0.0.1:3467/runtime`

## Test-only ограничения текущего этапа

Сейчас desktop можно запускать локально, но это именно `beta scaffold`, а не production client.

Что уже работает:

- Electron shell
- runtime contract
- local gateway stub
- desktop handoff из web UI

Что пока не готово:

- реальный `TON Storage` retrieval
- настоящий `c3k.ton` runtime
- storage daemon lifecycle
- packaging/signing
- auto-update

## Полезные env для локального теста

Минимально достаточно этого:

```bash
NEXT_PUBLIC_C3K_STORAGE_ENABLED=1
C3K_STORAGE_ENABLED=1
NEXT_PUBLIC_C3K_STORAGE_DESKTOP_CLIENT_ENABLED=1
C3K_STORAGE_DESKTOP_CLIENT_ENABLED=1
NEXT_PUBLIC_C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED=1
C3K_TON_SITE_DESKTOP_GATEWAY_ENABLED=1
NEXT_PUBLIC_C3K_DESKTOP_APP_SCHEME=c3k
C3K_DESKTOP_APP_SCHEME=c3k
NEXT_PUBLIC_C3K_DESKTOP_GATEWAY_HOST=127.0.0.1
C3K_DESKTOP_GATEWAY_HOST=127.0.0.1
NEXT_PUBLIC_C3K_DESKTOP_GATEWAY_PORT=3467
C3K_DESKTOP_GATEWAY_PORT=3467
NEXT_PUBLIC_C3K_DESKTOP_TON_SITE_HOST=c3k.ton
C3K_DESKTOP_TON_SITE_HOST=c3k.ton
```

Если web-app поднят не на `127.0.0.1:3000`, то для desktop shell можно указать:

```bash
C3K_DESKTOP_RUNTIME_URL=http://127.0.0.1:3000/api/desktop/runtime npm run desktop:dev
```
