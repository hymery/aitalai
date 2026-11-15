# Telegram-бот «Әйтәләй»

Бот регистрирует пользователя через FastAPI, сохраняет JWT в `/bot/state`, открывает общий frontend как Mini App и отправляет ежедневные напоминания. Основной сценарий использует реальный backend: `USE_MOCK=0`.

Полная инструкция, Docker Compose, демо-аккаунты и таблица API находятся в корневом `README.md`.

## Локальный запуск

```powershell
cd bot
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env
# Замените BOT_TOKEN на токен @BotFather
python bot.py
```

Перед запуском должны работать backend на `:8000` и frontend. Бот также раздаёт `../frontend` на `http://localhost:8080`; проверка сервера: `GET /health`.

## Регистрация

`/start` запускает последовательность **ФИО → школа → класс → email → пароль**. Пароль — от 4 до 72 символов. Бот отправляет в `POST /auth/register` поля `role: "student"`, `telegram_id`, `school`, `class_name` и `lang_pair: "ba-ru"`. Полученный JWT сохраняется в backend, поэтому общий Mini App восстанавливает сессию по Telegram ID.

`/cancel` отменяет текущий шаг, `/help` показывает справку. Состояние FSM синхронизируется через `/bot/state`, а локальный реестр напоминаний хранится в `USERS_FILE`.

## Mini App и HTTPS

По умолчанию `WEBAPP_DIR=../frontend` — это тот же курс, что и веб-версия, а не устаревший отдельный интерфейс. Каталог `bot/webapp` сохранён только как совместимый старый демо-вариант.

Для открытия внутри Telegram на телефоне задайте публичный HTTPS-адрес:

```env
WEBAPP_URL=https://your-mini-app.example
```

Frontend должен быть собран с публичным HTTPS `VITE_API_URL`; иначе телефон будет обращаться к собственному `localhost`, либо браузер заблокирует mixed content. Для production опубликуйте `frontend/dist` и укажите его адрес в `WEBAPP_URL`.

При локальном `http://localhost:8080` бот показывает подсказку вместо WebApp-кнопки. `start_tunnel.ps1` — необязательный старый помощник для Serveo; Docker Compose сам туннель не создаёт.

## Основные настройки

| Переменная | Назначение |
|---|---|
| `BOT_TOKEN` | обязательный токен @BotFather |
| `API_URL` | URL FastAPI для Python-бота |
| `USE_MOCK` | `0` — FastAPI, `1` — только локальная заглушка |
| `WEBAPP_URL` | публичный HTTPS Mini App |
| `WEBAPP_DIR` | `../frontend` локально, `/app/frontend` в Docker |
| `TELEGRAM_PROXY` | необязательный SOCKS5/HTTP-прокси |
| `REMINDER_ENABLED`, `REMINDER_TIME` | расписание напоминаний |
| `USERS_FILE` | локальный реестр напоминаний |

Логи: консоль и `bot.log`. Секреты, `users.json` и логи не коммитируются. Реальный обмен сообщениями с Telegram требует действующий токен и доступную сеть; он не заменяется проверками синтаксиса или API.
