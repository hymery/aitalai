import asyncio
import json
import os
import unittest
from pathlib import Path
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from database import Base
from main import (
    ai_status,
    create_ai_session,
    finish_ai_session,
    get_ai_session,
    list_ai_scenarios,
    send_ai_message,
)
from models import CourseUnit, UnitVocabulary, User, UserUnitProgress
from schemas import AiMessageCreate, AiSessionCreate


TEST_DB_PATH = Path(__file__).resolve().with_name("test_ai.db")
VALID_REPLY = json.dumps({
    "reply_ba": "Сәй бик тәмле.",
    "reply_ru": "Чай очень вкусный.",
    "emotion": "success",
    "corrections": [{"wrong": "сәй тәмле", "correct": "сәй бик тәмле", "explanation_ru": "Добавим усиление «бик»."}],
    "new_words": [{"ba": "бик", "ru": "очень"}],
    "hint": "Рәхмәт, өләсәй!",
}, ensure_ascii=False)


class AiDialogsTestCase(unittest.TestCase):
    def setUp(self):
        TEST_DB_PATH.unlink(missing_ok=True)
        self.engine = create_engine(
            "sqlite:///./test_ai.db", connect_args={"check_same_thread": False}
        )
        self.Session = sessionmaker(
            bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = self.Session()
        self.user = User(
            email="ai.student@example.com",
            full_name="Ученик ИИ",
            role="student",
            lang_pair="ba-ru",
            points=0,
            level=1,
            streak_days=0,
            badges=[],
        )
        self.db.add(self.user)
        self.db.add(CourseUnit(
            id=1,
            order_index=1,
            title="Чаепитие у Өләсәй",
            description="Чаепитие",
            character_name="Өләсәй",
            theme_slug="tea",
        ))
        self.db.add(UnitVocabulary(
            unit_id=1,
            ba_word="сәй",
            ru_word="чай",
            transcription="[сәй]",
            example_ba="Сәй тәмле.",
            example_ru="Чай вкусный.",
        ))
        self.db.add(UserUnitProgress(user_id=1, unit_id=1, circle_1_done=True))
        self.db.commit()
        self.user = self.db.query(User).filter_by(email="ai.student@example.com").one()
        self.env = patch.dict(os.environ, {
            "AI_ENABLED": "1",
            "DEEPSEEK_API_KEY": "test-key",
            "AI_DAILY_MESSAGE_LIMIT": "10",
            "AI_MAX_HISTORY": "12",
        }, clear=False)
        self.env.start()

    def tearDown(self):
        self.env.stop()
        self.db.close()
        self.engine.dispose()
        TEST_DB_PATH.unlink(missing_ok=True)

    def create_scenario(self):
        return create_ai_session(
            AiSessionCreate(mode="scenario", scenario_id="tea-granny"),
            db=self.db,
            user=self.user,
        )

    def send(self, session_id, text="Сәй бик тәмле."):
        with patch("ai_service.request_deepseek", new=AsyncMock(return_value=VALID_REPLY)):
            return asyncio.run(send_ai_message(
                session_id, AiMessageCreate(text=text), db=self.db, user=self.user
            ))

    def test_contract_history_reuse_and_finish_is_idempotent(self):
        created = self.create_scenario()
        self.assertIn("Һаумыһығыҙ", created["greeting"].reply_ba)
        resumed = self.create_scenario()
        self.assertTrue(resumed["resumed"])
        self.assertEqual(created["session_id"], resumed["session_id"])

        for text in ("Һаумыһығыҙ!", "Эйе, бал яратам.", "Рәхмәт, өләсәй!"):
            reply = self.send(created["session_id"], text)
            self.assertEqual(reply.emotion, "success")
            self.assertEqual(reply.reply_ru, "Чай очень вкусный.")

        history = get_ai_session(created["session_id"], db=self.db, user=self.user)
        self.assertEqual(len(history["messages"]), 7)
        self.assertEqual(sum(item["role"] == "user" for item in history["messages"]), 3)
        self.assertEqual(history["messages"][-1]["reply"].reply_ba, "Сәй бик тәмле.")

        first = finish_ai_session(created["session_id"], db=self.db, user=self.user)
        self.assertEqual(first["points"], 30)
        self.assertEqual(first["total_points"], 30)
        self.assertEqual(first["report"]["messages_count"], 3)
        self.assertEqual(first["report"]["corrections_count"], 3)
        self.assertEqual(first["report"]["new_words"], 1)
        repeated = finish_ai_session(created["session_id"], db=self.db, user=self.user)
        self.assertEqual(repeated["points"], 0)
        self.assertEqual(repeated["total_points"], 30)

        scenarios = list_ai_scenarios(db=self.db, user=self.user)
        self.assertTrue(scenarios[0]["unlocked"])
        self.assertTrue(scenarios[0]["completed"])
        self.assertTrue(scenarios[0]["completed_today"])

    def test_daily_limit_and_finished_session(self):
        with patch.dict(os.environ, {"AI_DAILY_MESSAGE_LIMIT": "1"}):
            session_id = self.create_scenario()["session_id"]
            self.send(session_id)
            self.assertEqual(ai_status(db=self.db, user=self.user)["daily_left"], 0)
            with self.assertRaises(HTTPException) as limited:
                self.send(session_id)
            self.assertEqual(limited.exception.status_code, 429)

    def test_locked_scenario_and_disabled_mode(self):
        progress = self.db.query(UserUnitProgress).filter_by(user_id=self.user.id, unit_id=1).one()
        progress.circle_1_done = False
        self.db.commit()
        with self.assertRaises(HTTPException) as locked:
            self.create_scenario()
        self.assertEqual(locked.exception.status_code, 403)
        self.assertFalse(list_ai_scenarios(db=self.db, user=self.user)[0]["unlocked"])

        with patch.dict(os.environ, {"AI_ENABLED": "0"}):
            self.assertFalse(ai_status(db=self.db, user=self.user)["enabled"])
            with self.assertRaises(HTTPException) as disabled:
                self.create_scenario()
            self.assertEqual(disabled.exception.status_code, 503)

    def test_invalid_json_retries_then_returns_fallback(self):
        session_id = self.create_scenario()["session_id"]
        client = AsyncMock(side_effect=["not-json", "still-not-json"])
        with patch("ai_service.request_deepseek", new=client):
            reply = asyncio.run(send_ai_message(
                session_id, AiMessageCreate(text="Һаумыһығыҙ"), db=self.db, user=self.user
            ))
        self.assertEqual(client.await_count, 2)
        self.assertIn("аңламаҙым", reply.reply_ba)
        history = get_ai_session(session_id, db=self.db, user=self.user)
        self.assertEqual(history["messages"][-1]["text"], reply.reply_ba)

    def test_tutor_has_no_scenario_and_history_is_private(self):
        created = create_ai_session(AiSessionCreate(mode="tutor"), db=self.db, user=self.user)
        self.assertIn("Устаз", created["greeting"].reply_ru)
        other = User(
            email="other.ai@example.com", full_name="Другой", role="student",
            lang_pair="ba-ru", points=0, level=1, streak_days=0, badges=[],
        )
        self.db.add(other)
        self.db.commit()
        with self.assertRaises(HTTPException) as missing:
            get_ai_session(created["session_id"], db=self.db, user=other)
        self.assertEqual(missing.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
