"""Проверка подлинности initData мини-приложений Telegram и MAX.

Алгоритм у платформ общий: параметры сортируются по ключу, склеиваются
через ``\\n`` без ``hash``; ``secret_key = HMAC_SHA256(key="WebAppData",
msg=bot_token)``; подпись — ``hex(HMAC_SHA256(secret_key, launch_params))``.

Документация:
- Telegram: https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
- MAX: https://dev.max.ru/docs/webapps/validation
"""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import time
from typing import Any
from urllib.parse import parse_qsl

logger = logging.getLogger("platform_auth")

# Сколько секунд initData считается свежей (по auth_date).
DEFAULT_TTL_SECONDS = 86_400


class PlatformAuthError(ValueError):
    """initData отсутствует, подделана или устарела."""


def validate_init_data(
    init_data: str,
    bot_token: str,
    *,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> dict[str, str]:
    """Проверяет подпись initData и возвращает декодированные параметры.

    Бросает PlatformAuthError при любой несостыковке: доверять таким
    данным нельзя.
    """
    if not init_data or not init_data.strip():
        raise PlatformAuthError("Платформа не передала данные авторизации.")
    if not bot_token:
        raise PlatformAuthError("На сервере не настроен токен бота платформы.")

    pairs = parse_qsl(init_data.strip(), keep_blank_values=True)
    keys = [key for key, _ in pairs]
    if len(set(keys)) != len(keys):
        raise PlatformAuthError("Параметры авторизации повреждены.")
    params = dict(pairs)

    received_hash = params.pop("hash", None)
    if not received_hash:
        raise PlatformAuthError("В данных авторизации нет подписи.")

    launch_params = "\n".join(
        f"{key}={value}" for key, value in sorted(params.items())
    )
    secret_key = hmac.new(
        key=b"WebAppData",
        msg=bot_token.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).digest()
    expected_hash = hmac.new(
        key=secret_key,
        msg=launch_params.encode("utf-8"),
        digestmod=hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_hash, received_hash):
        raise PlatformAuthError("Подпись данных авторизации не совпала.")

    if ttl_seconds > 0:
        try:
            auth_date = int(params.get("auth_date") or 0)
        except (TypeError, ValueError):
            auth_date = 0
        if auth_date and time.time() - auth_date > ttl_seconds:
            raise PlatformAuthError("Данные авторизации устарели, откройте приложение заново.")

    return params


def _parse_user(raw: str | None) -> dict[str, Any]:
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except (TypeError, json.JSONDecodeError):
        return {}
    return data if isinstance(data, dict) else {}


def _full_name(user: dict[str, Any], fallback: str) -> str:
    name = " ".join(
        part
        for part in (
            str(user.get("first_name") or "").strip(),
            str(user.get("last_name") or "").strip(),
        )
        if part
    ).strip()
    return name or str(user.get("username") or "").strip() or fallback


def parse_telegram_user(params: dict[str, str]) -> dict[str, Any]:
    """Извлекает профиль Telegram из проверенных параметров initData."""
    user = _parse_user(params.get("user"))
    try:
        telegram_id = int(user["id"])
    except (KeyError, TypeError, ValueError):
        raise PlatformAuthError("В данных Telegram нет идентификатора пользователя.") from None
    return {
        "telegram_id": telegram_id,
        "full_name": _full_name(user, "Ученик"),
        "username": user.get("username") or None,
        "photo_url": user.get("photo_url") or None,
    }


def parse_max_user(params: dict[str, str]) -> dict[str, Any]:
    """Извлекает профиль MAX из проверенных параметров initData."""
    user = _parse_user(params.get("user"))
    try:
        max_id = int(user["id"])
    except (KeyError, TypeError, ValueError):
        raise PlatformAuthError("В данных MAX нет идентификатора пользователя.") from None
    return {
        "max_id": max_id,
        "full_name": _full_name(user, "Ученик"),
        "username": user.get("username") or None,
        "photo_url": user.get("photo_url") or None,
    }
