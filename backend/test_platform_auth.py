"""Проверка авторизации мини-приложений Telegram и MAX.

Запуск: .venv/Scripts/python.exe -m unittest test_platform_auth -v
"""

import hashlib
import hmac
import json
import time
import unittest
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import main
from database import Base
from main import max_auth, telegram_auth
from models import User
from platform_auth import (
    PlatformAuthError,
    parse_max_user,
    parse_telegram_user,
    validate_init_data,
)
from schemas import MaxAuth, TelegramAuth

TEST_DB_PATH = Path(__file__).resolve().with_name("test_platform_auth.db")
TG_TOKEN = "123456:telegram-test-token"
MAX_TOKEN = "max-test-token"


def sign_init_data(params: dict[str, str], token: str) -> str:
    """Собирает подписанную initData строку так же, как платформа."""
    launch_params = "\n".join(f"{key}={value}" for key, value in sorted(params.items()))
    secret_key = hmac.new(
        key=b"WebAppData", msg=token.encode(), digestmod=hashlib.sha256
    ).digest()
    signature = hmac.new(
        key=secret_key, msg=launch_params.encode(), digestmod=hashlib.sha256
    ).hexdigest()
    pairs = {**params, "hash": signature}
    return "&".join(f"{key}={quote(value, safe='')}" for key, value in pairs.items())


def telegram_init_data(user_id: int = 777, **overrides) -> str:
    user = {
        "id": user_id,
        "first_name": "Айгуль",
        "last_name": "Юлдашева",
        "username": "aigul",
        "photo_url": "https://t.me/i/userpic/320/aigul.jpg",
        "language_code": "ru",
    }
    params = {
        "auth_date": str(int(time.time())),
        "query_id": "AAEAAAA",
        "user": json.dumps(user, ensure_ascii=False),
    }
    params.update({key: str(value) for key, value in overrides.items()})
    return params


def max_init_data(user_id: int = 555, **overrides) -> str:
    user = {
        "id": user_id,
        "first_name": "Тимур",
        "last_name": "Гареев",
        "username": None,
        "photo_url": None,
        "language_code": "ru",
    }
    params = {
        "auth_date": str(int(time.time())),
        "query_id": "4c0ab423-342b-4e45-aea4-2747dbc500cd",
        "ip": "192.168.0.1",
        "user": json.dumps(user, ensure_ascii=False),
        "chat": json.dumps({"id": 12345, "type": "DIALOG"}),
    }
    params.update({key: str(value) for key, value in overrides.items()})
    return params


class ValidateInitDataTest(unittest.TestCase):
    def test_valid_telegram(self):
        init_data = sign_init_data(telegram_init_data(), TG_TOKEN)
        params = validate_init_data(init_data, TG_TOKEN)
        profile = parse_telegram_user(params)
        self.assertEqual(profile["telegram_id"], 777)
        self.assertEqual(profile["full_name"], "Айгуль Юлдашева")
        self.assertEqual(profile["username"], "aigul")
        self.assertEqual(profile["photo_url"], "https://t.me/i/userpic/320/aigul.jpg")

    def test_valid_max(self):
        init_data = sign_init_data(max_init_data(), MAX_TOKEN)
        profile = parse_max_user(validate_init_data(init_data, MAX_TOKEN))
        self.assertEqual(profile["max_id"], 555)
        self.assertEqual(profile["full_name"], "Тимур Гареев")
        self.assertIsNone(profile["username"])

    def test_wrong_token_rejected(self):
        init_data = sign_init_data(telegram_init_data(), TG_TOKEN)
        with self.assertRaises(PlatformAuthError):
            validate_init_data(init_data, "another-token")

    def test_tampered_user_rejected(self):
        init_data = sign_init_data(telegram_init_data(), TG_TOKEN)
        tampered = init_data.replace("%D0%90%D0%B9%D0%B3%D1%83%D0%BB%D1%8C", "Hacker")
        with self.assertRaises(PlatformAuthError):
            validate_init_data(tampered, TG_TOKEN)

    def test_missing_hash_rejected(self):
        with self.assertRaises(PlatformAuthError):
            validate_init_data("auth_date=1&user=%7B%7D", TG_TOKEN)

    def test_expired_rejected(self):
        old = str(int(time.time()) - 90000)
        init_data = sign_init_data(telegram_init_data(auth_date=old), TG_TOKEN)
        with self.assertRaises(PlatformAuthError):
            validate_init_data(init_data, TG_TOKEN)

    def test_empty_rejected(self):
        with self.assertRaises(PlatformAuthError):
            validate_init_data("", TG_TOKEN)


class PlatformAuthEndpointsTest(unittest.TestCase):
    def setUp(self):
        TEST_DB_PATH.unlink(missing_ok=True)
        self.engine = create_engine(
            "sqlite:///./test_platform_auth.db",
            connect_args={"check_same_thread": False},
        )
        self.Session = sessionmaker(
            bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = self.Session()
        self._tg_token = main.TELEGRAM_BOT_TOKEN
        self._max_token = main.MAX_BOT_TOKEN
        main.TELEGRAM_BOT_TOKEN = TG_TOKEN
        main.MAX_BOT_TOKEN = MAX_TOKEN

    def tearDown(self):
        main.TELEGRAM_BOT_TOKEN = self._tg_token
        main.MAX_BOT_TOKEN = self._max_token
        self.db.close()
        self.engine.dispose()
        TEST_DB_PATH.unlink(missing_ok=True)

    def test_telegram_creates_profile(self):
        payload = TelegramAuth(init_data=sign_init_data(telegram_init_data(), TG_TOKEN))
        response = telegram_auth(payload, self.db)
        self.assertTrue(response.access_token)
        self.assertEqual(response.user.telegram_id, 777)
        self.assertEqual(response.user.full_name, "Айгуль Юлдашева")
        self.assertEqual(response.user.role, "student")
        self.assertEqual(response.user.points, 0)

    def test_telegram_reuses_existing_profile(self):
        first = telegram_auth(
            TelegramAuth(init_data=sign_init_data(telegram_init_data(), TG_TOKEN)), self.db
        )
        user = self.db.query(User).filter(User.telegram_id == 777).first()
        user.points = 120
        user.level = 3
        self.db.commit()
        second = telegram_auth(
            TelegramAuth(init_data=sign_init_data(telegram_init_data(), TG_TOKEN)), self.db
        )
        self.assertEqual(second.user.id, first.user.id)
        self.assertEqual(second.user.points, 120)
        self.assertEqual(second.user.level, 3)
        self.assertEqual(self.db.query(User).count(), 1)

    def test_telegram_forged_init_data_rejected(self):
        forged = sign_init_data(telegram_init_data(), TG_TOKEN).replace("777", "778")
        with self.assertRaises(HTTPException) as ctx:
            telegram_auth(TelegramAuth(init_data=forged), self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_telegram_without_init_data_rejected(self):
        with self.assertRaises(HTTPException) as ctx:
            telegram_auth(TelegramAuth(telegram_id=777, full_name="Хакер"), self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_max_creates_profile(self):
        payload = MaxAuth(init_data=sign_init_data(max_init_data(), MAX_TOKEN))
        response = max_auth(payload, self.db)
        self.assertTrue(response.access_token)
        self.assertEqual(response.user.max_id, 555)
        self.assertEqual(response.user.full_name, "Тимур Гареев")
        self.assertEqual(response.user.role, "student")

    def test_max_reuses_profile_and_keeps_progress(self):
        first = max_auth(MaxAuth(init_data=sign_init_data(max_init_data(), MAX_TOKEN)), self.db)
        user = self.db.query(User).filter(User.max_id == 555).first()
        user.streak_days = 9
        self.db.commit()
        second = max_auth(MaxAuth(init_data=sign_init_data(max_init_data(), MAX_TOKEN)), self.db)
        self.assertEqual(second.user.id, first.user.id)
        self.assertEqual(second.user.streak_days, 9)
        self.assertEqual(self.db.query(User).count(), 1)

    def test_max_signature_checked_against_max_token(self):
        # initData, подписанная токеном Telegram, не должна проходить в /auth/max.
        payload = MaxAuth(init_data=sign_init_data(max_init_data(), TG_TOKEN))
        with self.assertRaises(HTTPException) as ctx:
            max_auth(payload, self.db)
        self.assertEqual(ctx.exception.status_code, 401)

    def test_telegram_and_max_are_separate_accounts(self):
        telegram_auth(
            TelegramAuth(init_data=sign_init_data(telegram_init_data(), TG_TOKEN)), self.db
        )
        max_auth(MaxAuth(init_data=sign_init_data(max_init_data(), MAX_TOKEN)), self.db)
        self.assertEqual(self.db.query(User).count(), 2)


if __name__ == "__main__":
    unittest.main()
