"""Запуск всего приложения одной командой.

Поднимает бота, HTTPS-туннель к Mini App и держит кнопку в Telegram
актуальной: если бесплатный туннель истекает, скрипт сам поднимает новый
и меняет ссылку в закреплённом сообщении.

Запуск:  python run_app.py   (или двойной клик по «Запустить.bat»)
Остановка: Ctrl+C или закрыть окно.
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import socket
import subprocess
import sys
from datetime import datetime
from pathlib import Path

import aiohttp
from aiogram import Bot
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramAPIError
from aiogram.types import InlineKeyboardButton, InlineKeyboardMarkup, WebAppInfo

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
STATE_PATH = BASE_DIR / "tunnel_state.json"
LOG_PATH = BASE_DIR / "run_app.log"

LOCAL_URL = "http://127.0.0.1:8080"
LOCK_PORT = 8792

URL_RE = re.compile(r"https://[a-zA-Z0-9.-]+\.serveousercontent\.com")

MESSAGE_TEXT = (
    "🚀 <b>Мини-приложение готово</b>\n\n"
    "Нажми кнопку ниже — школа откроется прямо в Telegram.\n\n"
    "Ссылка обновляется автоматически, кнопка всегда рабочая."
)

logger = logging.getLogger("run_app")


# --- окружение -----------------------------------------------------------------

def setup_logging() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass

    formatter = logging.Formatter("%(asctime)s | %(levelname)-7s | %(message)s")
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)

    try:
        file_handler = logging.FileHandler(LOG_PATH, encoding="utf-8")
    except OSError:
        file_handler = None
    if file_handler is not None:
        file_handler.setFormatter(formatter)
        root.addHandler(file_handler)


def read_env(name: str) -> str:
    try:
        text = ENV_PATH.read_text(encoding="utf-8-sig")
    except OSError:
        return ""
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == name:
            return value.strip().strip('"').strip("'")
    return ""


def write_webapp_url(url: str) -> None:
    try:
        text = ENV_PATH.read_text(encoding="utf-8-sig")
    except OSError:
        return

    line = f"WEBAPP_URL={url}"
    if re.search(r"(?m)^WEBAPP_URL=.*$", text):
        text = re.sub(r"(?m)^WEBAPP_URL=.*$", line, text, count=1)
    else:
        text = text.rstrip("\r\n") + "\r\n" + line + "\r\n"

    ENV_PATH.write_text(text, encoding="utf-8", newline="")


def acquire_lock() -> socket.socket:
    lock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        lock.bind(("127.0.0.1", LOCK_PORT))
        lock.listen(1)
    except OSError:
        logger.error("Приложение уже запущено в другом окне.")
        raise SystemExit(1) from None
    return lock


# --- процессы ------------------------------------------------------------------

def kill_stale(kind: str) -> None:
    if kind == "bot":
        condition = "$_.CommandLine -like '*bot.py*'"
    else:
        condition = "$_.CommandLine -like '*serveo.net*'"
    name = "python.exe" if kind == "bot" else "ssh.exe"
    script = (
        f"Get-CimInstance Win32_Process -Filter \"Name='{name}'\" | "
        f"Where-Object {{ {condition} }} | "
        "ForEach-Object { Stop-Process -Id $_.ProcessId -Force "
        "-ErrorAction SilentlyContinue }"
    )
    subprocess.run(
        ["powershell", "-NoProfile", "-Command", script],
        capture_output=True,
        check=False,
    )


def start_bot() -> subprocess.Popen:
    out = open(BASE_DIR / "bot.out.log", "ab")
    err = open(BASE_DIR / "bot.err.log", "ab")
    return subprocess.Popen(  # noqa: SIM115 — файлы живут вместе с процессом
        [sys.executable, "bot.py"],
        cwd=BASE_DIR,
        stdout=out,
        stderr=err,
    )


async def wait_local_health(timeout: float = 90.0) -> bool:
    deadline = asyncio.get_running_loop().time() + timeout
    async with aiohttp.ClientSession() as session:
        while asyncio.get_running_loop().time() < deadline:
            try:
                async with session.get(
                    f"{LOCAL_URL}/health", timeout=aiohttp.ClientTimeout(total=3)
                ) as response:
                    if response.status == 200:
                        return True
            except (aiohttp.ClientError, asyncio.TimeoutError):
                pass
            await asyncio.sleep(2)
    return False


async def url_is_alive(url: str) -> bool:
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{url}/health", timeout=aiohttp.ClientTimeout(total=15)
            ) as response:
                return response.status == 200
    except (aiohttp.ClientError, asyncio.TimeoutError):
        return False


async def start_tunnel() -> tuple[asyncio.subprocess.Process, str]:
    args = [
        "ssh",
        "-p", "443",
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=NUL",
        "-o", "ServerAliveInterval=30",
        "-o", "ServerAliveCountMax=3",
        "-o", "ExitOnForwardFailure=yes",
        "-R", "80:127.0.0.1:8080",
        "serveo.net",
    ]
    process = await asyncio.create_subprocess_exec(
        *args,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.STDOUT,
    )

    async def read_url() -> str:
        assert process.stdout is not None
        while True:
            line = await process.stdout.readline()
            if not line:
                raise RuntimeError("туннель закрылся, не выдав адрес")
            text = line.decode("utf-8", "replace")
            match = URL_RE.search(text)
            if match:
                return match.group(0)

    try:
        url = await asyncio.wait_for(read_url(), timeout=60)
    except (asyncio.TimeoutError, RuntimeError) as exc:
        process.kill()
        raise RuntimeError(f"не удалось получить адрес туннеля: {exc}") from exc

    asyncio.create_task(_drain(process))
    return process, url


async def _drain(process: asyncio.subprocess.Process) -> None:
    """Читает вывод туннеля, чтобы буфер не переполнялся."""
    if process.stdout is None:
        return
    while True:
        line = await process.stdout.readline()
        if not line:
            return
        text = line.decode("utf-8", "replace").strip()
        if text and ("expired" in text.lower() or "closed" in text.lower()):
            logger.warning("Туннель: %s", text)


# --- Telegram ------------------------------------------------------------------

def build_bot() -> Bot:
    token = read_env("TELEGRAM_BOT_TOKEN") or read_env("BOT_TOKEN")
    if not token:
        logger.error("В .env не найден BOT_TOKEN.")
        raise SystemExit(1)
    proxy = read_env("TELEGRAM_PROXY") or None
    session = AiohttpSession(proxy=proxy) if proxy else None
    return Bot(
        token=token,
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )


def app_markup(url: str) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup(
        inline_keyboard=[
            [InlineKeyboardButton(text="🚀 Открыть приложение", web_app=WebAppInfo(url=url))]
        ]
    )


def known_chats() -> list[int]:
    users_file = Path(read_env("USERS_FILE") or (BASE_DIR / "users.json"))
    if not users_file.is_absolute():
        users_file = BASE_DIR / users_file
    try:
        data = json.loads(users_file.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    chats: list[int] = []
    for key, value in data.items():
        try:
            chats.append(int(value.get("telegram_id") or key))
        except (TypeError, ValueError, AttributeError):
            continue
    return chats


def load_state() -> dict[str, int]:
    try:
        return json.loads(STATE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_state(state: dict[str, int]) -> None:
    try:
        STATE_PATH.write_text(
            json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8"
        )
    except OSError:
        logger.warning("Не удалось сохранить tunnel_state.json")


async def publish_button(bot: Bot, url: str) -> None:
    markup = app_markup(url)
    state = load_state()
    changed = False

    for chat_id in known_chats():
        key = str(chat_id)
        message_id = state.get(key)

        if message_id:
            try:
                await bot.edit_message_reply_markup(
                    chat_id=chat_id, message_id=message_id, reply_markup=markup
                )
                continue
            except TelegramAPIError:
                state.pop(key, None)
                changed = True

        try:
            message = await bot.send_message(
                chat_id=chat_id, text=MESSAGE_TEXT, reply_markup=markup
            )
        except TelegramAPIError as exc:
            logger.warning("Не удалось отправить кнопку в %s: %s", chat_id, exc)
            continue

        state[key] = message.message_id
        changed = True
        try:
            await bot.pin_chat_message(
                chat_id=chat_id,
                message_id=message.message_id,
                disable_notification=True,
            )
        except TelegramAPIError:
            pass

    if changed:
        save_state(state)

    logger.info("Кнопка обновлена: %s", url)


# --- основной цикл -------------------------------------------------------------

async def supervise(bot: Bot, bot_process: subprocess.Popen) -> None:
    tunnel: asyncio.subprocess.Process | None = None
    current_url: str | None = None

    try:
        while True:
            if tunnel is None:
                try:
                    tunnel, current_url = await start_tunnel()
                    write_webapp_url(current_url)
                    logger.info("Новый адрес Mini App: %s", current_url)
                    await publish_button(bot, current_url)
                except RuntimeError as exc:
                    logger.warning("%s — пробую снова через 5 секунд", exc)
                    tunnel = None
                    await asyncio.sleep(5)
                    continue

            await asyncio.sleep(5)

            if bot_process.poll() is not None:
                logger.warning("Бот остановился (код %s) — перезапускаю",
                               bot_process.returncode)
                bot_process = start_bot()
                if not await wait_local_health():
                    logger.error("Бот не поднялся, смотрите bot.err.log")
                continue

            if tunnel.returncode is not None:
                logger.warning("Туннель закрылся — создаю новый")
                tunnel = None
                continue

            if current_url and not await url_is_alive(current_url):
                logger.warning("Адрес перестал отвечать — обновляю туннель")
                tunnel.kill()
                tunnel = None
    finally:
        if tunnel is not None and tunnel.returncode is None:
            tunnel.kill()
        if bot_process.poll() is None:
            bot_process.terminate()
        await bot.session.close()


async def main() -> None:
    lock = acquire_lock()  # noqa: F841 — держим, пока жив процесс
    setup_logging()

    logger.info("Запускаю бота…")
    kill_stale("bot")
    kill_stale("tunnel")
    await asyncio.sleep(1)

    bot_process = start_bot()
    if not await wait_local_health():
        logger.error(
            "Локальный сервер не отвечает на %s/health. "
            "Смотрите bot.err.log и bot.log.",
            LOCAL_URL,
        )
        bot_process.terminate()
        raise SystemExit(1)

    bot = build_bot()
    logger.info("Бот работает, поднимаю туннель…")
    logger.info("Не закрывайте это окно. Остановить — Ctrl+C.")

    try:
        await supervise(bot, bot_process)
    except KeyboardInterrupt:
        logger.info("Остановка по Ctrl+C")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
