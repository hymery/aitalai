# Айталай — башкирская языковая школа

Единый MVP: адаптивный веб-курс и Telegram Mini App, FastAPI, PostgreSQL/SQLite и aiogram-бот. Ученик проходит карточки, практику и босс-квесты, проверяет народные переводы и получает XP. Учитель видит отчёт по классу, эксперт модерирует спорные переводы и экспортирует подтверждённый корпус.

## Что внутри

- Два раздела: урок 1 — карточки с переворотом и TTS, уроки 2–3 — `word_bank`, `fill_blank`, `match_pairs`, `chat_choice`, затем босс с Өләсәй.
- Последовательное открытие уроков, 5 жизней в практике, серверный прогресс; повтор урока не начисляет XP повторно.
- JWT-регистрация и вход, ежедневные задания (+10 XP за подтверждение, +15 XP за исправление).
- 6 рейтингов с 5 периодами, профиль, отчёт учителя, модерация, экспорт JSON/CSV.
- Telegram-регистрация, Mini App и ежедневные напоминания.

## Требования

Для Docker: Docker Desktop с Docker Compose v2. Для ручного запуска: Python 3.11+, Node.js 20.19+ или 22.12+, npm. PostgreSQL локально необязателен: без `DATABASE_URL` backend пробует PostgreSQL и затем использует SQLite.

## Быстрый запуск в Docker

```powershell
copy backend\.env.example backend\.env
copy bot\.env.example bot\.env
docker compose up --build db backend frontend
```

Откройте `http://localhost:5173`; API и Swagger — `http://localhost:8000/docs`. PostgreSQL и демо-данные создаются автоматически.

Для всей системы замените `BOT_TOKEN` в `bot/.env` на токен @BotFather и выполните:

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
# Укажите настоящий BOT_TOKEN в .env
python bot.py
```

## Демо-аккаунты

Пароль всех seed-аккаунтов: `1234`.

| Роль | Email | Назначение |
|---|---|---|
| Ученик | `aigul@example.com` | курс, задания, рейтинги |
| Ученик | `timur@example.com` | второй учебный профиль |
| Учитель | `teacher@example.com` | отчёт по школе и классу |
| Администратор | `admin@example.com` | отчёты, модерация, экспорт |

Для готового отчёта: школа `МАОУ «БЛИ № 3» г. Стерлитамак`, класс `7А`.

## Telegram на телефоне

Telegram требует публичный HTTPS-адрес Mini App. Поднимите HTTPS-туннель к frontend и укажите его в `bot/.env` как `WEBAPP_URL=https://...`, затем перезапустите бота. API, который вызывает браузер, тоже должен быть публичным HTTPS: соберите frontend с `VITE_API_URL=https://...`, иначе будут ошибки `localhost` или mixed content. Для production разместите собранный `frontend/dist` на HTTPS-хостинге и задайте тот же публичный API.

`USE_MOCK=0` — основной режим. Заглушки в `bot/api.py` и старом `bot/webapp` оставлены только для изолированной демонстрации.

## Структура

| Папка | Содержимое |
|---|---|
| `backend/` | FastAPI, SQLAlchemy, JWT, seed и импорт Hugging Face |
| `frontend/` | Vanilla JS + Vite, общий курс и Mini App |
| `bot/` | aiogram 3, FSM-регистрация, напоминания, статический сервер |
| `docker-compose.yml` | PostgreSQL, backend, frontend и bot |

## Основные API

| Метод и путь | Назначение |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | аккаунт и JWT |
| `GET /course/progress`, `POST /course/complete` | прогресс и однократное начисление XP |
| `GET /tasks/daily`, `POST /tasks/submit` | народная проверка переводов |
| `GET /ratings/{top,schools,classes,accuracy,vocabulary,corrections}` | рейтинги, `period=day/week/month/year/all` |
| `GET /teacher/class-report?school=...&class_name=...` | отчёт учителя |
| `GET /moderation/disputed`, `POST /moderation/resolve` | экспертная модерация |
| `GET /translations/export?format=json|csv` | подтверждённые переводы |
| `GET/POST /bot/state...` | состояние Telegram-бота |
| `GET /health` | проверка API |

## Переменные окружения

| Компонент | Переменные |
|---|---|
| backend | `DATABASE_URL`, `SECRET_KEY`, `JWT_ALGORITHM`, `ACCESS_TOKEN_EXPIRE_MINUTES`, необязательный `HF_TOKEN` |
| frontend | `VITE_API_URL` — публичный URL API для браузера, задаётся до сборки |
| bot | `BOT_TOKEN`, `API_URL`, `USE_MOCK`, `WEBAPP_URL`, `WEBAPP_DIR`, `TELEGRAM_PROXY`, `REMINDER_*`, `USERS_FILE` |

Примеры лежат в `.env.example` каждой папки. `.env`, базы, токены и `users.json` исключены из Git. Для публичного окружения обязательно замените `SECRET_KEY` и пароль PostgreSQL.

## Данные и озвучивание

`python seed.py` безопасно повторять: существующие пользователи и фрагменты не дублируются. `python import_hf.py` импортирует разговорник Hugging Face; `HF_TOKEN` нужен только если сервис требует авторизацию.

TTS использует системный `speechSynthesis`: выбирается башкирский голос (`ba*`), при его отсутствии — русский. Доступность и качество башкирского произношения зависят от устройства и браузера.

## Проверки

```powershell
python -m compileall -q backend bot
node --check frontend/app.js
node --check frontend/course-data.js
node --check bot/webapp/app.js
cd frontend
npm run build
```

Текущий статус и границы MVP описаны в `CHECKPOINT_AND_PITCH.md`.
