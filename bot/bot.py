"""Точка входа: бот языковой школы (регистрация + напоминания)."""

from __future__ import annotations

import asyncio
import json
import logging
import sys
from contextlib import suppress
from dataclasses import replace
from logging.handlers import RotatingFileHandler
from typing import Any, Awaitable, Callable

from aiogram import BaseMiddleware, Bot, Dispatcher
from aiogram.client.default import DefaultBotProperties
from aiogram.client.session.aiohttp import AiohttpSession
from aiogram.enums import ParseMode
from aiogram.exceptions import TelegramNetworkError, TelegramUnauthorizedError
from aiogram.fsm.context import FSMContext
from aiogram.fsm.storage.memory import MemoryStorage
from aiogram.types import BotCommand, CallbackQuery, Message

from api import ApiClient, ApiError
from config import BASE_DIR, Config, load_config
from handlers import UserStates, router
from keyboards import is_local_url, is_webapp_url
from reminders import activity_loop, reminder_loop
from storage import UserStore
from webapp_server import start_webapp_server

LOG_FILE = BASE_DIR / "bot.log"
logger = logging.getLogger("bot")

_SHORT_STATES = {
    "idle": UserStates.idle,
    "registration": UserStates.registration,
    "registered": UserStates.registered,
}


def setup_logging() -> None:
    """Логирование в консоль и bot.log (UTF-8)."""
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[attr-defined]
        except (AttributeError, ValueError):
            pass

    formatter = logging.Formatter(
        "%(asctime)s | %(levelname)-8s | %(name)s | %(message)s"
    )

    root = logging.getLogger()
    root.setLevel(logging.INFO)

    if root.handlers:
        return

    file_handler = RotatingFileHandler(
        LOG_FILE,
        maxBytes=5 * 1024 * 1024,
        backupCount=3,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)

    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    console_handler.setLevel(logging.INFO)

    root.addHandler(file_handler)
    root.addHandler(console_handler)

    logging.getLogger("aiogram.event").setLevel(logging.WARNING)
    logging.getLogger("aiohttp").setLevel(logging.WARNING)


def short_state_name(raw_state: str | None) -> str:
    if not raw_state:
        return "idle"
    return raw_state.rsplit(":", 1)[-1]


class StateSyncMiddleware(BaseMiddleware):
    """Восстанавливает и сохраняет состояние пользователя через /bot/state."""

    def __init__(self, api: ApiClient) -> None:
        self.api = api
        self._restored: set[int] = set()

    async def __call__(
        self,
        handler: Callable[[Any, dict[str, Any]], Awaitable[Any]],
        event: Message | CallbackQuery,
        data: dict[str, Any],
    ) -> Any:
        state: FSMContext | None = data.get("state")
        user = data.get("event_from_user") or getattr(event, "from_user", None)
        data["api"] = self.api
        if state is None or user is None:
            return await handler(event, data)

        telegram_id = int(user.id)

        if telegram_id not in self._restored:
            if await self._restore(telegram_id, state):
                self._restored.add(telegram_id)

        before = await self._snapshot(state)
        try:
            return await handler(event, data)
        finally:
            try:
                after = await self._snapshot(state)
                if after != before:
                    await self._save(telegram_id, after)
            except Exception:  # noqa: BLE001 — синхронизация не должна ломать хендлер
                logger.warning(
                    "Не удалось синхронизировать состояние пользователя %s",
                    telegram_id,
                    exc_info=True,
                )

    async def _restore(self, telegram_id: int, state: FSMContext) -> bool:
        if await state.get_state() is not None or await state.get_data():
            return True

        try:
            saved = await self.api.get_bot_state(telegram_id)
        except ApiError as exc:
            logger.warning(
                "Не удалось восстановить состояние %s: %s", telegram_id, exc
            )
            return False

        if not saved:
            return True

        raw_state = saved.get("state")
        saved_data = saved.get("data") or {}
        if isinstance(saved_data, str):
            try:
                saved_data = json.loads(saved_data)
            except json.JSONDecodeError:
                logger.warning("Повреждённые data в /bot/state для %s", telegram_id)
                saved_data = {}
        if not isinstance(saved_data, dict):
            saved_data = {}

        target_state = _SHORT_STATES.get(
            short_state_name(raw_state), UserStates.idle
        )
        if saved_data:
            await state.set_data(saved_data)
        await state.set_state(target_state)

        logger.info(
            "Состояние пользователя %s восстановлено: %s",
            telegram_id,
            short_state_name(raw_state),
        )
        return True

    @staticmethod
    async def _snapshot(state: FSMContext) -> tuple[str | None, dict[str, Any]]:
        return await state.get_state(), await state.get_data()

    async def _save(
        self,
        telegram_id: int,
        snapshot: tuple[str | None, dict[str, Any]],
    ) -> None:
        raw_state, raw_data = snapshot
        try:
            payload = json.loads(
                json.dumps(raw_data, ensure_ascii=False, default=str)
            )
        except (TypeError, ValueError):
            logger.warning(
                "Данные состояния %s не сериализуются в JSON", telegram_id
            )
            return

        try:
            await self.api.save_bot_state(
                telegram_id,
                short_state_name(raw_state),
                payload,
            )
        except ApiError as exc:
            logger.warning(
                "Не удалось сохранить состояние %s: %s", telegram_id, exc
            )


async def run_bot(config: Config) -> None:
    api = ApiClient(config)
    store = UserStore(config.users_file)

    session = (
        AiohttpSession(proxy=config.telegram_proxy)
        if config.telegram_proxy
        else None
    )
    bot = Bot(
        token=config.bot_token,
        session=session,
        default=DefaultBotProperties(parse_mode=ParseMode.HTML),
    )
    dispatcher = Dispatcher(storage=MemoryStorage())

    sync_middleware = StateSyncMiddleware(api)
    dispatcher.message.outer_middleware(sync_middleware)
    dispatcher.callback_query.outer_middleware(sync_middleware)
    dispatcher.include_router(router)

    reminder_task: asyncio.Task | None = None
    activity_task: asyncio.Task | None = None
    webapp_runner = None
    try:
        try:
            webapp_runner, _ = await start_webapp_server(config)
        except OSError as exc:
            logger.error(
                "Не удалось запустить WebApp-сервер на %s:%s: %s. "
                "Проверьте, не занят ли порт.",
                config.webapp_host,
                config.webapp_port,
                exc,
            )

        await bot.set_my_commands(
            [
                BotCommand(command="start", description="Главное меню"),
                BotCommand(command="task", description="Фрагмент дня"),
                BotCommand(command="progress", description="Мой прогресс"),
                BotCommand(command="notifications", description="Уведомления"),
                BotCommand(command="cancel", description="Отменить действие"),
                BotCommand(command="help", description="Список команд"),
            ]
        )
        await bot.delete_webhook(drop_pending_updates=True)

        mode = "MOCK" if config.use_mock else "REAL"
        proxy_note = " via proxy" if config.telegram_proxy else ""
        logger.info(
            "Bot started in %s mode (API: %s)%s",
            mode,
            config.api_url,
            proxy_note,
        )
        if config.webapp_url:
            logger.info("Mini App: %s", config.webapp_url)
        else:
            logger.info(
                "Mini App: WEBAPP_URL не задан — кнопка покажет заглушку"
            )
        logger.info(
            "Напоминания: %s, время %s",
            "включены" if config.reminder_enabled else "выключены",
            config.reminder_time,
        )

        reminder_task = asyncio.create_task(
            reminder_loop(bot, config, store)
        )
        activity_task = asyncio.create_task(
            activity_loop(bot, config, store, api)
        )

        await dispatcher.start_polling(
            bot,
            api=api,
            config=config,
            store=store,
        )
    finally:
        for task in (reminder_task, activity_task):
            if task is not None:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task
        if webapp_runner is not None:
            await webapp_runner.cleanup()
            logger.info("WebApp сервер остановлен")
        await api.close()
        await bot.session.close()
        logger.info("Бот остановлен")


def main() -> None:
    setup_logging()
    try:
        config = load_config()
    except RuntimeError as exc:
        logger.error("Ошибка конфигурации: %s", exc)
        raise SystemExit(1) from exc

    if config.use_mock:
        logger.warning(
            "Включён USE_MOCK=1: все запросы к API заменены заглушкой. "
            "Для работы с реальным backend установите USE_MOCK=0."
        )

    if config.webapp_url and not is_webapp_url(config.webapp_url):
        logger.warning(
            "WEBAPP_URL должен начинаться с https:// (требование Telegram). "
            "Для локальной разработки разрешён http://localhost. "
            "Кнопка Mini App временно показывает заглушку."
        )
        config = replace(config, webapp_url=None)

    if config.webapp_url and is_local_url(config.webapp_url):
        logger.warning(
            "WEBAPP_URL — локальный адрес (%s). Mini App открывается в браузере; "
            "для кнопки внутри Telegram нужен HTTPS-адрес.",
            config.webapp_url,
        )

    try:
        asyncio.run(run_bot(config))
    except KeyboardInterrupt:
        logger.info("Остановка по Ctrl+C")
    except TelegramUnauthorizedError:
        logger.error(
            "Telegram отклонил BOT_TOKEN. Проверьте токен в .env "
            "(возможно, он отозван в @BotFather)."
        )
    except TelegramNetworkError as exc:
        logger.error(
            "Не удалось подключиться к Telegram API: %s\n"
            "Проверьте интернет или задайте TELEGRAM_PROXY в .env, "
            "например: socks5://127.0.0.1:10808",
            exc,
        )
    except Exception:  # noqa: BLE001 — верхнеуровневый перехват для лога
        logger.exception("Критическая ошибка при работе бота")


if __name__ == "__main__":
    main()
