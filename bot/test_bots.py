from __future__ import annotations

import tempfile
import unittest
from pathlib import Path
from unittest.mock import AsyncMock

from max_bot import MaxBot, MaxStore
from reminders import send_activity_updates
from storage import UserStore


class FakeBot:
    def __init__(self) -> None:
        self.messages: list[tuple[int, str]] = []

    async def send_message(self, telegram_id: int, text: str, **kwargs) -> None:
        self.messages.append((telegram_id, text))


class FakeApi:
    def __init__(self) -> None:
        self.streak = 1
        self.school_rank = 3
        self.class_rank = 4
        self.status = "pending"

    async def get_profile(self, token: str) -> dict:
        return {"streak_days": self.streak}

    async def get_my_answers(self, token: str) -> list[dict]:
        return [{"answer_id": 7, "translation_status": self.status}]

    async def get_rating(self, category: str) -> list[dict]:
        if category == "schools":
            return [{"rank": self.school_rank, "school": "Школа № 1"}]
        return [{"rank": self.class_rank, "school": "Школа № 1", "class_name": "5А"}]


class ActivityNotificationsTest(unittest.IsolatedAsyncioTestCase):
    async def test_baseline_and_real_changes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = UserStore(Path(directory) / "users.json")
            store.upsert(1, token="token", school="Школа № 1", grade="5А")
            api = FakeApi()
            bot = FakeBot()

            self.assertEqual(await send_activity_updates(bot, api, store), 0)
            api.streak = 2
            api.school_rank = 1
            api.class_rank = 2
            api.status = "confirmed"
            self.assertEqual(await send_activity_updates(bot, api, store), 4)
            text = "\n".join(message for _, message in bot.messages)
            self.assertIn("Серия продолжается: 2", text)
            self.assertIn("Новое место в рейтинге школы", text)
            self.assertIn("Подтверждены ваши переводы", text)
            self.assertEqual(await send_activity_updates(bot, api, store), 0)


class MaxBotTest(unittest.IsolatedAsyncioTestCase):
    async def test_commands_keyboard_and_daily_subscription(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            store = MaxStore(Path(directory) / "max.json")
            bot = MaxBot("test", "https://example.com", store)
            send = AsyncMock(return_value={})
            bot.send_message = send  # type: ignore[method-assign]

            await bot.handle_update({
                "update_type": "bot_started",
                "user": {"user_id": 42, "first_name": "Айгуль"},
            })
            self.assertEqual(send.await_args.args[0], 42)
            self.assertIn("Айгуль", send.await_args.args[1])
            self.assertEqual(bot.keyboard()[0]["payload"]["buttons"][0][0]["type"], "open_app")

            await bot.handle_update({
                "update_type": "message_created",
                "message": {
                    "sender": {"user_id": 42},
                    "body": {"text": "/notifications"},
                },
            })
            self.assertFalse(store.users["42"]["reminders_enabled"])
            self.assertEqual(await bot.send_daily_reminders("2026-11-14"), 0)

            store.toggle(42)
            self.assertEqual(await bot.send_daily_reminders("2026-11-14"), 1)
            self.assertEqual(await bot.send_daily_reminders("2026-11-14"), 0)
            await bot.close()


if __name__ == "__main__":
    unittest.main()
