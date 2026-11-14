"""Клиент backend API: регистрация и состояние бота.

Учебные запросы (задания, рейтинг, профиль) выполняет Mini App,
поэтому боту они больше не нужны.
"""

from __future__ import annotations

import asyncio
import copy
import json
import logging
from typing import Any

import aiohttp

from config import Config

logger = logging.getLogger(__name__)


class ApiError(Exception):
    """Ошибка API с готовым текстом для пользователя."""

    def __init__(
        self,
        user_message: str,
        *,
        status: int | None = None,
        detail: str | None = None,
    ) -> None:
        super().__init__(detail or user_message)
        self.user_message = user_message
        self.status = status
        self.detail = detail


def _extract_detail(raw: str) -> str | None:
    raw = (raw or "").strip()
    if not raw:
        return None
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError:
        return raw[:300]
    if isinstance(payload, dict):
        detail = payload.get("detail") or payload.get("message") or payload.get("error")
        if isinstance(detail, list):
            parts = []
            for item in detail:
                if isinstance(item, dict):
                    parts.append(str(item.get("msg") or item.get("message") or item))
                else:
                    parts.append(str(item))
            return "; ".join(parts)[:300] or None
        if detail:
            return str(detail)[:300]
    return None


def _http_error_message(status: int, detail: str | None) -> str:
    if status in (401, 403):
        return "Сервер отклонил авторизацию. Попробуйте позже или обратитесь в поддержку."
    if status == 404:
        return "Запрашиваемый раздел API не найден (404). Проверьте адрес API_URL."
    if status == 409:
        return "Похоже, такой пользователь уже зарегистрирован."
    if status == 422:
        return (
            f"Сервер отклонил данные: {detail}"
            if detail
            else "Сервер отклонил данные: проверьте заполненные поля."
        )
    if status == 429:
        return "Слишком много запросов. Подождите немного и попробуйте снова."
    if status >= 500:
        return f"Ошибка на стороне сервера (код {status}). Попробуйте позже."
    return f"Ошибка запроса (код {status})."


class MockBackend:
    """Фейковый backend для USE_MOCK=1."""

    def __init__(self) -> None:
        self._states: dict[int, dict[str, Any]] = {}
        self._users: dict[int, dict[str, Any]] = {}

    async def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        email = str(payload.get("email") or "").strip().lower()
        if email:
            self._users[email] = copy.deepcopy(payload)
        logger.debug("MOCK /auth/register: %s", payload.get("full_name"))
        return {
            "access_token": "fake_token_123",
            "token_type": "bearer",
            "user": {
                "email": email or None,
                "full_name": payload.get("full_name"),
                "school": payload.get("school"),
                "class_name": payload.get("class_name"),
                "lang_pair": payload.get("lang_pair", "ba-ru"),
            },
        }

    async def get_state(self, telegram_id: int) -> dict[str, Any] | None:
        logger.debug("MOCK GET /bot/state/%s", telegram_id)
        saved = self._states.get(int(telegram_id))
        return copy.deepcopy(saved) if saved else None

    async def save_state(self, payload: dict[str, Any]) -> dict[str, Any]:
        telegram_id = int(payload["telegram_id"])
        logger.debug(
            "MOCK POST /bot/state: %s -> %s", telegram_id, payload.get("state")
        )
        self._states[telegram_id] = {
            "telegram_id": telegram_id,
            "state": payload.get("state"),
            "data": copy.deepcopy(payload.get("data") or {}),
        }
        return {"ok": True}


class ApiClient:
    def __init__(self, config: Config) -> None:
        self.base_url = config.api_url.rstrip("/")
        self.use_mock = config.use_mock
        self.timeout = aiohttp.ClientTimeout(total=config.request_timeout)
        self._session: aiohttp.ClientSession | None = None
        self._mock = MockBackend() if config.use_mock else None

    def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            self._session = aiohttp.ClientSession(timeout=self.timeout)
        return self._session

    async def close(self) -> None:
        if self._session is not None and not self._session.closed:
            await self._session.close()
        self._session = None

    async def _request(
        self,
        method: str,
        path: str,
        *,
        params: dict[str, Any] | None = None,
        json_body: dict[str, Any] | None = None,
        token: str | None = None,
    ) -> Any:
        url = f"{self.base_url}{path}"
        headers = {"Accept": "application/json"}
        if token:
            headers["Authorization"] = f"Bearer {token}"

        logger.debug("API %s %s", method, url)
        try:
            async with self._get_session().request(
                method,
                url,
                params=params,
                json=json_body,
                headers=headers,
            ) as response:
                raw = await response.text()
                if response.status >= 400:
                    detail = _extract_detail(raw)
                    raise ApiError(
                        _http_error_message(response.status, detail),
                        status=response.status,
                        detail=detail,
                    )
                if not raw.strip():
                    return None
                try:
                    return json.loads(raw)
                except json.JSONDecodeError as exc:
                    raise ApiError(
                        "Сервер вернул ответ в неожиданном формате. Попробуйте позже."
                    ) from exc
        except asyncio.TimeoutError as exc:
            raise ApiError(
                "Сервер не ответил вовремя. Попробуйте ещё раз чуть позже."
            ) from exc
        except aiohttp.ClientError as exc:
            raise ApiError(
                "Не удалось связаться с сервером. Проверьте подключение и попробуйте позже."
            ) from exc

    # --- API -------------------------------------------------------------------

    async def register(self, payload: dict[str, Any]) -> dict[str, Any]:
        if self._mock is not None:
            return await self._mock.register(payload)
        data = await self._request("POST", "/auth/register", json_body=payload)
        return data if isinstance(data, dict) else {}

    async def get_bot_state(self, telegram_id: int) -> dict[str, Any] | None:
        if self._mock is not None:
            return await self._mock.get_state(telegram_id)
        try:
            data = await self._request("GET", f"/bot/state/{int(telegram_id)}")
        except ApiError as exc:
            if exc.status == 404:
                return None
            raise
        return data if isinstance(data, dict) else None

    async def save_bot_state(
        self,
        telegram_id: int,
        state: str | None,
        data: dict[str, Any],
    ) -> None:
        payload = {
            "telegram_id": int(telegram_id),
            "state": state,
            "data": data,
        }
        if self._mock is not None:
            await self._mock.save_state(payload)
            return
        await self._request("POST", "/bot/state", json_body=payload)

    async def get_profile(self, token: str) -> dict[str, Any]:
        if self._mock is not None:
            return {"points": 0, "level": 1, "streak_days": 0, "full_name": "Ученик"}
        data = await self._request("GET", "/auth/me", token=token)
        return data if isinstance(data, dict) else {}

    async def get_daily_task(self, token: str) -> dict[str, Any]:
        if self._mock is not None:
            return {
                "text_ba": "Сәләм",
                "translation": "Здравствуйте",
                "lang_pair": "ba-ru",
                "source": "Демонстрация",
            }
        data = await self._request("GET", "/tasks/daily", token=token)
        return data if isinstance(data, dict) else {}

    async def get_my_answers(self, token: str) -> list[dict[str, Any]]:
        if self._mock is not None:
            return []
        data = await self._request(
            "GET", "/answers/me", params={"format": "json"}, token=token
        )
        return data if isinstance(data, list) else []

    async def get_rating(self, category: str) -> list[dict[str, Any]]:
        if category not in {"schools", "classes"}:
            raise ValueError("Для уведомлений доступны только рейтинги schools/classes")
        if self._mock is not None:
            return []
        data = await self._request(
            "GET", f"/ratings/{category}", params={"period": "week"}
        )
        return data if isinstance(data, list) else []
