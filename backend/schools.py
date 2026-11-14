"""Поиск по локальному снимку справочника школ Республики Башкортостан."""
from __future__ import annotations

import json
import re
import unicodedata
from pathlib import Path

DIRECTORY_FILE = Path(__file__).resolve().with_name("schools_rb.json")
DATA = json.loads(DIRECTORY_FILE.read_text(encoding="utf-8"))
SCHOOLS = DATA["schools"]
METADATA = DATA["metadata"]
BY_ID = {item["id"]: item for item in SCHOOLS}


def normalize(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", str(value or "")).casefold()
    text = text.replace("ё", "е").replace("n ", "№ ")
    text = re.sub(r"[«»„“”\"'‘’]", "", text)
    text = re.sub(r"№\s*", "№", text)
    return " ".join(text.split())


def get_school(school_id: str | None):
    return BY_ID.get(str(school_id or ""))


def find_school(name: str | None):
    key = normalize(name)
    if not key:
        return None
    return next((item for item in SCHOOLS if key in {normalize(item["name"]), normalize(item["short_name"])}), None)


def search_schools(q: str = "", city: str = "", district: str = "", limit: int = 20, offset: int = 0):
    query = normalize(q)
    city_key = normalize(city)
    district_key = normalize(district)
    rows = []
    for item in SCHOOLS:
        if city_key and normalize(item["city"]) != city_key:
            continue
        if district_key and normalize(item["district"]) != district_key:
            continue
        haystack = normalize(" ".join(str(item.get(key, "")) for key in ("name", "short_name", "city", "district")))
        if query and not all(token in haystack for token in query.split()):
            continue
        rows.append(item)
    rows.sort(key=lambda item: (normalize(item["short_name"]), item["id"]))
    return {
        "items": rows[offset:offset + limit],
        "total": len(rows),
        "offset": offset,
        "limit": limit,
        "metadata": METADATA,
    }
