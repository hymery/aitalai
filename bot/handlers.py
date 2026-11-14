"""Бот языковой школы: регистрация и напоминания.

Учёба (задания, рейтинг, профиль) живёт в Mini App, бот только открывает
её и присылает напоминания.
"""

from __future__ import annotations

import html
import logging
import re

from aiogram import F, Router
from aiogram.exceptions import TelegramBadRequest
from aiogram.filters import Command, CommandStart, StateFilter
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import CallbackQuery, ErrorEvent, InlineKeyboardMarkup, Message

from api import ApiClient, ApiError
from config import Config, live_webapp_url
from keyboards import (
    CB_APP_LOCAL,
    CB_APP_SOON,
    CB_BACK,
    CB_CANCEL,
    CB_TOGGLE_REMINDERS,
    back_to_menu_kb,
    main_menu_kb,
    registration_kb,
)
from storage import UserStore

logger = logging.getLogger(__name__)
router = Router(name="main")


# --- FSM -----------------------------------------------------------------------

class UserStates(StatesGroup):
    idle = State()
    registration = State()
    registered = State()


# --- вспомогательные функции ---------------------------------------------------

GRADE_RE = re.compile(r"^(\d{1,2})\s*([А-Яа-яA-Za-z]?)$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")

MIN_PASSWORD = 4
MAX_PASSWORD = 72

WELCOME_TEXT = (
    "👋 <b>Добро пожаловать в языковую школу!</b>\n\n"
    "Вся учёба — ежедневные задания, рейтинг и профиль — теперь "
    "в мини-приложении.\n\n"
    "Сначала короткая регистрация (5 шагов).\n\n"
    "👤 <b>Шаг 1 из 5.</b> Введите ваши ФИО "
    "(например: Иванов Иван Иванович):"
)


def esc(value: object) -> str:
    return html.escape("" if value is None else str(value))


async def safe_edit(
    call: CallbackQuery,
    text: str,
    reply_markup: InlineKeyboardMarkup | None = None,
) -> None:
    """Редактирует сообщение, не падая на устаревших/недоступных сообщениях."""
    message = call.message
    if message is None:
        await call.bot.send_message(call.from_user.id, text, reply_markup=reply_markup)
        return
    try:
        await message.edit_text(text, reply_markup=reply_markup)
    except TelegramBadRequest as exc:
        if "message is not modified" in str(exc):
            return
        try:
            await message.answer(text, reply_markup=reply_markup)
        except TelegramBadRequest:
            await call.bot.send_message(
                call.from_user.id, text, reply_markup=reply_markup
            )


async def reset_transient(state: FSMContext) -> None:
    data = await state.get_data()
    data.pop("step", None)
    await state.set_data(data)
    await state.set_state(
        UserStates.registered if data.get("registered") else UserStates.idle
    )


def build_menu_text(data: dict) -> str:
    name = data.get("full_name")
    greeting = (
        f"👋 <b>{esc(name)}</b>, добро пожаловать!"
        if name
        else "👋 <b>Добро пожаловать!</b>"
    )
    return (
        f"{greeting}\n\n"
        "Вся языковая школа — задания, рейтинг и профиль — "
        "в мини-приложении.\n\n"
        "Выберите действие:"
    )


def menu_markup(config: Config, data: dict) -> InlineKeyboardMarkup:
    return main_menu_kb(
        live_webapp_url(config),
        reminders_enabled=bool(data.get("reminders_enabled", True)),
        show_reminders=config.reminder_enabled,
    )


async def show_menu(
    message: Message,
    state: FSMContext,
    config: Config,
    *,
    prefix: str = "",
) -> None:
    data = await state.get_data()
    text = build_menu_text(data)
    if prefix:
        text = f"{prefix}\n\n{text}"
    await message.answer(text, reply_markup=menu_markup(config, data))


# --- команды -------------------------------------------------------------------

@router.message(CommandStart())
async def cmd_start(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    telegram_id = message.from_user.id if message.from_user else message.chat.id
    data = await state.get_data()

    # Если backend/FSM потеряли данные, но локальный реестр знает пользователя.
    if not data.get("registered"):
        stored = store.get(telegram_id)
        if stored and stored.get("full_name"):
            data.update(
                registered=True,
                full_name=stored.get("full_name"),
                school=stored.get("school"),
                grade=stored.get("grade"),
                reminders_enabled=bool(stored.get("reminders_enabled", True)),
            )
            await state.set_data(data)
            await state.set_state(UserStates.registered)

    # Профиль есть, но токена нет (регистрация старой версии) — дозаполняем
    # email и пароль, чтобы Mini App получил доступ.
    if data.get("registered") and not data.get("token"):
        prefill = {
            key: data[key]
            for key in ("full_name", "school", "grade")
            if data.get(key)
        }
        prefill["step"] = "email"
        await state.set_data(prefill)
        await state.set_state(UserStates.registration)
        await message.answer(
            "Профиль найден, но доступ к мини-приложению ещё не настроен.\n\n"
            "📧 <b>Шаг 4 из 5.</b> Укажите email (он понадобится для входа):",
            reply_markup=registration_kb(),
        )
        return

    if data.get("registered"):
        await reset_transient(state)
        await show_menu(message, state, config)
        return

    await state.set_data({"step": "fio"})
    await state.set_state(UserStates.registration)
    await message.answer(WELCOME_TEXT, reply_markup=registration_kb())


@router.message(Command("cancel"))
async def cmd_cancel(
    message: Message,
    state: FSMContext,
    config: Config,
) -> None:
    data = await state.get_data()
    was_registration = (await state.get_state()) == UserStates.registration.state
    await reset_transient(state)
    data = await state.get_data()

    if data.get("registered"):
        await message.answer(
            "↩️ Действие отменено.\n\n" + build_menu_text(data),
            reply_markup=menu_markup(config, data),
        )
    elif was_registration:
        await message.answer(
            "↩️ Регистрация отменена. Чтобы начать заново, отправьте /start."
        )
    else:
        await message.answer(
            "↩️ Действие отменено. Чтобы начать, отправьте /start."
        )


@router.message(Command("help"))
async def cmd_help(message: Message) -> None:
    await message.answer(
        "ℹ️ <b>Помощь</b>\n\n"
        "/start — главное меню или регистрация\n"
        "/task — фрагмент дня\n"
        "/progress — очки, уровень и серия\n"
        "/notifications — включить или выключить уведомления\n"
        "/cancel — отменить текущее действие\n"
        "/help — эта справка\n\n"
        "🚀 <b>Открыть языковую школу</b> — мини-приложение с заданиями, "
        "рейтингом и профилем."
    )


@router.message(Command("task"))
async def cmd_task(message: Message, state: FSMContext, api: ApiClient, config: Config) -> None:
    data = await state.get_data()
    token = data.get("token")
    if not token:
        await message.answer("Сначала зарегистрируйтесь командой /start.")
        return
    try:
        task = await api.get_daily_task(str(token))
    except ApiError as exc:
        await message.answer(esc(exc.user_message))
        return
    await message.answer(
        "📖 <b>Фрагмент дня ждёт проверки!</b>\n\n"
        f"<b>{esc(task.get('text_ba'))}</b>\n"
        f"Предложенный перевод: {esc(task.get('translation'))}\n\n"
        "Откройте мини-приложение, чтобы подтвердить или исправить перевод.",
        reply_markup=menu_markup(config, data),
    )


@router.message(Command("progress"))
async def cmd_progress(message: Message, state: FSMContext, api: ApiClient, config: Config) -> None:
    data = await state.get_data()
    token = data.get("token")
    if not token:
        await message.answer("Сначала зарегистрируйтесь командой /start.")
        return
    try:
        profile = await api.get_profile(str(token))
    except ApiError as exc:
        await message.answer(esc(exc.user_message))
        return
    await message.answer(
        f"📊 <b>{esc(profile.get('full_name') or 'Ваш прогресс')}</b>\n\n"
        f"Очки: <b>{int(profile.get('points') or 0)}</b>\n"
        f"Уровень: <b>{int(profile.get('level') or 1)}</b>\n"
        f"Серия: <b>{int(profile.get('streak_days') or 0)} дн.</b>",
        reply_markup=menu_markup(config, data),
    )


@router.message(Command("notifications"))
async def cmd_notifications(
    message: Message,
    state: FSMContext,
    config: Config,
    store: UserStore,
) -> None:
    data = await state.get_data()
    telegram_id = message.from_user.id if message.from_user else message.chat.id
    if not data.get("registered"):
        await message.answer("Сначала зарегистрируйтесь командой /start.")
        return
    enabled = not bool(data.get("reminders_enabled", True))
    await state.update_data(reminders_enabled=enabled)
    store.set_reminders(telegram_id, enabled)
    data["reminders_enabled"] = enabled
    await message.answer(
        "🔔 Уведомления включены." if enabled else "🔕 Уведомления выключены.",
        reply_markup=menu_markup(config, data),
    )


# --- регистрация ---------------------------------------------------------------

@router.message(StateFilter(UserStates.registration), F.text, ~F.text.startswith("/"))
async def registration_input(
    message: Message,
    state: FSMContext,
    api: ApiClient,
    store: UserStore,
    config: Config,
) -> None:
    data = await state.get_data()
    step = data.get("step") or "fio"
    text = (message.text or "").strip()
    telegram_id = message.from_user.id if message.from_user else message.chat.id

    if step == "fio":
        if len(text) < 3 or len(text) > 120 or len(text.split()) < 2:
            await message.answer(
                "Пожалуйста, укажите фамилию и имя полностью "
                "(например: Иванов Иван Иванович):",
                reply_markup=registration_kb(),
            )
            return
        await state.update_data(full_name=text, step="school")
        await message.answer(
            "🏫 <b>Шаг 2 из 5.</b> Укажите школу:",
            reply_markup=registration_kb(),
        )
        return

    if step == "school":
        if not 2 <= len(text) <= 150:
            await message.answer(
                "Название школы должно быть от 2 до 150 символов. "
                "Попробуйте ещё раз:",
                reply_markup=registration_kb(),
            )
            return
        await state.update_data(school=text, step="grade")
        await message.answer(
            "🎓 <b>Шаг 3 из 5.</b> Укажите класс (например: 5 или 9А):",
            reply_markup=registration_kb(),
        )
        return

    if step == "grade":
        match = GRADE_RE.fullmatch(text)
        if not match or not 1 <= int(match.group(1)) <= 11:
            await message.answer(
                "Введите класс числом от 1 до 11, например: 5 или 9А.",
                reply_markup=registration_kb(),
            )
            return
        grade = f"{int(match.group(1))}{match.group(2).upper()}"
        await state.update_data(grade=grade, step="email")
        await message.answer(
            "📧 <b>Шаг 4 из 5.</b> Укажите email "
            "(он понадобится для входа):",
            reply_markup=registration_kb(),
        )
        return

    if step == "email":
        if len(text) > 254 or not EMAIL_RE.fullmatch(text):
            await message.answer(
                "Похоже, email указан неверно. Пример: ivan@example.com.\n"
                "Попробуйте ещё раз:",
                reply_markup=registration_kb(),
            )
            return
        await state.update_data(email=text.lower(), step="password")
        await message.answer(
            "🔒 <b>Шаг 5 из 5.</b> Придумайте пароль "
            f"(от {MIN_PASSWORD} до {MAX_PASSWORD} символов).\n\n"
            "Сообщение с паролем я удалю из чата после ввода.",
            reply_markup=registration_kb(),
        )
        return

    if step == "password":
        if not MIN_PASSWORD <= len(text) <= MAX_PASSWORD:
            await message.answer(
                f"Пароль должен быть от {MIN_PASSWORD} до {MAX_PASSWORD} "
                "символов. Попробуйте ещё раз:",
                reply_markup=registration_kb(),
            )
            return
        # Пароль не должен оставаться в истории чата.
        try:
            await message.delete()
        except TelegramBadRequest:
            logger.debug("Не удалось удалить сообщение с паролем", exc_info=True)
        await state.update_data(password=text, step=None)
        await complete_registration(
            message, state, api, store, config, telegram_id
        )
        return

    # Неизвестный/устаревший шаг — начинаем заново.
    await state.update_data(step="fio")
    await message.answer(
        "Продолжим регистрацию.\n\n"
        "👤 <b>Шаг 1 из 5.</b> Введите ваши ФИО "
        "(например: Иванов Иван Иванович):",
        reply_markup=registration_kb(),
    )


async def complete_registration(
    message: Message,
    state: FSMContext,
    api: ApiClient,
    store: UserStore,
    config: Config,
    telegram_id: int,
) -> None:
    data = await state.get_data()
    full_name = data.get("full_name")
    school = data.get("school")
    grade = data.get("grade")
    email = data.get("email")
    password = data.get("password")

    if not (full_name and school and grade and email and password):
        await state.update_data(step="fio", password=None)
        await message.answer(
            "Не хватает данных для регистрации. Начнём заново.\n\n"
            "👤 <b>Шаг 1 из 5.</b> Введите ваши ФИО:",
            reply_markup=registration_kb(),
        )
        return

    # Языковая пара не спрашивается: школа работает только с башкирским ↔ русским.
    payload = {
        "email": email,
        "password": password,
        "full_name": full_name,
        "role": "student",
        "telegram_id": telegram_id,
        "school": school,
        "class_name": grade,
        "lang_pair": "ba-ru",
    }

    await message.answer("⏳ Создаём профиль…")

    try:
        response = await api.register(payload)
    except ApiError as exc:
        logger.warning(
            "Регистрация не удалась (user_id=%s): %s", telegram_id, exc
        )
        # Пароль при ошибке не храним — просим ввести заново.
        await state.update_data(password=None, step="password")
        await message.answer(
            f"❌ Не удалось создать профиль: {esc(exc.user_message)}\n\n"
            "Проверьте данные и отправьте пароль ещё раз "
            "(или нажмите «Отмена» и начните с /start).",
            reply_markup=registration_kb(),
        )
        return

    token = None
    if isinstance(response, dict):
        token = (
            response.get("access_token")
            or response.get("token")
            or (response.get("data") or {}).get("token")
        )
    if not token:
        logger.error(
            "API не вернул access_token при регистрации (user_id=%s): %s",
            telegram_id,
            response,
        )
        await state.update_data(password=None, step="password")
        await message.answer(
            "❌ Сервер не вернул токен доступа. Отправьте пароль ещё раз "
            "или обратитесь в поддержку.",
            reply_markup=registration_kb(),
        )
        return

    reminders_enabled = bool(data.get("reminders_enabled", True))
    store.upsert(
        telegram_id,
        full_name=full_name,
        school=school,
        grade=grade,
        email=email,
        token=token,
        reminders_enabled=reminders_enabled,
        blocked=False,
    )

    # Токен храним и в FSM: middleware сохраняет его вместе с состоянием,
    # иначе следующие действия пользователя затрют /bot/state без токена.
    await state.update_data(
        registered=True,
        full_name=full_name,
        school=school,
        grade=grade,
        email=email,
        token=token,
        password=None,
        reminders_enabled=reminders_enabled,
        step=None,
    )
    await state.set_state(UserStates.registered)

    try:
        await api.save_bot_state(
            telegram_id,
            "registered",
            {"token": token},
        )
    except ApiError as exc:
        logger.warning(
            "Не удалось сохранить токен в /bot/state (user_id=%s): %s",
            telegram_id,
            exc,
        )

    if config.reminder_enabled:
        reminder_note = (
            "Напоминания о занятиях включены — отключить можно в меню."
        )
    else:
        reminder_note = "Напоминания сейчас отключены."

    await message.answer(
        "✅ <b>Профиль создан!</b>\n\n"
        f"<b>{esc(full_name)}</b>, добро пожаловать в языковую школу.\n"
        "Откройте мини-приложение, чтобы выполнить задание, "
        "посмотреть рейтинг и профиль.\n\n"
        f"{reminder_note}",
        reply_markup=main_menu_kb(
            live_webapp_url(config),
            reminders_enabled=reminders_enabled,
            show_reminders=config.reminder_enabled,
        ),
    )


# --- Mini App и напоминания ----------------------------------------------------

@router.callback_query(F.data == CB_APP_SOON)
async def cb_app_soon(call: CallbackQuery, config: Config) -> None:
    if live_webapp_url(config):
        await call.answer(
            "Мини-приложение доступно — откройте его кнопкой в меню.",
            show_alert=True,
        )
    else:
        await call.answer(
            "🚀 Мини-приложение скоро появится. Мы обязательно сообщим!",
            show_alert=True,
        )


@router.callback_query(F.data == CB_APP_LOCAL)
async def cb_app_local(call: CallbackQuery, config: Config) -> None:
    await call.answer(
        "Локальный адрес Mini App:\n"
        f"{live_webapp_url(config)}\n\n"
        "Откройте его в браузере на этом компьютере. "
        "Чтобы открывать приложение внутри Telegram, нужен HTTPS-адрес.",
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
        await call.answer(
            "Напоминания отключены администратором.",
            show_alert=True,
        )
        return

    data = await state.get_data()
    if not data.get("registered"):
        await call.answer(
            "Сначала пройдите регистрацию: /start",
            show_alert=True,
        )
        return

    enabled = not bool(data.get("reminders_enabled", True))
    await state.update_data(reminders_enabled=enabled)

    profile_fields = {
        key: data[key]
        for key in ("full_name", "school", "grade")
        if data.get(key)
    }
    store.upsert(
        call.from_user.id,
        reminders_enabled=enabled,
        **profile_fields,
    )

    await call.answer(
        "Напоминания включены 🔔" if enabled else "Напоминания выключены 🔕"
    )
    data["reminders_enabled"] = enabled
    await safe_edit(call, build_menu_text(data), menu_markup(config, data))


# --- навигация и запасные обработчики ------------------------------------------

@router.callback_query(F.data.in_({CB_BACK, CB_CANCEL}))
async def cb_back_or_cancel(
    call: CallbackQuery,
    state: FSMContext,
    config: Config,
) -> None:
    await call.answer()
    was_registration = (await state.get_state()) == UserStates.registration.state
    await reset_transient(state)
    data = await state.get_data()

    if data.get("registered"):
        await safe_edit(
            call,
            build_menu_text(data),
            menu_markup(config, data),
        )
    elif was_registration:
        await safe_edit(
            call,
            "↩️ Регистрация отменена. Чтобы начать заново, отправьте /start.",
        )
    else:
        await safe_edit(
            call,
            "↩️ Действие отменено. Чтобы начать, отправьте /start.",
        )


@router.message(F.text.startswith("/"))
async def unknown_command(message: Message) -> None:
    await message.answer("🤔 Неизвестная команда.\n\nСписок команд: /help")


@router.message()
async def fallback_message(
    message: Message,
    state: FSMContext,
    config: Config,
) -> None:
    data = await state.get_data()
    if data.get("registered"):
        await message.answer(
            "Выберите действие в меню:",
            reply_markup=menu_markup(config, data),
        )
    else:
        await message.answer(
            "Чтобы начать, отправьте /start — я помогу зарегистрироваться."
        )


@router.callback_query()
async def fallback_callback(call: CallbackQuery) -> None:
    await call.answer(
        "Эта кнопка устарела. Откройте меню командой /start.",
        show_alert=True,
    )


# --- ошибки --------------------------------------------------------------------

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
                "😔 Произошла непредвиденная ошибка. Попробуйте ещё раз.",
                show_alert=True,
            )
        elif update.message is not None:
            await update.message.answer(
                "😔 Произошла непредвиденная ошибка. "
                "Попробуйте ещё раз или отправьте /start."
            )
    except Exception:  # noqa: BLE001 — уведомление не должно падать
        logger.debug("Не удалось сообщить пользователю об ошибке", exc_info=True)
    return True
