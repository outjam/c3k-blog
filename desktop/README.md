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
