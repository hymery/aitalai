import json
from pathlib import Path
from typing import Any

import bcrypt
from sqlalchemy.orm import Session

from database import Base, DATABASE_URL, SessionLocal, engine
from models import Answer, Badge, Fragment, Translation, User


BASE_DIR = Path(__file__).resolve().parent
FRAGMENTS_FILE = BASE_DIR / "fragments.json"
TEST_PASSWORD = "1234"

TEST_USERS = [
    {
        "email": "aigul@example.com",
        "telegram_id": 700001,
        "full_name": "Айгуль Юлдашева",
        "role": "student",
        "school": "МАОУ «БЛИ № 3» г. Стерлитамак",
        "class_name": "7А",
        "points": 240,
        "level": 3,
        "streak_days": 6,
        "badges": ["first_answer", "hundred_points"],
    },
    {
        "email": "timur@example.com",
        "telegram_id": 700002,
        "full_name": "Тимур Халиков",
        "role": "student",
        "school": "МАОУ «БЛИ № 3» г. Стерлитамак",
        "class_name": "8Б",
        "points": 95,
        "level": 1,
        "streak_days": 3,
        "badges": ["first_answer"],
    },
    {
        "email": "liliya@example.com",
        "telegram_id": 700003,
        "full_name": "Лилия Миннебаева",
        "role": "student",
        "school": "МБОУ СОШ № 12 г. Уфа",
        "class_name": "9А",
        "points": 160,
        "level": 2,
        "streak_days": 4,
        "badges": ["first_answer", "hundred_points"],
    },
    {
        "email": "teacher@example.com",
        "telegram_id": 700004,
        "full_name": "Гульназ Рашитовна Юлдашева",
        "role": "teacher",
        "school": "МАОУ «БЛИ № 3» г. Стерлитамак",
        "class_name": None,
        "points": 0,
        "level": 1,
        "streak_days": 0,
        "badges": [],
    },
    {
        "email": "admin@example.com",
        "telegram_id": 700005,
        "full_name": "Администратор УФИЦ РАН",
        "role": "admin",
        "school": "УФИЦ РАН",
        "class_name": None,
        "points": 0,
        "level": 1,
        "streak_days": 0,
        "badges": [],
    },
]

DEFAULT_FRAGMENTS = [
    {
        "text_ba": "Ашағанда аҙ яҡшы, эшләгәндә күп яҡшы.",
        "translation": "В еде лучше умеренность, а в работе — усердие.",
        "wrong_variants": {"ba-ru": "Чем больше ешь, тем лучше работаешь."},
        "source": {
            "file": "audio/proverbs.mp3",
            "chapter": "Мәҡәлдәр · 1",
            "time": "00:00:05",
        },
    },
    {
        "text_ba": "Бер көн артта ҡалһаң, биш көн артынан йүгерерһең.",
        "translation": "Отстанешь на один день — пять дней будешь догонять.",
        "wrong_variants": {"ba-ru": "Пять дней отдыхай, а потом один день работай."},
        "source": {
            "file": "audio/proverbs.mp3",
            "chapter": "Мәҡәлдәр · 2",
            "time": "00:00:18",
        },
    },
    {
        "text_ba": "Ике уйла, бер эшлә.",
        "translation": "Дважды подумай, один раз сделай.",
        "wrong_variants": {"ba-ru": "Два человека работают лучше одного."},
        "source": {
            "file": "audio/proverbs.mp3",
            "chapter": "Мәҡәлдәр · 3",
            "time": "00:00:31",
        },
    },
    {
        "text_ba": "Йылы һүҙ йән иретер.",
        "translation": "Тёплое слово растапливает душу.",
        "wrong_variants": {"ba-ru": "Горячая вода растапливает лёд."},
        "source": {
            "file": "audio/proverbs.mp3",
            "chapter": "Мәҡәлдәр · 4",
            "time": "00:00:44",
        },
    },
    {
        "text_ba": "Эш үҙе өйрәтә.",
        "translation": "Дело само учит.",
        "wrong_variants": {"ba-ru": "Учитель сам делает всю работу."},
        "source": {
            "file": "audio/proverbs.mp3",
            "chapter": "Мәҡәлдәр · 5",
            "time": "00:00:57",
        },
    },
    {
        "text_ba": "Үлемде табып үлтереп, ил ҡотҡарыр уйым бар.",
        "translation": "Я намерен найти и уничтожить Смерть, чтобы спасти народ.",
        "wrong_variants": {"ba-ru": "Я хочу покинуть народ и никогда не возвращаться."},
        "disputed_translation": "Я хочу найти Смерть и изгнать её из страны.",
        "source": {
            "file": "audio/ural_batyr.mp3",
            "chapter": "Урал батыр · 5-се бүлек",
            "time": "00:12:10",
        },
    },
    {
        "text_ba": "Йәшәй торған илем бар, илһеҙ етем түгелмен.",
        "translation": "У меня есть родная страна, я не сирота без народа.",
        "wrong_variants": {"ba-ru": "У меня нет ни дома, ни родной земли."},
        "source": {
            "file": "audio/ural_batyr.mp3",
            "chapter": "Урал батыр · 1-се бүлек",
            "time": "00:08:42",
        },
    },
    {
        "text_ba": "Тау артылып, һыу кисеп, ҡара урмандар үтеп, һаман алға киткән, ти.",
        "translation": "Переваливая через горы, переправляясь через воды и проходя дремучие леса, они всё шли вперёд.",
        "wrong_variants": {"ba-ru": "Они остановились у реки и вернулись домой."},
        "source": {
            "file": "audio/ural_batyr.mp3",
            "chapter": "Урал батыр · 2-се бүлек",
            "time": "00:15:03",
        },
    },
    {
        "text_ba": "Яҡшылыҡҡа яҡшылыҡ ҡыла торған йола бар.",
        "translation": "Там существует обычай отвечать добром на добро.",
        "wrong_variants": {"ba-ru": "Там принято платить за каждое доброе дело."},
        "source": {
            "file": "audio/ural_batyr.mp3",
            "chapter": "Урал батыр · 2-се бүлек",
            "time": "00:17:26",
        },
    },
    {
        "text_ba": "Үлгәнгә йән бирәйек, кешеләрҙе донъяла үлмәҫ йәндәр ҡылайыҡ.",
        "translation": "Вернём жизнь умершим и сделаем людей бессмертными на земле.",
        "wrong_variants": {"ba-ru": "Оставим умерших забытыми и покинем эту землю."},
        "source": {
            "file": "audio/ural_batyr.mp3",
            "chapter": "Урал батыр · 5-се бүлек",
            "time": "00:31:48",
        },
    },
    {
        "text_ba": "Бөгөн Өфөлә башҡорт теле уҡытыусылары өсөн семинар асылды.",
        "translation": "Сегодня в Уфе открылся семинар для преподавателей башкирского языка.",
        "wrong_variants": {"ba-ru": "Сегодня в Уфе закрыли школу башкирского языка."},
        "disputed_translation": "Сегодня в Уфе прошла конференция школьников.",
        "source": {
            "file": "audio/news.mp3",
            "chapter": "Яңылыҡтар · Мәғариф",
            "time": "00:02:12",
        },
    },
    {
        "text_ba": "Стерлитамактың башҡорт гимназияһында «Урал батыр» эпосына арналған кисә үтте.",
        "translation": "В башкирской гимназии Стерлитамака прошёл вечер, посвящённый эпосу «Урал-батыр».",
        "wrong_variants": {"ba-ru": "В стерлитамакской гимназии отменили уроки литературы."},
        "source": {
            "file": "audio/news.mp3",
            "chapter": "Яңылыҡтар · Мәҙәниәт",
            "time": "00:05:40",
        },
    },
    {
        "text_ba": "Уҡыусылар китапханаға башҡорт телендәге яңы китаптар бүләк итте.",
        "translation": "Ученики подарили библиотеке новые книги на башкирском языке.",
        "wrong_variants": {"ba-ru": "Ученики забрали из библиотеки все старые книги."},
        "source": {
            "file": "audio/news.mp3",
            "chapter": "Яңылыҡтар · Китапхана",
            "time": "00:09:05",
        },
    },
    {
        "text_ba": "Йәш тәржемәселәр әҙәби тексттарҙы тәржемә итеү буйынса оҫталыҡ дәресендә ҡатнашты.",
        "translation": "Молодые переводчики приняли участие в мастер-классе по переводу литературных текстов.",
        "wrong_variants": {"ba-ru": "Молодые художники представили свои картины на выставке."},
        "source": {
            "file": "audio/news.mp3",
            "chapter": "Яңылыҡтар · Тәржемә",
            "time": "00:12:34",
        },
    },
    {
        "text_ba": "Республикала башҡорт телен өйрәнеү өсөн яңы цифрлы белем биреү ресурсы эшләй башланы.",
        "translation": "В республике заработал новый цифровой образовательный ресурс для изучения башкирского языка.",
        "wrong_variants": {"ba-ru": "В республике закрылся последний курс башкирского языка."},
        "source": {
            "file": "audio/news.mp3",
            "chapter": "Яңылыҡтар · Цифрлы белем биреү",
            "time": "00:16:20",
        },
    },
]


def password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def seed_users(db: Session) -> tuple[int, int]:
    created = 0
    existing = 0
    for user_data in TEST_USERS:
        if db.query(User).filter(User.email == user_data["email"]).first():
            existing += 1
            continue
        badges = list(user_data["badges"])
        user = User(
            **{key: value for key, value in user_data.items() if key != "badges"},
            password_hash=password_hash(TEST_PASSWORD),
            lang_pair="ba-ru",
            badges=badges,
        )
        db.add(user)
        db.flush()
        for badge_type in badges:
            db.add(Badge(user_id=user.id, badge_type=badge_type))
        created += 1
    return created, existing


def load_fragment_data() -> tuple[list[dict[str, Any]], str]:
    if not FRAGMENTS_FILE.exists():
        return DEFAULT_FRAGMENTS, "встроенный набор"
    with FRAGMENTS_FILE.open("r", encoding="utf-8") as file:
        data = json.load(file)
    if isinstance(data, dict):
        data = data.get("fragments")
    if not isinstance(data, list):
        raise ValueError("Файл fragments.json должен содержать список фрагментов.")
    if not all(isinstance(item, dict) for item in data):
        raise ValueError("Каждый фрагмент в fragments.json должен быть объектом.")
    return data, "fragments.json"


def fragment_translations(item: dict[str, Any]) -> list[dict[str, Any]]:
    if "translations" in item:
        translations = []
        for entry in item["translations"]:
            if isinstance(entry, str):
                translations.append({"translation": entry})
            elif isinstance(entry, dict):
                translations.append(entry)
            else:
                raise ValueError("Перевод должен быть строкой или объектом.")
        return translations

    translations = [
        {
            "translation": item.get("translation"),
            "status": "confirmed",
            "confirmed": item.get("confirmed", 5),
        }
    ]
    if item.get("disputed_translation"):
        translations.append(
            {
                "translation": item["disputed_translation"],
                "status": "expert_review",
                "confirmed": 0,
            }
        )
    return translations


def seed_fragments(db: Session) -> tuple[int, int, str] | None:
    if db.query(Fragment.id).first():
        return None

    items, source_name = load_fragment_data()
    translation_count = 0
    for item in items:
        text_ba = str(item.get("text_ba", "")).strip()
        if not text_ba:
            raise ValueError("У каждого фрагмента должно быть непустое поле text_ba.")
        lang_pair = item.get("lang_pair", "ba-ru")
        fragment = Fragment(
            text_ba=text_ba,
            lang_pair=lang_pair,
            source=item.get(
                "source",
                {"file": "fragments.json", "chapter": "Импорт", "time": "00:00:00"},
            ),
            wrong_variants=item.get("wrong_variants", {}),
        )
        db.add(fragment)
        db.flush()
        for translation_data in fragment_translations(item):
            translation_text = str(
                translation_data.get("translation", "")
            ).strip()
            if not translation_text:
                raise ValueError(
                    f"У фрагмента «{text_ba}» отсутствует текст перевода."
                )
            db.add(
                Translation(
                    fragment_id=fragment.id,
                    lang_pair=translation_data.get("lang_pair", lang_pair),
                    translation=translation_text,
                    confirmed=translation_data.get("confirmed", 0),
                    status=translation_data.get("status", "confirmed"),
                )
            )
            translation_count += 1
    return len(items), translation_count, source_name


def seed_answers(db: Session) -> int:
    pairs = (
        db.query(Fragment, Translation)
        .join(Translation, Translation.fragment_id == Fragment.id)
        .filter(Translation.lang_pair == "ba-ru", Translation.status == "confirmed")
        .order_by(Fragment.id, Translation.id)
        .all()
    )
    answer_flags = {
        "aigul@example.com": [True, True, False],
        "timur@example.com": [True, False, True],
        "liliya@example.com": [True, True, True],
    }
    created = 0
    for email, flags in answer_flags.items():
        user = db.query(User).filter(User.email == email).first()
        if user is None:
            continue
        existing_answers = db.query(Answer).filter(Answer.user_id == user.id).all()
        answered_fragments = {answer.fragment_id for answer in existing_answers}
        answers_count = len(existing_answers)
        for fragment, translation in pairs:
            if answers_count >= 3:
                break
            if fragment.id in answered_fragments:
                continue
            is_correct = flags[answers_count % 3]
            db.add(
                Answer(
                    user_id=user.id,
                    fragment_id=fragment.id,
                    translation_id=translation.id,
                    translation_text=translation.translation,
                    is_correct=is_correct,
                    points_earned=10 if is_correct else 15,
                )
            )
            answered_fragments.add(fragment.id)
            answers_count += 1
            created += 1
    return created


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created_users, existing_users = seed_users(db)
        fragment_result = seed_fragments(db)
        created_answers = seed_answers(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    backend = "SQLite" if DATABASE_URL.startswith("sqlite") else "PostgreSQL"
    print(f"База данных: {backend}")
    print(f"Пользователи: добавлено {created_users}, уже существовали {existing_users}.")
    if fragment_result is None:
        print("Фрагменты уже есть в базе, повторное добавление пропущено.")
    else:
        fragments_count, translations_count, source_name = fragment_result
        print(
            f"Фрагменты: добавлено {fragments_count}, переводов {translations_count} "
            f"({source_name})."
        )
    print(f"Тестовые ответы: добавлено {created_answers}.")
    print(f"Пароль тестовых пользователей: {TEST_PASSWORD}")


if __name__ == "__main__":
    main()
