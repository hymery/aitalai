# API учебных курсов

Все запросы требуют `Authorization: Bearer <access_token>`. Токен выдают `/auth/login`, `/auth/register` и `/auth/telegram`.

## Правила прохождения

- Открытие этапов: `circle_1` → `circle_2` → `circle_3` → `boss_story`.
- Следующий курс открывается после `boss_story` предыдущего.
- Структуру заблокированного курса можно предварительно просмотреть, но завершать его этапы нельзя.
- `score` — целое число от 0 до 100, рассчитанное фронтендом.
- XP начисляется один раз: `round(base_xp * score / 100)`.

| Этап | XP при 100 баллах |
|---|---:|
| `circle_1` | 20 |
| `circle_2` | 40 |
| `circle_3` | 60 |
| `boss_story` | 100 |

Повторное завершение возвращает `already_completed: true` и `awarded_xp: 0`.

## GET `/courses/units`

Возвращает все курсы. `current_circle` может быть `circle_1`, `circle_2`, `circle_3`, `boss_story`, `completed` или `locked`.

Пример `200 OK`:

```json
[
  {
    "id": 1,
    "order_index": 1,
    "title": "Чаепитие у Өләсәй",
    "description": "Гостеприимное чаепитие за столом с башкирским мёдом.",
    "character_name": "бабушка Өләсәй",
    "theme_slug": "tea_with_olasay",
    "vocabulary_count": 8,
    "unlocked": true,
    "progress": {
      "circle_1": {"unlocked": true, "completed": false},
      "circle_2": {"unlocked": false, "completed": false},
      "circle_3": {"unlocked": false, "completed": false},
      "boss_story": {"unlocked": false, "completed": false},
      "current_circle": "circle_1"
    }
  },
  {
    "id": 2,
    "order_index": 2,
    "title": "Моя семья и друзья",
    "description": "Знакомство на празднике Сабантуй и представление своей семьи.",
    "character_name": "старший брат Азамат",
    "theme_slug": "family_and_friends",
    "vocabulary_count": 8,
    "unlocked": false,
    "progress": {
      "circle_1": {"unlocked": false, "completed": false},
      "circle_2": {"unlocked": false, "completed": false},
      "circle_3": {"unlocked": false, "completed": false},
      "boss_story": {"unlocked": false, "completed": false},
      "current_circle": "locked"
    }
  },
  {
    "id": 3,
    "order_index": 3,
    "title": "Путешествие с Аҡбуҙатом",
    "description": "Встреча с волшебным конём Аҡбуҙатом у Уральских гор и полёт над рекой и лесом.",
    "character_name": "крылатый конь Аҡбуҙат",
    "theme_slug": "journey_with_akbuzat",
    "vocabulary_count": 8,
    "unlocked": false,
    "progress": {
      "circle_1": {"unlocked": false, "completed": false},
      "circle_2": {"unlocked": false, "completed": false},
      "circle_3": {"unlocked": false, "completed": false},
      "boss_story": {"unlocked": false, "completed": false},
      "current_circle": "locked"
    }
  }
]
```

## GET `/courses/units/{unit_id}`

Возвращает поля курса и прогресс из примера выше плюс:

- `circle_1.cards`: 8 карточек;
- `circle_1.quiz`: 8 вопросов с 4 уникальными вариантами, направления `ba_to_ru` и `ru_to_ba`;
- `circle_2.build_sentence`: 5 заданий;
- `circle_3.fill_blanks`: 4 задания;
- `circle_3.match_pairs`: объект раунда на 8 пар;
- `boss_story.steps`: 4 шага, в каждом 3 варианта и один верный.

Сокращённый пример структуры контента:

```json
{
  "circle_1": {
    "cards": [
      {
        "id": 1,
        "ba_word": "сәй",
        "ru_word": "чай",
        "transcription": "сәй",
        "example_ba": "Сәй бал менән тәмле.",
        "example_ru": "Чай с мёдом вкусный."
      }
    ],
    "quiz": [
      {
        "id": "1-quiz-1",
        "direction": "ba_to_ru",
        "prompt": "сәй",
        "options": ["чай", "хлеб", "мёд", "спасибо"],
        "correct_answer": "чай"
      }
    ]
  },
  "circle_2": {
    "build_sentence": [
      {
        "id": 101,
        "prompt_ru": "Бабушка пьёт чай",
        "tokens": ["сәй", "эсә", "Өләсәй"],
        "distractors": ["һыу", "өй", "ашарға"],
        "hints": {"Өләсәй": "бабушка", "сәй": "чай", "эсә": "пьёт"},
        "correct_answer": "Өләсәй сәй эсә"
      }
    ]
  },
  "circle_3": {
    "fill_blanks": [
      {
        "id": 201,
        "prompt_ru": "Чай с мёдом вкусный.",
        "target_ba": "____ бал менән тәмле.",
        "tokens": ["сәй", "бал", "икмәк", "рәхмәт"],
        "distractors": ["бал", "икмәк", "рәхмәт"],
        "hints": {"сәй": "чай"},
        "correct_answer": "сәй"
      }
    ],
    "match_pairs": {
      "id": 301,
      "prompt_ru": "Соедините башкирские слова с русскими переводами.",
      "tokens": ["өләсәй", "сәй", "бал", "икмәк"],
      "ru_options": ["хлеб", "бабушка", "мёд", "чай"],
      "correct_answer": {
        "өләсәй": "бабушка",
        "сәй": "чай",
        "бал": "мёд",
        "икмәк": "хлеб"
      }
    }
  },
  "boss_story": {
    "steps": [
      {
        "id": 401,
        "step_order": 1,
        "character_name": "бабушка Өләсәй",
        "scene_tag": "tea_welcome",
        "npc_text_ba": "Һаумыһығыҙ, ҡунаҡтар! Өстәлгә ултырығыҙ.",
        "npc_text_ru": "Здравствуйте, гости! Садитесь за стол.",
        "options": [
          {"text_ba": "Рәхмәт, Өләсәй. Ултырамын.", "is_correct": true, "explanation_ru": "Вежливо принять приглашение."},
          {"text_ba": "Икмәк ултырығыҙ.", "is_correct": false, "explanation_ru": "«Икмәк» означает «хлеб»."},
          {"text_ba": "Бал эсергә теләймен.", "is_correct": false, "explanation_ru": "Мёд едят, а не пьют."}
        ]
      }
    ]
  }
}
```

Неизвестный `unit_id` возвращает `404` с `{"detail": "Курс не найден."}`.

## POST `/courses/units/{unit_id}/complete`

Запрос:

```json
{"circle": "circle_1", "score": 100}
```

Пример ответа:

```json
{
  "unit_id": 1,
  "circle": "circle_1",
  "score": 100,
  "already_completed": false,
  "awarded_xp": 20,
  "points": 260,
  "level": 3,
  "next_circle": "circle_2",
  "next_unit_id": 2,
  "next_unit_unlocked": false,
  "progress": {
    "circle_1": {"unlocked": true, "completed": true},
    "circle_2": {"unlocked": true, "completed": false},
    "circle_3": {"unlocked": false, "completed": false},
    "boss_story": {"unlocked": false, "completed": false},
    "current_circle": "circle_2"
  }
}
```

После финального `boss_story` третьего курса: `next_circle: "completed"`, `next_unit_id: null`, `next_unit_unlocked: false`.

Ошибка обхода последовательности (`409`):

```json
{"detail": "Сначала завершите предыдущий кружок или курс."}
```

При неверном `circle` или `score` вне диапазона 0–100 возвращается `422`.

## Автотест

```bash
python -m unittest -v test_courses.py
```

Тест использует отдельную `test_courses.db` и не изменяет рабочую базу. Проверяются курсы, история Аҡбуҙата, XP, блокировки, повторное завершение, `/tasks/*`, `/ratings/*`, `/teacher/class-report`, `/moderation/*` и `/translations/export`.
