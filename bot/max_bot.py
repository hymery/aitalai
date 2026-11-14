"""MAX-бот Әйтәләй: вход в WebApp и ежедневные напоминания.

Использует официальный MAX Bot API. Long polling подходит для локального запуска;
для production рекомендуется HTTPS webhook через POST /subscriptions.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import ssl
from datetime import date, datetime
from pathlib import Path
from typing import Any

import aiohttp
from dotenv import load_dotenv


BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")
logger = logging.getLogger("max_bot")
API_BASE = "https://platform-api2.max.ru"


class MaxStore:
    """Список MAX-пользователей, которые разрешили напоминания."""

    def __init__(self, path: Path) -> None:
        self.path = path
        self.users: dict[str, dict[str, Any]] = {}
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                self.users = {
                    str(key): value for key, value in raw.items() if isinstance(value, dict)
                }
        except FileNotFoundError:
            pass
        except (OSError, json.JSONDecodeError):
            logger.warning("Не удалось прочитать реестр MAX", exc_info=True)

    def save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix(".tmp")
        temporary.write_text(
            json.dumps(self.users, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        os.replace(temporary, self.path)

    def subscribe(self, user_id: int, name: str = "") -> None:
        user = self.users.get(str(user_id), {})
        user.update({"user_id": user_id, "name": name, "blocked": False})
        user.setdefault("reminders_enabled", True)
        self.users[str(user_id)] = user
        self.save()

    def toggle(self, user_id: int) -> bool:
        user = self.users.setdefault(str(user_id), {"user_id": user_id})
        enabled = not bool(user.get("reminders_enabled", True))
        user["reminders_enabled"] = enabled
        user.setdefault("blocked", False)
        self.save()
        return enabled

    def recipients(self, day: str) -> list[dict[str, Any]]:
        return [
            dict(user)
            for user in self.users.values()
            if user.get("reminders_enabled", True)
            and not user.get("blocked", False)
            and user.get("last_reminder") != day
        ]

    def mark_reminded(self, user_id: int, day: str) -> None:
        self.users[str(user_id)]["last_reminder"] = day
        self.save()

    def mark_blocked(self, user_id: int) -> None:
        if str(user_id) in self.users:
            self.users[str(user_id)].update(blocked=True, reminders_enabled=False)
            self.save()


class MaxBot:
    def __init__(
        self,
        token: str,
        webapp_url: str | None,
        store: MaxStore,
        *,
        reminder_time: str = "09:00",
    ) -> None:
        self.token = token
        self.webapp_url = (webapp_url or "").strip() or None
        self.store = store
        self.reminder_time = reminder_time
        self._session: aiohttp.ClientSession | None = None

    @property
    def session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            ssl_context = ssl.create_default_context()
            ca_bundle = Path(
                os.getenv("MAX_CA_BUNDLE")
                or BASE_DIR.parent / "tools" / "certs" / "russiantrustedca.pem"
            )
            if ca_bundle.is_file():
                ssl_context.load_verify_locations(cafile=str(ca_bundle))
            connector = aiohttp.TCPConnector(ssl=ssl_context)
            self._session = aiohttp.ClientSession(
                timeout=aiohttp.ClientTimeout(total=45),
                headers={"Authorization": self.token, "Accept": "application/json"},
                connector=connector,
            )
        return self._session

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()

    async def request(
        self, method: str, path: str, *, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        async with self.session.request(method, f"{API_BASE}{path}", params=params) as response:
            raw = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"MAX API {response.status}: {raw[:300]}")
            return json.loads(raw) if raw.strip() else {}

    def keyboard(self) -> list[dict[str, Any]]:
        if not self.webapp_url:
            return []
        if self.webapp_url.startswith("https://"):
            button = {
                "type": "open_app",
                "text": "Открыть Әйтәләй",
                "web_app": self.webapp_url,
            }
        else:
            button = {"type": "link", "text": "Открыть Әйтәләй", "url": self.webapp_url}
        return [{"type": "inline_keyboard", "payload": {"buttons": [[button]]}}]

    async def send_message(self, user_id: int, text: str) -> dict[str, Any]:
        payload: dict[str, Any] = {"text": text}
        attachments = self.keyboard()
        if attachments:
            payload["attachments"] = attachments
        # Тело POST /messages передаётся отдельно от user_id.
        async with self.session.post(
            f"{API_BASE}/messages", params={"user_id": user_id}, json=payload
        ) as response:
            raw = await response.text()
            if response.status >= 400:
                raise RuntimeError(f"MAX API {response.status}: {raw[:300]}")
            return json.loads(raw) if raw.strip() else {}

    @staticmethod
    def sender(update: dict[str, Any]) -> tuple[int | None, str]:
        message = update.get("message") or {}
        user = message.get("sender") or update.get("user") or {}
        try:
            user_id = int(user.get("user_id"))
        except (TypeError, ValueError):
            user_id = None
        name = " ".join(
            str(user.get(key) or "").strip() for key in ("first_name", "last_name")
        ).strip()
        return user_id, name

    def menu_text(self, name: str = "") -> str:
        greeting = f"{name}, добро" if name else "Добро"
        return (
            f"{greeting} пожаловать в Әйтәләй!\n\n"
            "Курс, задания, рейтинг и проверка переводов — в приложении. "
            "Нажмите кнопку ниже, чтобы открыть его.\n\n"
            "Команды: /task, /progress, /notifications, /cancel, /help"
        )

    async def handle_update(self, update: dict[str, Any]) -> None:
        user_id, name = self.sender(update)
        if user_id is None:
            logger.info("Пропущено событие MAX без user_id: %s", update.get("update_type"))
            return
        message = update.get("message") or {}
        body = message.get("body") or {}
        text = str(body.get("text") or message.get("text") or "").strip()
        command = text.split(maxsplit=1)[0].split("@", 1)[0].lower() if text else ""

        if update.get("update_type") == "bot_started" or command == "/start":
            self.store.subscribe(user_id, name)
            await self.send_message(user_id, self.menu_text(name))
            return
        if command == "/cancel":
            await self.send_message(user_id, "Действие отменено.\n\n" + self.menu_text(name))
            return
        if command == "/notifications":
            enabled = self.store.toggle(user_id)
            await self.send_message(
                user_id, "Уведомления включены." if enabled else "Уведомления выключены."
            )
            return
        if command == "/task":
            await self.send_message(
                user_id, "Фрагмент дня ждёт проверки! Откройте приложение по кнопке ниже."
            )
            return
        if command == "/progress":
            await self.send_message(
                user_id, "Очки, уровень и серия дней доступны в кабинете приложения."
            )
            return
        if command == "/help":
            await self.send_message(user_id, self.menu_text(name))
            return
        await self.send_message(user_id, "Выберите действие в приложении.\n\n" + self.menu_text(name))

    async def send_daily_reminders(self, today: str | None = None) -> int:
        day = today or date.today().isoformat()
        sent = 0
        for user in self.store.recipients(day):
            user_id = int(user["user_id"])
            try:
                await self.send_message(
                    user_id,
                    "Фрагмент дня ждёт проверки! Зайдите в Әйтәләй и сохраните серию дней.",
                )
                self.store.mark_reminded(user_id, day)
                sent += 1
                await asyncio.sleep(0.6)
            except (RuntimeError, aiohttp.ClientError, asyncio.TimeoutError) as exc:
                logger.warning("Не удалось отправить MAX-напоминание %s: %s", user_id, exc)
        return sent

    async def reminder_loop(self) -> None:
        fired_on: date | None = None
        while True:
            now = datetime.now()
            if now.strftime("%H:%M") == self.reminder_time and fired_on != now.date():
                fired_on = now.date()
                await self.send_daily_reminders()
            elif now.strftime("%H:%M") != self.reminder_time:
                fired_on = None
            await asyncio.sleep(20)

    async def poll(self) -> None:
        marker: int | None = None
        reminders = asyncio.create_task(self.reminder_loop())
        try:
            while True:
                params: dict[str, Any] = {"timeout": 30, "limit": 100}
                if marker is not None:
                    params["marker"] = marker
                try:
                    payload = await self.request("GET", "/updates", params=params)
                    for update in payload.get("updates") or []:
                        if isinstance(update, dict):
                            await self.handle_update(update)
                    next_marker = payload.get("marker")
                    if next_marker is not None:
                        marker = int(next_marker)
                except (RuntimeError, aiohttp.ClientError, asyncio.TimeoutError) as exc:
                    logger.warning("MAX Long Polling: %s; повтор через 5 секунд", exc)
                    await asyncio.sleep(5)
        finally:
            reminders.cancel()
            try:
                await reminders
            except asyncio.CancelledError:
                pass


async def main() -> None:
    token = (os.getenv("MAX_BOT_TOKEN") or "").strip()
    if not token or "replace" in token.lower():
        raise SystemExit("Укажите настоящий MAX_BOT_TOKEN в bot/.env")
    store_path = Path(os.getenv("MAX_USERS_FILE") or BASE_DIR / "max_users.json")
    if not store_path.is_absolute():
        store_path = BASE_DIR / store_path
    bot = MaxBot(
        token,
        os.getenv("WEBAPP_URL"),
        MaxStore(store_path),
        reminder_time=os.getenv("REMINDER_TIME") or "09:00",
    )
    try:
        logger.info("MAX-бот запущен; WebApp: %s", bot.webapp_url or "не задан")
        await bot.poll()
    finally:
        await bot.close()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s | %(levelname)s | %(message)s")
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
