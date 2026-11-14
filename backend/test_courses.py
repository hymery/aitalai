import unittest
from pathlib import Path

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from build_courses import UNITS_CONFIG, build_unit, load_fragment_pairs
from database import Base
from main import (
    app,
    class_report,
    complete_course_circle,
    daily_task,
    disputed_translations,
    export_translations,
    get_course_unit_detail,
    list_course_units,
    propose_fragment,
    search_fragments,
    rating_accuracy,
    rating_classes,
    rating_corrections,
    rating_schools,
    rating_top,
    rating_vocabulary,
    require_expert,
    require_teacher,
    resolve_translation,
    submit_answer,
)
from models import User, UserUnitProgress
from schemas import (
    AnswerCreate,
    CourseCircleComplete,
    CourseCircleCompleteResponse,
    CourseUnitDetailResponse,
    CourseUnitSummary,
    FragmentProposal,
    ModerationResolve,
)
from seed import seed_answers, seed_fragments, seed_users


TEST_DB_PATH = Path(__file__).resolve().with_name("test_courses.db")


class CoursesApiTestCase(unittest.TestCase):
    def setUp(self):
        TEST_DB_PATH.unlink(missing_ok=True)
        self.engine = create_engine(
            "sqlite:///./test_courses.db",
            connect_args={"check_same_thread": False},
        )
        self.Session = sessionmaker(
            bind=self.engine, autoflush=False, autocommit=False, expire_on_commit=False
        )
        Base.metadata.create_all(bind=self.engine)
        self.db = self.Session()
        seed_users(self.db)
        seed_fragments(self.db)
        seed_answers(self.db)
        pairs = load_fragment_pairs(self.db)
        for config in UNITS_CONFIG:
            build_unit(self.db, config, pairs)
        student = User(
            email="courses.student@example.com",
            full_name="Тестовый Ученик Курсов",
            role="student",
            school="МАОУ «БЛИ № 3» г. Стерлитамак",
            class_name="7А",
            lang_pair="ba-ru",
            points=0,
            level=1,
            streak_days=0,
            badges=[],
        )
        self.db.add(student)
        self.db.commit()
        self.student = student
        self.teacher = (
            self.db.query(User).filter(User.email == "teacher@example.com").one()
        )
        self.admin = self.db.query(User).filter(User.email == "admin@example.com").one()

    def tearDown(self):
        self.db.close()
        self.engine.dispose()
        TEST_DB_PATH.unlink(missing_ok=True)

    def test_routes_and_all_three_course_structures(self):
        routes = set()

        def collect_routes(router):
            for route in router.routes:
                if path := getattr(route, "path", None):
                    routes.add(path)
                if nested_router := getattr(route, "original_router", None):
                    collect_routes(nested_router)

        collect_routes(app)
        expected_routes = {
            "/schools",
            "/answers/me",
            "/api/tts",
            "/courses/units",
            "/courses/units/{unit_id}",
            "/courses/units/{unit_id}/complete",
            "/tasks/daily",
            "/tasks/submit",
            "/teacher/class-report",
            "/moderation/disputed",
            "/moderation/resolve",
            "/translations/export",
        }
        self.assertTrue(expected_routes.issubset(routes))

        units = list_course_units(db=self.db, user=self.student)
        self.assertEqual(len(units), 3)
        for unit in units:
            CourseUnitSummary.model_validate(unit)
            self.assertEqual(unit["vocabulary_count"], 8)
        self.assertTrue(units[0]["unlocked"])
        self.assertTrue(units[0]["progress"]["circle_1"]["unlocked"])
        self.assertFalse(units[1]["unlocked"])
        self.assertEqual(units[1]["progress"]["current_circle"], "locked")

        for unit in units:
            detail = get_course_unit_detail(unit["id"], db=self.db, user=self.student)
            CourseUnitDetailResponse.model_validate(detail)
            cards = detail["circle_1"]["cards"]
            quiz = detail["circle_1"]["quiz"]
            self.assertEqual(len(cards), 8)
            self.assertEqual(len(quiz), 8)
            self.assertEqual(
                {question["direction"] for question in quiz},
                {"ba_to_ru", "ru_to_ba"},
            )
            for question in quiz:
                self.assertEqual(len(question["options"]), 4)
                self.assertEqual(len(set(question["options"])), 4)
                self.assertIn(question["correct_answer"], question["options"])

            sentences = detail["circle_2"]["build_sentence"]
            self.assertEqual(len(sentences), 5)
            for exercise in sentences:
                self.assertGreaterEqual(len(exercise["tokens"]), 3)
                self.assertLessEqual(len(exercise["tokens"]), 6)
                self.assertTrue(exercise["hints"])
                self.assertTrue(exercise["distractors"])
            self.assertEqual(len(detail["circle_3"]["fill_blanks"]), 4)
            self.assertEqual(
                len(detail["circle_3"]["match_pairs"]["correct_answer"]), 8
            )
            steps = detail["boss_story"]["steps"]
            self.assertEqual(len(steps), 4)
            for step in steps:
                self.assertEqual(len(step["options"]), 3)
                self.assertEqual(
                    sum(option["is_correct"] for option in step["options"]), 1
                )

        akbuzat = get_course_unit_detail(units[2]["id"], db=self.db, user=self.student)
        self.assertIn("Аҡбуҙат", akbuzat["character_name"])
        self.assertIn("Аҡбуҙат", akbuzat["title"])
        self.assertEqual(
            {step["character_name"] for step in akbuzat["boss_story"]["steps"]},
            {"крылатый конь Аҡбуҙат"},
        )
        with self.assertRaises(HTTPException) as missing:
            get_course_unit_detail(9999, db=self.db, user=self.student)
        self.assertEqual(missing.exception.status_code, 404)

    def test_complete_all_circles_unlocks_courses_and_awards_xp_once(self):
        units = list_course_units(db=self.db, user=self.student)
        payload = CourseCircleComplete(circle="circle_2", score=100)
        with self.assertRaises(HTTPException) as locked_circle:
            complete_course_circle(units[0]["id"], payload, db=self.db, user=self.student)
        self.assertEqual(locked_circle.exception.status_code, 409)
        with self.assertRaises(HTTPException) as locked_unit:
            complete_course_circle(
                units[1]["id"],
                CourseCircleComplete(circle="circle_1", score=100),
                db=self.db,
                user=self.student,
            )
        self.assertEqual(locked_unit.exception.status_code, 409)

        expected_xp = {"circle_1": 20, "circle_2": 40, "circle_3": 60, "boss_story": 100}
        for unit_index, unit in enumerate(units):
            for circle, xp in expected_xp.items():
                before = self.student.points
                result = complete_course_circle(
                    unit["id"],
                    CourseCircleComplete(circle=circle, score=100),
                    db=self.db,
                    user=self.student,
                )
                CourseCircleCompleteResponse.model_validate(result)
                self.assertFalse(result["already_completed"])
                self.assertEqual(result["awarded_xp"], xp)
                self.assertEqual(result["points"], before + xp)
                self.assertTrue(result["progress"][circle]["completed"])

            expected_next = units[unit_index + 1]["id"] if unit_index < 2 else None
            self.assertEqual(result["next_unit_id"], expected_next)
            self.assertEqual(result["next_unit_unlocked"], unit_index < 2)

        self.assertEqual(self.student.points, 660)
        self.assertEqual(self.student.level, 7)
        progress_rows = (
            self.db.query(UserUnitProgress)
            .filter(UserUnitProgress.user_id == self.student.id)
            .all()
        )
        self.assertEqual(len(progress_rows), 3)
        for progress in progress_rows:
            self.assertTrue(progress.circle_1_done)
            self.assertTrue(progress.circle_2_done)
            self.assertTrue(progress.circle_3_done)
            self.assertTrue(progress.boss_done)

        points_before_repeat = self.student.points
        repeated = complete_course_circle(
            units[0]["id"],
            CourseCircleComplete(circle="circle_1", score=100),
            db=self.db,
            user=self.student,
        )
        self.assertTrue(repeated["already_completed"])
        self.assertEqual(repeated["awarded_xp"], 0)
        self.assertEqual(repeated["points"], points_before_repeat)

        with self.assertRaises(ValidationError):
            CourseCircleComplete(circle="circle_1", score=101)
        with self.assertRaises(ValidationError):
            CourseCircleComplete(circle="unknown", score=100)

    def test_score_affects_xp(self):
        unit = list_course_units(db=self.db, user=self.student)[0]
        result = complete_course_circle(
            unit["id"],
            CourseCircleComplete(circle="circle_1", score=75),
            db=self.db,
            user=self.student,
        )
        self.assertEqual(result["awarded_xp"], 15)
        self.assertEqual(result["next_circle"], "circle_2")
        self.assertTrue(result["progress"]["circle_2"]["unlocked"])

    def test_dictionary_search_and_community_proposal(self):
        daily = daily_task(db=self.db, _=self.student)
        found = search_fragments(
            q=daily.text_ba,
            limit=10,
            lang_pair="ba-ru",
            db=self.db,
            _=self.student,
        )
        self.assertTrue(any(row["fragment_id"] == daily.fragment_id for row in found))
        case_insensitive = search_fragments(
            q=daily.text_ba.swapcase(),
            limit=10,
            lang_pair="ba-ru",
            db=self.db,
            _=self.student,
        )
        self.assertTrue(
            any(row["fragment_id"] == daily.fragment_id for row in case_insensitive)
        )

        points_before = self.student.points
        proposed = propose_fragment(
            FragmentProposal(
                text_ba="Яңы һүҙ",
                translation="Новое слово",
            ),
            db=self.db,
            user=self.student,
        )
        self.assertEqual(proposed["awarded_xp"], 20)
        self.assertEqual(proposed["points"], points_before + 20)
        self.assertGreater(proposed["fragment_id"], 0)
        self.assertGreater(proposed["translation_id"], 0)
        proposed_search = search_fragments(
            q="Яңы һүҙ",
            limit=10,
            lang_pair="ba-ru",
            db=self.db,
            _=self.student,
        )
        self.assertEqual(proposed_search[0]["translation"], "Новое слово")
        self.assertEqual(proposed_search[0]["status"], "pending")

        with self.assertRaises(HTTPException) as duplicate:
            propose_fragment(
                FragmentProposal(text_ba="Яңы һүҙ", translation="Новое слово"),
                db=self.db,
                user=self.student,
            )
        self.assertEqual(duplicate.exception.status_code, 409)
        with self.assertRaises(HTTPException) as spam:
            propose_fragment(
                FragmentProposal(text_ba="https://spam.example", translation="Ссылка"),
                db=self.db,
                user=self.student,
            )
        self.assertEqual(spam.exception.status_code, 422)

    def test_community_endpoints_remain_functional(self):
        daily = daily_task(db=self.db, _=self.student)
        self.assertGreater(daily.fragment_id, 0)
        points_before = self.student.points
        submitted = submit_answer(
            AnswerCreate(
                fragment_id=daily.fragment_id,
                translation=daily.translation,
                is_correct=True,
            ),
            db=self.db,
            user=self.student,
        )
        self.assertEqual(submitted["points"], points_before + 10)
        self.assertEqual(submitted["answer"].points_earned, 10)

        rating_functions = (
            rating_top,
            rating_schools,
            rating_classes,
            rating_accuracy,
            rating_vocabulary,
            rating_corrections,
        )
        for rating_function in rating_functions:
            rows = rating_function(period="all", db=self.db)
            self.assertIsInstance(rows, list)
            self.assertTrue(rows)

        report = class_report(
            school=self.teacher.school,
            class_name="7А",
            db=self.db,
            _=self.teacher,
        )
        self.assertEqual(report["class_name"], "7А")
        self.assertGreaterEqual(report["total_students"], 1)
        with self.assertRaises(HTTPException) as teacher_forbidden:
            require_teacher(self.student)
        self.assertEqual(teacher_forbidden.exception.status_code, 403)
        with self.assertRaises(HTTPException) as expert_forbidden:
            require_expert(self.student)
        self.assertEqual(expert_forbidden.exception.status_code, 403)

        disputed = disputed_translations(db=self.db, _=self.admin)
        self.assertTrue(disputed)
        target = disputed[0]
        final_translation = "Подтверждённый автотестом перевод"
        resolved = resolve_translation(
            ModerationResolve(
                translation_id=target["translation_id"],
                final_translation=final_translation,
                approved=False,
            ),
            db=self.db,
            expert=self.admin,
        )
        self.assertEqual(resolved["translation"].status, "confirmed")

        exported_json = export_translations(format="json", db=self.db)
        self.assertTrue(
            any(row["translation"] == final_translation for row in exported_json)
        )
        exported_csv = export_translations(format="csv", db=self.db)
        csv_text = exported_csv.body.decode("utf-8-sig")
        self.assertIn("text_ba", csv_text)
        self.assertIn(final_translation, csv_text)


if __name__ == "__main__":
    unittest.main(verbosity=2)
