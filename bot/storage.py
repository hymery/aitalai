"""Локальный реестр пользователей — нужен для напоминаний."""

from __future__ import annotations

import json
import logging
import os
import threading
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)


class UserStore:
    """Простое JSON-хранилище зарегистрированных пользователей.

    Telegram не даёт боту список всех чатов, поэтому для ежедневных
    напоминаний ведём собственный реестр. Файл переживает перезапуск.
    """

    def __init__(self, path: Path) -> None:
        self.path = Path(path)
        self._lock = threading.Lock()
        self._users: dict[int, dict[str, Any]] = {}
        self._load()

    # --- чтение / запись файла -------------------------------------------------

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            logger.warning(
                "Не удалось прочитать %s — реестр пользователей пуст",
                self.path,
                exc_info=True,
            )
            return

        users: dict[int, dict[str, Any]] = {}
        if isinstance(raw, dict):
            items = raw.items()
        elif isinstance(raw, list):
            items = ((str(item.get("telegram_id")), item) for item in raw if isinstance(item, dict))
        else:
            items = ()

        for key, value in items:
            if not isinstance(value, dict):
                continue
            try:
                telegram_id = int(value.get("telegram_id", key))
            except (TypeError, ValueError):
                continue
            users[telegram_id] = value

        self._users = users
        logger.info("Загружено пользователей из реестра: %s", len(users))

    def _save(self) -> None:
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            tmp = self.path.with_name(self.path.name + ".tmp")
            tmp.write_text(
                json.dumps(self._users, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            os.replace(tmp, self.path)
        except OSError:
            logger.warning("Не удалось сохранить %s", self.path, exc_info=True)

    # --- операции --------------------------------------------------------------

    def get(self, telegram_id: int) -> dict[str, Any] | None:
        with self._lock:
            user = self._users.get(int(telegram_id))
            return dict(user) if user else None

    def upsert(self, telegram_id: int, **fields: Any) -> dict[str, Any]:
        telegram_id = int(telegram_id)
        with self._lock:
            user = dict(self._users.get(telegram_id, {}))
            user.update(fields)
            user["telegram_id"] = telegram_id
            user.setdefault("reminders_enabled", True)
            user.setdefault("blocked", False)
            self._users[telegram_id] = user
            self._save()
            return dict(user)

    def set_reminders(self, telegram_id: int, enabled: bool) -> None:
        self.upsert(telegram_id, reminders_enabled=bool(enabled))

    def mark_reminded(self, telegram_id: int, day: str) -> None:
        self.upsert(telegram_id, last_reminder=day)

    def mark_blocked(self, telegram_id: int) -> None:
        self.upsert(telegram_id, blocked=True, reminders_enabled=False)

    def reminder_recipients(self, today: str) -> list[dict[str, Any]]:
        """Пользователи, которым пора отправить напоминание сегодня."""
        with self._lock:
            return [
                dict(user)
                for user in self._users.values()
                if user.get("reminders_enabled", True)
                and not user.get("blocked", False)
                and user.get("last_reminder") != today
            ]

    def notification_recipients(self) -> list[dict[str, Any]]:
        """Подписанные пользователи с сохранённым токеном доступа."""
        with self._lock:
            return [
                dict(user)
                for user in self._users.values()
                if user.get("reminders_enabled", True)
                and not user.get("blocked", False)
                and bool(user.get("token"))
            ]

    def count(self) -> int:
        with self._lock:
            return len(self._users)
