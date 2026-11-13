# Бот языковой школы

Вся учёба — задания, рейтинг и профиль — живёт в **Mini App**.
Telegram-бот отвечает только за **регистрацию** и **напоминания**.

Стек: Python 3.11, aiogram 3, FSM, aiohttp, python-dotenv.

## Файлы

| Файл | Назначение |
|------|------------|
| `bot.py` | запуск, логирование, middleware состояния, планировщик |
| `handlers.py` | команды, регистрация, меню, переключатель напоминаний |
| `keyboards.py` | inline-клавиатуры (Mini App, регистрация) |
| `reminders.py` | ежедневная рассылка напоминаний |
| `storage.py` | локальный реестр пользователей в `users.json` |
| `api.py` | клиент API (регистрация + `/bot/state`) и заглушка |
| `config.py` | загрузка `.env` |
| `webapp_server.py` | локальный HTTP-сервер Mini App на `:8080` |
| `webapp/index.html` | разметка Mini App, 4 экрана и нижняя навигация |
| `webapp/style.css` | стили: белый фон, синие кнопки |
| `webapp/app.js` | логика Mini App, API-запросы и заглушка |
| `webapp/telegram-web-app.js` | локальная копия Telegram WebApp SDK |
| `start_tunnel.ps1` | HTTPS-туннель, обновление `WEBAPP_URL`, перезапуск бота |
| `requirements.txt` | зависимости |
| `.env.example` | пример переменных окружения |

## Запуск

```powershell
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# укажите BOT_TOKEN и, при необходимости, TELEGRAM_PROXY
python bot.py
```

Логи: `bot.log` (с ротацией) и консоль.

## Переменные окружения

| Переменная | Описание |
|------------|----------|
| `BOT_TOKEN` | токен от @BotFather |
| `API_URL` | адрес backend, например `http://localhost:8000` |
| `USE_MOCK` | `1` — заглушка API, `0` — реальный backend |
| `API_TIMEOUT` | таймаут запросов, секунды |
| `TELEGRAM_PROXY` | SOCKS5/HTTP-прокси для Telegram, если прямой доступ закрыт |
| `WEBAPP_URL` | адрес Mini App; локально `http://localhost:8080`, для Telegram — HTTPS |
| `WEBAPP_HOST` | интерфейс сервера Mini App (`0.0.0.0` — доступ с телефона по IP) |
| `WEBAPP_PORT` | порт сервера Mini App (по умолчанию `8080`) |
| `REMINDER_ENABLED` | `1`/`0` — глобально включить напоминания |
| `REMINDER_TIME` | время рассылки по локальному времени, `ЧЧ:ММ` (по умолчанию `09:00`) |
| `USERS_FILE` | файл реестра пользователей (по умолчанию `users.json`) |

Если `TELEGRAM_PROXY` задан, нужен пакет `aiohttp-socks` — он уже в
`requirements.txt`.

## Как работает бот

1. `/start` — если пользователь не зарегистрирован, бот спрашивает:
   **ФИО → школа → класс → email → пароль**. Языковая пара
   `ba-ru` подставляется автоматически.
2. Бот вызывает `POST /auth/register`, получает `access_token` и сохраняет
   его в `/bot/state` как `state: "registered", data: {"token": ...}`.
3. В меню:
   - **🚀 Открыть приложение** — WebApp-кнопка при HTTPS-адресе;
     при локальном `http://localhost` показывает подсказку с адресом;
   - **🔔 Напоминания** — включить/выключить ежедневные напоминания.
4. `/cancel` — отменить действие, `/help` — справка.

## Напоминания

Раз в сутки в `REMINDER_TIME` бот рассылает сообщение всем пользователям
из `users.json`, у кого напоминания включены и кому сегодня ещё не писали.
Отметка `last_reminder` хранится в реестре, поэтому перезапуск бота не
приводит к повторной рассылке. Если пользователь заблокировал бота,
он помечается как `blocked` и больше не получает сообщений.

`users.json` создаётся автоматически при первой регистрации и не
попадает в git.

## Mini App: локальный сервер

Сервер Mini App запускается автоматически вместе с ботом и раздаёт
файлы из папки `webapp/`:

```
WebApp server started on http://localhost:8080
```

Порт и интерфейс настраиваются в `.env`:

```env
WEBAPP_URL=http://localhost:8080
WEBAPP_HOST=0.0.0.0
WEBAPP_PORT=8080
```

Проверить вручную:

```powershell
curl http://localhost:8080/
curl http://localhost:8080/health
```

`http://` разрешён только для `localhost`/`127.0.0.1`: так удобно
проверять Mini App на компьютере. Telegram на телефоне требует **HTTPS**,
поэтому для реального открытия на телефоне поднимите туннель:

```powershell
cloudflared tunnel --url http://localhost:8080
# или
ngrok http 8080
```

Полученный `https://...` адрес пропишите в `.env`:

```env
WEBAPP_URL=https://your-tunnel.example/
```

После перезапуска бота кнопка «Открыть приложение» станет рабочей.

Важно: Telegram отклоняет `localhost` и в `web_app`, и в обычных
`url`-кнопках (ошибка «Only HTTPS links are allowed»). Поэтому при
локальном `WEBAPP_URL` кнопка в боте показывает подсказку с адресом,
а сам Mini App открывается в браузере. Как только в `WEBAPP_URL`
прописан HTTPS-адрес, бот автоматически делает настоящую
WebApp-кнопку.

## Как открыть Mini App прямо в Telegram

Telegram открывает Mini App только по **HTTPS**, поэтому локальный сервер
нужно выставить наружу через туннель. В проекте для этого есть
`start_tunnel.ps1` (бесплатный Serveo, без регистрации):

```powershell
cd "C:\Users\ASUS\Documents\Проект по умолчанию"
powershell -ExecutionPolicy Bypass -File .\start_tunnel.ps1
```

Скрипт:

1. поднимает HTTPS-туннель к `127.0.0.1:8080`;
2. прописывает полученный адрес в `WEBAPP_URL` в `.env`;
3. перезапускает `bot.py`.

После этого в Telegram:

1. откройте **@bashkir_lang_bot**;
2. отправьте `/start`;
3. нажмите **«🚀 Открыть приложение»** — Mini App откроется внутри
   Telegram.

Бесплатный адрес Serveo меняется при каждом запуске туннеля. После
перезагрузки компьютера снова запустите `start_tunnel.ps1`. Пока идёт
демонстрация, компьютер и процесс `ssh` должны быть включены.

Для постоянного адреса разместите папку `webapp/` на статическом
хостинге с HTTPS (GitHub Pages, Netlify, Cloudflare Pages) и укажите
его в `WEBAPP_URL`. Пока `useMock: true`, backend не нужен — приложение
работает на мок-данных.

## Экраны Mini App

Навигация — нижняя панель, переключение через `location.hash`
(без перезагрузки страницы):

| Экран | Hash | Что делает |
|-------|------|------------|
| Задание | `#task` | `GET /tasks/daily`, кнопки «✅ Верно» / «✏️ Исправить», `POST /tasks/submit`, результат «+X очков!» |
| Рейтинг | `#ratings` | 6 табов (Ученики, Школы, Классы, Точность, Словарь, Исправления) и 5 периодов (День, Неделя, Месяц, Год, Всё время), топ-10 |
| Профиль | `#profile` | `GET /auth/me`: имя, очки, уровень, серия дней, точность |
| Учитель | `#teacher` | поля «Школа» и «Класс», `GET /teacher/class-report`, таблица учеников |

При запуске `app.js`:

1. вызывает `Telegram.WebApp.ready()` и `expand()`;
2. берёт `initDataUnsafe.user.id`;
3. запрашивает `GET /bot/state/{telegram_id}` и достаёт `data.token`;
4. если токена нет — показывает «Сначала пройди регистрацию в боте».

### Настройка `webapp/app.js`

```js
const CONFIG = {
  apiUrl: "http://localhost:8000",
  useMock: true,        // синхронизировать с USE_MOCK в .env
  devTelegramId: 1,
};
```

- `useMock: true` — все запросы заменены заглушкой, backend не нужен;
- `useMock: false` — реальные запросы к `API_URL` с `Authorization: Bearer <token>`;
- при открытии в обычном браузере без Telegram и `useMock: true`
  включается демо-режим, чтобы интерфейс можно было посмотреть локально.

Для реального backend включите CORS на его стороне: Mini App обслуживается
с `:8080`, а API — с `:8000`, это разные origins. При HTTPS-туннеле
`API_URL` тоже должен быть HTTPS, иначе браузер заблокирует запросы
как mixed content.

## Контракт API

Боту нужны только два сценария:

| Метод | Путь | Тело |
|-------|------|------|
| POST | `/auth/register` | `email`, `password`, `full_name`, `school`, `class_name`, `lang_pair` |
| GET | `/bot/state/{telegram_id}` | → `{"state": "...", "data": {...}}`; 404 допустим |
| POST | `/bot/state` | `telegram_id`, `state`, `data` |

Остальные данные (задания, рейтинг, профиль) Mini App запрашивает у
backend самостоятельно:

| Метод | Путь | Назначение |
|-------|------|------------|
| GET | `/tasks/daily` | ежедневная фраза и перевод |
| POST | `/tasks/submit` | `fragment_id`, `translation`, `is_correct` |
| GET | `/ratings/top?period=all` | топ учеников |
| GET | `/ratings/schools?period=all` | топ школ |
| GET | `/ratings/classes?period=all` | топ классов |
| GET | `/ratings/accuracy?period=all` | рейтинг точности |
| GET | `/ratings/vocabulary?period=all` | рейтинг словарного запаса |
| GET | `/ratings/corrections?period=all` | рейтинг исправлений |
| GET | `/auth/me` | профиль текущего пользователя |
| GET | `/teacher/class-report?school=X&class=Y` | отчёт по классу |

Периоды: `day`, `week`, `month`, `year`, `all`. Если на backend другие
пути рейтингов, поменяйте их в массиве `RATING_TABS` в `webapp/app.js`.

При `USE_MOCK=1` регистрация и состояние обслуживаются встроенной
заглушкой в `api.py`, а Mini App — заглушкой в `webapp/app.js`.
Backend не нужен.
