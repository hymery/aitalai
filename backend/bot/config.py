"""Конфигурация приложения."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(BASE_DIR / ".env")


@dataclass(frozen=True)
class Config:
    bot_token: str
    api_url: str
    use_mock: bool
    request_timeout: float = 15.0
    telegram_proxy: str | None = None
    webapp_url: str | None = None
    webapp_host: str = "0.0.0.0"
    webapp_port: int = 8080
    webapp_dir: Path = BASE_DIR.parent / "frontend"
    reminder_enabled: bool = True
    reminder_time: str = "09:00"
    users_file: Path = BASE_DIR / "users.json"


def _flag(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on", "да"}


def read_webapp_url(default: str | None = None) -> str | None:
    """Текущий адрес Mini App: каждый раз читает WEBAPP_URL из .env.

    Позволяет обновлять адрес туннеля без перезапуска бота.
    """
    try:
        text = (BASE_DIR / ".env").read_text(encoding="utf-8-sig")
    except OSError:
        return default

    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "WEBAPP_URL":
            value = value.strip().strip('"').strip("'")
            return value or default
    return default


def live_webapp_url(config: Config) -> str | None:
    """Адрес Mini App с учётом обновлений .env во время работы."""
    return read_webapp_url(config.webapp_url)


def load_config() -> Config:
    token = (os.getenv("TELEGRAM_BOT_TOKEN") or os.getenv("BOT_TOKEN") or "").strip()
    if not token:
        raise RuntimeError(
            "Не задан BOT_TOKEN. Скопируйте .env.example в .env "
            "и укажите токен, полученный у @BotFather."
        )
    if ":" not in token:
        raise RuntimeError(
            "BOT_TOKEN выглядит некорректно: ожидается формат «123456789:AA...». "
            "Проверьте значение в .env."
        )

    api_url = (os.getenv("API_URL") or "http://localhost:8000").strip().rstrip("/")

    try:
        timeout = float(os.getenv("API_TIMEOUT") or 15)
    except ValueError:
        timeout = 15.0
    timeout = max(3.0, min(timeout, 60.0))

    reminder_time = (os.getenv("REMINDER_TIME") or "09:00").strip()
    try:
        datetime.strptime(reminder_time, "%H:%M")
    except ValueError:
        reminder_time = "09:00"

    users_file = Path(
        (os.getenv("USERS_FILE") or "").strip() or (BASE_DIR / "users.json")
    )
    if not users_file.is_absolute():
        users_file = BASE_DIR / users_file

    try:
        webapp_port = int((os.getenv("WEBAPP_PORT") or "8080").strip())
    except ValueError:
        webapp_port = 8080
    if not 1 <= webapp_port <= 65535:
        webapp_port = 8080

    webapp_dir = Path(
        (os.getenv("WEBAPP_DIR") or "").strip() or (BASE_DIR.parent / "frontend")
    )
    if not webapp_dir.is_absolute():
        webapp_dir = BASE_DIR / webapp_dir

    return Config(
        bot_token=token,
        api_url=api_url,
        use_mock=_flag("USE_MOCK", False),
        request_timeout=timeout,
        telegram_proxy=(os.getenv("TELEGRAM_PROXY") or "").strip() or None,
        webapp_url=(os.getenv("WEBAPP_URL") or "").strip() or None,
        webapp_host=(os.getenv("WEBAPP_HOST") or "0.0.0.0").strip(),
        webapp_port=webapp_port,
        webapp_dir=webapp_dir,
        reminder_enabled=_flag("REMINDER_ENABLED", True),
        reminder_time=reminder_time,
        users_file=users_file,
    )
