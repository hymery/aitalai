from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field


TranslationStatus = Literal["pending", "confirmed", "expert_review"]


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class UserRegister(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str = Field(min_length=4, max_length=72)
    full_name: str = Field(min_length=1, max_length=255)
    role: str = Field(default="student")
    telegram_id: int | None = None
    school: str | None = Field(default=None, max_length=255)
    class_name: str | None = Field(default=None, max_length=50)
    lang_pair: str = Field(default="ba-ru", min_length=1, max_length=10)


class TelegramAuth(BaseModel):
    telegram_id: int
    full_name: str
    role: str = "student"
    school: str | None = None
    class_name: str | None = None
    lang_pair: str = "ba-ru"


class UserLogin(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(ORMModel):
    id: int
    telegram_id: int | None
    email: EmailStr | None
    full_name: str
    role: str
    school: str | None
    class_name: str | None
    lang_pair: str
    points: int
    level: int
    streak_days: int
    badges: list[str]
    created_at: datetime


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class FragmentSource(BaseModel):
    file: str
    chapter: str
    time: str


class TaskResponse(ORMModel):
    id: int
    text_ba: str
    lang_pair: str
    source: FragmentSource
    wrong_variants: dict[str, str] = Field(default_factory=dict)


class DailyTaskResponse(BaseModel):
    fragment_id: int
    translation_id: int
    text_ba: str
    translation: str
    lang_pair: str
    source: FragmentSource


class TranslationCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    fragment_id: int = Field(gt=0)
    lang_pair: str = Field(min_length=1, max_length=10)
    translation: str = Field(min_length=1)


class TranslationResponse(ORMModel):
    id: int
    fragment_id: int
    lang_pair: str
    translation: str
    confirmed: int
    status: TranslationStatus
    created_at: datetime


class AnswerCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    fragment_id: int = Field(gt=0)
    translation: str = Field(min_length=1)
    is_correct: bool


class AnswerResponse(ORMModel):
    id: int
    user_id: int
    fragment_id: int
    translation_id: int
    translation_text: str
    is_correct: bool
    points_earned: int
    created_at: datetime


class ModerationResolve(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    translation_id: int = Field(gt=0)
    final_translation: str = Field(min_length=1)
    approved: bool


class RatingEntry(BaseModel):
    rank: int = Field(ge=1)
    user_id: int
    full_name: str
    school: str | None
    class_name: str | None
    points: int = Field(ge=0)
    level: int = Field(ge=1)
    streak_days: int = Field(ge=0)
    badges: list[str] = Field(default_factory=list)


class RatingResponse(BaseModel):
    items: list[RatingEntry]
    total: int = Field(ge=0)


class BotStateCreate(BaseModel):
    telegram_id: int
    state: str = Field(min_length=1, max_length=100)
    data: dict = Field(default_factory=dict)


class BotStateUpdate(BaseModel):
    state: str | None = Field(default=None, min_length=1, max_length=100)
    data: dict | None = None


class BotStateResponse(ORMModel):
    id: int
    telegram_id: int
    state: str
    data: dict
    updated_at: datetime


class CourseComplete(BaseModel):
    unit_id: int = Field(gt=0)
    lesson_id: int = Field(gt=0)
    lesson_type: Literal["flashcards", "practice", "boss"]


class CourseProgressResponse(ORMModel):
    unit_id: int
    lesson_id: int
    lesson_type: Literal["flashcards", "practice", "boss"]
    xp_awarded: int
    completed_at: datetime


CourseCircle = Literal["circle_1", "circle_2", "circle_3", "boss_story"]
QuizDirection = Literal["ba_to_ru", "ru_to_ba"]


class CircleStatus(BaseModel):
    unlocked: bool
    completed: bool


class UnitProgressStatus(BaseModel):
    circle_1: CircleStatus
    circle_2: CircleStatus
    circle_3: CircleStatus
    boss_story: CircleStatus
    current_circle: str


class CourseUnitSummary(BaseModel):
    id: int
    order_index: int
    title: str
    description: str
    character_name: str
    theme_slug: str
    vocabulary_count: int
    unlocked: bool
    progress: UnitProgressStatus


class VocabularyCardResponse(ORMModel):
    id: int
    ba_word: str
    ru_word: str
    transcription: str
    example_ba: str
    example_ru: str


class QuizQuestionResponse(BaseModel):
    id: str
    direction: QuizDirection
    prompt: str
    options: list[str]
    correct_answer: str


class Circle1Response(BaseModel):
    cards: list[VocabularyCardResponse]
    quiz: list[QuizQuestionResponse]


class BuildSentenceResponse(BaseModel):
    id: int
    prompt_ru: str
    tokens: list[str]
    distractors: list[str]
    hints: dict[str, str]
    correct_answer: str


class Circle2Response(BaseModel):
    build_sentence: list[BuildSentenceResponse]


class FillBlankResponse(BaseModel):
    id: int
    prompt_ru: str
    target_ba: str
    tokens: list[str]
    distractors: list[str]
    hints: dict[str, str]
    correct_answer: str


class MatchPairsResponse(BaseModel):
    id: int
    prompt_ru: str
    tokens: list[str]
    ru_options: list[str]
    correct_answer: dict[str, str]


class Circle3Response(BaseModel):
    fill_blanks: list[FillBlankResponse]
    match_pairs: MatchPairsResponse | None


class StoryOptionResponse(BaseModel):
    text_ba: str
    is_correct: bool
    explanation_ru: str


class StoryStepResponse(BaseModel):
    id: int
    step_order: int
    character_name: str
    scene_tag: str
    npc_text_ba: str
    npc_text_ru: str
    options: list[StoryOptionResponse]


class BossStoryResponse(BaseModel):
    steps: list[StoryStepResponse]


class CourseUnitDetailResponse(CourseUnitSummary):
    circle_1: Circle1Response
    circle_2: Circle2Response
    circle_3: Circle3Response
    boss_story: BossStoryResponse


class CourseCircleComplete(BaseModel):
    circle: CourseCircle
    score: int = Field(ge=0, le=100)


class CourseCircleCompleteResponse(BaseModel):
    unit_id: int
    circle: CourseCircle
    score: int
    already_completed: bool
    awarded_xp: int
    points: int
    level: int
    next_circle: str
    next_unit_id: int | None
    next_unit_unlocked: bool
    progress: UnitProgressStatus
