# Айталай — башкирская языковая школа

Единый MVP: адаптивный веб-курс и Telegram Mini App, FastAPI, PostgreSQL/SQLite и aiogram-бот. Карта, упражнения, истории, очки и разблокировки работают через реальный backend. Ученик проверяет народные переводы и пополняет словарь; учитель видит отчёт по классу; эксперт модерирует спорные переводы и экспортирует подтверждённый корпус.

## Что внутри

- Три курса: **«Чаепитие у Өләсәй»**, **«Моя семья и друзья»**, **«Путешествие с Аҡбуҙатом»**.
- В каждом курсе четыре последовательных этапа:
  1. 8 карточек с переворотом, примерами и системным TTS, затем 8 вопросов квиза;
  2. 5 заданий `build_sentence` на сборку предложений;
  3. 4 задания `fill_blank` и 8 пар `match_pairs`;
  4. история из 4 диалоговых шагов и награда.
- Максимум за этапы: 20 / 40 / 60 / 100 очков. Начисление зависит от процента верных ответов; повторное прохождение не добавляет очки повторно.
- JWT-регистрация и вход, серверный прогресс и последовательная разблокировка курсов.
- Живой поиск по парам `fragments` на башкирском и русском языках.
- Ежедневная проверка переводов: +10 очков за подтверждение, +15 за исправление. Предложение новой пары: +20 очков; дубликаты и простой спам отклоняются.
- 6 рейтингов с 5 периодами, профиль, отчёт учителя, модерация, экспорт JSON/CSV для учителей и экспертов.
- Telegram-регистрация, общий Mini App и ежедневные напоминания.

## Требования

Для Docker: Docker Desktop с Docker Compose v2. Для ручного запуска: Python 3.11+, Node.js 20.19+ или 22.12+, npm. PostgreSQL локально необязателен: без `DATABASE_URL` backend пробует PostgreSQL и затем использует SQLite.

## Быстрый запуск в Docker

```powershell
copy backend\.env.example backend\.env
copy bot\.env.example bot\.env
docker compose up --build db backend frontend
```

Откройте `http://localhost:5173`; API и Swagger — `http://localhost:8000/docs`. PostgreSQL, демо-данные и три курса создаются автоматически.

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
# Укажите настоящий BOT_TOKEN в .env
python bot.py
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

## Telegram на телефоне

Telegram требует публичный HTTPS-адрес Mini App. Поднимите HTTPS-туннель к frontend и укажите его в `bot/.env` как `WEBAPP_URL=https://...`, затем перезапустите бота. API, который вызывает браузер, тоже должен быть публичным HTTPS: соберите frontend с `VITE_API_URL=https://...`, иначе будут ошибки `localhost` или mixed content. Для production разместите собранный `frontend/dist` на HTTPS-хостинге и задайте тот же публичный API.

`USE_MOCK=0` — основной режим. Заглушки в `bot/api.py` и старом `bot/webapp` оставлены только для изолированной демонстрации. Бот регистрирует пользователя через `/auth/register`, сохраняет JWT в `/bot/state`, а Mini App восстанавливает сессию по Telegram ID.

## Структура

| Папка | Содержимое |
|---|---|
| `backend/` | FastAPI, SQLAlchemy, JWT, seed, построение курсов и импорт Hugging Face |
| `frontend/` | Vanilla JS + Vite, общий курс и Mini App |
| `bot/` | aiogram 3, FSM-регистрация, напоминания, статический сервер |
| `docker-compose.yml` | PostgreSQL, backend, frontend и bot |

## Основные API

| Метод и путь | Назначение |
|---|---|
| `POST /auth/register`, `POST /auth/login`, `GET /auth/me` | аккаунт и JWT |
| `GET /courses/units` | три курса, прогресс и доступность этапов |
| `GET /courses/units/{unit_id}` | карточки, квиз, упражнения и шаги истории |
| `POST /courses/units/{unit_id}/complete` | завершение `circle` со `score`, очки и разблокировка |
| `GET /fragments/search?q=...&limit=20&lang_pair=ba-ru` | живой поиск по общему словарю |
| `POST /fragments/propose` | новая пара `text_ba` + `translation`, +20 очков |
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

`python import_hf.py` импортирует разговорник Hugging Face; `HF_TOKEN` нужен только если сервис требует авторизацию. После импорта повторно запустите `python build_courses.py`, чтобы обновить учебные примеры.

TTS использует системный `speechSynthesis`: выбирается башкирский голос (`ba*`), при его отсутствии — русский. Доступность и качество башкирского произношения зависят от устройства и браузера.

## Проверки

```powershell
python -m compileall -q backend bot
cd backend
.\.venv\Scripts\python.exe -m unittest -v test_courses.py
cd ..\frontend
node --check app.js
node --check course-data.js
npm run build
```

Для полной HTTP-проверки на изолированной SQLite при свободном порту 8000:

```powershell
cd backend
.\.venv\Scripts\python.exe run_http_checks.py
```

Скрипт сам создаёт тестовые данные, запускает Uvicorn, выполняет `e2e_check.py`, останавливает сервер и удаляет временную базу. Текущий статус и границы MVP описаны в `CHECKPOINT_AND_PITCH.md`.
