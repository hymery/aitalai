import json
import os
from datetime import datetime, time, timezone

import httpx
from pydantic import ValidationError
from sqlalchemy.orm import Session

from ai_prompts import scenario_prompt, tutor_prompt
from ai_scenarios import SCENARIOS
from models import AiMessage, AiSession, CourseUnit, UnitVocabulary, User, UserUnitProgress
from schemas import AiReply


TRUE_VALUES = {"1", "true", "yes", "on"}
FALLBACK_REPLY = AiReply(
    reply_ba="Ағай, мин аңламаҙым. Тағы бер тапҡыр әйтегеҙ.",
    reply_ru="Простите, я не понял. Скажите ещё раз.",
    emotion="fail",
)
TUTOR_GREETING = AiReply(
    reply_ba="Һаумыһығыҙ! Мин — Устаз. Башҡорт теле буйынса һорауығыҙҙы яҙығыҙ.",
    reply_ru="Здравствуйте! Я Устаз. Напишите ваш вопрос о башкирском языке.",
    emotion="success",
    hint="Что означает слово «рәхмәт»?",
)


class DeepSeekError(RuntimeError):
    pass


def ai_enabled() -> bool:
    flag = os.getenv("AI_ENABLED", "").strip().lower() in TRUE_VALUES
    return flag and bool(os.getenv("DEEPSEEK_API_KEY", "").strip())


def daily_limit() -> int:
    try:
        return max(1, int(os.getenv("AI_DAILY_MESSAGE_LIMIT", "60")))
    except ValueError:
        return 60


def max_history() -> int:
    try:
        return max(2, int(os.getenv("AI_MAX_HISTORY", "12")))
    except ValueError:
        return 12


def utc_day_start() -> datetime:
    now = datetime.now(timezone.utc)
    return datetime.combine(now.date(), time.min, tzinfo=timezone.utc)


def daily_messages_used(db: Session, user_id: int) -> int:
    return (
        db.query(AiMessage)
        .join(AiSession, AiMessage.session_id == AiSession.id)
        .filter(
            AiSession.user_id == user_id,
            AiMessage.role == "user",
            AiMessage.created_at >= utc_day_start(),
        )
        .count()
    )


def learned_vocabulary(db: Session, user_id: int) -> list[UnitVocabulary]:
    return (
        db.query(UnitVocabulary)
        .join(UserUnitProgress, UserUnitProgress.unit_id == UnitVocabulary.unit_id)
        .filter(UserUnitProgress.user_id == user_id, UserUnitProgress.circle_1_done.is_(True))
        .order_by(UnitVocabulary.unit_id, UnitVocabulary.id)
        .limit(200)
        .all()
    )


def progress_text(db: Session, user_id: int) -> str:
    rows = (
        db.query(CourseUnit, UserUnitProgress)
        .join(UserUnitProgress, UserUnitProgress.unit_id == CourseUnit.id)
        .filter(UserUnitProgress.user_id == user_id)
        .order_by(CourseUnit.order_index)
        .all()
    )
    if not rows:
        return "Ученик пока не завершил ни одного этапа."
    return "\n".join(
        f"• {unit.title}: словарь — {'пройден' if progress.circle_1_done else 'не пройден'}, "
        f"предложения — {'пройдено' if progress.circle_2_done else 'не пройдено'}, "
        f"закрепление — {'пройдено' if progress.circle_3_done else 'не пройдено'}, "
        f"история — {'пройдена' if progress.boss_done else 'не пройдена'}."
        for unit, progress in rows
    )


def system_prompt(db: Session, user: User, session: AiSession) -> str:
    vocabulary = "\n".join(
        f"• {item.ba_word} — {item.ru_word}" for item in learned_vocabulary(db, user.id)
    ) or "Словарь пока пуст. Используй только самые простые проверенные фразы."
    progress = progress_text(db, user.id)
    if session.mode == "scenario":
        scenario = SCENARIOS[session.scenario_id]
        character_names = {"granny": "Өләсәй", "boy": "Азамат", "akbuzat": "Аҡбуҙат"}
        return scenario_prompt(
            character_names.get(scenario["character"], scenario["character"]),
            scenario["setting"], vocabulary, progress,
        )
    return tutor_prompt(vocabulary, progress)


def session_history(db: Session, session_id: int) -> list[dict[str, str]]:
    rows = (
        db.query(AiMessage)
        .filter(AiMessage.session_id == session_id)
        .order_by(AiMessage.id.desc())
        .limit(max_history())
        .all()
    )
    return [{"role": row.role, "content": row.text} for row in reversed(rows)]


async def request_deepseek(messages: list[dict[str, str]]) -> str:
    base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
    payload = {
        "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        "messages": messages,
        "response_format": {"type": "json_object"},
        "temperature": 0.5,
        "max_tokens": 700,
    }
    try:
        async with httpx.AsyncClient(timeout=45) as client:
            response = await client.post(
                f"{base_url}/chat/completions",
                headers={
                    "Authorization": f"Bearer {os.getenv('DEEPSEEK_API_KEY', '').strip()}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except (httpx.HTTPError, KeyError, IndexError, TypeError, ValueError) as exc:
        raise DeepSeekError("DeepSeek вернул недоступный или некорректный ответ.") from exc


def parse_reply(content: str) -> AiReply:
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    reply = AiReply.model_validate(json.loads(cleaned))
    reply.corrections = reply.corrections[:2]
    reply.new_words = reply.new_words[:2]
    return reply


async def generate_reply(messages: list[dict[str, str]]) -> AiReply:
    content = await request_deepseek(messages)
    try:
        return parse_reply(content)
    except (json.JSONDecodeError, ValidationError, TypeError):
        retry = messages + [{
            "role": "user",
            "content": "Предыдущий ответ не удалось прочитать. Повтори ответ строго одним валидным JSON-объектом по заданной схеме, без Markdown и пояснений.",
        }]
        retry_content = await request_deepseek(retry)
        try:
            return parse_reply(retry_content)
        except (json.JSONDecodeError, ValidationError, TypeError):
            return FALLBACK_REPLY.model_copy(deep=True)


def message_reply(message: AiMessage) -> AiReply:
    if message.role == "assistant" and message.meta:
        try:
            return AiReply.model_validate(message.meta)
        except ValidationError:
            pass
    return AiReply(reply_ba=message.text, reply_ru="", emotion="idle")
