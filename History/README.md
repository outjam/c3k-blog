# History

Эта папка нужна как операционная память проекта.

В отличие от `Documentation/`, где описываются:

- архитектура
- бизнес-логика
- roadmap
- ТЗ

папка `History/` нужна для хронологии работы:

- что именно обсуждали
- что именно сделали
- какие решения приняли по ходу
- какие задачи реально закрыли
- какие темы остались открытыми после конкретной рабочей сессии

## Что хранить в History

### 1. `sessions/`

Помесячные или подневные summaries рабочих сессий.

Там фиксируются:

- что было запросом
- что было реализовано
- какие решения и компромиссы приняли
- какие риски увидели
- что осталось следующим шагом

Это не сырой verbatim-чат, а нормализованный рабочий digest.

### 2. `completed-backlog.md`

Подробный журнал уже завершённых задач.

Он должен быть:

- детальнее, чем `roadmap/project-status-checklist.md`
- более инженерным
- с привязкой к доменам и результатам

### 3. Дополнительные файлы

При необходимости здесь можно добавлять:

- отдельные retrospective notes
- migration journals
- incident notes
- feature implementation diaries

## Как использовать вместе с Documentation

- `Documentation/roadmap/project-status-checklist.md`
  - быстрый статус проекта
- `Documentation/roadmap/production-roadmap.md`
  - стратегический план
- `Documentation/process/implementation-log.md`
  - инженерный журнал крупных slices
- `History/`
  - детальная хронология нашей фактической работы

## Правило обновления

После каждого заметного этапа нужно:

1. Обновить `sessions/` новой записью или дополнить текущую
2. Перенести завершённые задачи в `completed-backlog.md`
3. При необходимости синхронизировать:
   - `Documentation/process/implementation-log.md`
   - `Documentation/roadmap/project-status-checklist.md`
