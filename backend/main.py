import csv
import io
import json
import logging
import os
import random
import re
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal

import bcrypt
from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Query,
    Request,
    Security,
    status,
)
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from sqlalchemy import and_, case, func, inspect, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from database import Base, engine, get_db
from schools import find_school, get_school, search_schools
from models import (
    Answer,
    Badge,
    BotState,
    CourseProgress,
    CourseUnit,
    Fragment,
    Translation,
    UnitExercise,
    UnitStoryStep,
    UnitVocabulary,
    User,
    UserUnitProgress,
)
from schemas import (
    AnswerCreate,
    AnswerResponse,
    AuthResponse,
    BotStateCreate,
    BotStateResponse,
    CourseCircleComplete,
    CourseCircleCompleteResponse,
    CourseComplete,
    CourseProgressResponse,
    CourseUnitDetailResponse,
    CourseUnitSummary,
    DailyTaskResponse,
    FragmentProposal,
    FragmentProposalResponse,
    ModerationResolve,
    SchoolDirectoryResponse,
    TelegramAuth,
    TranslationResponse,
    UserLogin,
    UserProfileUpdate,
    UserRegister,
    UserResponse,
)
from tts import preload_tts, router as tts_router, tts_enabled


LOG_FILE = Path(__file__).resolve().with_name("app.log")
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
    handlers=[
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
        logging.StreamHandler(),
    ],
    force=True,
)
logger = logging.getLogger("bashkir_school")

SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
ALLOWED_ROLES = {"student", "teacher", "expert"}
Period = Literal["day", "week", "month", "year", "all"]

bearer_scheme = HTTPBearer(
    auto_error=False,
    description="JWT-токен, полученный при регистрации или входе.",
)


def ensure_schema():
    """Небольшая обратносовместимая миграция для существующих установок."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as connection:
        columns = {column["name"] for column in inspect(connection).get_columns("users")}
        if "school_id" not in columns:
            connection.execute(text("ALTER TABLE users ADD COLUMN school_id VARCHAR(64)"))
        connection.execute(text("CREATE INDEX IF NOT EXISTS ix_users_school_id ON users (school_id)"))
    with Session(bind=engine) as db:
        changed = False
        for user in db.query(User).filter(User.school_id.is_(None), User.school.is_not(None)):
            school = find_school(user.school)
            if school:
                user.school_id = school["id"]
                user.school = school["name"]
                changed = True
        if changed:
            db.commit()


@asynccontextmanager
async def lifespan(_: FastAPI):
    ensure_schema()
    if tts_enabled():
        try:
            preload_tts()
            logger.info("Silero TTS: башкирский голос bak_alfia загружен")
        except Exception:
            logger.exception("Silero TTS не загружен; endpoint вернёт 503 до восстановления модели")
    logger.info("Приложение запущено, таблицы базы данных проверены")
    yield
    logger.info("Приложение остановлено")


app = FastAPI(
    title="API Башкирской языковой школы",
    description=(
        "Сервис ежедневных заданий, народного перевода, экспертной модерации "
        "и рейтингов Башкирской языковой школы."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    lifespan=lifespan,
    openapi_tags=[
        {"name": "Авторизация", "description": "Регистрация, вход и JWT-токены."},
        {"name": "Задания", "description": "Ежедневные задания и проверка переводов."},
        {"name": "Модерация", "description": "Работа экспертов УФИЦ РАН."},
        {"name": "Рейтинги", "description": "Рейтинги за выбранный период."},
        {"name": "Учитель", "description": "Сводные отчёты по классам."},
        {"name": "Экспорт", "description": "Выгрузка подтверждённых переводов."},
        {"name": "Бот", "description": "Сохранение состояния Telegram-бота."},
        {"name": "Озвучка", "description": "Локальный башкирский Silero TTS."},
        {"name": "Сервис", "description": "Проверка доступности приложения."},
    ],
)
app.include_router(tts_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    try:
        response = await call_next(request)
    except Exception:
        logger.exception("Ошибка запроса %s %s", request.method, request.url.path)
        raise
    logger.info(
        "%s %s — %s", request.method, request.url.path, response.status_code
    )
    return response


def validation_message(error: dict) -> str:
    error_type = error.get("type", "")
    messages = {
        "missing": "Обязательное поле не заполнено.",
        "string_too_short": "Текст короче допустимой длины.",
        "string_too_long": "Текст длиннее допустимой длины.",
        "value_error": "Поле содержит некорректное значение.",
        "email": "Укажите корректный адрес электронной почты.",
        "bool_parsing": "Ожидается логическое значение.",
        "bool_type": "Ожидается логическое значение.",
        "int_parsing": "Ожидается целое число.",
        "int_type": "Ожидается целое число.",
        "greater_than": "Число должно быть больше допустимого минимума.",
        "literal_error": "Передано недопустимое значение.",
        "json_invalid": "Передан некорректный JSON.",
    }
    return messages.get(error_type, "Поле содержит некорректное значение.")


@app.exception_handler(RequestValidationError)
async def handle_validation_error(_: Request, exc: RequestValidationError):
    errors = []
    for error in exc.errors():
        field = ".".join(str(part) for part in error.get("loc", ()) if part != "body")
        errors.append(
            {
                "field": field or "запрос",
                "message": validation_message(error),
            }
        )
    return JSONResponse(
        status_code=422,
        content={"detail": "Ошибка валидации данных.", "errors": errors},
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_error(_: Request, exc: StarletteHTTPException):
    default_messages = {
        401: "Требуется аутентификация.",
        403: "Недостаточно прав для выполнения операции.",
        404: "Запрошенный ресурс не найден.",
        405: "Метод не поддерживается для этого ресурса.",
    }
    english_defaults = {
        "Not Found",
        "Method Not Allowed",
        "Unauthorized",
        "Forbidden",
        "Not authenticated",
    }
    detail = exc.detail
    if not isinstance(detail, str) or detail in english_defaults:
        detail = default_messages.get(exc.status_code, "Ошибка обработки запроса.")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": detail},
        headers=getattr(exc, "headers", None),
    )


@app.exception_handler(Exception)
async def handle_internal_error(_: Request, exc: Exception):
    logger.exception("Непредвиденная ошибка", exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Внутренняя ошибка сервера."},
    )


def hash_password(password: str) -> str:
    password_bytes = password.encode("utf-8")
    if len(password_bytes) > 72:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Пароль должен занимать не более 72 байт в кодировке UTF-8.",
        )
    return bcrypt.hashpw(password_bytes, bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str | None) -> bool:
    if not password_hash:
        return False
    try:
        return bcrypt.checkpw(
            password.encode("utf-8"), password_hash.encode("utf-8")
        )
    except (ValueError, TypeError):
        return False


def create_access_token(user: User) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )
    return jwt.encode(
        {"sub": str(user.id), "exp": expires_at},
        SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def build_auth_response(user: User) -> AuthResponse:
    return AuthResponse(
        access_token=create_access_token(user),
        user=UserResponse.model_validate(user),
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    auth_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Недействительный или отсутствующий токен авторизации.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise auth_error
    try:
        payload = jwt.decode(
            credentials.credentials, SECRET_KEY, algorithms=[JWT_ALGORITHM]
        )
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise auth_error from None
    user = db.get(User, user_id)
    if user is None:
        raise auth_error
    return user


def require_expert(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"expert", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Доступ разрешён только экспертам УФИЦ РАН.",
        )
    return user


def require_teacher(user: User = Depends(get_current_user)) -> User:
    if user.role not in {"teacher", "expert", "admin"}:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Отчёт доступен только учителю или эксперту.",
        )
    return user


def normalize_translation(text: str) -> str:
    normalized = "".join(
        char if char.isalnum() or char.isspace() else " "
        for char in text.casefold()
    )
    return " ".join(normalized.split())


def shuffled_translation(text: str) -> str:
    words = text.split()
    if len(words) < 2:
        return text
    shuffled = words[:]
    for _ in range(10):
        random.shuffle(shuffled)
        if shuffled != words:
            break
    return " ".join(shuffled)


def resolve_school(school_id: str | None, school_name: str | None):
    record = get_school(school_id) if school_id else None
    if school_id and record is None:
        raise HTTPException(status_code=400, detail="Школа не найдена в справочнике РБ.")
    if record is None and school_name:
        record = find_school(school_name)
        if record is None:
            raise HTTPException(status_code=400, detail="Выберите школу из справочника РБ.")
    if record and school_name:
        by_name = find_school(school_name)
        if by_name is None or by_name["id"] != record["id"]:
            raise HTTPException(status_code=400, detail="Идентификатор и название школы не совпадают.")
    return record


@app.get(
    "/schools",
    response_model=SchoolDirectoryResponse,
    tags=["Сервис"],
    summary="Поиск по справочнику школ Башкортостана",
)
def schools_directory(
    q: str = Query("", max_length=120),
    city: str = Query("", max_length=120),
    district: str = Query("", max_length=120),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    return search_schools(q=q.strip(), city=city.strip(), district=district.strip(), limit=limit, offset=offset)


@app.post(
    "/auth/register",
    response_model=AuthResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Авторизация"],
    summary="Регистрация по электронной почте",
    response_description="JWT-токен и данные созданного пользователя.",
)
def register(payload: UserRegister, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с такой электронной почтой уже зарегистрирован.",
        )
    if payload.telegram_id is not None and (
        db.query(User).filter(User.telegram_id == payload.telegram_id).first()
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Этот Telegram-аккаунт уже привязан к другому пользователю.",
        )
    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Роль должна быть student, teacher или expert.",
        )
    school = resolve_school(payload.school_id, payload.school)
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=role,
        telegram_id=payload.telegram_id,
        school_id=school["id"] if school else None,
        school=school["name"] if school else None,
        class_name=payload.class_name,
        lang_pair=payload.lang_pair,
        badges=[],
    )
    db.add(user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Пользователь с такими данными уже существует.",
        ) from None
    db.refresh(user)
    logger.info("Зарегистрирован пользователь %s", user.id)
    return build_auth_response(user)


@app.post(
    "/auth/login",
    response_model=AuthResponse,
    tags=["Авторизация"],
    summary="Вход по электронной почте",
    response_description="JWT-токен и данные пользователя.",
)
def login(payload: UserLogin, db: Session = Depends(get_db)):
    email = str(payload.email).lower()
    user = db.query(User).filter(func.lower(User.email) == email).first()
    if user is None or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Неверный адрес электронной почты или пароль.",
        )
    return build_auth_response(user)


@app.post(
    "/auth/telegram",
    response_model=AuthResponse,
    tags=["Авторизация"],
    summary="Вход или регистрация через Telegram",
    response_description="JWT-токен и данные пользователя Telegram.",
)
def telegram_auth(payload: TelegramAuth, db: Session = Depends(get_db)):
    role = payload.role.strip().lower()
    if role not in ALLOWED_ROLES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Роль должна быть student, teacher или expert.",
        )
    school = resolve_school(payload.school_id, payload.school)
    user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()
    if user is None:
        user = User(
            telegram_id=payload.telegram_id,
            full_name=payload.full_name,
            role=role,
            school_id=school["id"] if school else None,
            school=school["name"] if school else None,
            class_name=payload.class_name,
            lang_pair=payload.lang_pair,
            badges=[],
        )
        db.add(user)
    else:
        user.full_name = payload.full_name
        if school:
            user.school_id = school["id"]
            user.school = school["name"]
        if payload.class_name is not None:
            user.class_name = payload.class_name
        user.lang_pair = payload.lang_pair
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Не удалось привязать Telegram-аккаунт.",
        ) from None
    db.refresh(user)
    return build_auth_response(user)


@app.get(
    "/auth/me",
    response_model=UserResponse,
    tags=["Авторизация"],
    summary="Текущий пользователь",
    response_description="Данные владельца Bearer-токена.",
)
def me(user: User = Depends(get_current_user)):
    return user


@app.patch(
    "/auth/me",
    response_model=UserResponse,
    tags=["Авторизация"],
    summary="Обновить школу, класс и языковую пару",
)
def update_me(
    payload: UserProfileUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    values = payload.model_dump(exclude_unset=True)
    if "school_id" in values or "school" in values:
        school = resolve_school(payload.school_id, payload.school)
        if school is None:
            raise HTTPException(status_code=400, detail="Выберите школу из справочника РБ.")
        user.school_id = school["id"]
        user.school = school["name"]
    if "class_name" in values:
        class_name = (payload.class_name or "").strip().upper().replace(" ", "")
        if not class_name or not re.fullmatch(r"(?:[1-9]|10|11)[А-Я]", class_name):
            raise HTTPException(status_code=400, detail="Укажите класс в формате 7А (с 1 по 11).")
        user.class_name = class_name
    if payload.lang_pair is not None:
        user.lang_pair = payload.lang_pair
    db.commit()
    db.refresh(user)
    return user


@app.get(
    "/tasks/daily",
    response_model=DailyTaskResponse,
    tags=["Задания"],
    summary="Получить ежедневное задание",
    response_description="Случайный фрагмент и вариант перевода для проверки.",
)
def daily_task(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    fragment = db.query(Fragment).order_by(func.random()).first()
    if fragment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="В базе пока нет фрагментов для заданий.",
        )
    translation = (
        db.query(Translation)
        .filter(Translation.fragment_id == fragment.id)
        .order_by(func.random())
        .first()
    )
    if translation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Для выбранного фрагмента пока нет перевода.",
        )

    shown_translation = translation.translation
    if random.random() < 0.3:
        wrong_variants = fragment.wrong_variants or {}
        wrong = wrong_variants.get(fragment.lang_pair)
        if not wrong:
            values = [
                value for value in wrong_variants.values() if isinstance(value, str)
            ]
            wrong = random.choice(values) if values else None
        shown_translation = wrong or shuffled_translation(translation.translation)

    return DailyTaskResponse(
        fragment_id=fragment.id,
        translation_id=translation.id,
        text_ba=fragment.text_ba,
        translation=shown_translation,
        lang_pair=fragment.lang_pair,
        source=fragment.source,
    )


def award_badges(db: Session, user: User) -> None:
    answers_count = db.query(Answer).filter(Answer.user_id == user.id).count()
    corrections_count = (
        db.query(Answer)
        .filter(Answer.user_id == user.id, Answer.is_correct.is_(False))
        .count()
    )
    earned_badges = set(user.badges or [])
    rules = {
        "first_answer": answers_count >= 1,
        "corrector": corrections_count >= 1,
        "hundred_points": user.points >= 100,
        "ten_answers": answers_count >= 10,
    }
    for badge_type, condition in rules.items():
        if not condition or badge_type in earned_badges:
            continue
        existing = (
            db.query(Badge)
            .filter(Badge.user_id == user.id, Badge.badge_type == badge_type)
            .first()
        )
        if existing is None:
            db.add(Badge(user_id=user.id, badge_type=badge_type))
        earned_badges.add(badge_type)
    user.badges = sorted(earned_badges)


@app.post(
    "/tasks/submit",
    tags=["Задания"],
    summary="Отправить оценку перевода",
    response_description="Сохранённый ответ, очки, уровень и статус консенсуса.",
)
def submit_answer(
    payload: AnswerCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    fragment = db.get(Fragment, payload.fragment_id)
    if fragment is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Фрагмент для ответа не найден.",
        )
    normalized = normalize_translation(payload.translation)
    if not normalized:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Перевод должен содержать буквы или цифры.",
        )

    translations = (
        db.query(Translation).filter(Translation.fragment_id == fragment.id).all()
    )
    variant = next(
        (
            item
            for item in translations
            if normalize_translation(item.translation) == normalized
        ),
        None,
    )
    if variant is None:
        variant = Translation(
            fragment_id=fragment.id,
            lang_pair=fragment.lang_pair,
            translation=payload.translation.strip(),
            confirmed=0,
            status="pending",
        )
        db.add(variant)
        db.flush()
        translations.append(variant)

    points_earned = 10 if payload.is_correct else 15
    answer = Answer(
        user_id=user.id,
        fragment_id=fragment.id,
        translation_id=variant.id,
        translation_text=payload.translation.strip(),
        is_correct=payload.is_correct,
        points_earned=points_earned,
    )
    db.add(answer)
    db.flush()
    user.points += points_earned
    user.level = user.points // 100 + 1

    fragment_answers = (
        db.query(Answer)
        .filter(Answer.fragment_id == fragment.id)
        .order_by(Answer.id)
        .all()
    )
    groups: dict[str, list[Answer]] = defaultdict(list)
    for item in fragment_answers:
        groups[normalize_translation(item.translation_text)].append(item)

    leader_normalized = max(groups, key=lambda key: len(groups[key]))
    leader_answers = groups[leader_normalized]
    votes = len(leader_answers)
    total_answers = len(fragment_answers)
    consensus_status = variant.status

    if votes >= 3 and votes * 2 > total_answers:
        consensus = next(
            (
                item
                for item in translations
                if normalize_translation(item.translation) == leader_normalized
            ),
            variant,
        )
        consensus.translation = leader_answers[-1].translation_text
        consensus.confirmed = votes
        consensus.status = "confirmed"
        consensus_status = consensus.status
    elif total_answers >= 5:
        for item in translations:
            if item.status != "confirmed":
                item.status = "expert_review"
        consensus_status = variant.status

    award_badges(db, user)
    db.commit()
    db.refresh(answer)
    db.refresh(user)
    return {
        "message": "Ответ сохранён.",
        "answer": AnswerResponse.model_validate(answer),
        "points": user.points,
        "level": user.level,
        "badges": user.badges,
        "consensus_status": consensus_status,
    }


@app.get(
    "/moderation/disputed",
    tags=["Модерация"],
    summary="Список спорных переводов",
    response_description="Переводы на экспертной проверке и ответы пользователей.",
)
def disputed_translations(
    db: Session = Depends(get_db),
    _: User = Depends(require_expert),
):
    rows = (
        db.query(Translation, Fragment)
        .join(Fragment, Translation.fragment_id == Fragment.id)
        .filter(Translation.status == "expert_review")
        .order_by(Translation.created_at)
        .all()
    )
    result = []
    for translation, fragment in rows:
        answers = (
            db.query(Answer)
            .filter(Answer.fragment_id == fragment.id)
            .order_by(Answer.id)
            .all()
        )
        variants: dict[str, dict] = {}
        for answer in answers:
            key = normalize_translation(answer.translation_text)
            if key not in variants:
                variants[key] = {
                    "translation": answer.translation_text,
                    "votes": 0,
                    "correct_votes": 0,
                    "correction_votes": 0,
                }
            variants[key]["votes"] += 1
            if answer.is_correct:
                variants[key]["correct_votes"] += 1
            else:
                variants[key]["correction_votes"] += 1
        result.append(
            {
                "translation_id": translation.id,
                "fragment_id": fragment.id,
                "text_ba": fragment.text_ba,
                "lang_pair": translation.lang_pair,
                "translation": translation.translation,
                "source": fragment.source,
                "variants": list(variants.values()),
            }
        )
    return result


@app.post(
    "/moderation/resolve",
    tags=["Модерация"],
    summary="Подтвердить эталонный перевод",
    response_description="Результат экспертного решения.",
)
def resolve_translation(
    payload: ModerationResolve,
    db: Session = Depends(get_db),
    expert: User = Depends(require_expert),
):
    translation = db.get(Translation, payload.translation_id)
    if translation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Перевод для модерации не найден.",
        )
    translation.translation = payload.final_translation
    translation.status = "confirmed"
    db.commit()
    db.refresh(translation)
    logger.info(
        "Эксперт %s подтвердил перевод %s", expert.id, translation.id
    )
    message = (
        "Перевод подтверждён экспертом."
        if payload.approved
        else "Исправленный перевод сохранён и подтверждён экспертом."
    )
    return {
        "message": message,
        "translation": TranslationResponse.model_validate(translation),
    }


def period_cutoff(period: Period) -> datetime | None:
    deltas = {
        "day": timedelta(days=1),
        "week": timedelta(days=7),
        "month": timedelta(days=30),
        "year": timedelta(days=365),
    }
    if period == "all":
        return None
    return datetime.now(timezone.utc) - deltas[period]


def user_points_query(db: Session, period: Period):
    cutoff = period_cutoff(period)
    join_conditions = [Answer.user_id == User.id]
    if cutoff is not None:
        join_conditions.append(Answer.created_at >= cutoff)
    return (
        db.query(
            User,
            func.coalesce(func.sum(Answer.points_earned), 0).label("period_points"),
        )
        .outerjoin(Answer, and_(*join_conditions))
        .filter(User.role == "student")
        .group_by(User.id)
    )


@app.get(
    "/ratings/top",
    tags=["Рейтинги"],
    summary="Рейтинг учеников по очкам",
)
def rating_top(period: Period = Query("all"), db: Session = Depends(get_db)):
    if period == "all":
        users = (
            db.query(User)
            .filter(User.role == "student")
            .order_by(User.points.desc(), User.id)
            .all()
        )
        rows = [(user, user.points) for user in users]
    else:
        rows = user_points_query(db, period).order_by(
            func.coalesce(func.sum(Answer.points_earned), 0).desc(), User.id
        ).all()
    return [
        {
            "rank": rank,
            "user_id": user.id,
            "full_name": user.full_name,
            "school_id": user.school_id,
            "school": user.school,
            "class_name": user.class_name,
            "points": points,
            "level": user.level,
            "streak_days": user.streak_days,
            "badges": user.badges,
        }
        for rank, (user, points) in enumerate(rows, start=1)
    ]


@app.get(
    "/ratings/schools",
    tags=["Рейтинги"],
    summary="Рейтинг школ по очкам",
)
def rating_schools(period: Period = Query("all"), db: Session = Depends(get_db)):
    filters = (User.role == "student", User.school.is_not(None), User.school != "")
    points = User.points if period == "all" else Answer.points_earned
    query = db.query(
        User.school_id,
        User.school,
        func.coalesce(func.sum(points), 0).label("points"),
        func.count(func.distinct(User.id)).label("students"),
    )
    if period != "all":
        query = query.outerjoin(Answer, and_(Answer.user_id == User.id, Answer.created_at >= period_cutoff(period)))
    rows = query.filter(*filters).group_by(User.school_id, User.school).order_by(
        func.coalesce(func.sum(points), 0).desc(), User.school
    ).all()
    return [
        {"rank": rank, "school_id": school_id, "school": school, "points": points, "students": students}
        for rank, (school_id, school, points, students) in enumerate(rows, start=1)
    ]


@app.get(
    "/ratings/classes",
    tags=["Рейтинги"],
    summary="Рейтинг классов по очкам",
)
def rating_classes(period: Period = Query("all"), db: Session = Depends(get_db)):
    filters = (User.role == "student", User.school.is_not(None), User.class_name.is_not(None))
    points = User.points if period == "all" else Answer.points_earned
    query = db.query(
        User.school_id,
        User.school,
        User.class_name,
        func.coalesce(func.sum(points), 0).label("points"),
        func.count(func.distinct(User.id)).label("students"),
    )
    if period != "all":
        query = query.outerjoin(Answer, and_(Answer.user_id == User.id, Answer.created_at >= period_cutoff(period)))
    rows = query.filter(*filters).group_by(User.school_id, User.school, User.class_name).order_by(
        func.coalesce(func.sum(points), 0).desc(), User.school, User.class_name
    ).all()
    return [
        {"rank": rank, "school_id": school_id, "school": school, "class_name": class_name, "points": points, "students": students}
        for rank, (school_id, school, class_name, points, students) in enumerate(rows, start=1)
    ]


def answers_with_users(db: Session, period: Period):
    query = db.query(Answer, User).join(User, Answer.user_id == User.id).filter(
        User.role == "student"
    )
    cutoff = period_cutoff(period)
    if cutoff is not None:
        query = query.filter(Answer.created_at >= cutoff)
    return query


@app.get(
    "/ratings/accuracy",
    tags=["Рейтинги"],
    summary="Рейтинг точности ответов",
)
def rating_accuracy(period: Period = Query("all"), db: Session = Depends(get_db)):
    query = db.query(
        User,
        func.count(Answer.id).label("total_answers"),
        func.sum(case((Answer.is_correct.is_(True), 1), else_=0)).label(
            "correct_answers"
        ),
    ).join(Answer, Answer.user_id == User.id).filter(User.role == "student")
    cutoff = period_cutoff(period)
    if cutoff is not None:
        query = query.filter(Answer.created_at >= cutoff)
    rows = query.group_by(User.id).all()
    result = [
        {
            "user_id": user.id,
            "full_name": user.full_name,
            "school_id": user.school_id,
            "school": user.school,
            "class_name": user.class_name,
            "accuracy": round(correct / total * 100, 2),
            "total_answers": total,
            "correct_answers": correct,
        }
        for user, total, correct in rows
    ]
    result.sort(key=lambda item: (-item["accuracy"], -item["total_answers"]))
    for rank, item in enumerate(result, start=1):
        item["rank"] = rank
    return result


@app.get(
    "/ratings/vocabulary",
    tags=["Рейтинги"],
    summary="Рейтинг словарного запаса",
)
def rating_vocabulary(period: Period = Query("all"), db: Session = Depends(get_db)):
    rows = answers_with_users(db, period).all()
    users: dict[int, dict] = {}
    for answer, user in rows:
        if user.id not in users:
            users[user.id] = {
                "user_id": user.id,
                "full_name": user.full_name,
                "school_id": user.school_id,
                "school": user.school,
                "class_name": user.class_name,
                "translations": set(),
            }
        normalized = normalize_translation(answer.translation_text)
        if normalized:
            users[user.id]["translations"].add(normalized)
    result = []
    for item in users.values():
        item["unique_translations"] = len(item.pop("translations"))
        result.append(item)
    result.sort(key=lambda item: (-item["unique_translations"], item["user_id"]))
    for rank, item in enumerate(result, start=1):
        item["rank"] = rank
    return result


@app.get(
    "/ratings/corrections",
    tags=["Рейтинги"],
    summary="Рейтинг по количеству исправлений",
)
def rating_corrections(period: Period = Query("all"), db: Session = Depends(get_db)):
    query = db.query(
        User,
        func.count(Answer.id).label("corrections"),
        func.coalesce(func.sum(Answer.points_earned), 0).label("points"),
    ).join(Answer, Answer.user_id == User.id).filter(
        User.role == "student", Answer.is_correct.is_(False)
    )
    cutoff = period_cutoff(period)
    if cutoff is not None:
        query = query.filter(Answer.created_at >= cutoff)
    rows = query.group_by(User.id).order_by(func.count(Answer.id).desc()).all()
    return [
        {
            "rank": rank,
            "user_id": user.id,
            "full_name": user.full_name,
            "school_id": user.school_id,
            "school": user.school,
            "class_name": user.class_name,
            "corrections": corrections,
            "points": points,
        }
        for rank, (user, corrections, points) in enumerate(rows, start=1)
    ]


@app.get(
    "/teacher/class-report",
    tags=["Учитель"],
    summary="Отчёт по классу",
    response_description="Очки, уровни и точность ответов учеников класса.",
)
def class_report(
    school: str = Query(..., description="Название школы."),
    class_name: str = Query(..., description="Название класса."),
    db: Session = Depends(get_db),
    _: User = Depends(require_teacher),
):
    students = (
        db.query(User)
        .filter(
            User.role == "student",
            User.school == school,
            User.class_name == class_name,
        )
        .order_by(User.full_name)
        .all()
    )
    report = []
    for student in students:
        answers = db.query(Answer).filter(Answer.user_id == student.id).all()
        correct = sum(1 for answer in answers if answer.is_correct)
        total = len(answers)
        report.append(
            {
                "user_id": student.id,
                "full_name": student.full_name,
                "points": student.points,
                "level": student.level,
                "streak_days": student.streak_days,
                "badges": student.badges,
                "total_answers": total,
                "correct_answers": correct,
                "accuracy": round(correct / total * 100, 2) if total else 0.0,
            }
        )
    return {
        "school": school,
        "class_name": class_name,
        "total_students": len(students),
        "students": report,
        "generated_at": datetime.now(timezone.utc),
    }


@app.get(
    "/answers/me",
    tags=["Экспорт"],
    summary="Экспортировать собственные ответы",
    response_description="Ответы текущего пользователя с башкирскими фрагментами в JSON или CSV.",
)
def export_my_answers(
    format: Literal["json", "csv"] = Query("json"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = (
        db.query(Answer, Fragment, Translation)
        .join(Fragment, Answer.fragment_id == Fragment.id)
        .join(Translation, Answer.translation_id == Translation.id)
        .filter(Answer.user_id == user.id)
        .order_by(Answer.created_at.desc(), Answer.id.desc())
        .all()
    )
    data = [
        {
            "answer_id": answer.id,
            "fragment_id": fragment.id,
            "text_ba": fragment.text_ba,
            "lang_pair": answer_translation.lang_pair,
            "translation": answer.translation_text,
            "is_correct": answer.is_correct,
            "points_earned": answer.points_earned,
            "source": fragment.source,
            "translation_status": answer_translation.status,
            "created_at": answer.created_at.isoformat(),
        }
        for answer, fragment, answer_translation in rows
    ]
    if format == "json":
        return data
    output = io.StringIO()
    fieldnames = list(data[0]) if data else [
        "answer_id", "fragment_id", "text_ba", "lang_pair", "translation",
        "is_correct", "points_earned", "source", "translation_status", "created_at",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for item in data:
        writer.writerow({**item, "source": json.dumps(item["source"], ensure_ascii=False)})
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="my_answers.csv"'},
    )


@app.get(
    "/translations/export",
    tags=["Экспорт"],
    summary="Экспортировать подтверждённые переводы",
    response_description="Подтверждённые переводы в формате JSON или CSV.",
)
def export_translations(
    format: Literal["json", "csv"] = Query("json"),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Translation, Fragment)
        .join(Fragment, Translation.fragment_id == Fragment.id)
        .filter(Translation.status == "confirmed")
        .order_by(Translation.fragment_id, Translation.id)
        .all()
    )
    data = [
        {
            "fragment_id": fragment.id,
            "text_ba": fragment.text_ba,
            "lang_pair": translation.lang_pair,
            "translation": translation.translation,
            "source": fragment.source,
            "confirmed": translation.confirmed,
            "status": translation.status,
        }
        for translation, fragment in rows
    ]
    if format == "json":
        return data

    output = io.StringIO()
    fieldnames = [
        "fragment_id",
        "text_ba",
        "lang_pair",
        "translation",
        "source",
        "confirmed",
        "status",
    ]
    writer = csv.DictWriter(output, fieldnames=fieldnames)
    writer.writeheader()
    for item in data:
        writer.writerow({**item, "source": json.dumps(item["source"], ensure_ascii=False)})
    return Response(
        content="\ufeff" + output.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": 'attachment; filename="confirmed_translations.csv"'
        },
    )


@app.get(
    "/fragments/search",
    tags=["Задания"],
    summary="Найти слово или фразу в общем словаре",
)
def search_fragments(
    q: str = Query(min_length=1, max_length=100),
    limit: int = Query(20, ge=1, le=50),
    lang_pair: str = Query("ba-ru", min_length=1, max_length=10),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    query_text = q.strip()
    if not query_text:
        raise HTTPException(status_code=422, detail="Введите слово или фразу для поиска.")
    normalized_query = query_text.casefold()
    rows = (
        db.query(Fragment, Translation)
        .join(Translation, Translation.fragment_id == Fragment.id)
        .filter(
            Fragment.lang_pair == lang_pair,
            Translation.lang_pair == lang_pair,
        )
        .order_by(
            case((Translation.status == "confirmed", 0), else_=1),
            Fragment.id,
            Translation.id,
        )
        .all()
    )
    rows = [
        (fragment, translation)
        for fragment, translation in rows
        if normalized_query in fragment.text_ba.casefold()
        or normalized_query in translation.translation.casefold()
    ][:limit]
    return [
        {
            "fragment_id": fragment.id,
            "translation_id": translation.id,
            "text_ba": fragment.text_ba,
            "translation": translation.translation,
            "lang_pair": fragment.lang_pair,
            "source": fragment.source,
            "status": translation.status,
            "confirmed": translation.confirmed,
        }
        for fragment, translation in rows
    ]


def validate_proposal_text(text: str) -> None:
    lowered = text.casefold()
    if (
        any(marker in lowered for marker in ("http://", "https://", "www.", "<script"))
        or "<" in text
        or ">" in text
        or any(char * 6 in text for char in set(text) if char.strip())
        or not any(char.isalnum() for char in text)
    ):
        raise HTTPException(
            status_code=422,
            detail="Текст не прошёл проверку. Уберите лишнее и отправьте снова.",
        )


@app.post(
    "/fragments/propose",
    response_model=FragmentProposalResponse,
    status_code=status.HTTP_201_CREATED,
    tags=["Задания"],
    summary="Предложить новую башкирско-русскую пару",
)
def propose_fragment(
    payload: FragmentProposal,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    text_ba = payload.text_ba.strip()
    translation_text = payload.translation.strip()
    validate_proposal_text(text_ba)
    validate_proposal_text(translation_text)
    existing_pairs = (
        db.query(Fragment.text_ba, Translation.translation)
        .join(Translation, Translation.fragment_id == Fragment.id)
        .filter(
            Fragment.lang_pair == payload.lang_pair,
            Translation.lang_pair == payload.lang_pair,
        )
        .all()
    )
    duplicate = next(
        (
            pair
            for pair in existing_pairs
            if pair.text_ba.casefold() == text_ba.casefold()
            and pair.translation.casefold() == translation_text.casefold()
        ),
        None,
    )
    if duplicate is not None:
        raise HTTPException(
            status_code=409,
            detail="Такая пара уже есть в словаре. Попробуйте найти её через поиск.",
        )

    fragment = Fragment(
        text_ba=text_ba,
        lang_pair=payload.lang_pair,
        source={
            "file": "community",
            "chapter": f"Предложено: {user.full_name}",
            "time": datetime.now(timezone.utc).isoformat(),
        },
        wrong_variants={},
    )
    db.add(fragment)
    db.flush()
    translation = Translation(
        fragment_id=fragment.id,
        lang_pair=payload.lang_pair,
        translation=translation_text,
        confirmed=0,
        status="pending",
    )
    db.add(translation)
    db.flush()
    user.points += 20
    user.level = user.points // 100 + 1
    award_badges(db, user)
    db.commit()
    db.refresh(user)
    return {
        "fragment_id": fragment.id,
        "translation_id": translation.id,
        "awarded_xp": 20,
        "points": user.points,
        "level": user.level,
        "badges": user.badges,
        "message": "Спасибо! Фразу проверят другие ученики.",
    }


COURSE_CIRCLES = {
    "circle_1": ("circle_1_done", 20),
    "circle_2": ("circle_2_done", 40),
    "circle_3": ("circle_3_done", 60),
    "boss_story": ("boss_done", 100),
}


def course_units_query(db: Session) -> list[CourseUnit]:
    return db.query(CourseUnit).order_by(CourseUnit.order_index, CourseUnit.id).all()


def user_unit_progress_map(db: Session, user_id: int) -> dict[int, UserUnitProgress]:
    rows = (
        db.query(UserUnitProgress)
        .filter(UserUnitProgress.user_id == user_id)
        .all()
    )
    return {row.unit_id: row for row in rows}


def course_unit_unlocked(
    unit: CourseUnit,
    units: list[CourseUnit],
    progress_by_unit: dict[int, UserUnitProgress],
) -> bool:
    position = next(index for index, item in enumerate(units) if item.id == unit.id)
    if position == 0:
        return True
    previous_progress = progress_by_unit.get(units[position - 1].id)
    return bool(previous_progress and previous_progress.boss_done)


def build_unit_progress_status(
    unit: CourseUnit,
    units: list[CourseUnit],
    progress_by_unit: dict[int, UserUnitProgress],
) -> dict:
    progress = progress_by_unit.get(unit.id)
    unit_unlocked = course_unit_unlocked(unit, units, progress_by_unit)
    statuses = {}
    previous_completed = True
    for circle, (field_name, _) in COURSE_CIRCLES.items():
        completed = bool(progress and getattr(progress, field_name))
        unlocked = unit_unlocked and previous_completed
        statuses[circle] = {"unlocked": unlocked, "completed": completed}
        previous_completed = completed

    if not unit_unlocked:
        current_circle = "locked"
    else:
        current_circle = next(
            (
                circle
                for circle, state in statuses.items()
                if state["unlocked"] and not state["completed"]
            ),
            "completed",
        )
    return {**statuses, "current_circle": current_circle}


def course_unit_summary(
    db: Session,
    unit: CourseUnit,
    units: list[CourseUnit],
    progress_by_unit: dict[int, UserUnitProgress],
) -> dict:
    vocabulary_count = (
        db.query(UnitVocabulary).filter(UnitVocabulary.unit_id == unit.id).count()
    )
    return {
        "id": unit.id,
        "order_index": unit.order_index,
        "title": unit.title,
        "description": unit.description,
        "character_name": unit.character_name,
        "theme_slug": unit.theme_slug,
        "vocabulary_count": vocabulary_count,
        "unlocked": course_unit_unlocked(unit, units, progress_by_unit),
        "progress": build_unit_progress_status(unit, units, progress_by_unit),
    }


def find_course_unit(db: Session, unit_id: int) -> CourseUnit:
    unit = db.get(CourseUnit, unit_id)
    if unit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден."
        )
    return unit


def generate_unit_quiz(unit_id: int, vocabulary: list[UnitVocabulary]) -> list[dict]:
    generator = random.Random(unit_id * 1000)
    cards = vocabulary[:]
    generator.shuffle(cards)
    directions = ["ba_to_ru"] * 4 + ["ru_to_ba"] * 4
    generator.shuffle(directions)
    quiz = []
    for index, card in enumerate(cards):
        direction = directions[index]
        correct_answer = card.ru_word if direction == "ba_to_ru" else card.ba_word
        other_answers = [
            item.ru_word if direction == "ba_to_ru" else item.ba_word
            for item in vocabulary
            if item.id != card.id
        ]
        options = generator.sample(other_answers, 3) + [correct_answer]
        generator.shuffle(options)
        quiz.append(
            {
                "id": f"{unit_id}-quiz-{index + 1}",
                "direction": direction,
                "prompt": card.ba_word if direction == "ba_to_ru" else card.ru_word,
                "options": options,
                "correct_answer": correct_answer,
            }
        )
    return quiz


@app.get(
    "/courses/units",
    response_model=list[CourseUnitSummary],
    tags=["Курсы"],
    summary="Список курсов и прогресс текущего пользователя",
)
def list_course_units(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    units = course_units_query(db)
    progress_by_unit = user_unit_progress_map(db, user.id)
    return [
        course_unit_summary(db, unit, units, progress_by_unit) for unit in units
    ]


@app.get(
    "/courses/units/{unit_id}",
    response_model=CourseUnitDetailResponse,
    tags=["Курсы"],
    summary="Полная структура курса с заданиями и историей",
)
def get_course_unit_detail(
    unit_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    units = course_units_query(db)
    unit = next((item for item in units if item.id == unit_id), None)
    if unit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден."
        )
    progress_by_unit = user_unit_progress_map(db, user.id)
    vocabulary = (
        db.query(UnitVocabulary)
        .filter(UnitVocabulary.unit_id == unit.id)
        .order_by(UnitVocabulary.id)
        .all()
    )
    exercises = (
        db.query(UnitExercise)
        .filter(UnitExercise.unit_id == unit.id)
        .order_by(UnitExercise.id)
        .all()
    )
    story_steps = (
        db.query(UnitStoryStep)
        .filter(UnitStoryStep.unit_id == unit.id)
        .order_by(UnitStoryStep.step_order)
        .all()
    )

    build_sentence = [
        {
            "id": item.id,
            "prompt_ru": item.prompt_ru,
            "tokens": item.tokens_json,
            "distractors": item.distractors_json,
            "hints": item.hints_json,
            "correct_answer": item.correct_answer,
        }
        for item in exercises
        if item.exercise_type == "build_sentence"
    ]
    fill_blanks = [
        {
            "id": item.id,
            "prompt_ru": item.prompt_ru,
            "target_ba": item.target_ba,
            "tokens": item.tokens_json,
            "distractors": item.distractors_json,
            "hints": item.hints_json,
            "correct_answer": item.correct_answer,
        }
        for item in exercises
        if item.exercise_type == "fill_blank"
    ]
    match = next(
        (item for item in exercises if item.exercise_type == "match_pairs"), None
    )
    match_pairs = None
    if match is not None:
        ru_options = list(match.correct_answer.values())
        random.Random(unit.id * 2000).shuffle(ru_options)
        match_pairs = {
            "id": match.id,
            "prompt_ru": match.prompt_ru,
            "tokens": match.tokens_json,
            "ru_options": ru_options,
            "correct_answer": match.correct_answer,
        }

    return {
        **course_unit_summary(db, unit, units, progress_by_unit),
        "circle_1": {
            "cards": vocabulary,
            "quiz": generate_unit_quiz(unit.id, vocabulary),
        },
        "circle_2": {"build_sentence": build_sentence},
        "circle_3": {"fill_blanks": fill_blanks, "match_pairs": match_pairs},
        "boss_story": {
            "steps": [
                {
                    "id": step.id,
                    "step_order": step.step_order,
                    "character_name": step.character_name,
                    "scene_tag": step.scene_tag,
                    "npc_text_ba": step.npc_text_ba,
                    "npc_text_ru": step.npc_text_ru,
                    "options": step.options_json,
                }
                for step in story_steps
            ]
        },
    }


def course_circle_completion_payload(
    db: Session,
    user: User,
    unit: CourseUnit,
    units: list[CourseUnit],
    payload: CourseCircleComplete,
    already_completed: bool,
    awarded_xp: int,
) -> dict:
    progress_by_unit = user_unit_progress_map(db, user.id)
    updated_progress = build_unit_progress_status(unit, units, progress_by_unit)
    position = next(index for index, item in enumerate(units) if item.id == unit.id)
    next_unit = units[position + 1] if position + 1 < len(units) else None
    return {
        "unit_id": unit.id,
        "circle": payload.circle,
        "score": payload.score,
        "already_completed": already_completed,
        "awarded_xp": awarded_xp,
        "points": user.points,
        "level": user.level,
        "next_circle": updated_progress["current_circle"],
        "next_unit_id": next_unit.id if next_unit else None,
        "next_unit_unlocked": bool(
            next_unit
            and course_unit_unlocked(next_unit, units, progress_by_unit)
        ),
        "progress": updated_progress,
    }


@app.post(
    "/courses/units/{unit_id}/complete",
    response_model=CourseCircleCompleteResponse,
    tags=["Курсы"],
    summary="Завершить кружок, получить XP и открыть следующий этап",
)
def complete_course_circle(
    unit_id: int,
    payload: CourseCircleComplete,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    units = course_units_query(db)
    unit = next((item for item in units if item.id == unit_id), None)
    if unit is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Курс не найден."
        )
    progress_by_unit = user_unit_progress_map(db, user.id)
    current_status = build_unit_progress_status(unit, units, progress_by_unit)
    circle_status = current_status[payload.circle]
    if not circle_status["unlocked"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Сначала завершите предыдущий кружок или курс.",
        )
    if circle_status["completed"]:
        return course_circle_completion_payload(
            db, user, unit, units, payload, True, 0
        )

    progress = progress_by_unit.get(unit.id)
    if progress is None:
        progress = UserUnitProgress(user_id=user.id, unit_id=unit.id)
        db.add(progress)
    field_name, base_xp = COURSE_CIRCLES[payload.circle]
    setattr(progress, field_name, True)
    awarded_xp = round(base_xp * payload.score / 100)
    user.points += awarded_xp
    user.level = user.points // 100 + 1
    award_badges(db, user)
    db.commit()
    db.refresh(user)
    db.refresh(progress)
    return course_circle_completion_payload(
        db, user, unit, units, payload, False, awarded_xp
    )


@app.get(
    "/course/progress",
    response_model=list[CourseProgressResponse],
    tags=["Курс"],
    summary="Получить прогресс по учебной карте",
)
def course_progress(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return (
        db.query(CourseProgress)
        .filter(CourseProgress.user_id == user.id)
        .order_by(CourseProgress.unit_id, CourseProgress.lesson_id)
        .all()
    )


@app.post(
    "/course/complete",
    tags=["Курс"],
    summary="Завершить урок и начислить XP один раз",
)
def complete_course_lesson(
    payload: CourseComplete,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    existing = (
        db.query(CourseProgress)
        .filter(
            CourseProgress.user_id == user.id,
            CourseProgress.unit_id == payload.unit_id,
            CourseProgress.lesson_id == payload.lesson_id,
        )
        .first()
    )
    if existing:
        return {
            "already_completed": True,
            "awarded_xp": 0,
            "points": user.points,
            "level": user.level,
            "progress": CourseProgressResponse.model_validate(existing),
        }

    awarded_xp = {"flashcards": 10, "practice": 30, "boss": 100}[
        payload.lesson_type
    ]
    progress = CourseProgress(
        user_id=user.id,
        unit_id=payload.unit_id,
        lesson_id=payload.lesson_id,
        lesson_type=payload.lesson_type,
        xp_awarded=awarded_xp,
    )
    db.add(progress)
    user.points += awarded_xp
    user.level = user.points // 100 + 1
    award_badges(db, user)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = (
            db.query(CourseProgress)
            .filter(
                CourseProgress.user_id == user.id,
                CourseProgress.unit_id == payload.unit_id,
                CourseProgress.lesson_id == payload.lesson_id,
            )
            .first()
        )
        return {
            "already_completed": True,
            "awarded_xp": 0,
            "points": user.points,
            "level": user.level,
            "progress": CourseProgressResponse.model_validate(existing),
        }
    db.refresh(progress)
    db.refresh(user)
    return {
        "already_completed": False,
        "awarded_xp": awarded_xp,
        "points": user.points,
        "level": user.level,
        "progress": CourseProgressResponse.model_validate(progress),
    }


@app.get(
    "/bot/state/{telegram_id}",
    response_model=BotStateResponse,
    tags=["Бот"],
    summary="Получить состояние бота",
)
def get_bot_state(telegram_id: int, db: Session = Depends(get_db)):
    state = db.query(BotState).filter(BotState.telegram_id == telegram_id).first()
    if state is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Состояние для этого Telegram-пользователя не найдено.",
        )
    return state


@app.post(
    "/bot/state",
    response_model=BotStateResponse,
    tags=["Бот"],
    summary="Создать или обновить состояние бота",
)
def save_bot_state(payload: BotStateCreate, db: Session = Depends(get_db)):
    state = db.query(BotState).filter(BotState.telegram_id == payload.telegram_id).first()
    if state is None:
        state = BotState(
            telegram_id=payload.telegram_id,
            state=payload.state,
            data=payload.data,
        )
        db.add(state)
    else:
        state.state = payload.state
        state.data = payload.data
    db.commit()
    db.refresh(state)
    return state


@app.get("/health", tags=["Сервис"], summary="Проверка доступности API")
@app.get(
    "/",
    tags=["Сервис"],
    summary="Проверка работоспособности",
)
def service_status():
    return {"service": "Башкирская языковая школа", "status": "работает"}
