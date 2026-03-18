# ADR-0001: C3K Storage Node реализуется как Electron desktop app

## Статус

Принято

## Дата

2026-03-18

## Контекст

`TON Storage` требует runtime, который умеет:

- запускать `storage-daemon`
- работать с локальной файловой системой
- жить в фоне
- переживать перезапуск ОС

Telegram Mini App и обычный браузер не подходят как основная storage-node среда.

## Решение

`C3K Storage Node` реализуется как desktop-приложение на:

- `Electron`
- `TypeScript`
- renderer UI на `React`

## Причины

- единый стек для macOS, Windows, Linux
- быстрый старт силами web-команды
- удобный доступ к process management и файловой системе
- возможность встроить tray, auto-update и local gateway

## Последствия

### Плюсы

- быстрее выйти в beta
- проще совмещать storage node и TON Site gateway
- проще reuse UI и frontend stack

### Минусы

- desktop runtime тяжелее native-клиента
- нужно внимательно закрывать IPC и renderer security
- придется поддерживать packaging и signing

## Следствие для кода

- все локальные process/filesystem операции идут через `main process`
- renderer не получает прямой `nodeIntegration`
- нужен `preload` bridge
