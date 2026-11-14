import random
import re
from typing import Any

from sqlalchemy.orm import Session

from database import Base, DATABASE_URL, SessionLocal, engine
from models import (
    CourseUnit,
    Fragment,
    Translation,
    UnitExercise,
    UnitStoryStep,
    UnitVocabulary,
)


SENTENCES_PER_UNIT = 5
FILL_BLANKS_PER_UNIT = 4


def v(ba: str, ru: str, transcription: str, example_ba: str, example_ru: str) -> dict:
    return {
        "ba_word": ba,
        "ru_word": ru,
        "transcription": transcription,
        "example_ba": example_ba,
        "example_ru": example_ru,
    }


def s(ba: str, ru: str, **hints: str) -> dict:
    return {"ba": ba, "ru": ru, "hints": hints}


def o(text_ba: str, is_correct: bool, explanation_ru: str) -> dict:
    return {
        "text_ba": text_ba,
        "is_correct": is_correct,
        "explanation_ru": explanation_ru,
    }


# Чтобы добавить курс, дополните этот список темой, ключевыми словами,
# карточками, учебными связками и шагами истории. Подходящие реальные примеры
# из fragments автоматически заменяют учебные заготовки.
UNITS_CONFIG: list[dict[str, Any]] = [
    {
        "order_index": 1,
        "title": "Чаепитие у Өләсәй",
        "description": "Гостеприимное чаепитие за столом с башкирским мёдом.",
        "character_name": "бабушка Өләсәй",
        "theme_slug": "tea_with_olasay",
        "keywords": ["өләсәй", "сәй", "бал", "икмәк", "рәхмәт", "тәмле", "ултырығыҙ", "эсергә"],
        "vocabulary": [
            v("өләсәй", "бабушка", "өл-ә-сәй", "Өләсәй өйөндә сәй эсәбеҙ.", "У бабушки мы пьём чай."),
            v("сәй", "чай", "сәй", "Сәй бал менән тәмле.", "Чай с мёдом вкусный."),
            v("бал", "мёд", "бал", "Башҡорт балы бик тәмле.", "Башкирский мёд очень вкусный."),
            v("икмәк", "хлеб", "ик-мәк", "Икмәк менән сәй ашағыҙ.", "Съешьте хлеб с чаем."),
            v("рәхмәт", "спасибо", "рәх-мәт", "Тәмле сәй өсөн рәхмәт.", "Спасибо за вкусный чай."),
            v("тәмле", "вкусный", "тәм-ле", "Бал бик тәмле.", "Мёд очень вкусный."),
            v("ултырығыҙ", "садитесь", "ул-ты-ры-ғыҙ", "Өстәл янына ултырығыҙ.", "Садитесь за стол."),
            v("эсергә", "пить", "э-сер-гә", "Сәй эсергә яратам.", "Я люблю пить чай."),
        ],
        "sentences": [
            s("Өләсәй сәй эсә", "Бабушка пьёт чай", эсә="пьёт"),
            s("Бал менән икмәк тәмле", "Мёд с хлебом вкусные"),
            s("Ултырығыҙ сәй эсергә", "Садитесь пить чай"),
            s("Рәхмәт тәмле сәй өсөн", "Спасибо за вкусный чай"),
            s("Өләсәй тәмле сәй әҙерләй", "Бабушка готовит вкусный чай", әҙерләй="готовит"),
        ],
        "distractors": ["һыу", "өй", "ашарға"],
        "story": [
            {
                "scene_tag": "tea_welcome",
                "npc_text_ba": "Һаумыһығыҙ, ҡунаҡтар! Өстәлгә ултырығыҙ.",
                "npc_text_ru": "Здравствуйте, гости! Садитесь за стол.",
                "options": [
                    o("Рәхмәт, Өләсәй. Ултырамын.", True, "Вежливый ответ: поблагодарить хозяйку и сесть за стол."),
                    o("Икмәк ултырығыҙ.", False, "Слово «икмәк» означает «хлеб» и здесь не подходит."),
                    o("Бал эсергә теләймен.", False, "Мёд едят, а не пьют; лучше сначала ответить на приглашение."),
                ],
            },
            {
                "scene_tag": "tea_honey",
                "npc_text_ba": "Сәйгә бал өҫтәйһеңме?",
                "npc_text_ru": "Добавишь мёд в чай?",
                "options": [
                    o("Эйе, бал яратам.", True, "«Бал яратам» — «люблю мёд», ответ подходит по смыслу."),
                    o("Эйе, йылға яратам.", False, "«Йылға» — «река», а Өләсәй спрашивает о мёде."),
                    o("Юҡ, икмәк эсәм.", False, "«Эсәм» относится к питью; хлеб едят."),
                ],
            },
            {
                "scene_tag": "tea_bread",
                "npc_text_ba": "Икмәк тәмлеме?",
                "npc_text_ru": "Хлеб вкусный?",
                "options": [
                    o("Эйе, икмәк бик тәмле.", True, "Правильно: «икмәк» — «хлеб», «тәмле» — «вкусный»."),
                    o("Эйе, сәй бик тау.", False, "«Тау» — «гора»; для вкуса нужно слово «тәмле»."),
                    o("Юҡ, бал ҡанатлы.", False, "«Ҡанатлы» — «крылатый» и не описывает вкус мёда."),
                ],
            },
            {
                "scene_tag": "tea_thanks",
                "npc_text_ba": "Ҡунаҡлыҡ өсөн ни әйтерһең?",
                "npc_text_ru": "Что скажешь в благодарность за угощение?",
                "options": [
                    o("Сәй өсөн рәхмәт, өләсәй.", True, "«Рәхмәт» — «спасибо»: благодарность звучит естественно."),
                    o("Сәй өсөн юл.", False, "«Юл» — «дорога»; здесь нужно слово «рәхмәт»."),
                    o("Икмәк өсөн ҡанат.", False, "«Ҡанат» — «крыло» и не выражает благодарность."),
                ],
            },
        ],
    },
    {
        "order_index": 2,
        "title": "Моя семья и друзья",
        "description": "Знакомство на празднике Сабантуй и представление своей семьи.",
        "character_name": "старший брат Азамат",
        "theme_slug": "family_and_friends",
        "keywords": ["әсәй", "атай", "ғаилә", "дуҫ", "исем", "һаумыһығыҙ", "хәлдәр", "яҡшы"],
        "vocabulary": [
            v("әсәй", "мама", "ә-сәй", "Минең әсәй сабантуйҙа.", "Моя мама на Сабантуе."),
            v("атай", "папа", "а-тай", "Атай минең дуҫ менән һөйләшә.", "Папа разговаривает с моим другом."),
            v("ғаилә", "семья", "ға-и-лә", "Минең ғаилә ҙур.", "Моя семья большая."),
            v("дуҫ", "друг", "дуҫ", "Азамат — минең яҡшы дуҫ.", "Азамат — мой хороший друг."),
            v("исем", "имя", "и-сем", "Минең исемем Азамат.", "Меня зовут Азамат."),
            v("һаумыһығыҙ", "здравствуйте", "һау-мы-һы-ғыҙ", "Һаумыһығыҙ, хәлдәр нисек?", "Здравствуйте, как дела?"),
            v("хәлдәр", "дела", "хәл-дәр", "Хәлдәр яҡшы, рәхмәт.", "Дела хорошо, спасибо."),
            v("яҡшы", "хорошо", "яҡ-шы", "Бөгөн хәлдәр бик яҡшы.", "Сегодня дела очень хорошо."),
        ],
        "sentences": [
            s("Һаумыһығыҙ минең дуҫ", "Здравствуй, мой друг"),
            s("Минең исемем Азамат", "Меня зовут Азамат", исемем="имя (форма слова «исем»)", Азамат="Азамат (имя)"),
            s("Ғаилә минең өсөн мөһим", "Семья важна для меня"),
            s("Әсәй менән атай сабантуйҙа", "Мама и папа на Сабантуе", сабантуйҙа="на Сабантуе"),
            s("Хәлдәр яҡшы рәхмәт", "Дела хорошо, спасибо"),
        ],
        "distractors": ["сәй", "тау", "бал"],
        "story": [
            {
                "scene_tag": "sabantuy_greeting",
                "npc_text_ba": "Һаумыһығыҙ! Минең исемем Азамат. Һинең исемең нисә?",
                "npc_text_ru": "Здравствуй! Меня зовут Азамат. Как тебя зовут?",
                "options": [
                    o("Минең исемем Айгөл.", True, "«Минең исемем…» используется, чтобы назвать своё имя."),
                    o("Минең ғаилә Айгөл.", False, "«Ғаилә» — «семья», а вопрос был об имени."),
                    o("Минең хәлдәр Айгөл.", False, "«Хәлдәр» — «дела»; это слово не заменяет «исем»."),
                ],
            },
            {
                "scene_tag": "sabantuy_smalltalk",
                "npc_text_ba": "Хәлдәр нисек?",
                "npc_text_ru": "Как дела?",
                "options": [
                    o("Хәлдәр яҡшы, рәхмәт.", True, "«Яҡшы» — «хорошо»: это естественный ответ."),
                    o("Исем яҡшы, рәхмәт.", False, "«Исем» — «имя»; о делах говорят «хәлдәр»."),
                    o("Атай сәй, рәхмәт.", False, "Слова «атай» и «сәй» не отвечают на вопрос о делах."),
                ],
            },
            {
                "scene_tag": "sabantuy_family",
                "npc_text_ba": "Быныһы минең әсәй, ә быныһы атай.",
                "npc_text_ru": "Это моя мама, а это папа.",
                "options": [
                    o("Һаумыһығыҙ, танышҡаныма шатмын.", True, "При знакомстве уместно поздороваться и сказать, что рад знакомству."),
                    o("Минең исемем йылға.", False, "«Йылға» — «река», а не ответ при знакомстве."),
                    o("Хәлдәр ҡанат.", False, "«Ҡанат» — «крыло»; фраза не имеет подходящего смысла."),
                ],
            },
            {
                "scene_tag": "sabantuy_together",
                "npc_text_ba": "Ғаиләң менән Сабантуйға килдеңме?",
                "npc_text_ru": "Ты пришёл на Сабантуй с семьёй?",
                "options": [
                    o("Эйе, ғаиләм менән килдем.", True, "«Ғаиләм менән» — «со своей семьёй», ответ точный."),
                    o("Эйе, тау менән килдем.", False, "«Тау» — «гора»; Азамат спросил о семье."),
                    o("Юҡ, дуҫ эсәм.", False, "«Эсәм» — «пью» и не подходит к слову «дуҫ»."),
                ],
            },
        ],
    },
    {
        "order_index": 3,
        "title": "Путешествие с Аҡбуҙатом",
        "description": "Встреча с волшебным конём Аҡбуҙатом у Уральских гор и полёт над рекой и лесом.",
        "character_name": "крылатый конь Аҡбуҙат",
        "theme_slug": "journey_with_akbuzat",
        "keywords": ["ат", "ҡанат", "тау", "йылға", "урман", "юл", "барырға", "матур"],
        "vocabulary": [
            v("ат", "конь", "ат", "Аҡбуҙат — тиҙ ат.", "Акбузат — быстрый конь."),
            v("ҡанат", "крыло", "ҡа-нат", "Аҡбуҙаттың ҡанаттары матур.", "Крылья Акбузата красивые."),
            v("тау", "гора", "тау", "Урал тауҙары бик матур.", "Уральские горы очень красивые."),
            v("йылға", "река", "йыл-ға", "Йылға һыуы таҙа.", "Вода в реке чистая."),
            v("урман", "лес", "ур-ман", "Ҡара урман матур.", "Дремучий лес красив."),
            v("юл", "дорога, путь", "юл", "Тауға юл алып бара.", "Дорога ведёт к горе."),
            v("барырға", "идти, ехать", "ба-рыр-ға", "Беҙ Уралға барырға теләйбеҙ.", "Мы хотим поехать на Урал."),
            v("матур", "красивый", "ма-тур", "Тауҙар һәм йылғалар матур.", "Горы и реки красивые."),
        ],
        "sentences": [
            s("Аҡбуҙат бик матур ат", "Акбузат — очень красивый конь", Аҡбуҙат="Акбузат (имя волшебного коня)"),
            s("Ҡанаттар көслө һәм матур", "Крылья сильные и красивые", Ҡанаттар="крылья (форма слова «ҡанат»)", көслө="сильные"),
            s("Тау менән йылға матур", "Гора и река красивые"),
            s("Урман аша юл бара", "Дорога идёт через лес", бара="идёт"),
            s("Беҙ урман аша барабыҙ", "Мы идём через лес", барабыҙ="идём"),
        ],
        "distractors": ["икмәк", "әсәй", "сәй"],
        "story": [
            {
                "scene_tag": "ural_meeting",
                "npc_text_ba": "Мин Аҡбуҙат. Урал тауҙарын күрәһеңме?",
                "npc_text_ru": "Я Акбузат. Видишь Уральские горы?",
                "options": [
                    o("Эйе, тауҙар бик матур.", True, "«Тауҙар» — «горы», «матур» — «красивые»."),
                    o("Эйе, сәй бик матур.", False, "«Сәй» — «чай», а Акбузат спрашивает о горах."),
                    o("Юҡ, ҡанат эсәм.", False, "«Эсәм» — «пью» и не сочетается здесь со словом «ҡанат»."),
                ],
            },
            {
                "scene_tag": "flight_over_river",
                "npc_text_ba": "Ҡанаттарым менән йылға өҫтөнән осабыҙ.",
                "npc_text_ru": "На моих крыльях мы летим над рекой.",
                "options": [
                    o("Йылға һәм урман матур икән.", True, "Так можно отметить красоту реки и леса во время полёта."),
                    o("Икмәк һәм бал матур икән.", False, "Хлеб и мёд не относятся к виду за крылом Акбузата."),
                    o("Йылға ҡанаттар эсә.", False, "Фраза буквально говорит, что река пьёт крылья: это ошибка."),
                ],
            },
            {
                "scene_tag": "forest_path",
                "npc_text_ba": "Ҡайһы юл менән барабыҙ?",
                "npc_text_ru": "По какой дороге мы идём?",
                "options": [
                    o("Урман аша барған юл менән.", True, "«Урман аша» — «через лес»: ответ указывает путь."),
                    o("Сәй эсергә юл менән.", False, "«Сәй эсергә» — «пить чай» и не описывает выбранную дорогу."),
                    o("Ғаилә яҡшы юл менән.", False, "Слова о семье не отвечают на вопрос о маршруте."),
                ],
            },
            {
                "scene_tag": "storm_flight",
                "npc_text_ba": "Даумал яҡынлаша. Ни эшләргә?",
                "npc_text_ru": "Буря приближается. Что делать?",
                "options": [
                    o("Аҡбуҙат, тау артына осабыҙ!", True, "Предложение улететь за гору продолжает путешествие и помогает избежать бури."),
                    o("Аҡбуҙат, сәй эсергә ултырабыҙ!", False, "Во время приближения бури чаепитие не решает проблему."),
                    o("Аҡбуҙат, исемебеҙҙе үҙгәртәбеҙ!", False, "Смена имени не помогает путешественникам избежать бури."),
                ],
            },
        ],
    },
]

COMMON_HINTS = {
    "менән": "с, со, вместе с",
    "өсөн": "для, за",
    "минең": "мой, моя",
    "беҙ": "мы",
    "һәм": "и",
    "бик": "очень",
    "аша": "через",
    "мөһим": "важный",
    "рәхмәт": "спасибо",
}


def tokenize(text: str) -> list[str]:
    return re.findall(r"[^\W\d_]+(?:-[^\W\d_]+)?|\d+", text, flags=re.UNICODE)


def normalize_word(word: str) -> str:
    return word.casefold()


def unit_lexicon(config: dict[str, Any]) -> dict[str, str]:
    lexicon = dict(COMMON_HINTS)
    lexicon.update(
        {normalize_word(item["ba_word"]): item["ru_word"] for item in config["vocabulary"]}
    )
    for sentence in config["sentences"]:
        lexicon.update(
            {normalize_word(word): hint for word, hint in sentence["hints"].items()}
        )
    return lexicon


def hints_for_tokens(
    tokens: list[str], lexicon: dict[str, str], context_ru: str | None = None
) -> dict[str, str] | None:
    hints: dict[str, str] = {}
    bases = sorted(lexicon, key=len, reverse=True)
    for token in tokens:
        normalized = normalize_word(token)
        hint = lexicon.get(normalized)
        if hint is None:
            base = next(
                (
                    candidate
                    for candidate in bases
                    if len(candidate) >= 3
                    and len(normalized) > len(candidate)
                    and normalized.startswith(candidate)
                ),
                None,
            )
            if base is not None:
                hint = f"{lexicon[base]} (форма слова «{base}»)"
        if hint is None and context_ru:
            hint = f"Новое слово; перевод всей фразы: {context_ru}"
        if hint is None:
            return None
        hints[token] = hint
    return hints


def load_fragment_pairs(db: Session) -> list[dict[str, Any]]:
    rows = (
        db.query(Fragment, Translation)
        .join(Translation, Translation.fragment_id == Fragment.id)
        .filter(Translation.lang_pair == "ba-ru", Translation.status == "confirmed")
        .order_by(Fragment.id, Translation.id)
        .all()
    )
    return [
        {"id": fragment.id, "ba": fragment.text_ba.strip(), "ru": translation.translation.strip()}
        for fragment, translation in rows
        if fragment.text_ba.strip() and translation.translation.strip()
    ]


def find_real_example(
    pairs: list[dict[str, Any]],
    word: str,
    used_fragment_ids: set[int],
    theme_slug: str,
) -> dict[str, Any] | None:
    thematic_ru = REAL_SENTENCE_RU_KEYWORDS.get(theme_slug, [])
    candidates = []
    for pair in pairs:
        tokens = tokenize(pair["ba"])
        if pair["id"] in used_fragment_ids or any(len(token) < 2 for token in tokens):
            continue
        if keyword_match_level(tokens, word.casefold()) is None:
            continue
        if thematic_ru and not any(
            marker in pair["ru"].casefold() for marker in thematic_ru
        ):
            continue
        candidates.append(pair)
    if not candidates:
        return None
    return min(candidates, key=lambda pair: (len(tokenize(pair["ba"])), pair["id"]))


def keyword_match_level(tokens: list[str], keyword: str) -> int | None:
    normalized = [normalize_word(token) for token in tokens]
    if keyword in normalized:
        return 0
    if len(keyword) >= 3 and any(
        len(token) > len(keyword)
        and len(token) - len(keyword) <= 8
        and token.startswith(keyword)
        for token in normalized
    ):
        return 1
    return None


REAL_SENTENCE_RU_KEYWORDS = {
    "tea_with_olasay": ["бабуш", "чай", "мёд", "мед", "хлеб", "спасиб", "благодар", "вкус", "садитесь", "пить"],
    "family_and_friends": ["мам", "пап", "семь", "друг", "имя", "здравств", "дела", "хорош", "бабуш"],
    "journey_with_akbuzat": ["конь", "лошад", "крыл", "гор", "рек", "лес", "дорог", "путь", "красив", "пойти", "поехать", "путешеств"],
}


def select_real_sentences(
    pairs: list[dict[str, Any]],
    config: dict[str, Any],
    lexicon: dict[str, str],
) -> list[dict[str, Any]]:
    keywords = [word.casefold() for word in config["keywords"]]
    thematic_ru = REAL_SENTENCE_RU_KEYWORDS.get(config["theme_slug"], [])
    candidates = []
    for pair in pairs:
        tokens = tokenize(pair["ba"])
        if not 3 <= len(tokens) <= 6 or any(len(token) < 2 for token in tokens):
            continue
        if thematic_ru and not any(
            marker in pair["ru"].casefold() for marker in thematic_ru
        ):
            continue
        levels = {
            index: level
            for index, keyword in enumerate(keywords)
            if (level := keyword_match_level(tokens, keyword)) is not None
        }
        if levels:
            candidates.append({"pair": pair, "tokens": tokens, "levels": levels})

    # Сначала берём по одному примеру для разных ключевых слов темы,
    # затем дополняем набор лучшими оставшимися совпадениями.
    ordered = []
    for index in range(len(keywords)):
        matches = [item for item in candidates if index in item["levels"]]
        matches.sort(key=lambda item: (item["levels"][index], item["pair"]["id"]))
        ordered.extend(matches[:1])
    ordered.extend(
        sorted(
            candidates,
            key=lambda item: (min(item["levels"].values()), item["pair"]["id"]),
        )
    )

    selected = []
    seen = set()
    for candidate in ordered:
        pair = candidate["pair"]
        target = " ".join(candidate["tokens"])
        if target.casefold() in seen:
            continue
        hints = hints_for_tokens(candidate["tokens"], lexicon, context_ru=pair["ru"])
        selected.append(
            {"ba": target, "ru": pair["ru"], "hints": hints, "fragment_id": pair["id"]}
        )
        seen.add(target.casefold())
        if len(selected) >= min(2, SENTENCES_PER_UNIT):
            break
    return selected


def sentence_materials(
    pairs: list[dict[str, Any]], config: dict[str, Any]
) -> list[dict[str, Any]]:
    lexicon = unit_lexicon(config)
    materials = select_real_sentences(pairs, config, lexicon)
    seen = {item["ba"].casefold() for item in materials}
    for sentence in config["sentences"]:
        if len(materials) >= SENTENCES_PER_UNIT:
            break
        tokens = tokenize(sentence["ba"])
        target = " ".join(tokens)
        if target.casefold() in seen:
            continue
        if not 3 <= len(tokens) <= 6:
            raise ValueError(f"Учебная фраза должна содержать 3–6 слов: {target}")
        hints = hints_for_tokens(tokens, lexicon)
        if hints is None:
            missing = [token for token in tokens if token not in (hints or {})]
            raise ValueError(f"Нет подсказок для слов {missing} в фразе «{target}».")
        materials.append({"ba": target, "ru": sentence["ru"], "hints": hints, "fragment_id": None})
        seen.add(target.casefold())
    if len(materials) < SENTENCES_PER_UNIT:
        raise ValueError(f"Недостаточно связных фраз для темы {config['theme_slug']}.")
    return materials


def shuffled(values: list[str], seed: int) -> list[str]:
    result = values[:]
    generator = random.Random(seed)
    for _ in range(10):
        generator.shuffle(result)
        if len(result) < 2 or result != values:
            break
    return result


def mask_word(example: str, word: str) -> str | None:
    match = re.search(re.escape(word), example, flags=re.IGNORECASE)
    if match is None:
        return None
    return f"{example[:match.start()]}____{example[match.end():]}"


def upsert_unit(db: Session, config: dict[str, Any]) -> CourseUnit:
    unit = db.query(CourseUnit).filter(CourseUnit.theme_slug == config["theme_slug"]).first()
    if unit is None:
        unit = CourseUnit(theme_slug=config["theme_slug"])
        db.add(unit)
    unit.order_index = config["order_index"]
    unit.title = config["title"]
    unit.description = config["description"]
    unit.character_name = config["character_name"]
    db.flush()
    db.query(UnitVocabulary).filter(UnitVocabulary.unit_id == unit.id).delete(synchronize_session=False)
    db.query(UnitExercise).filter(UnitExercise.unit_id == unit.id).delete(synchronize_session=False)
    db.query(UnitStoryStep).filter(UnitStoryStep.unit_id == unit.id).delete(synchronize_session=False)
    return unit


def build_unit(
    db: Session,
    config: dict[str, Any],
    pairs: list[dict[str, Any]],
) -> None:
    unit = upsert_unit(db, config)
    used_fragment_ids: set[int] = set()
    vocabulary_rows: list[dict[str, Any]] = []

    for item in config["vocabulary"]:
        example_ba = item["example_ba"]
        example_ru = item["example_ru"]
        real = find_real_example(
            pairs, item["ba_word"], used_fragment_ids, config["theme_slug"]
        )
        if real is not None:
            example_ba = real["ba"]
            example_ru = real["ru"]
            used_fragment_ids.add(real["id"])
        row = {
            **item,
            "example_ba": example_ba,
            "example_ru": example_ru,
            "curated_example_ba": item["example_ba"],
            "curated_example_ru": item["example_ru"],
        }
        vocabulary_rows.append(row)
        db.add(UnitVocabulary(unit_id=unit.id, **{key: row[key] for key in (
            "ba_word", "ru_word", "transcription", "example_ba", "example_ru"
        )}))

    for index, sentence in enumerate(sentence_materials(pairs, config), start=1):
        tokens = tokenize(sentence["ba"])
        db.add(
            UnitExercise(
                unit_id=unit.id,
                circle_number=2,
                exercise_type="build_sentence",
                prompt_ru=sentence["ru"],
                target_ba=sentence["ba"],
                tokens_json=shuffled(tokens, unit.id * 100 + index),
                distractors_json=config["distractors"],
                hints_json=sentence["hints"],
                correct_answer=sentence["ba"],
            )
        )

    fill_created = 0
    for item in vocabulary_rows:
        if fill_created >= FILL_BLANKS_PER_UNIT:
            break
        masked = mask_word(item["example_ba"], item["ba_word"])
        example_ba = item["example_ba"]
        example_ru = item["example_ru"]
        if masked is None:
            masked = mask_word(item["curated_example_ba"], item["ba_word"])
            example_ru = item["curated_example_ru"]
        if masked is None:
            continue
        wrong_words = [
            row["ba_word"] for row in vocabulary_rows if row["ba_word"] != item["ba_word"]
        ][:3]
        options = shuffled([item["ba_word"], *wrong_words], unit.id * 200 + fill_created)
        db.add(
            UnitExercise(
                unit_id=unit.id,
                circle_number=3,
                exercise_type="fill_blank",
                prompt_ru=example_ru,
                target_ba=masked,
                tokens_json=options,
                distractors_json=wrong_words,
                hints_json={item["ba_word"]: item["ru_word"]},
                correct_answer=item["ba_word"],
            )
        )
        fill_created += 1

    db.add(
        UnitExercise(
            unit_id=unit.id,
            circle_number=3,
            exercise_type="match_pairs",
            prompt_ru="Соедините башкирские слова с русскими переводами.",
            target_ba="",
            tokens_json=[item["ba_word"] for item in vocabulary_rows],
            distractors_json=[],
            hints_json={item["ba_word"]: item["ru_word"] for item in vocabulary_rows},
            correct_answer={item["ba_word"]: item["ru_word"] for item in vocabulary_rows},
        )
    )

    for step_order, step in enumerate(config["story"], start=1):
        db.add(
            UnitStoryStep(
                unit_id=unit.id,
                step_order=step_order,
                character_name=config["character_name"],
                scene_tag=step["scene_tag"],
                npc_text_ba=step["npc_text_ba"],
                npc_text_ru=step["npc_text_ru"],
                options_json=step["options"],
            )
        )


def validate_database(db: Session) -> list[dict[str, Any]]:
    summaries = []
    units = db.query(CourseUnit).order_by(CourseUnit.order_index).all()
    if len(units) != len(UNITS_CONFIG):
        raise ValueError(f"Ожидалось {len(UNITS_CONFIG)} курса, в базе: {len(units)}.")

    for unit in units:
        vocabulary = db.query(UnitVocabulary).filter(UnitVocabulary.unit_id == unit.id).all()
        exercises = db.query(UnitExercise).filter(UnitExercise.unit_id == unit.id).all()
        stories = db.query(UnitStoryStep).filter(UnitStoryStep.unit_id == unit.id).all()
        if len(vocabulary) != 8:
            raise ValueError(f"В курсе «{unit.title}» должно быть 8 слов.")
        build_exercises = [item for item in exercises if item.circle_number == 2]
        if len(build_exercises) != SENTENCES_PER_UNIT:
            raise ValueError(f"Неверное число заданий Кружка 2 в курсе «{unit.title}».")
        for exercise in build_exercises:
            tokens = tokenize(exercise.correct_answer)
            if not 3 <= len(tokens) <= 6:
                raise ValueError(f"Фраза вне диапазона 3–6 слов: {exercise.correct_answer}")
            normalized_hints = {key.casefold() for key in exercise.hints_json}
            missing = [token for token in tokens if token.casefold() not in normalized_hints]
            if missing:
                raise ValueError(f"В задании нет подсказок для: {missing}")
        fill_count = sum(item.exercise_type == "fill_blank" for item in exercises)
        match_count = sum(item.exercise_type == "match_pairs" for item in exercises)
        if fill_count < FILL_BLANKS_PER_UNIT or match_count < 1:
            raise ValueError(f"Неполный Кружок 3 в курсе «{unit.title}».")
        for story in stories:
            options = story.options_json
            if len(options) != 3 or sum(bool(item.get("is_correct")) for item in options) != 1:
                raise ValueError(f"Шаг {story.id} должен иметь 3 варианта и 1 верный.")
            if any(not item.get("explanation_ru") for item in options):
                raise ValueError(f"В шаге {story.id} есть вариант без пояснения.")
        summaries.append(
            {
                "title": unit.title,
                "character": unit.character_name,
                "vocabulary": len(vocabulary),
                "circle_2": len(build_exercises),
                "fill_blank": fill_count,
                "match_pairs": match_count,
                "story_steps": len(stories),
            }
        )
    return summaries


def main() -> None:
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        pairs = load_fragment_pairs(db)
        if not pairs:
            raise RuntimeError("В fragments нет подтверждённых пар. Сначала запустите seed.py/import_hf.py.")
        for config in UNITS_CONFIG:
            build_unit(db, config, pairs)
        db.flush()
        summaries = validate_database(db)
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    backend = "SQLite" if DATABASE_URL.startswith("sqlite") else "PostgreSQL"
    print(f"База данных: {backend}; доступно реальных пар: {len(pairs)}.")
    for summary in summaries:
        print(
            f"Курс «{summary['title']}» ({summary['character']}): "
            f"слов {summary['vocabulary']}, Кружок 2 — {summary['circle_2']}, "
            f"Кружок 3 — {summary['fill_blank']} fill_blank + {summary['match_pairs']} match_pairs, "
            f"шагов истории {summary['story_steps']}."
        )


if __name__ == "__main__":
    main()
