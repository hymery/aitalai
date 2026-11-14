import argparse
import csv
import json
import os
import random
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from database import Base, DATABASE_URL, SessionLocal, engine
from models import Fragment, Translation
from seed import seed_fragments, seed_users


DATASET = "bashkorttele/trilingual-parallel-phrasebook"
SOURCE_FILE = f"huggingface.co/{DATASET}"
ROWS_ENDPOINT = "https://datasets-server.huggingface.co/rows"
PAGE_SIZE = 100
MAX_PAIRS = 1000
SOURCE = {
    "file": SOURCE_FILE,
    "chapter": "Трёхъязычный разговорник",
    "time": "00:00:00",
    "dataset": DATASET,
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


def clean_text(value: Any) -> str:
    if value is None or isinstance(value, (dict, list, tuple)):
        return ""
    return " ".join(str(value).split())


def pair_key(text_ba: str, text_ru: str) -> tuple[str, str]:
    return text_ba.casefold(), text_ru.casefold()


def is_quality_pair(text_ba: str, text_ru: str) -> bool:
    if not text_ba or not text_ru or text_ba.casefold() == text_ru.casefold():
        return False
    if len(text_ba) > 1000 or len(text_ru) > 1000:
        return False
    if not any(char.isalpha() for char in text_ba):
        return False
    if not any(char.isalpha() for char in text_ru):
        return False
    return not any(
        ord(char) < 32 or ord(char) == 127
        for char in f"{text_ba}\n{text_ru}"
        if char != "\n"
    )


def request_json(url: str) -> dict[str, Any]:
    headers = {
        "Accept": "application/json",
        "User-Agent": "BashkirSchoolImporter/2.0",
    }
    if os.getenv("HF_TOKEN"):
        headers["Authorization"] = f"Bearer {os.environ['HF_TOKEN']}"
    request = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=45) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        if exc.code in {401, 403}:
            raise RuntimeError(
                f"Hugging Face отклонил доступ к {DATASET}. Задайте действующий "
                f"HF_TOKEN с доступом к датасету. Ответ API: {body}"
            ) from None
        raise RuntimeError(f"Hugging Face вернул HTTP {exc.code}: {body}") from None
    except urllib.error.URLError as exc:
        raise RuntimeError(
            f"Не удалось подключиться к Hugging Face Datasets Server: {exc.reason}"
        ) from None


def rows_url(offset: int) -> str:
    query = urllib.parse.urlencode(
        {
            "dataset": DATASET,
            "config": "default",
            "split": "train",
            "offset": offset,
            "length": PAGE_SIZE,
        }
    )
    return f"{ROWS_ENDPOINT}?{query}"


def fetch_rows(limit: int = MAX_PAIRS) -> tuple[list[dict[str, Any]], dict[str, str | None]]:
    """Загружает страницы до limit качественных уникальных пар или конца датасета."""
    selected: list[dict[str, Any]] = []
    detected: dict[str, str | None] = {"ba": None, "ru": None, "en": None}
    seen: set[tuple[str, str]] = set()
    offset = 0
    total_rows: int | None = None

    while len(selected) < limit:
        payload = request_json(rows_url(offset))
        entries = payload.get("rows")
        if not isinstance(entries, list) or not entries:
            if offset == 0:
                raise RuntimeError("Datasets Server не вернул строки датасета.")
            break

        raw_rows = [entry.get("row", entry) for entry in entries]
        if offset == 0:
            columns = list(raw_rows[0])
            detected = {
                language: detect_column(columns, language)
                for language in ("ba", "ru", "en")
            }
            if not detected["ba"] or not detected["ru"]:
                raise RuntimeError(
                    "Не удалось автоматически найти башкирский и русский столбцы. "
                    f"Доступные поля: {', '.join(columns)}"
                )
            total_rows = payload.get("num_rows_total")

        for row in raw_rows:
            text_ba = clean_text(row.get(detected["ba"]))
            text_ru = clean_text(row.get(detected["ru"]))
            if not is_quality_pair(text_ba, text_ru):
                continue
            key = pair_key(text_ba, text_ru)
            if key in seen:
                continue
            seen.add(key)
            selected.append(row)
            if len(selected) >= limit:
                break

        offset += len(entries)
        print(f"Проверено строк: {offset}; отобрано качественных пар: {len(selected)}.")
        if total_rows is not None and offset >= total_rows:
            break

    if not selected:
        raise RuntimeError("В датасете не найдено качественных башкирско-русских пар.")
    return selected, detected


def read_local_rows(
    input_path: str, limit: int = MAX_PAIRS
) -> tuple[list[dict[str, Any]], dict[str, str | None]]:
    """Читает CSV, JSON или JSONL, расположенный внутри backend."""
    base_dir = Path(__file__).resolve().parent
    path = Path(input_path)
    path = (base_dir / path).resolve() if not path.is_absolute() else path.resolve()
    if base_dir not in path.parents:
        raise RuntimeError("Локальный файл должен находиться внутри папки backend.")
    if not path.is_file():
        raise RuntimeError(f"Файл не найден: {path.name}. Поместите его в папку backend.")

    suffix = path.suffix.casefold()
    if suffix == ".csv":
        with path.open("r", encoding="utf-8-sig", newline="") as file:
            payload: Any = list(csv.DictReader(file))
    elif suffix == ".json":
        with path.open("r", encoding="utf-8-sig") as file:
            payload = json.load(file)
    elif suffix == ".jsonl":
        with path.open("r", encoding="utf-8-sig") as file:
            payload = [json.loads(line) for line in file if line.strip()]
    else:
        raise RuntimeError("Поддерживаются только файлы CSV, JSON и JSONL.")

    if isinstance(payload, dict):
        payload = payload.get("rows", payload.get("data"))
    if not isinstance(payload, list) or not payload:
        raise RuntimeError("Файл должен содержать непустой список строк датасета.")
    raw_rows = [entry.get("row", entry) for entry in payload]
    if not all(isinstance(row, dict) for row in raw_rows):
        raise RuntimeError("Каждая строка локального датасета должна быть объектом.")

    columns = list(raw_rows[0])
    detected = {
        language: detect_column(columns, language) for language in ("ba", "ru", "en")
    }
    if not detected["ba"] or not detected["ru"]:
        raise RuntimeError(
            "Не удалось автоматически найти башкирский и русский столбцы. "
            f"Доступные поля: {', '.join(columns)}"
        )

    selected = []
    seen: set[tuple[str, str]] = set()
    for row in raw_rows:
        text_ba = clean_text(row.get(detected["ba"]))
        text_ru = clean_text(row.get(detected["ru"]))
        if not is_quality_pair(text_ba, text_ru):
            continue
        key = pair_key(text_ba, text_ru)
        if key in seen:
            continue
        seen.add(key)
        selected.append(row)
        if len(selected) >= limit:
            break
    if not selected:
        raise RuntimeError("В локальном файле не найдено качественных пар.")
    print(
        f"Локальный файл: {path.name}; проверено строк: {len(raw_rows)}; "
        f"отобрано качественных пар: {len(selected)}."
    )
    return selected, detected


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
    limit: int = MAX_PAIRS,
) -> tuple[int, int, int, int]:
    created_fragments = 0
    existing_fragments = 0
    created_translations = 0
    skipped_duplicates = 0
    fragments_by_text: dict[str, Fragment] = {}
    for fragment in db.query(Fragment).order_by(Fragment.id).all():
        fragments_by_text.setdefault(" ".join(fragment.text_ba.split()).casefold(), fragment)

    for row_index, row in enumerate(rows):
        if created_fragments >= limit:
            break
        text_ba = clean_text(row.get(columns["ba"]))
        text_ru = clean_text(row.get(columns["ru"]))
        text_en = clean_text(row.get(columns["en"])) if columns["en"] else ""
        if not is_quality_pair(text_ba, text_ru):
            continue

        fragment = fragments_by_text.get(text_ba.casefold())
        if fragment is None:
            wrong_variants = {"ba-ru": shuffled_words(text_ru, row_index)}
            if text_en:
                wrong_variants["ba-en"] = shuffled_words(text_en, row_index + 1000)
            fragment = Fragment(
                text_ba=text_ba,
                lang_pair="ba-ru",
                source=dict(SOURCE),
                wrong_variants=wrong_variants,
            )
            db.add(fragment)
            db.flush()
            fragments_by_text[text_ba.casefold()] = fragment
            created_fragments += 1
        else:
            existing_fragments += 1
            if (fragment.source or {}).get("file") == SOURCE_FILE:
                skipped_duplicates += 1

        if ensure_translation(db, fragment, "ba-ru", text_ru):
            created_translations += 1
        if text_en and ensure_translation(db, fragment, "ba-en", text_en):
            created_translations += 1

    return created_fragments, existing_fragments, created_translations, skipped_duplicates


def main(input_path: str | None = None) -> None:
    rows, columns = read_local_rows(input_path) if input_path else fetch_rows()
    print(
        "Поля датасета: "
        f"башкирский={columns['ba']}, русский={columns['ru']}, "
        f"английский={columns['en'] or 'не найден'}."
    )
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        created_users, existing_users = seed_users(db)
        fragment_result = seed_fragments(db)
        created, existing, translations, duplicates = import_rows(db, rows, columns)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    backend = "SQLite" if DATABASE_URL.startswith("sqlite") else "PostgreSQL"
    print(f"База данных: {backend}.")
    print(f"Тестовые пользователи: добавлено {created_users}, сохранено {existing_users}.")
    if fragment_result is None:
        print("Стартовые 15 фрагментов сохранены.")
    else:
        print(f"Стартовые фрагменты: добавлено {fragment_result[0]}.")
    print(
        f"Импорт завершён: новых фрагментов {created}, совпадений {existing}, "
        f"повторов из источника {duplicates}, новых переводов {translations}. "
        f"Лимит новых пар из источника: {MAX_PAIRS}."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Импорт башкирско-русских пар.")
    parser.add_argument(
        "--input",
        help="CSV, JSON или JSONL внутри backend; без параметра используется Hugging Face API.",
    )
    args = parser.parse_args()
    main(input_path=args.input)
