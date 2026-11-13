"""Inline-клавиатуры бота: Mini App, регистрация, напоминания."""

from __future__ import annotations

from aiogram.types import InlineKeyboardMarkup, WebAppInfo
from aiogram.utils.keyboard import InlineKeyboardBuilder

# --- callbacks -----------------------------------------------------------------

CB_APP_SOON = "app:soon"
CB_APP_LOCAL = "app:local"
CB_TOGGLE_REMINDERS = "reminders:toggle"
CB_CANCEL = "menu:cancel"
CB_BACK = "menu:back"


def is_local_url(url: str | None) -> bool:
    return bool(url) and url.startswith(("http://localhost", "http://127.0.0.1"))


def is_https_url(url: str | None) -> bool:
    return bool(url) and url.startswith("https://")


def is_webapp_url(url: str | None) -> bool:
    """Адрес, который бот принимает: HTTPS или локальный HTTP для разработки."""
    return is_https_url(url) or is_local_url(url)


def _add_app_button(builder: InlineKeyboardBuilder, webapp_url: str | None) -> None:
    if is_https_url(webapp_url):
        builder.button(
            text="🚀 Открыть приложение",
            web_app=WebAppInfo(url=webapp_url),  # type: ignore[arg-type]
        )
    elif is_local_url(webapp_url):
        # Telegram не принимает localhost ни в web_app, ни в url-кнопках.
        builder.button(text="🚀 Открыть приложение", callback_data=CB_APP_LOCAL)
    else:
        builder.button(text="🚀 Языковая школа", callback_data=CB_APP_SOON)


def main_menu_kb(
    webapp_url: str | None,
    *,
    reminders_enabled: bool = True,
    show_reminders: bool = True,
) -> InlineKeyboardMarkup:
    """Главное меню: Mini App + управление напоминаниями."""
    builder = InlineKeyboardBuilder()
    _add_app_button(builder, webapp_url)
    if show_reminders:
        builder.button(
            text=(
                "🔔 Напоминания: включены"
                if reminders_enabled
                else "🔕 Напоминания: выключены"
            ),
            callback_data=CB_TOGGLE_REMINDERS,
        )
    builder.adjust(1)
    return builder.as_markup()


def reminder_kb(webapp_url: str | None) -> InlineKeyboardMarkup:
    """Кнопка Mini App для сообщения-напоминания."""
    builder = InlineKeyboardBuilder()
    _add_app_button(builder, webapp_url)
    builder.adjust(1)
    return builder.as_markup()


def registration_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="✖️ Отмена", callback_data=CB_CANCEL)
    builder.adjust(1)
    return builder.as_markup()


def back_to_menu_kb() -> InlineKeyboardMarkup:
    builder = InlineKeyboardBuilder()
    builder.button(text="⬅️ В главное меню", callback_data=CB_BACK)
    builder.adjust(1)
    return builder.as_markup()
