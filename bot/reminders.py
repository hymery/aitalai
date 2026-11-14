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

from api import ApiClient, ApiError
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


def _rank_for(rows: list[dict], user: dict, category: str) -> int | None:
    for row in rows:
        if category == "schools":
            same = (
                user.get("school_id")
                and row.get("school_id") == user.get("school_id")
            ) or (user.get("school") and row.get("school") == user.get("school"))
        else:
            same = (
                (user.get("school") and row.get("school") == user.get("school"))
                and (user.get("grade") and row.get("class_name") == user.get("grade"))
            )
        if same:
            try:
                return int(row["rank"])
            except (KeyError, TypeError, ValueError):
                return None
    return None


def _activity_messages(previous: dict, current: dict) -> list[str]:
    """Сравнивает снимки и формирует только действительно новые события."""
    messages: list[str] = []
    old_streak = int(previous.get("streak") or 0)
    new_streak = int(current.get("streak") or 0)
    if new_streak > old_streak:
        messages.append(
            f"🔥 <b>Серия продолжается: {new_streak} дн.!</b>\n"
            "Ещё одно задание сегодня поможет сохранить результат."
        )

    labels = {"school_rank": "рейтинге школы", "class_rank": "рейтинге класса"}
    for key, label in labels.items():
        old_rank = previous.get(key)
        new_rank = current.get(key)
        if new_rank and old_rank and new_rank != old_rank:
            direction = "поднялись" if new_rank < old_rank else "сместились"
            messages.append(
                f"🏆 Новое место в {label}: <b>{new_rank}</b> "
                f"(было {old_rank}, вы {direction})."
            )

    old_confirmed = set(previous.get("confirmed") or [])
    new_confirmed = set(current.get("confirmed") or [])
    added = len(new_confirmed - old_confirmed)
    if added:
        messages.append(
            f"✅ Подтверждены ваши переводы: <b>{added}</b>.\n"
            "Спасибо за вклад в башкирский языковой корпус!"
        )
    return messages


async def send_activity_updates(
    bot: Bot,
    api: ApiClient,
    store: UserStore,
    webapp_url: str | None = None,
) -> int:
    """Уведомляет о streak, местах и подтверждениях; первый опрос лишь задаёт базу."""
    sent = 0
    for user in store.notification_recipients():
        telegram_id = int(user["telegram_id"])
        token = str(user["token"])
        try:
            profile, answers, schools, classes = await asyncio.gather(
                api.get_profile(token),
                api.get_my_answers(token),
                api.get_rating("schools"),
                api.get_rating("classes"),
            )
            current = {
                "streak": int(profile.get("streak_days") or 0),
                "school_rank": _rank_for(schools, user, "schools"),
                "class_rank": _rank_for(classes, user, "classes"),
                "confirmed": sorted(
                    int(answer["answer_id"])
                    for answer in answers
                    if answer.get("translation_status") == "confirmed"
                    and answer.get("answer_id") is not None
                ),
            }
            previous = user.get("notification_state")
            if isinstance(previous, dict):
                for text in _activity_messages(previous, current):
                    await bot.send_message(
                        telegram_id,
                        text,
                        reply_markup=reminder_kb(webapp_url),
                    )
                    sent += 1
                    await asyncio.sleep(0.6)
            store.upsert(telegram_id, notification_state=current)
        except TelegramForbiddenError:
            store.mark_blocked(telegram_id)
        except (ApiError, TelegramAPIError, TypeError, ValueError) as exc:
            logger.info("Уведомление пользователю %s отложено: %s", telegram_id, exc)
        except Exception:  # noqa: BLE001 — один пользователь не должен остановить цикл
            logger.exception("Ошибка проверки событий пользователя %s", telegram_id)
    return sent


async def activity_loop(
    bot: Bot,
    config: Config,
    store: UserStore,
    api: ApiClient,
) -> None:
    if not config.reminder_enabled:
        return
    while True:
        try:
            await send_activity_updates(bot, api, store, live_webapp_url(config))
        except Exception:  # noqa: BLE001 — фоновый планировщик должен выживать
            logger.exception("Ошибка цикла уведомлений об активности")
        await asyncio.sleep(300)
