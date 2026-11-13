import json
import os
import random
import re
import urllib.error
import urllib.request
from typing import Any

from sqlalchemy.orm import Session

from database import Base, SessionLocal, engine
from models import Fragment, Translation


DATASET = "bashkorttele/trilingual-parallel-expressionbook"
SOURCE_FILE = "huggingface.co/bashkorttele/trilingual-parallel-expressionbook"
ROWS_URL = (
    "https://datasets-server.huggingface.co/rows"
    "?dataset=bashkorttele%2Ftrilingual-parallel-expressionbook"
    "&config=default&split=train&offset=0&length=100"
)
SOURCE = {
    "file": SOURCE_FILE,
    "chapter": "Разговорник",
    "time": "00:00:00",
}

ALIASES = {
    "ba": {
        "ba",
        "bak",
        "bashkir",
        "bashkort",
        "bashkir_text",
        "text_ba",
        "ba_text",
        "башҡортса",
        "башкирский",
    },
    "ru": {
        "ru",
        "rus",
        "russian",
        "russian_text",
        "text_ru",
        "ru_text",
        "русский",
    },
    "en": {
        "en",
        "eng",
        "english",
        "english_text",
        "text_en",
        "en_text",
        "английский",
    },
}


def normalize_column(name: str) -> str:
    return re.sub(r"[^a-zа-я0-9]+", "_", name.casefold()).strip("_")


def detect_column(columns: list[str], language: str) -> str | None:
    normalized = {column: normalize_column(column) for column in columns}
    for column, normalized_name in normalized.items():
        if normalized_name in ALIASES[language]:
            return column

    tokens = {
        "ba": ("bashkir", "bashkort", "башҡорт", "башкир"),
        "ru": ("russian", "русск"),
        "en": ("english", "английск"),
    }[language]
    for column, normalized_name in normalized.items():
        if any(token in normalized_name for token in tokens):
            return column
    return None


def fetch_rows() -> tuple[list[dict[str, Any]], dict[str, str | None]]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "BashkirSchoolImporter/1.0",
    }
    if os.getenv("HF_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['HF_TOKEN']}"
    request = urllib.request.Request(ROWS_URL, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code in {401, 403}:
            raise RuntimeError(
                "Hugging Face отклонил доступ к датасету. Проверьте, что он публичен, "
                "или задайте действующий токен в переменной окружения HF_TOKEN. "
                f"Ответ API: {body}"
            ) from None
        raise RuntimeError(
            f"Hugging Face вернул HTTP {exc.code}: {body}"
        ) from None
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Не удалось подключиться к Hugging Face Datasets Server: {exc.reason}"
        ) from None

    entries = payload.get("rows")
    if not isinstance(entries, list) or not entries:
        raise RuntimeError("Datasets Server не вернул строки датасета.")
    rows = [entry.get("row", entry) for entry in entries[:60]]
    columns = list(rows[0])
    detected = {
        language: detect_column(columns, language) for language in ("ba", "ru", "en")
    }
    if not detected["ba"] or not detected["ru"]:
        raise RuntimeError(
            "Не удалось автоматически найти башкирский и русский столбцы. "
            f"Доступные поля: {', '.join(columns)}"
        )
    return rows, detected


def shuffled_words(text: str, seed: int) -> str:
    words = text.split()
    if len(words) < 2:
        return text
    generator = random.Random(seed)
    shuffled = words[:]
    for _ in range(10):
        generator.shuffle(shuffled)
        if shuffled != words:
            break
    return " ".join(shuffled)


def find_source_fragment(db: Session, text_ba: str) -> Fragment | None:
    candidates = db.query(Fragment).filter(Fragment.text_ba == text_ba).all()
    return next(
        (
            fragment
            for fragment in candidates
            if (fragment.source or {}).get("file") == SOURCE_FILE
        ),
        None,
    )


def ensure_translation(
    db: Session,
    fragment: Fragment,
    lang_pair: str,
    text: str,
) -> bool:
    existing = (
        db.query(Translation)
        .filter(
            Translation.fragment_id == fragment.id,
            Translation.lang_pair == lang_pair,
            Translation.translation == text,
        )
        .first()
    )
    if existing:
        return False
    db.add(
        Translation(
            fragment_id=fragment.id,
            lang_pair=lang_pair,
            translation=text,
            confirmed=1,
            status="confirmed",
        )
    )
    return True


def import_rows(
    db: Session,
    rows: list[dict[str, Any]],
    columns: dict[str, str | None],
) -> tuple[int, int, int]:
    created_fragments = 0
    existing_fragments = 0
    created_translations = 0

    for row_index, row in enumerate(rows):
        text_ba = str(row.get(columns["ba"], "")).strip()
        text_ru = str(row.get(columns["ru"], "")).strip()
        text_en = (
            str(row.get(columns["en"], "")).strip() if columns["en"] else ""
        )
        if not text_ba or not text_ru:
            print(f"Строка {row_index}: пропущена из-за пустого башкирского или русского текста.")
            continue

        fragment = find_source_fragment(db, text_ba)
        if fragment is None:
            wrong_variants = {
                "ba-ru": shuffled_words(text_ru, row_index),
            }
            if text_en:
                wrong_variants["ba-en"] = shuffled_words(text_en, row_index + 1000)
            fragment = Fragment(
                text_ba=text_ba,
                lang_pair="ba-ru",
                source=SOURCE,
                wrong_variants=wrong_variants,
            )
            db.add(fragment)
            db.flush()
            created_fragments += 1
        else:
            existing_fragments += 1

        if ensure_translation(db, fragment, "ba-ru", text_ru):
            created_translations += 1
        if text_en and ensure_translation(db, fragment, "ba-en", text_en):
            created_translations += 1

    return created_fragments, existing_fragments, created_translations


def main() -> None:
    rows, columns = fetch_rows()
    print(
        "Поля датасета: "
        f"башкирский={columns['ba']}, русский={columns['ru']}, "
        f"английский={columns['en'] or 'не найден'}."
    )
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created, existing, translations = import_rows(db, rows, columns)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
    print(
        f"Импорт завершён: новых фрагментов {created}, уже существовали {existing}, "
        f"новых переводов {translations}."
    )


if __name__ == "__main__":
    main()
