import csv
import io
import json
import logging
import os
import random
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
from sqlalchemy import and_, case, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from starlette.exceptions import HTTPException as StarletteHTTPException

from database import Base, engine, get_db
from models import Answer, Badge, BotState, Fragment, Translation, User
from schemas import (
    AnswerCreate,
    AnswerResponse,
    AuthResponse,
    BotStateCreate,
    BotStateResponse,
    DailyTaskResponse,
    ModerationResolve,
    TelegramAuth,
    TranslationResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)


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


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(bind=engine)
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
        {"name": "Сервис", "description": "Проверка доступности приложения."},
    ],
)

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
    user = User(
        email=email,
        password_hash=hash_password(payload.password),
        full_name=payload.full_name,
        role=role,
        telegram_id=payload.telegram_id,
        school=payload.school,
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
    user = db.query(User).filter(User.telegram_id == payload.telegram_id).first()
    if user is None:
        user = User(
            telegram_id=payload.telegram_id,
            full_name=payload.full_name,
            role=role,
            school=payload.school,
            class_name=payload.class_name,
            lang_pair=payload.lang_pair,
            badges=[],
        )
        db.add(user)
    else:
        user.full_name = payload.full_name
        user.school = payload.school
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
    if period == "all":
        rows = (
            db.query(
                User.school,
                func.coalesce(func.sum(User.points), 0).label("points"),
                func.count(User.id).label("students"),
            )
            .filter(*filters)
            .group_by(User.school)
            .order_by(func.coalesce(func.sum(User.points), 0).desc())
            .all()
        )
    else:
        cutoff = period_cutoff(period)
        join_conditions = [Answer.user_id == User.id, Answer.created_at >= cutoff]
        rows = (
            db.query(
                User.school,
                func.coalesce(func.sum(Answer.points_earned), 0).label("points"),
                func.count(func.distinct(User.id)).label("students"),
            )
            .outerjoin(Answer, and_(*join_conditions))
            .filter(*filters)
            .group_by(User.school)
            .order_by(func.coalesce(func.sum(Answer.points_earned), 0).desc())
            .all()
        )
    return [
        {"rank": rank, "school": school, "points": points, "students": students}
        for rank, (school, points, students) in enumerate(rows, start=1)
    ]


@app.get(
    "/ratings/classes",
    tags=["Рейтинги"],
    summary="Рейтинг классов по очкам",
)
def rating_classes(period: Period = Query("all"), db: Session = Depends(get_db)):
    filters = (
        User.role == "student",
        User.school.is_not(None),
        User.class_name.is_not(None),
    )
    if period == "all":
        rows = (
            db.query(
                User.school,
                User.class_name,
                func.coalesce(func.sum(User.points), 0).label("points"),
                func.count(User.id).label("students"),
            )
            .filter(*filters)
            .group_by(User.school, User.class_name)
            .order_by(func.coalesce(func.sum(User.points), 0).desc())
            .all()
        )
    else:
        cutoff = period_cutoff(period)
        join_conditions = [Answer.user_id == User.id, Answer.created_at >= cutoff]
        rows = (
            db.query(
                User.school,
                User.class_name,
                func.coalesce(func.sum(Answer.points_earned), 0).label("points"),
                func.count(func.distinct(User.id)).label("students"),
            )
            .outerjoin(Answer, and_(*join_conditions))
            .filter(*filters)
            .group_by(User.school, User.class_name)
            .order_by(func.coalesce(func.sum(Answer.points_earned), 0).desc())
            .all()
        )
    return [
        {
            "rank": rank,
            "school": school,
            "class_name": class_name,
            "points": points,
            "students": students,
        }
        for rank, (school, class_name, points, students) in enumerate(rows, start=1)
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


@app.get(
    "/",
    tags=["Сервис"],
    summary="Проверка работоспособности",
)
def service_status():
    return {"service": "Башкирская языковая школа", "status": "работает"}
