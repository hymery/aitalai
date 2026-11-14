export const COURSE_UNITS = [
  {
    unit_id: 1,
    unit_title: "Азы һәм ҡунаҡсыллыҡ",
    unit_subtitle: "Приветствие и гостеприимство",
    accent: "blue",
    lessons: [
      {
        unit_id: 1,
        lesson_id: 1,
        lesson_type: "flashcards",
        lesson_title: "Слова гостеприимства",
        instruction: "Листай карточки, переворачивай их и слушай произношение. Здесь нет ошибок и списания жизней.",
        cards: [
          { id: 1, ba: "Һаумыһығыҙ", ru: "Здравствуйте", audio_tts: "Һаумыһығыҙ", example_ba: "Һаумыһығыҙ, дуҫ!", example_ru: "Здравствуйте, друг!" },
          { id: 2, ba: "Сәләм", ru: "Привет", audio_tts: "Сәләм", example_ba: "Сәләм, дуҫ!", example_ru: "Привет, друг!" },
          { id: 3, ba: "Рәхмәт", ru: "Спасибо", audio_tts: "Рәхмәт", example_ba: "Сәй өсөн рәхмәт.", example_ru: "Спасибо за чай." },
          { id: 4, ba: "Һәйбәт", ru: "Хорошо", audio_tts: "Һәйбәт", example_ba: "Минең хәлдәрем һәйбәт.", example_ru: "Мои дела хорошо." },
          { id: 5, ba: "Эйе", ru: "Да", audio_tts: "Эйе", example_ba: "Эйе, рәхмәт!", example_ru: "Да, спасибо!" },
          { id: 6, ba: "Юҡ", ru: "Нет", audio_tts: "Юҡ", example_ba: "Юҡ, рәхмәт.", example_ru: "Нет, спасибо." },
          { id: 7, ba: "Мин", ru: "Я", audio_tts: "Мин", example_ba: "Мин сәй эсәм.", example_ru: "Я пью чай." },
          { id: 8, ba: "Дуҫ", ru: "Друг", audio_tts: "Дуҫ", example_ba: "Сәләм, дуҫ!", example_ru: "Привет, друг!" },
          { id: 9, ba: "Сәй", ru: "Чай", audio_tts: "Сәй", example_ba: "Сәй бик тәмле.", example_ru: "Чай очень вкусный." },
          { id: 10, ba: "Һөт", ru: "Молоко", audio_tts: "Һөт", example_ba: "Һөт — һәйбәт.", example_ru: "Молоко — это хорошо." },
          { id: 11, ba: "Бал", ru: "Мёд", audio_tts: "Бал", example_ba: "Бал бик тәмле.", example_ru: "Мёд очень вкусный." },
          { id: 12, ba: "Икмәк", ru: "Хлеб", audio_tts: "Икмәк", example_ba: "Икмәк һәм бал.", example_ru: "Хлеб и мёд." },
          { id: 13, ba: "Тәмле", ru: "Вкусный", audio_tts: "Тәмле", example_ba: "Сәй тәмле.", example_ru: "Чай вкусный." },
          { id: 14, ba: "Өләсәй", ru: "Бабушка", audio_tts: "Өләсәй", example_ba: "Рәхмәт, өләсәй!", example_ru: "Спасибо, бабушка!" },
          { id: 15, ba: "Бик", ru: "Очень", audio_tts: "Бик", example_ba: "Бик һәйбәт!", example_ru: "Очень хорошо!" }
        ]
      },
      {
        unit_id: 1,
        lesson_id: 2,
        lesson_type: "practice",
        lesson_title: "Собираем фразы и пары",
        instruction: "Закрепляем только слова из карточек.",
        steps: [
          {
            type: "word_bank",
            prompt: "Собери фразу: «Привет, друг!»",
            target: ["Сәләм,", "дуҫ!"],
            bank: ["Сәләм,", "дуҫ!", "Юҡ", "Бал", "Мин"]
          },
          {
            type: "match_pairs",
            prompt: "Соедини башкирские слова с русскими переводами:",
            pairs: [
              { ba: "Сәй", ru: "Чай" },
              { ba: "Һөт", ru: "Молоко" },
              { ba: "Бал", ru: "Мёд" },
              { ba: "Икмәк", ru: "Хлеб" }
            ]
          }
        ]
      },
      {
        unit_id: 1,
        lesson_id: 3,
        lesson_type: "practice",
        lesson_title: "За чашкой чая",
        instruction: "Выбирай подходящие слова и отвечай вежливо.",
        steps: [
          {
            type: "fill_blank",
            prompt: "Вставь пропущенное слово: «Чай очень вкусный».",
            sentence_pre: "Сәй бик ",
            sentence_post: ".",
            correct: "тәмле",
            options: ["тәмле", "юҡ", "дуҫ", "һөт"],
            hint: "«Тәмле» — вкусный."
          },
          {
            type: "chat_choice",
            speaker: "Өләсәй",
            speaker_ba: "Сәй эсәйек, балам!",
            prompt: "Бабушка предлагает чай. Ответь утвердительно:",
            options: [
              { text: "Эйе, рәхмәт!", is_correct: true },
              { text: "Юҡ, бал.", is_correct: false },
              { text: "Сәләм, икмәк!", is_correct: false }
            ]
          }
        ]
      }
    ],
    final_boss_node: {
      unit_id: 1,
      lesson_id: 99,
      lesson_type: "boss",
      quest_title: "В гостях у Өләсәй",
      cultural_character: { name: "Өләсәй — бабушка Халима", initial: "Ө" },
      stages: [
        {
          mechanic: "chat_choice",
          story_context: "Ты заходишь в гости. За столом сидит Өләсәй.",
          npc_speech_ba: "Һаумыһығыҙ, балам! Хәлдәрең нисек?",
          task_prompt: "Поздоровайся и ответь, что у тебя всё хорошо:",
          options: [
            { text_ba: "Һаумыһығыҙ, өләсәй! Рәхмәт, минең хәлдәрем һәйбәт!", is_correct: true },
            { text_ba: "Юҡ, бал!", is_correct: false, error_hint: "Бабушка спросила о делах, а не предложила мёд." },
            { text_ba: "Сәй, икмәк, һөт!", is_correct: false, error_hint: "Начни с вежливого приветствия." }
          ]
        },
        {
          mechanic: "interactive_table",
          story_context: "Өләсәй просит помочь накрыть на стол.",
          npc_speech_ba: "Өҫтәлгә бал, һөт һәм икмәк ҡуй!",
          task_prompt: "Выбери мёд, молоко и хлеб:",
          required_item_ids: ["honey", "milk", "bread"],
          table_items: [
            { id: "honey", label_ba: "Бал", label_ru: "Мёд" },
            { id: "milk", label_ba: "Һөт", label_ru: "Молоко" },
            { id: "bread", label_ba: "Икмәк", label_ru: "Хлеб" },
            { id: "tea", label_ba: "Сәй", label_ru: "Чай" }
          ]
        },
        {
          mechanic: "grammar_trap",
          story_context: "Өләсәй угощает тебя бурзянским мёдом.",
          npc_speech_ba: "Башҡорт балы бик тәмлеме?",
          task_prompt: "Ответь: «Да, спасибо! Этот мёд очень вкусный».",
          sentence_start: "Эйе, рәхмәт! Был бал бик ",
          sentence_end: "!",
          correct_option: "тәмле",
          options: ["тәмле", "юҡ", "дуҫ", "һөт"],
          grammar_explanation: "«Бик тәмле» — очень вкусный."
        },
        {
          mechanic: "boss_word_bank",
          story_context: "Поблагодари Өләсәй за угощение.",
          task_prompt: "Собери фразу: «Спасибо, бабушка! Чай очень вкусный!»",
          correct_sentence_ba: ["Рәхмәт,", "өләсәй!", "Сәй", "бик", "тәмле!"],
          distractor_words_ba: ["Юҡ", "Дуҫ", "Һөт"]
        },
        {
          mechanic: "reward_screen",
          final_praise_ba: "Афарин! Бик һәйбәт!",
          final_praise_ru: "Молодец! Очень хорошо!",
          reward_trophy: {
            title: "Бочонок бурзянского мёда",
            cultural_fact: "Бортевой мёд — часть башкирской культуры и традиции гостеприимства."
          }
        }
      ]
    }
  },
  {
    unit_id: 2,
    unit_title: "Мәктәп һәм дуҫтар",
    unit_subtitle: "Школа и друзья",
    accent: "green",
    lessons: [
      {
        unit_id: 2,
        lesson_id: 1,
        lesson_type: "flashcards",
        lesson_title: "Слова о школе",
        instruction: "Сначала познакомься со словами нового раздела. Ошибаться здесь невозможно.",
        cards: [
          { id: 1, ba: "Мәктәп", ru: "Школа", audio_tts: "Мәктәп", example_ba: "Мәктәп — яңы.", example_ru: "Школа — новая." },
          { id: 2, ba: "Дуҫ", ru: "Друг", audio_tts: "Дуҫ", example_ba: "Дуҫ менән бергә.", example_ru: "Вместе с другом." },
          { id: 3, ba: "Китап", ru: "Книга", audio_tts: "Китап", example_ba: "Мин китап уҡыйм.", example_ru: "Я читаю книгу." },
          { id: 4, ba: "Уҡытыусы", ru: "Учитель", audio_tts: "Уҡытыусы", example_ba: "Уҡытыусы дәрестә.", example_ru: "Учитель на уроке." },
          { id: 5, ba: "Уҡыусы", ru: "Ученик", audio_tts: "Уҡыусы", example_ba: "Уҡыусы китап уҡый.", example_ru: "Ученик читает книгу." },
          { id: 6, ba: "Дәрес", ru: "Урок", audio_tts: "Дәрес", example_ba: "Дәрес бик һәйбәт.", example_ru: "Урок очень хороший." },
          { id: 7, ba: "Яңы", ru: "Новый", audio_tts: "Яңы", example_ba: "Яңы китап.", example_ru: "Новая книга." },
          { id: 8, ba: "Мин", ru: "Я", audio_tts: "Мин", example_ba: "Мин уҡыусы.", example_ru: "Я ученик." },
          { id: 9, ba: "Һин", ru: "Ты", audio_tts: "Һин", example_ba: "Һин минең дуҫым.", example_ru: "Ты мой друг." },
          { id: 10, ba: "Бергә", ru: "Вместе", audio_tts: "Бергә", example_ba: "Бергә уҡыйбыҙ.", example_ru: "Читаем вместе." },
          { id: 11, ba: "Уҡыйм", ru: "Читаю", audio_tts: "Уҡыйм", example_ba: "Мин китап уҡыйм.", example_ru: "Я читаю книгу." },
          { id: 12, ba: "Яратам", ru: "Люблю", audio_tts: "Яратам", example_ba: "Мин мәктәпте яратам.", example_ru: "Я люблю школу." },
          { id: 13, ba: "Эйе", ru: "Да", audio_tts: "Эйе", example_ba: "Эйе, мин уҡыйм.", example_ru: "Да, я читаю." },
          { id: 14, ba: "Өләсәй", ru: "Бабушка", audio_tts: "Өләсәй", example_ba: "Өләсәй китап уҡый.", example_ru: "Бабушка читает книгу." }
        ]
      },
      {
        unit_id: 2,
        lesson_id: 2,
        lesson_type: "practice",
        lesson_title: "Школьные пары",
        instruction: "Собери предложение и восстанови пары слов.",
        steps: [
          {
            type: "word_bank",
            prompt: "Собери фразу: «Я читаю книгу».",
            target: ["Мин", "китап", "уҡыйм"],
            bank: ["Мин", "китап", "уҡыйм", "мәктәп", "һин", "дуҫ"]
          },
          {
            type: "match_pairs",
            prompt: "Найди перевод каждого слова:",
            pairs: [
              { ba: "Мәктәп", ru: "Школа" },
              { ba: "Уҡытыусы", ru: "Учитель" },
              { ba: "Уҡыусы", ru: "Ученик" },
              { ba: "Дәрес", ru: "Урок" }
            ]
          }
        ]
      },
      {
        unit_id: 2,
        lesson_id: 3,
        lesson_type: "practice",
        lesson_title: "На уроке",
        instruction: "Используй знакомую лексику в новом контексте.",
        steps: [
          {
            type: "fill_blank",
            prompt: "Вставь слово: «Я люблю школу».",
            sentence_pre: "Мин мәктәпте ",
            sentence_post: ".",
            correct: "яратам",
            options: ["яратам", "яңы", "дуҫ", "эйе"],
            hint: "«Яратам» — люблю."
          },
          {
            type: "chat_choice",
            speaker: "Дуҫ",
            speaker_ba: "Бергә китап уҡыймыҙ!",
            prompt: "Друг предлагает почитать вместе. Согласись:",
            options: [
              { text: "Эйе, бергә уҡыйм!", is_correct: true },
              { text: "Яңы мәктәп!", is_correct: false },
              { text: "Һин уҡытыусы!", is_correct: false }
            ]
          }
        ]
      }
    ],
    final_boss_node: {
      unit_id: 2,
      lesson_id: 99,
      lesson_type: "boss",
      quest_title: "Китап кисәһе у Өләсәй",
      cultural_character: { name: "Өләсәй — хранительница историй", initial: "Ө" },
      stages: [
        {
          mechanic: "chat_choice",
          story_context: "Вечером Өләсәй достаёт книгу башкирских сказаний.",
          npc_speech_ba: "Балам, бергә китап уҡыймыҙмы?",
          task_prompt: "Согласись почитать с бабушкой:",
          options: [
            { text_ba: "Эйе, өләсәй, мин китап уҡыйм!", is_correct: true },
            { text_ba: "Яңы мәктәп!", is_correct: false, error_hint: "Ответь на предложение бабушки словом «Эйе»." },
            { text_ba: "Һин уҡыусы!", is_correct: false, error_hint: "Скажи о своём согласии, а не о собеседнике." }
          ]
        },
        {
          mechanic: "grammar_trap",
          story_context: "Өләсәй спрашивает, что ты делаешь с книгой.",
          npc_speech_ba: "Китап менән нишләйһең?",
          task_prompt: "Закончи фразу: «Я читаю книгу».",
          sentence_start: "Мин китап ",
          sentence_end: ".",
          correct_option: "уҡыйм",
          options: ["уҡыйм", "яңы", "дуҫ", "мәктәп"],
          grammar_explanation: "«Мин … уҡыйм» — я … читаю."
        },
        {
          mechanic: "boss_word_bank",
          story_context: "Расскажи Өләсәй о своём любимом занятии.",
          task_prompt: "Собери фразу: «Я люблю школу».",
          correct_sentence_ba: ["Мин", "мәктәпте", "яратам"],
          distractor_words_ba: ["Һин", "Дәрес", "Эйе"]
        },
        {
          mechanic: "reward_screen",
          final_praise_ba: "Афарин, уҡыусы!",
          final_praise_ru: "Молодец, ученик!",
          reward_trophy: {
            title: "Китап с фразами Өләсәй",
            cultural_fact: "Семейное чтение помогает передавать язык, сказания и память между поколениями."
          }
        }
      ]
    }
  }
];
