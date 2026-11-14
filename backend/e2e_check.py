"""Сквозная HTTP-проверка MVP против временно запущенного backend."""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.parse
import urllib.request

BASE_URL = os.getenv("AITALAI_TEST_URL", "http://127.0.0.1:8765").rstrip("/")
SCHOOL = "МАОУ «БЛИ № 3» г. Стерлитамак"


def request(method, path, token=None, body=None, expected=200, raw=False):
    headers = {"Accept": "application/json"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(BASE_URL + path, data=data, headers=headers, method=method)
    try:
        response = urllib.request.urlopen(req, timeout=10)
        status = response.status
        payload = response.read()
        content_type = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        status = error.code
        payload = error.read()
        content_type = error.headers.get("Content-Type", "")
    assert status == expected, f"{method} {path}: ожидался {expected}, получен {status}: {payload[:500]!r}"
    if raw:
        return payload.decode("utf-8-sig"), content_type
    if not payload:
        return None
    if "json" in content_type:
        return json.loads(payload)
    return payload.decode("utf-8")


def login(email):
    result = request("POST", "/auth/login", body={"email": email, "password": "1234"})
    assert result["token_type"] == "bearer" and result["access_token"]
    me = request("GET", "/auth/me", token=result["access_token"])
    assert me["email"] == email
    return result["access_token"], me


def main():
    health = request("GET", "/health")
    assert health["status"] == "работает"

    accounts = {}
    expected_roles = {
        "aigul@example.com": "student",
        "timur@example.com": "student",
        "liliya@example.com": "student",
        "teacher@example.com": "teacher",
        "admin@example.com": "admin",
    }
    for email, role in expected_roles.items():
        token, me = login(email)
        assert me["role"] == role
        accounts[email] = token
    print("OK: вход пяти seed-аккаунтов, JWT и /auth/me")

    registered = request("POST", "/auth/register", body={
        "email": "e2e.student@example.com",
        "password": "1234",
        "full_name": "Сквозной Тест",
        "school": SCHOOL,
        "class_name": "7А",
        "lang_pair": "ba-ru",
        "role": "student",
    }, expected=201)
    student = registered["access_token"]
    request("POST", "/auth/register", body={
        "email": "e2e.student@example.com",
        "password": "1234",
        "full_name": "Дубликат",
        "lang_pair": "ba-ru",
    }, expected=409)
    assert request("GET", "/course/progress", token=student) == []
    first = request("POST", "/course/complete", token=student, body={
        "unit_id": 1, "lesson_id": 1, "lesson_type": "flashcards",
    })
    assert first["awarded_xp"] == 10 and first["already_completed"] is False
    repeat = request("POST", "/course/complete", token=student, body={
        "unit_id": 1, "lesson_id": 1, "lesson_type": "flashcards",
    })
    assert repeat["awarded_xp"] == 0 and repeat["already_completed"] is True
    assert repeat["points"] == first["points"]
    practice = request("POST", "/course/complete", token=student, body={
        "unit_id": 1, "lesson_id": 2, "lesson_type": "practice",
    })
    boss = request("POST", "/course/complete", token=student, body={
        "unit_id": 1, "lesson_id": 99, "lesson_type": "boss",
    })
    assert practice["awarded_xp"] == 30 and boss["awarded_xp"] == 100
    assert len(request("GET", "/course/progress", token=student)) == 3
    print("OK: регистрация, конфликт email, прогресс и однократные 10/30/100 XP")

    daily = request("GET", "/tasks/daily", token=student)
    assert daily["fragment_id"] and daily["translation_id"]
    before = request("GET", "/auth/me", token=student)["points"]
    confirmed = request("POST", "/tasks/submit", token=student, body={
        "fragment_id": daily["fragment_id"],
        "translation": daily["translation"],
        "is_correct": True,
    })
    assert confirmed["answer"]["points_earned"] == 10
    assert confirmed["points"] == before + 10
    daily2 = request("GET", "/tasks/daily", token=student)
    corrected_text = "Исправленный перевод для сквозной проверки"
    corrected = request("POST", "/tasks/submit", token=student, body={
        "fragment_id": daily2["fragment_id"],
        "translation": corrected_text,
        "is_correct": False,
    })
    assert corrected["answer"]["points_earned"] == 15
    assert corrected["points"] == before + 25
    assert isinstance(corrected["badges"], list) and corrected["consensus_status"]
    print("OK: ежедневные задания, answer.points_earned, +10/+15 XP и points")

    categories = ["top", "schools", "classes", "accuracy", "vocabulary", "corrections"]
    periods = ["day", "week", "month", "year", "all"]
    for category in categories:
        for period in periods:
            rows = request("GET", f"/ratings/{category}?period={period}", token=student)
            assert isinstance(rows, list)
            if category == "vocabulary":
                assert all("unique_translations" in row for row in rows)
            if category == "classes":
                assert all("class_name" in row for row in rows)
    request("GET", "/ratings/top?period=unknown", token=student, expected=422)
    print("OK: 6 рейтингов × 5 периодов и контракты class_name/unique_translations")

    query = urllib.parse.urlencode({"school": SCHOOL, "class_name": "7А"})
    report = request("GET", f"/teacher/class-report?{query}", token=accounts["teacher@example.com"])
    assert report["class_name"] == "7А" and report["total_students"] >= 1
    request("GET", f"/teacher/class-report?{query}", token=student, expected=403)
    print("OK: отчёт учителя и запрет доступа ученику")

    request("GET", "/moderation/disputed", token=student, expected=403)
    fragment_id = daily2["fragment_id"]
    for index in range(5):
        request("POST", "/tasks/submit", token=student, body={
            "fragment_id": fragment_id,
            "translation": f"Спорный вариант перевода {index}",
            "is_correct": False,
        })
    disputed = request("GET", "/moderation/disputed", token=accounts["admin@example.com"])
    assert disputed, "После пяти разногласий должен появиться перевод на модерации"
    target = disputed[0]
    resolved = request("POST", "/moderation/resolve", token=accounts["admin@example.com"], body={
        "translation_id": target["translation_id"],
        "final_translation": "Подтверждённый экспертом перевод",
        "approved": False,
    })
    assert resolved["translation"]["status"] == "confirmed"
    print("OK: запрет модерации ученику, спорные переводы и решение администратора")

    exported = request("GET", "/translations/export?format=json", token=accounts["admin@example.com"])
    assert any(row["translation"] == "Подтверждённый экспертом перевод" for row in exported)
    csv_text, content_type = request(
        "GET", "/translations/export?format=csv", token=accounts["admin@example.com"], raw=True
    )
    assert "text/csv" in content_type and "text_ba" in csv_text
    assert "Подтверждённый экспертом перевод" in csv_text
    print("OK: экспорт подтверждённых переводов JSON и CSV")

    state = request("POST", "/bot/state", body={
        "telegram_id": 987654321,
        "state": "registered",
        "data": {"token": "e2e-token"},
    })
    restored = request("GET", "/bot/state/987654321")
    assert restored["data"]["token"] == "e2e-token" and state["telegram_id"] == restored["telegram_id"]
    print("OK: сохранение и восстановление состояния Telegram-бота")
    print("ВСЕ СКВОЗНЫЕ HTTP-ПРОВЕРКИ ПРОЙДЕНЫ")


if __name__ == "__main__":
    main()
