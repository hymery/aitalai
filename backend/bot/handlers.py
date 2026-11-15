"""Тонкий Telegram-бот: Mini App и напоминания, без регистрации в чате."""

from __future__ import annotations

import html
import logging

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, ErrorEvent, InlineKeyboardMarkup, Message

from config import Config, live_webapp_url
from keyboards import (
    CB_APP_LOCAL,
    CB_APP_SOON,
    CB_BACK,
    CB_CANCEL,
    CB_TOGGLE_REMINDERS,
    main_menu_kb,
)
from storage import UserStore

logger = logging.getLogger(__name__)
router = Router(name="main")


class UserStates(StatesGroup):
    """Состояния оставлены для совместимости с сохранёнными сессиями."""

    idle = State()
    registration = State()
    registered = State()


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value))


async def safe_edit(
    call: CallbackQuery,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    message = call.message
    if message is None:
        await call.bot.send_message(call.from_user.id, text, reply_markup=reply_markup)
        return
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc):
            return
        await call.bot.send_message(call.from_user.id, text, reply_markup=reply_markup)


def build_menu_text(data: dict) -> str:
    name = data.get("full_name")
    greeting = f"👋 <b>{esc(name)}</b>!\n\n" if name else "👋 <b>Привет!</b>\n\n"
    return (
        f"{greeting}"
        "Добро пожаловать в <b>Әйтәләй</b> — башкирскую языковую школу.\n\n"
        "🚀 Регистрация, вход, уроки, рейтинг и кабинет находятся в приложении. "
        "Нажми <b>«Открыть приложение»</b> ниже.\n\n"
        "Здесь можно управлять напоминаниями о занятиях."
    )


def menu_markup(config: Config, data: dict) -> InlineKeyboardMarkup:
    return main_menu_kb(
        live_webapp_url(config),
        reminders_enabled=bool(data.get("reminders_enabled", True)),
        show_reminders=config.reminder_enabled,
    )


def telegram_id_of(message: Message) -> int:
    return message.from_user.id if message.from_user else message.chat.id


def display_name(message: Message) -> str:
    user = message.from_user
    if not user:
        return ""
    return user.full_name or user.first_name or user.username or ""


async def show_menu(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
    *,
    prefix: str = "",
) -> None:
    telegram_id = telegram_id_of(message)
    stored = store.get(telegram_id) or {}
    data = {
        "full_name": stored.get("full_name") or display_name(message),
        "reminders_enabled": bool(stored.get("reminders_enabled", True)),
    }
    await state.set_state(UserStates.idle)
    await state.set_data(data)
    text = build_menu_text(data)
    if prefix:
        text = f"{prefix}\n\n{text}"
    await message.answer(text, reply_markup=menu_markup(config, data))


@router.message(CommandStart())
async def cmd_start(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    telegram_id = telegram_id_of(message)
    stored = store.get(telegram_id) or {}
    store.upsert(
        telegram_id,
        full_name=display_name(message),
        reminders_enabled=bool(stored.get("reminders_enabled", True)),
        blocked=False,
    )
    await show_menu(message, state, config, store)


@router.message(Command("cancel"))
async def cmd_cancel(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    await state.clear()
    await show_menu(message, state, config, store, prefix="↩️ Действие отменено.")


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "ℹ️ <b>Помощь</b>\n\n"
        "/start — открыть главное меню\n"
        "/task — перейти к заданию дня в приложении\n"
        "/progress — открыть кабинет и прогресс\n"
        "/notifications — включить или выключить напоминания\n"
        "/help — эта справка\n\n"
        "Регистрация и вход выполняются только в мини-приложении. "
        "Пароль в чат отправлять не нужно."
    )


@router.message(Command("task"))
async def cmd_task(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    await show_menu(
        message,
        state,
        config,
        store,
        prefix="📖 Фрагмент дня ждёт в разделе «Сообщество».",
    )


@router.message(Command("progress"))
async def cmd_progress(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    await show_menu(
        message,
        state,
        config,
        store,
        prefix="📊 Очки, уровень и серия дней находятся в «Кабинете» приложения.",
    )


async def toggle_notifications(
    telegram_id: int,
    state: FSMContext,
    store: UserStore,
) -> bool:
    stored = store.get(telegram_id) or {}
    enabled = not bool(stored.get("reminders_enabled", True))
    store.set_reminders(telegram_id, enabled)
    await state.update_data(reminders_enabled=enabled)
    return enabled


@router.message(Command("notifications"))
async def cmd_notifications(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    enabled = await toggle_notifications(telegram_id_of(message), state, store)
    await show_menu(
        message,
        state,
        config,
        store,
        prefix="🔔 Напоминания включены." if enabled else "🔕 Напоминания выключены.",
    )


@router.callback_query(F.data == CB_APP_SOON)
async def cb_app_soon(call: CallbackQuery, config: Config) -> None:
    await call.answer(
        "Откройте приложение кнопкой в меню." if live_webapp_url(config)
        else "Мини-приложение пока недоступно. Попробуйте позже.",
        show_alert=True,
    )


@router.callback_query(F.data == CB_APP_LOCAL)
async def cb_app_local(call: CallbackQuery, config: Config) -> None:
    await call.answer(
        "Для открытия внутри Telegram нужен публичный HTTPS-адрес Mini App.",
        show_alert=True,
    )


@router.callback_query(F.data == CB_TOGGLE_REMINDERS)
async def cb_toggle_reminders(
    call: CallbackQuery,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    if not config.reminder_enabled:
        await call.answer("Напоминания отключены администратором.", show_alert=True)
        return
    enabled = await toggle_notifications(call.from_user.id, state, store)
    await call.answer("Напоминания включены 🔔" if enabled else "Напоминания выключены 🔕")
    data = await state.get_data()
    await safe_edit(call, build_menu_text(data), menu_markup(config, data))


@router.callback_query(F.data.in_({CB_BACK, CB_CANCEL}))
async def cb_back_or_cancel(
    call: CallbackQuery,
    state: FSMContext,
    store: UserStore,
    config: Config,
) -> None:
    await call.answer()
    stored = store.get(call.from_user.id) or {}
    data = {
        "full_name": stored.get("full_name") or call.from_user.full_name,
        "reminders_enabled": bool(stored.get("reminders_enabled", True)),
    }
    await state.set_state(UserStates.idle)
    await state.set_data(data)
    await safe_edit(call, build_menu_text(data), menu_markup(config, data))


@router.message(F.text.startswith("/"))
async def unknown_command(message: Message) -> None:
    await message.answer("🤔 Неизвестная команда.\n\nСписок команд: /help")


@router.message()
async def fallback_message(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    await show_menu(message, state, config, store)


@router.callback_query()
async def fallback_callback(call: CallbackQuery) -> None:
    await call.answer("Эта кнопка устарела. Откройте меню командой /start.", show_alert=True)


@router.errors()
async def error_handler(event: ErrorEvent) -> bool:
    logger.error(
        "Необработанная ошибка при обработке обновления: %s",
        event.exception,
        exc_info=event.exception,
    )
    update = event.update
    try:
        if update.callback_query is not None:
            await update.callback_query.answer(
                "Произошла ошибка. Попробуйте ещё раз.", show_alert=True
            )
        elif update.message is not None:
            await update.message.answer("Произошла ошибка. Попробуйте /start.")
    except Exception:
        logger.debug("Не удалось сообщить пользователю об ошибке", exc_info=True)
    return True
