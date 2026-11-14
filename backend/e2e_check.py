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
    preflight = urllib.request.Request(
        BASE_URL + "/fragments/search?q=test",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
        method="OPTIONS",
    )
    with urllib.request.urlopen(preflight, timeout=10) as response:
        assert response.status == 200
        assert response.headers.get("Access-Control-Allow-Origin") == "*"
    print("OK: health и CORS preflight для поиска по словарю")

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

    directory = request("GET", "/schools?q=" + urllib.parse.quote("Уфа 12") + "&city=" + urllib.parse.quote("Уфа"))
    assert directory["total"] >= 1 and directory["items"][0]["city"] == "Уфа"
    school_id = directory["items"][0]["id"]
    registered = request("POST", "/auth/register", body={
        "email": "e2e.student@example.com",
        "password": "1234",
        "full_name": "Сквозной Тест",
        "school_id": school_id,
        "school": directory["items"][0]["name"],
        "class_name": "7А",
        "lang_pair": "ba-ru",
        "role": "student",
    }, expected=201)
    assert registered["user"]["school_id"] == school_id
    student = registered["access_token"]
    updated = request("PATCH", "/auth/me", token=student, body={
        "school_id": "rb-municipal-001", "school": SCHOOL, "class_name": "8Б",
    })
    assert updated["school_id"] == "rb-municipal-001" and updated["class_name"] == "8Б"
    restored = request("GET", "/auth/me", token=student)
    assert restored["school"] == SCHOOL and restored["school_id"] == "rb-municipal-001"
    request("PATCH", "/auth/me", token=student, body={"school_id": "unknown"}, expected=400)
    top = request("GET", "/ratings/top?period=all")
    assert next(item for item in top if item["user_id"] == restored["id"])["school_id"] == "rb-municipal-001"
    print("OK: справочник школ, серверный PATCH профиля и school_id в рейтинге")
    request("POST", "/auth/register", body={
        "email": "e2e.student@example.com",
        "password": "1234",
        "full_name": "Дубликат",
        "lang_pair": "ba-ru",
    }, expected=409)
    units = request("GET", "/courses/units", token=student)
    assert len(units) == 3 and units[0]["unlocked"] and not units[1]["unlocked"]
    expected_points = {"circle_1": 20, "circle_2": 40, "circle_3": 60, "boss_story": 100}
    first = None
    for unit_index, unit in enumerate(units):
        detail = request("GET", f"/courses/units/{unit['id']}", token=student)
        assert len(detail["circle_1"]["cards"]) == 8
        assert len(detail["circle_1"]["quiz"]) == 8
        assert len(detail["circle_2"]["build_sentence"]) == 5
        assert len(detail["circle_3"]["fill_blanks"]) == 4
        assert len(detail["circle_3"]["match_pairs"]["correct_answer"]) == 8
        assert len(detail["boss_story"]["steps"]) == 4
        for circle, points in expected_points.items():
            result = request("POST", f"/courses/units/{unit['id']}/complete", token=student, body={
                "circle": circle, "score": 100,
            })
            assert result["awarded_xp"] == points and result["already_completed"] is False
            if first is None:
                first = result
        if unit_index < 2:
            assert result["next_unit_unlocked"] is True
    repeat = request("POST", f"/courses/units/{units[0]['id']}/complete", token=student, body={
        "circle": "circle_1", "score": 100,
    })
    assert repeat["awarded_xp"] == 0 and repeat["already_completed"] is True
    final_units = request("GET", "/courses/units", token=student)
    assert all(unit["progress"]["boss_story"]["completed"] for unit in final_units)
    print("OK: регистрация, три курса, все этапы, 660 очков и запрет повторного начисления")

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
    print("OK: ежедневные задания, answer.points_earned, +10/+15 очков и points")

    my_answers = request("GET", "/answers/me?format=json", token=student)
    assert len(my_answers) == 2
    assert any(row["text_ba"] == daily2["text_ba"] and row["translation"] == corrected_text for row in my_answers)
    my_csv, my_csv_type = request("GET", "/answers/me?format=csv", token=student, raw=True)
    assert "text/csv" in my_csv_type and "text_ba" in my_csv and corrected_text in my_csv
    request("GET", "/answers/me?format=json", expected=401)
    print("OK: авторизованный экспорт собственных ответов JSON и CSV")

    found = request("GET", f"/fragments/search?{urllib.parse.urlencode({'q': daily['text_ba'], 'limit': 20})}", token=student)
    assert any(row["fragment_id"] == daily["fragment_id"] for row in found)
    proposal = request("POST", "/fragments/propose", token=student, body={
        "text_ba": "Һаумы, дуҫым",
        "translation": "Здравствуй, друг",
        "lang_pair": "ba-ru",
    }, expected=201)
    assert proposal["awarded_xp"] == 20
    proposed = request("GET", f"/fragments/search?{urllib.parse.urlencode({'q': 'Һаумы, дуҫым', 'limit': 20})}", token=student)
    assert any(row["fragment_id"] == proposal["fragment_id"] and row["status"] == "pending" for row in proposed)
    request("POST", "/fragments/propose", token=student, body={
        "text_ba": "Һаумы, дуҫым",
        "translation": "Здравствуй, друг",
        "lang_pair": "ba-ru",
    }, expected=409)
    request("POST", "/fragments/propose", token=student, body={
        "text_ba": "https://spam.example",
        "translation": "Ссылка",
        "lang_pair": "ba-ru",
    }, expected=422)
    print("OK: поиск по fragments, новая пара +20 очков, дубликат 409 и спам 422")

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
