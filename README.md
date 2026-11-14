# Әйтәләй — башкирская языковая школа

Единый MVP: адаптивный веб-курс, Telegram Mini App и MAX WebApp, FastAPI, PostgreSQL/SQLite, Telegram- и MAX-боты. Карта, упражнения, истории, очки и разблокировки работают через реальный backend. Ученик проверяет народные переводы и пополняет словарь; учитель видит отчёт по классу; эксперт модерирует спорные переводы и экспортирует подтверждённый корпус.

## Что внутри

- Три курса: **«Чаепитие у Өләсәй»**, **«Моя семья и друзья»**, **«Путешествие с Аҡбуҙатом»**.
- В каждом курсе четыре последовательных этапа:
  1. 8 карточек с переворотом, примерами и башкирской Silero TTS, затем 8 вопросов квиза;
  2. 5 заданий `build_sentence` на сборку предложений с возможностью ручного ввода;
  3. 4 задания `fill_blank` и 8 пар `match_pairs`;
  4. история из 4 диалоговых шагов и награда.
- Максимум за этапы: 20 / 40 / 60 / 100 очков. Начисление зависит от процента верных ответов; повторное прохождение не добавляет очки повторно.
- JWT-регистрация и вход, серверный прогресс и последовательная разблокировка курсов. В профиле — поиск и выбор школы РБ, класс и `school_id`.
- Башкирская панель букв и полноценная экранная клавиатура в поиске, письменных заданиях, проверке и предложении переводов. Вставка идёт в позицию курсора без потери фокуса.
- Живой поиск по парам `fragments` на башкирском и русском языках.
- Ежедневная проверка переводов: +10 очков за подтверждение, +15 за исправление. Предложение новой пары: +20 очков; дубликаты и простой спам отклоняются.
- 4 категории рейтинга — «Ученики», «Классы», «Школы» и «Моя школа» — с 3 периодами. Профиль, отчёт учителя и модерация. Собственные ответы экспортируют все авторизованные пользователи, подтверждённый корпус — только учителя и эксперты.
- Регистрация и вход проходят в Mini App. Telegram-бот открывает приложение, восстанавливает привязанную сессию и поддерживает `/task`, `/progress`, `/notifications`, ежедневные напоминания и уведомления о серии, рейтинге и подтверждении переводов. MAX-бот открывает WebApp и присылает ежедневные напоминания подписчикам.

## Требования

Для Docker: Docker Desktop с Docker Compose v2. Для ручного запуска: Python 3.11+, Node.js 20.19+ или 22.12+, npm. PostgreSQL локально необязателен: без `DATABASE_URL` backend пробует PostgreSQL и затем использует SQLite.

## Быстрый запуск в Windows

После установки зависимостей по инструкции ниже запустите `start.bat` двойным кликом или командой:

```powershell
.\start.bat
```

Скрипт поднимает backend и frontend, открывает приложение и Swagger. Telegram- и MAX-боты запускаются только при наличии настоящих `TELEGRAM_BOT_TOKEN` и `MAX_BOT_TOKEN` в `bot/.env`; без токенов они пропускаются.

## Быстрый запуск в Docker

```powershell
copy backend\.env.example backend\.env
copy bot\.env.example bot\.env
docker compose up --build db backend frontend
```

Откройте `http://localhost:5173`; API и Swagger — `http://localhost:8000/docs`. PostgreSQL, демо-данные и три курса создаются автоматически.

Для Telegram замените `TELEGRAM_BOT_TOKEN` в `bot/.env` на токен @BotFather и выполните:

```powershell
docker compose up --build
```

Бот раздаёт общий frontend на `http://localhost:8080`. Остановка: `docker compose down`; удаление базы вместе с контейнерами: `docker compose down -v`.

## Ручной запуск: три терминала

Backend:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
python seed.py
python build_courses.py
uvicorn main:app --reload --port 8000
```

Frontend:

```powershell
cd frontend
npm ci
copy .env.example .env
npm run dev
```

Telegram-бот:

```powershell
cd bot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Укажите настоящий TELEGRAM_BOT_TOKEN в .env (поддерживается и BOT_TOKEN)
python bot.py
```

MAX-бот (во втором терминале после указания `MAX_BOT_TOKEN`):

```powershell
cd bot
.\.venv\Scripts\Activate.ps1
python max_bot.py
```

`seed.py` и `build_courses.py` можно повторять: демо-пользователи не дублируются, учебные материалы трёх курсов пересобираются, а прогресс пользователей сохраняется.

## Демонстрация за две минуты

1. **0:00–0:20 — вход и живая карта.** Откройте frontend, войдите как `aigul@example.com` / `1234`. Карта и прогресс загружаются через `GET /courses/units`.
2. **0:20–0:50 — карточки и квиз.** Откройте первый этап «Чаепитие у Өләсәй», переверните карточку, прослушайте слово, пройдите карточки и ответьте на вопросы. Завершение отправляет `POST /courses/units/1/complete`; очки обновляются, следующий этап разблокируется.
3. **0:50–1:20 — сообщество.** Во вкладке «Сообщество» введите в поиске слово из карточки или русский перевод. Затем на вкладке «Проверка» оцените перевод либо на вкладке «Предложить» добавьте новую пару и получите 20 очков.
4. **1:20–1:40 — рейтинг.** Откройте «Рейтинг», смените категорию или период и покажите общий баланс очков.
5. **1:40–2:00 — роли.** Выйдите и войдите как `teacher@example.com` / `1234`. В «Кабинете» сформируйте отчёт для школы `МАОУ «БЛИ № 3» г. Стерлитамак`, класса `7А`; в «Профиле» доступен экспорт корпуса.

Для показа полного цикла курса пройдите все четыре этапа первого раздела: после истории откроется «Моя семья и друзья», а затем «Путешествие с Аҡбуҙатом».

## Демо-аккаунты

Пароль всех seed-аккаунтов: `1234`.

| Роль | Email | Назначение |
|---|---|---|
| Ученик | `aigul@example.com` | курс, задания, рейтинги |
| Ученик | `timur@example.com` | второй учебный профиль |
| Учитель | `teacher@example.com` | отчёт по школе и классу |
| Администратор | `admin@example.com` | отчёты, модерация, экспорт |

## Telegram и MAX на телефоне

Telegram требует публичный HTTPS-адрес Mini App. Поднимите HTTPS-туннель к frontend и укажите его в `bot/.env` как `WEBAPP_URL=https://...`, затем перезапустите бота. API тоже должен быть доступен по HTTPS: используйте `VITE_API_URL=/api` с reverse proxy на том же домене либо публичный HTTPS-адрес API, иначе возникнут ошибки `localhost` или mixed content. Для production разместите собранный `frontend/dist` на HTTPS-хостинге и настройте API.

`USE_MOCK=0` — основной режим. Заглушки в `bot/api.py` и старом `bot/webapp` оставлены только для изолированной демонстрации. Регистрация выполняется в Mini App через `/auth/register`; бот не запрашивает email и пароль. Для привязанного аккаунта JWT сохраняется в `/bot/state`, а Mini App восстанавливает сессию по Telegram ID. Локальный реестр `users.json` также хранит JWT для персональных уведомлений; не публикуйте этот файл. Срок действия JWT задаётся `ACCESS_TOKEN_EXPIRE_MINUTES`.

MAX-бот использует официальный `platform-api2.max.ru`, кнопку `open_app` для HTTPS-адреса и Long Polling для локальной разработки. Для production MAX рекомендует HTTPS webhook через `POST /subscriptions`; текущий модуль webhook не создаёт. Внешняя доставка Telegram/MAX требует настоящих токенов и отдельной проверки в соответствующих приложениях.

## Структура

| Папка | Содержимое |
|---|---|
| `backend/` | FastAPI, SQLAlchemy, JWT, школы, Silero TTS, seed и курсы |
| `frontend/` | Vanilla JS + Vite, общий курс, клавиатура и Mini App |
| `bot/` | aiogram 3, MAX Bot API, уведомления, статический сервер |
| `docker-compose.yml` | PostgreSQL, backend, frontend и Telegram-бот |

## Основные API

| Метод и путь | Назначение |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me` | аккаунт, JWT, школа и класс |
| `GET /schools?q=...&limit=20` | поиск по справочнику школ РБ |
| `GET /courses/units` | три курса, прогресс и доступность этапов |
| `GET /courses/units/{unit_id}` | карточки, квиз, упражнения и шаги истории |
| `POST /courses/units/{unit_id}/complete` | завершение `circle` со `score`, очки и разблокировка |
| `GET /fragments/search?q=...&limit=20&lang_pair=ba-ru` | живой поиск по общему словарю |
| `POST /fragments/propose` | новая пара `text_ba` + `translation`, +20 очков |
| `GET /tasks/daily`, `POST /tasks/submit` | народная проверка переводов |
| `GET /ratings/{top,schools,classes,accuracy,vocabulary,corrections}` | рейтинги, `period=day/week/month/year/all` |
| `GET /teacher/class-report?school=...&class_name=...` | отчёт учителя |
| `GET /moderation/disputed`, `POST /moderation/resolve` | экспертная модерация |
| `GET /answers/me?format=json|csv` | экспорт собственных ответов |
| `GET /translations/export?format=json|csv` | подтверждённые переводы для staff |
| `POST /api/tts` | башкирский WAV, тело `{"text":"..."}` |
| `GET/POST /bot/state...` | состояние Telegram-бота |
| `GET /health` | проверка API |

## Переменные окружения

| Компонент | Переменные |
|---|---|
| backend | `DATABASE_URL`, `SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, `TTS_ENABLED`, `TTS_MODEL_PATH`, `TTS_CACHE_DIR`, необязательный `HF_TOKEN` |
| frontend | `VITE_API_URL` — публичный URL API для браузера, задаётся до сборки |
| bot | `TELEGRAM_BOT_TOKEN` (или `BOT_TOKEN`), `MAX_BOT_TOKEN`, `API_URL`, `USE_MOCK`, `WEBAPP_URL`, `WEBAPP_DIR`, `TELEGRAM_PROXY`, `REMINDER_*`, `USERS_FILE`, `MAX_USERS_FILE` |

Примеры лежат в `.env.example` каждой папки. `.env`, базы, токены, `users.json` и `max_users.json` исключены из Git. Для публичного окружения обязательно замените `SECRET_KEY` и пароль PostgreSQL.

## Данные и озвучивание

`backend/schools_rb.json` содержит начальный проверенный набор из 57 школ: 34 полные государственные записи по приказу Минпросвещения РБ от 03.03.2026 № 261 и 23 муниципальные записи из официальных открытых источников. Это **не полный реестр всех школ республики**; `import_schools.py` позволяет расширять справочник без дубликатов.

`python import_hf.py` импортирует разговорник Hugging Face; `HF_TOKEN` нужен только если сервис требует авторизацию. После импорта повторно запустите `python build_courses.py`, чтобы обновить учебные примеры.

TTS использует Silero `v5_cis_base_nostress`, голос `bak_alfia`, 24000 Hz. Модель загружается один раз при старте, WAV кэшируются в `backend/tts_cache` по MD5 `bak_alfia:{text}`. Фронтенд останавливает предыдущий трек при новом клике и не подменяет ошибку сервера системной русской озвучкой.

Файл модели (~88 МБ) не входит в Git. Локальная копия ожидается в `backend/.cache/models/v5_cis_base_nostress.pt`; если её нет, Silero пробует скачать модель автоматически. При проблемах с TLS скачайте файл по адресу `https://huggingface.co/adeshkin/silero-models-v5-cis-base-nostress/resolve/main/v5_cis_base_nostress.pt` и укажите путь в `TTS_MODEL_PATH`. Для работы без TTS задайте `TTS_ENABLED=0`: интерфейс продолжит работать, а endpoint честно вернёт 503.

## Проверки

```powershell
python -m compileall -q backend bot
cd backend
.\.venv\Scripts\python.exe -m unittest -v test_courses.py
cd ..\bot
.\.venv\Scripts\python.exe -m unittest -v test_bots.py
cd ..\frontend
node --check app.js
node --check bashkir-keyboard.js
node --check speech.js
node --check course-data.js
npm run build
```

Полная HTTP-проверка использует изолированную SQLite и автоматически выбирает свободный случайный порт, поэтому запущенный backend на `:8000` не мешает:

```powershell
cd backend
.\.venv\Scripts\python.exe run_http_checks.py
```

Скрипт сам создаёт тестовые данные, запускает Uvicorn с `TTS_ENABLED=0`, выполняет `e2e_check.py`, останавливает сервер и удаляет временную базу. TTS проверяется отдельно через `POST /api/tts`: ответ должен иметь `audio/wav` и RIFF-заголовок. Текущий статус и границы MVP описаны в `CHECKPOINT_AND_PITCH.md`.
