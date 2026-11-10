# Локальные правки velxio (self-hosted)

Клон https://github.com/davidmonterocrespo24/velxio (master), без коммитов —
при обновлении (`git pull`) правки нужно перенести заново (см. список ниже).
Лицензия AGPLv3 — правки допустимы, обязательства касаются только этого репо.

## 1. `backend/app/services/arduino_cli.py`

**Причина:** сеть колледжа отдаёт 403 на downloads.arduino.cc и бесконечно
висит на скачивании индекса drazzy.com (0 B, вечный retry) — а сервис
`ArduinoCLIService` при каждом старте бэкенда вызывает `config add` /
`core update-index` без таймаута, из-за чего uvicorn вообще не поднимался.

**Правки:**
- из `CORE_URLS` закомментированы `esp32:esp32` (нет ESP-IDF — не используется)
  и `ATTinyCore:avr` (drazzy.com недоступен). Для Uno/Pico этого достаточно;
- всем стартовым вызовам `subprocess.run` (config init/dump/add,
  `core update-index` — timeout 30/45/90, `core list` — 45,
  `core install` — 900) добавлены `timeout=...` (ранее — вечное зависание);
- тем же вызовам добавлено `encoding='utf-8', errors='replace'` вместо
  `text=True` — на русской Windows (cp1251) читаемая «в лоб» выдача
  arduino-cli с прогресс-барами роняла reader-поток UnicodeDecodeError.

## 2. `frontend/src/main.tsx` — мост works-core

**Причина:** СДО (works-core) встраивает редактор в `<iframe>` на странице
задания. Нужны два канала (origin у СДО и velxio разные, поэтому
единственный легальный транспорт — postMessage; простые JSON-сообщения с
`'*'`):

*Экспорт схемы* — кнопка «📥 Импортировать схему в отчёт» в СДО:
- вход: `{wc:'velxio-export', id}` (проверка `data.wc`, остальное игнорируется);
- перед снимком вызывается `flushChipFileSync()` — файлы чипов синхронизируются
  с дебаунсом, без сброса экспорт мог взять устаревший код (как в
  `handleExportVlx` из EditorToolbar);
- ответ: `{wc:'velxio-export-data', id, payload, error}`, где `payload` —
  результат `buildVlxPayload()` из `utils/vlxFile` (тот же снимок, что уходит
  в .vlx при скачивании проекта: платы, файлы скетчей, компоненты, провода);
- отправка `postMessage(reply, '*')` в `window.parent` (или в собственное
  окно, если открыто вкладкой). Снимок не содержит секретов (OSS-сборка
  stateless, без авторизации), поэтому проверка origin не нужна.

*Черновик работы по заданию* — чтобы собранная схема не сбрасывалась при
отправке формы отчёта или F5: OSS-сборка держит проект только в памяти,
а iframe перезагружается вместе со страницей СДО.
- при старте внутри iframe редактор шлёт родителю `{wc:'velxio-ready'}`;
  СДО отвечает `{wc:'velxio-task', task:'<id задания>'}` (также шлёт его
  при каждом клике по кнопке импорта — на случай ретраев);
- получив `velxio-task`, редактор привязывает черновик к заданию: весь
  снимок проекта (`buildVlxPayload()` после `flushChipFileSync()`) пишется
  в localStorage с ключом `velxio_ws_draft_<id задания>` — автосохранение
  раз в 3 с и на `pagehide`;
- при загрузке черновик восстанавливается через
  `useSimulatorStore.loadProjectState()` с повторами через 1,5/3/5/8 с:
  стартер `/example/...` грузится асинхронно и мог бы перезаписать
  восстановленное позже — повторы это ловят. Повтор пропускается, если в
  рабочей области уже есть работа студента (`workspaceHasWork()` из
  `utils/workspaceDraft`: компоненты/провода/вторая плата/Pro-плата/
  изменённые файлы);
- вне iframe (открыто вкладкой) черновики не пишутся, `velxio-ready`
  не шлётся.

Референс-тесты round-trip (headless Edge, харнесс same-origin в
`frontend/public`, 09.11.2026):
- экспорт: ответ `payload.format === 'velxio-project'` — PASS;
- E2E черновика: правка кода → автосохранение в `velxio_ws_draft_*` →
  `location.reload()` iframe → `velxio-ready` → `velxio-task` → правка
  восстановлена, экспорт содержит её же — PASS.

## 3. Прочее

- `arduino-cli` 1.5.1 лежит в `E:\AI\velxio\bin`, PATH добавляют
  `start-velxio.bat` и автозапуск СДО (server.py `--sim`).
- Ядра arduino:avr 1.8.8 (+ esp32 2.0.9) уже были установлены в системе
  (`%LOCALAPPDATA%\Arduino15`) — установка ядра при старте не требуется.
- `start-velxio.bat` переписан: запуск через PowerShell `Start-Process
  -WindowStyle Hidden` с логами в `_сим-бэкенд.log` / `_сим-фронтенд.log`
  (раньше открывались два свёрнутых окна cmd). Остановка: `stop-velxio.bat`.
- СДО может запускать velxio сама: `START.bat` в works-core или
  `python server.py --sim` (флаг `CREATE_NO_WINDOW` — окон нет).

## Интеграция с works-core

Модуль `modules/sim` в works-core встраивает симулятор в страницу задания
(iframe + кнопки «Открыть симулятор» и «Импортировать схему в отчёт»).
База адреса строится из хоста, на котором открыт СДО, + порт из настроек
(`modules/sim/модуль.json` → «порт», по умолчанию 5173); явный «url» имеет
приоритет. Привязка адреса к заданию — в панели преподавателя.
