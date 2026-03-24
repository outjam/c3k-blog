# Session Summary — 2026-03-24

## Основная тема

Продолжение `Sprint 10 — Real TON Storage test runtime` с фокусом на том, чтобы storage contour стал не только умеющим upload pointer, но и умеющим проверять его пригодность для реальной выдачи файла.

## Что было сделано

### Production desktop поверх локальной ноды

- В [desktop runtime client](/Users/culture3k/Documents/GitHub/c3k-blog/src/lib/desktop-runtime-api.ts) добавлен приоритет `window.c3kDesktop.runtime()` над HTTP `/api/desktop/runtime`
- Это дало рабочий contour:
  - локальный `storage-daemon`
  - локальный `storage-daemon-cli`
  - локальный Next runtime control-plane
  - продовый UI `https://c3k-blog.vercel.app/storage/desktop`
- Для Vercel добавлен [.vercelignore](/Users/culture3k/Documents/GitHub/c3k-blog/.vercelignore), чтобы deploy не тащил `.local/ton` и nested `c3k/`

### One-click launcher для локальной storage-ноды

- Добавлен [scripts/desktop-node-launcher.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/scripts/desktop-node-launcher.mjs)
- Он одной командой умеет:
  - поднимать `storage-daemon`
  - поднимать local Next runtime control-plane
  - запускать Electron на prod UI Vercel
  - передавать Electron локальный runtime URL
- Добавлены root scripts:
  - `npm run desktop:node`
  - `npm run desktop:node:headless`
- Headless smoke-test прошёл успешно: launcher корректно переиспользовал уже поднятые daemon/runtime процессы и подтвердил готовый node contour

### Telegram Login popup закреплён внутри Electron

- В [desktop/main.mjs](/Users/culture3k/Documents/GitHub/c3k-blog/desktop/main.mjs) popup handler теперь считает `oauth.telegram.org` и same-origin web-app URL доверенными popup-поверхностями
- Для них открывается встроенное modal window внутри desktop-клиента
- Это нужно, чтобы browser Telegram Login flow не уезжал во внешний браузер и не терял связь с основным Electron окном

### Отдельный pitch deck простыми словами

- В проект добавлена отдельная презентация:
  - [Презентация C3K — простыми словами](/Users/culture3k/Documents/GitHub/c3k-blog/Documentation/Мечты/Презентация%20C3K%20%E2%80%94%20простыми%20словами.md)
- Она объясняет продукт без технического языка:
  - как работает приложение для обычного человека
  - как работает для артиста
  - в чём главная ценность
  - как работает модель дохода
  - как расти по нагрузке и инфраструктуре
  - почему `TON Storage` важен не как “модный термин”, а как полезная часть продукта

### 1. Runtime pointer verification

- После upload completion bag теперь получает runtime fetch state:
  - `pending`
  - `verified`
  - `failed`
- Верификация идёт через gateway probe для `tonstorage://` pointer.
- Если pointer реально отвечает, bag автоматически становится ближе к состоянию реального delivery-ready runtime.

### 2. Bag file manifest

- Система теперь фиксирует не только сам bag, но и файл внутри bag.
- Это важно, потому что пользователю нужно отдать не абстрактный контейнер, а конкретный трек или архив релиза.
- Именно этот manifest потом нужен для:
  - gateway retrieval
  - web delivery
  - Telegram delivery

### 3. Storage health visibility

- При успешной или неуспешной runtime verification в storage registry теперь пишутся health events.
- Это превращает историю upload в операторски полезный контур:
  - видно, что upload прошёл
  - видно, что gateway реально подтверждает или не подтверждает pointer

### 4. Admin storage dashboard

- В storage dashboard теперь видно:
  - сколько bags уже имеют `real pointer`
  - сколько из них `verified`
  - сколько `failed`
  - какие file paths уже зафиксированы внутри bag
- В карточках bags теперь выводятся:
  - runtime fetch status
  - gateway URL
  - runtime fetch error, если есть
  - первые file paths bag manifest

### 5. Verified pointer вошёл в delivery layer

- Если bag уже confirmed через gateway, runtime теперь старается использовать именно его для выдачи файла.
- Это распространяется на:
  - web download
  - Telegram delivery
  - operator runtime checks
- То есть `TON Storage` перестаёт быть просто подготовленным рядом слоем и начинает реально участвовать в выдаче контента.

### 6. Upload completion будит старые запросы на выдачу

- После того как asset/bag стал runtime-ready, система теперь умеет пересматривать уже существующие запросы на delivery.
- Это особенно важно для сценария:
  - пользователь запросил файл слишком рано
  - bag тогда ещё не был готов
  - позже upload завершился и pointer стал рабочим
- Теперь такие запросы могут автоматически перейти в рабочий статус без обязательного ручного retry.

### 7. История выдачи теперь знает реальный runtime path

- После web download и Telegram delivery request теперь сохраняет:
  - через что именно файл был реально получен
  - какой source URL или gateway был использован
- Это уже выведено на user-facing экраны, поэтому пользователь может увидеть, сработал ли `TON Storage gateway` или система всё ещё отдала файл через fallback.

### 8. Локальный server-side upload cycle из админки

- В storage dashboard появился ещё один практический шаг между симуляцией и полноценным внешним worker:
  - `Прогнать upload once`
- Этот режим нужен именно для локального теста:
  - забрать один prepared job
  - получить source bytes
  - пройти текущий bridge mode
  - попытаться закончить upload через server-side process
- Это не финальная архитектура runtime, но очень удобный мост к первому живому `storage-daemon` тесту.

### 9. Targeted upload по конкретному asset

- После общего `upload once` добавлен и более точный операторский сценарий:
  - выбрать конкретный asset
  - прогнать upload именно для него
- Это полезно, когда нужно проверить один конкретный релиз или проблемный track, а не следующую случайную prepared job из очереди.

### 10. Живой bridge preflight

- В storage admin появился отдельный preflight для `storage-daemon-cli` и gateway.
- Он теперь показывает не только env-конфиг, но и реальную операционную готовность:
  - запускается ли CLI
  - отвечает ли gateway
  - можно ли уже идти в первый живой testnet upload

### 11. Runtime probe стал честнее по смыслу

- По выводу admin storage стало видно, что `Runtime fetch доступен` ещё не означает “это уже TON Storage”.
- Поэтому UI теперь прямо объясняет, через что прошёл fetch:
  - реальный `TON Storage gateway`
  - или fallback source path
- Это важно, чтобы оператор не путал “файл доступен” с “живой storage runtime уже готов”.

### 12. Per-asset operator flow

- На карточках assets в storage admin теперь видно состояние pipeline именно по этому файлу:
  - последний job
  - mode
  - bag status
  - runtime status
- И самое важное: теперь можно не только грузить asset, но и:
  - сначала подготовить его
  - или сразу пройти `подготовить + загрузить`
- Это сокращает путь к первому живому testnet-тесту на одном конкретном релизе или треке.

### 13. Server-side one-shot для prepare+upload

- `Подготовить + загрузить` больше не выполняется как просто два отдельных client-side вызова.
- Для него теперь есть серверный one-shot маршрут, который делает весь цикл сам и отдаёт один итоговый результат.
- Это делает storage admin ближе к реальному операторскому инструменту, где нужен единый статус операции, а не две разрозненные стадии.

### 14. Reverify для bag после поднятия gateway

- У bag появился отдельный шаг `Перепроверить runtime`.
- Это нужно на случай, если:
  - bag уже существует
  - gateway или pointer contour стал доступен позже
  - нужно добить runtime readiness без повторного upload
- После reverify storage может сразу обновить status bag и пересобрать delivery-ready состояние для связанных файлов.

### 15. Массовый reverify после поднятия gateway

- После одиночного bag reverify добавлен и bulk-flow для pointer-ready bags.
- Это даёт очень практичный операторский сценарий:
  - подняли gateway
  - нажали одну кнопку
  - все подходящие bags попытались перейти в `verified`
  - delivery начала оживать без повторного upload
- Этот кусок уже похож на реальную эксплуатацию storage runtime, а не на ручной тест одного объекта.

### 16. Targeted внешний worker

- Внешний worker route и локальный script теперь умеют таргетированный claim.
- Это значит, что живой `tonstorage_cli` прогон теперь можно направить:
  - в один asset
  - в один bag
  - в один job
- Для первого реального testnet-теста это намного удобнее, чем забирать “следующую prepared job” наугад.

### 17. Готовые команды запуска worker в админке

- В storage admin появился блок с готовыми командами запуска внешнего worker.
- Он показывает:
  - env bootstrap
  - one-shot запуск
  - loop запуск
  - targeted запуск по asset/job
- Это делает путь к первому реальному `tonstorage_cli` тесту уже не “надо знать систему”, а “взял готовую команду и запустил”.

### 18. Health events стали видны прямо в storage admin

- В storage dashboard появился отдельный runtime health layer.
- Теперь видно:
  - последние события upload/verify/reverify
  - какой bag дал `verified`, а какой `failed`
  - какой следующий шаг нужен оператору после warning-события
- Кроме отдельного списка событий, последний health signal теперь выводится и прямо в карточке bag.
- Это сильно помогает на первом живом `TON Storage` тесте: можно смотреть не только на статус bag, но и на последнюю причину, почему contour сейчас выглядит именно так.

### 19. Asset-карточки стали подсказывать следующий шаг

- На карточках assets теперь есть короткая подсказка, что делать дальше по pipeline.
- Вместо ручного чтения `job status`, `bag status` и `runtime status` оператор получает человеческое направление:
  - подготовить asset
  - дождаться ingest
  - запускать upload
  - делать runtime reverify
  - или уже проверять delivery
- Для первого живого testnet-прогона это очень полезно, потому что storage admin начинает реально вести пользователя по шагам.

### 20. Bridge preflight вошёл в общую runtime history

- Результат `Проверить daemon/gateway` теперь записывается как runtime event.
- То есть bridge readiness больше не живёт только в одном разовом ответе кнопки.
- В истории уже можно увидеть:
  - `bridge_preflight_ok`
  - `bridge_preflight_simulated`
  - `bridge_preflight_failed`
- Это делает operator UX гораздо сильнее: при первом живом тесте уже видно не только текущее состояние, но и что именно происходило с bridge между попытками.

### 21. Source probe для asset перед живым upload

- На карточках assets теперь можно отдельно проверить сам источник файла.
- Это даёт быстрый ответ:
  - отвечает ли `sourceUrl`
  - жив ли `audioFileId`
  - можно ли вообще идти в живой upload этого asset
- Для первого реального testnet-прогона это очень практично: оператор сначала подтверждает source, потом запускает upload, а не наоборот.

### 22. Asset получил собственную runtime history

- После этого шага storage admin пишет события не только по bridge и bag, но и по самому asset.
- Поэтому прямо на карточке файла теперь видно:
  - source probe прошёл или нет
  - upload нашёл prepared job или нет
  - upload завершился или упал
- Это ещё сильнее приближает нас к реальному операторскому инструменту для live `TON Storage` теста.

### 23. Asset-history стала общей и для внешнего worker

- Логика записи asset-level runtime events теперь живёт не только в server-side upload path, а глубже, в completion flow.
- Поэтому внешний worker, simulated upload и server-side upload now пишут одну и ту же историю.
- Это делает storage admin гораздо надёжнее как операторский экран для живого теста: больше нет разницы между путями upload с точки зрения диагностики.

### 24. Live readiness verdict по asset

- После этого шага у asset появился почти финальный operator-check перед живым upload.
- Он в одном месте собирает:
  - готовность source
  - готовность bridge
  - наличие prepared job
  - bag/runtime status
- Это уже очень близко к завершению подготовительной части `Sprint 10`: дальше остаётся сам живой прогон через настоящий `tonstorage_cli + gateway`.

### 25. Targeted worker-команды теперь привязаны к asset

- После `live readiness` на карточке asset теперь сразу видны команды для внешнего worker именно по этому файлу.
- Это закрывает последний UX-разрыв перед живым тестом:
  - не нужно искать job вручную
  - не нужно пересобирать shell-команду
  - всё уже лежит рядом с verdict по asset

### 26. Командный пакет на asset-карточке стал цельным

- После этого шага asset-карточка больше не собирает worker-команды из повторяющихся вызовов helper прямо в JSX.
- Теперь там есть один нормальный per-asset command pack:
  - env bootstrap
  - daemon probe
  - targeted `--asset`
  - targeted `--job`
  - gateway check
  - pointer line
- Это небольшой, но очень полезный шаг перед живым тестом: оператору проще доверять экрану, когда он не расползается на дублируемую логику.

### 27. Live readiness теперь не застаивается после prepare/upload

- До этого карточка asset могла честно показывать старый `live readiness`, хотя prepare, upload или reverify уже изменили реальное состояние pipeline.
- Теперь после:
  - `Проверить source`
  - `Подготовить этот asset`
  - `Загрузить этот asset`
  - `Подготовить + загрузить`
  - `Перепроверить runtime`
  asset автоматически пересобирает свой `live readiness`.
- Это важно именно для первого живого `TON Storage` теста: оператор больше не пойдёт запускать worker по устаревшим командам или по старому verdict.

### 28. Внутри приложения появился свой TON runtime gateway

- После этого шага чтение реального bag больше не зависит только от внешнего HTTP gateway.
- Появился встроенный app-level route:
  - health endpoint
  - file endpoint по `bagId/filePath`
- Он читает bag через живой `storage-daemon-cli`, а upload path теперь использует `create --copy --json`, чтобы файл реально жил внутри daemon storage.

### 29. Sprint 10 реально закрыт живым local test

- В этой же сессии были:
  - скачаны официальные TON binaries для mac arm64
  - поднят локальный `storage-daemon` на testnet config
  - реально создан bag
  - реальный файл из него возвращён через `/api/storage/runtime-gateway/<BagID>/hello.txt`
- Это уже не simulated contour.
- Это и есть первый честный local end-to-end runtime test для `Sprint 10`.

## Зачем это было нужно

- До этого upload completion говорил только “bag создан” или “pointer записан”.
- Но для реального `TON Storage` этого мало:
  - нужно понимать, сможет ли runtime реально выдать файл
  - по какому пути внутри bag он должен это сделать
- После этого среза storage contour стал ближе к настоящему runtime, а не только к подготовке метаданных.

## Следующий шаг

- Перейти в `Sprint 11` и подключать desktop node runtime к уже живому storage contour:
  - локальный статус ноды
  - desktop retrieval path
  - реальные runtime-точки на карте нод

### 30. Desktop Telegram auth больше не упирается во встроенный popup как основной путь

- Для Electron собран desktop-specific login bridge:
  - вход открывается во внешнем браузере
  - браузерная страница `/auth/desktop-telegram` делает обычный Telegram login
  - после этого браузер отдаёт короткий bridge token в локальный gateway `127.0.0.1:3467`
  - Electron main process обменивает bridge token на `c3k_tg_auth` session и перезагружает desktop webview уже в авторизованном состоянии
- Это закрывает неприятный UX, где авторизация происходила во встроенном browser window Electron, а не в основном браузере пользователя.
- Продовый домен [c3k-blog.vercel.app](https://c3k-blog.vercel.app) уже обновлён под этот flow.

### 31. Desktop теперь реально качает файл через локальную ноду

- `storage/open` в desktop gateway больше не просто отвечает заглушкой.
- Electron main process теперь:
  - разбирает `tonstorage://` pointer
  - выбирает локальный runtime gateway, если нода готова
  - падает обратно на удалённый download route только как fallback
  - шлёт в renderer события о handoff и прогрессе загрузки
- На desktop-экране появился блок последнего handoff:
  - источник
  - request id
  - storage pointer
  - прогресс загрузки
- Живой тест прошёл:
  - реальный bag читался через `/api/storage/runtime-gateway/<BagID>/hello.txt`
  - desktop handoff выбрал `local_node`
  - файл появился в системных Downloads

### 32. Desktop node получил реальные метрики участия

- Runtime contract расширен тремя новыми блоками:
  - `storage`
  - `health`
  - `participation`
- Теперь desktop считает не только `daemon/gateway/bagCount`, но и:
  - storage root path
  - объём локальных данных
  - свободное место на диске
  - verified bags
  - recent health summary
  - beta-preview `C3K Credit` на день и неделю
- Экран ноды теперь показывает уже не только “нода жива”, а “насколько она реально готова участвовать в storage program”.

### 33. Local node heartbeat подготовлен для storage registry

- One-click launcher теперь передаёт runtime путь к локальному storage root.
- Desktop runtime пытается heartbeat’ить локальную ноду в storage registry как `community_node`, если на машине действительно есть живой local runtime/daemon.
- Это ещё не финальный participant economy, но уже backend-подготовка к следующему слою storage program.

### 34. Desktop local-node download теперь пишет назад в delivery history

- До этого локальный desktop-download честно забирал файл через ноду, но история выдач об этом не узнавала.
- Теперь после `download completed` desktop отправляет callback в delivery layer.
- Для этого добавлен отдельный route `desktop-complete`, а desktop page вызывает его автоматически только для `local_node` handoff.
- Итог:
  - request переходит в `delivered`
  - в историю пишется `lastDeliveredVia=bag_http_pointer`
  - дальше это можно использовать и для user-facing истории, и для будущих participant/reward расчётов
