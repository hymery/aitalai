"""Ежедневные напоминания о занятиях."""

from __future__ import annotations

import asyncio
import html
import logging
from datetime import date, datetime

from aiogram import Bot
from aiogram.exceptions import (
    TelegramAPIError,
    TelegramForbiddenError,
    TelegramRetryAfter,
)

from config import Config, live_webapp_url
from keyboards import reminder_kb
from storage import UserStore

logger = logging.getLogger(__name__)


def build_reminder_text(user: dict, webapp_url: str | None) -> str:
    name = user.get("full_name")
    greeting = f"<b>{html.escape(str(name))}</b>, " if name else ""
    if webapp_url:
        tail = "Откройте мини-приложение и выполните сегодняшнее задание."
    else:
        tail = (
            "Мини-приложение скоро появится — обязательно загляните, "
            "когда оно откроется."
        )
    return (
        "🔥 <b>Не забудь сделать задание сегодня!</b>\n\n"
        f"{greeting}ежедневное задание уже ждёт вас в языковой школе.\n\n"
        f"{tail}"
    )


async def send_reminders(
    bot: Bot,
    store: UserStore,
    webapp_url: str | None,
    *,
    today: str | None = None,
) -> int:
    """Рассылает напоминания всем, кому сегодня ещё не отправляли."""
    day = today or date.today().isoformat()
    recipients = store.reminder_recipients(day)
    if not recipients:
        logger.info("Напоминания: нет получателей на %s", day)
        return 0

    sent = 0
    for user in recipients:
        try:
            telegram_id = int(user["telegram_id"])
        except (KeyError, TypeError, ValueError):
            logger.warning("Пропущен некорректный пользователь в реестре: %s", user)
            continue

        try:
            await bot.send_message(
                telegram_id,
                build_reminder_text(user, webapp_url),
                reply_markup=reminder_kb(webapp_url),
            )
        except TelegramForbiddenError:
            logger.info(
                "Пользователь %s заблокировал бота — напоминания отключены",
                telegram_id,
            )
            store.mark_blocked(telegram_id)
            continue
        except TelegramRetryAfter as exc:
            logger.warning(
                "Telegram попросил подождать %s с, продолжаем позже",
                exc.retry_after,
            )
            await asyncio.sleep(exc.retry_after)
            continue
        except TelegramAPIError as exc:
            logger.warning(
                "Не удалось отправить напоминание %s: %s", telegram_id, exc
            )
            continue

        store.mark_reminded(telegram_id, day)
        sent += 1
        await asyncio.sleep(0.05)  # ~20 сообщений/сек, чтобы не ловить flood

    logger.info("Напоминания отправлены: %s из %s", sent, len(recipients))
    return sent


async def reminder_loop(bot: Bot, config: Config, store: UserStore) -> None:
    """Раз в сутки в REMINDER_TIME рассылает напоминания."""
    if not config.reminder_enabled:
        logger.info("Ежедневные напоминания отключены (REMINDER_ENABLED=0)")
        return

    logger.info(
        "Ежедневные напоминания включены: %s (локальное время), "
        "пользователей в реестре: %s",
        config.reminder_time,
        store.count(),
    )

    fired_on: date | None = None
    while True:
        now = datetime.now()
        current = now.strftime("%H:%M")

        if current == config.reminder_time:
            if fired_on != now.date():
                fired_on = now.date()
                try:
                    await send_reminders(bot, store, live_webapp_url(config))
                except Exception:  # noqa: BLE001 — планировщик не должен падать
                    logger.exception("Ошибка при рассылке напоминаний")
        else:
            fired_on = None

        await asyncio.sleep(20)
