export const COURSE_UNITS = [];

const CIRCLE_META = [
  {
    circle: "circle_1",
    lesson_id: 1,
    lesson_type: "flashcards",
    lesson_title: "Слова и квиз",
    instruction: "Переверни карточки, послушай слова и проверь себя.",
  },
  {
    circle: "circle_2",
    lesson_id: 2,
    lesson_type: "practice",
    lesson_title: "Собираем предложения",
    instruction: "Составь башкирские фразы по русскому переводу.",
  },
  {
    circle: "circle_3",
    lesson_id: 3,
    lesson_type: "practice",
    lesson_title: "Закрепляем слова",
    instruction: "Заполни пропуски и соедини слова с переводами.",
  },
];

const ACCENTS = ["blue", "green", "gold"];

function lessonFromSummary(summary, meta) {
  return {
    unit_id: summary.id,
    circle: meta.circle,
    lesson_id: meta.lesson_id,
    lesson_type: meta.lesson_type,
    lesson_title: meta.lesson_title,
    instruction: meta.instruction,
    cards: [],
    quiz: [],
    steps: [],
  };
}

function unitFromSummary(summary) {
  return {
    unit_id: summary.id,
    unit_title: summary.title,
    unit_subtitle: summary.description,
    character_name: summary.character_name,
    theme_slug: summary.theme_slug,
    accent: ACCENTS[(summary.order_index - 1) % ACCENTS.length],
    api_unlocked: summary.unlocked,
    api_progress: summary.progress,
    lessons: CIRCLE_META.map((meta) => lessonFromSummary(summary, meta)),
    final_boss_node: {
      unit_id: summary.id,
      lesson_id: 99,
      lesson_type: "boss",
      circle: "boss_story",
      quest_title: summary.title,
      cultural_character: { name: summary.character_name },
      stages: [],
    },
  };
}

export function replaceCourseUnits(summaries) {
  COURSE_UNITS.splice(0, COURSE_UNITS.length, ...summaries.map(unitFromSummary));
  return COURSE_UNITS;
}

function mapCards(detail) {
  return detail.circle_1.cards.map((card) => ({
    id: card.id,
    ba: card.ba_word,
    ru: card.ru_word,
    audio_tts: card.ba_word,
    transcription: card.transcription,
    example_ba: card.example_ba,
    example_ru: card.example_ru,
  }));
}

function mapBuildSentences(detail) {
  return detail.circle_2.build_sentence.map((exercise) => ({
    type: "word_bank",
    prompt: `Собери фразу: «${exercise.prompt_ru}»`,
    target: exercise.correct_answer.split(/\s+/),
    bank: [...exercise.tokens, ...exercise.distractors],
    hints: exercise.hints,
  }));
}

function mapFillBlanks(detail) {
  return detail.circle_3.fill_blanks.map((exercise) => {
    const [sentence_pre, sentence_post = ""] = exercise.target_ba.split("____");
    return {
      type: "fill_blank",
      prompt: `Вставь пропущенное слово: «${exercise.prompt_ru}»`,
      sentence_pre,
      sentence_post,
      correct: exercise.correct_answer,
      options: exercise.tokens,
      hint: exercise.hints[exercise.correct_answer] || exercise.correct_answer,
    };
  });
}

function mapPairs(detail) {
  const exercise = detail.circle_3.match_pairs;
  if (!exercise) return [];
  return [{
    type: "match_pairs",
    prompt: exercise.prompt_ru,
    pairs: Object.entries(exercise.correct_answer).map(([ba, ru]) => ({ ba, ru })),
  }];
}

function mapBossStages(unit, detail) {
  const story = detail.boss_story.steps.map((step) => ({
    mechanic: "chat_choice",
    story_context: step.npc_text_ru,
    npc_speech_ba: step.npc_text_ba,
    npc_speech_ru: step.npc_text_ru,
    speaker: step.character_name,
    task_prompt: "Выбери подходящий ответ:",
    options: step.options.map((option) => ({
      text_ba: option.text_ba,
      is_correct: option.is_correct,
      error_hint: option.explanation_ru,
    })),
  }));
  return [
    ...story,
    {
      mechanic: "reward_screen",
      final_praise_ba: "Афарин!",
      final_praise_ru: "История завершена",
      reward_trophy: {
        title: unit.unit_title,
        cultural_fact: unit.unit_subtitle,
      },
    },
  ];
}

export function applyUnitDetail(unit, detail) {
  const [circle1, circle2, circle3] = unit.lessons;
  circle1.cards = mapCards(detail);
  circle1.quiz = detail.circle_1.quiz.map((question) => ({ ...question }));
  circle2.steps = mapBuildSentences(detail);
  circle3.steps = [...mapFillBlanks(detail), ...mapPairs(detail)];
  unit.final_boss_node.stages = mapBossStages(unit, detail);
  unit.api_progress = detail.progress;
  unit.api_unlocked = detail.unlocked;
  return unit;
}
