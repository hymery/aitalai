from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int | None] = mapped_column(
        BigInteger, unique=True, nullable=True
    )
    email: Mapped[str | None] = mapped_column(
        String(255), unique=True, nullable=True
    )
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(50), default="student", nullable=False)
    school: Mapped[str | None] = mapped_column(String(255), nullable=True)
    class_name: Mapped[str | None] = mapped_column(String(50), nullable=True)
    lang_pair: Mapped[str] = mapped_column(String(10), default="ba-ru", nullable=False)
    points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    streak_days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    badges: Mapped[list[str]] = mapped_column(JSON, default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Fragment(Base):
    __tablename__ = "fragments"

    id: Mapped[int] = mapped_column(primary_key=True)
    text_ba: Mapped[str] = mapped_column(Text, nullable=False)
    lang_pair: Mapped[str] = mapped_column(String(10), nullable=False)
    source: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    wrong_variants: Mapped[dict[str, str]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Translation(Base):
    __tablename__ = "translations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('pending', 'confirmed', 'expert_review')",
            name="ck_translations_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    fragment_id: Mapped[int] = mapped_column(
        ForeignKey("fragments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    lang_pair: Mapped[str] = mapped_column(String(10), nullable=False)
    translation: Mapped[str] = mapped_column(Text, nullable=False)
    confirmed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    fragment_id: Mapped[int] = mapped_column(
        ForeignKey("fragments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    translation_id: Mapped[int] = mapped_column(
        ForeignKey("translations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    translation_text: Mapped[str] = mapped_column(Text, nullable=False)
    is_correct: Mapped[bool] = mapped_column(Boolean, nullable=False)
    points_earned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class BotState(Base):
    __tablename__ = "bot_states"

    id: Mapped[int] = mapped_column(primary_key=True)
    telegram_id: Mapped[int] = mapped_column(
        BigInteger, unique=True, nullable=False, index=True
    )
    state: Mapped[str] = mapped_column(String(100), nullable=False)
    data: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class Badge(Base):
    __tablename__ = "badges"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    badge_type: Mapped[str] = mapped_column(String(100), nullable=False)
    earned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CourseProgress(Base):
    __tablename__ = "course_progress"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "unit_id", "lesson_id", name="uq_course_progress_lesson"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    unit_id: Mapped[int] = mapped_column(Integer, nullable=False)
    lesson_id: Mapped[int] = mapped_column(Integer, nullable=False)
    lesson_type: Mapped[str] = mapped_column(String(20), nullable=False)
    xp_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class CourseUnit(Base):
    __tablename__ = "course_units"

    id: Mapped[int] = mapped_column(primary_key=True)
    order_index: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    character_name: Mapped[str] = mapped_column(String(255), nullable=False)
    theme_slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)


class UnitVocabulary(Base):
    __tablename__ = "unit_vocabulary"
    __table_args__ = (
        UniqueConstraint("unit_id", "ba_word", name="uq_unit_vocabulary_word"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("course_units.id", ondelete="CASCADE"), nullable=False, index=True
    )
    ba_word: Mapped[str] = mapped_column(String(255), nullable=False)
    ru_word: Mapped[str] = mapped_column(String(255), nullable=False)
    transcription: Mapped[str] = mapped_column(String(255), nullable=False)
    example_ba: Mapped[str] = mapped_column(Text, nullable=False)
    example_ru: Mapped[str] = mapped_column(Text, nullable=False)


class UnitExercise(Base):
    __tablename__ = "unit_exercises"
    __table_args__ = (
        CheckConstraint(
            "circle_number IN (2, 3)", name="ck_unit_exercises_circle_number"
        ),
        CheckConstraint(
            "exercise_type IN ('build_sentence', 'fill_blank', 'match_pairs')",
            name="ck_unit_exercises_type",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("course_units.id", ondelete="CASCADE"), nullable=False, index=True
    )
    circle_number: Mapped[int] = mapped_column(Integer, nullable=False)
    exercise_type: Mapped[str] = mapped_column(String(30), nullable=False)
    prompt_ru: Mapped[str] = mapped_column(Text, nullable=False)
    target_ba: Mapped[str] = mapped_column(Text, nullable=False)
    tokens_json: Mapped[list[Any]] = mapped_column(JSON, default=list, nullable=False)
    distractors_json: Mapped[list[Any]] = mapped_column(
        JSON, default=list, nullable=False
    )
    hints_json: Mapped[dict[str, Any]] = mapped_column(
        JSON, default=dict, nullable=False
    )
    correct_answer: Mapped[Any] = mapped_column(JSON, nullable=False)


class UnitStoryStep(Base):
    __tablename__ = "unit_story_steps"
    __table_args__ = (
        UniqueConstraint("unit_id", "step_order", name="uq_unit_story_step_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("course_units.id", ondelete="CASCADE"), nullable=False, index=True
    )
    step_order: Mapped[int] = mapped_column(Integer, nullable=False)
    character_name: Mapped[str] = mapped_column(String(255), nullable=False)
    scene_tag: Mapped[str] = mapped_column(String(100), nullable=False)
    npc_text_ba: Mapped[str] = mapped_column(Text, nullable=False)
    npc_text_ru: Mapped[str] = mapped_column(Text, nullable=False)
    options_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, default=list, nullable=False
    )


class UserUnitProgress(Base):
    __tablename__ = "user_unit_progress"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    unit_id: Mapped[int] = mapped_column(
        ForeignKey("course_units.id", ondelete="CASCADE"), primary_key=True
    )
    circle_1_done: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    circle_2_done: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    circle_3_done: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    boss_done: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
