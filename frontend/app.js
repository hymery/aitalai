// ==========================================================================
// БАШҠОРТ ТЕЛЕ — DUOLINGO APP CORE (КУРС, СООБЩЕСТВО, ПРОФИЛЬ)
// ЧИСТЫЙ ВЕКТОРНЫЙ ДИЗАЙН, БЕЗ СМАЙЛИКОВ И БЕЗ ИИ-МУСОРА
// ==========================================================================

const MOCK = {
  user: {
    name: 'Ильдар Хабиров',
    school: 'Гимназия №3, Уфа',
    class_name: '8Б',
    lang_pair: 'ba-ru',
    points: 240,
    level: 3,
    streak: 7,
    hearts: 5,
    accuracy: 94,
    verified_count: 18
  },

  unit1: {
    unit_id: 1,
    unit_title: "Раздел 1: Первые шаги и Гостеприимство",
    lessons: [
      {
        id: 1,
        title: "Приветствие и вежливость",
        desc: "Һаумыһығыҙ, сәләм, рәхмәт",
        status: "completed",
        stars: 3,
        steps: [
          {
            type: "word_bank",
            prompt: "Собери фразу на башкирском: «Привет, дорогой друг!»",
            target: ["Һаумы,", "ҡәҙерле", "дуҫ!"],
            bank: ["Һаумы,", "ҡәҙерле", "дуҫ!", "сәй", "юҡ", "исем", "рәхмәт"]
          },
          {
            type: "chat_choice",
            speaker: "Маскот",
            speaker_ba: "Һаумыһығыҙ! Хәлдәрегеҙ нисек?",
            prompt: "Выбери вежливый ответ на вопрос «Как ваши дела?»:",
            options: [
              { text: "Рәхмәт, минең хәлдәрем һәйбәт!", is_correct: true },
              { text: "Мин һыу эсәм.", is_correct: false },
              { text: "Һау бул!", is_correct: false }
            ]
          }
        ]
      },
      {
        id: 2,
        title: "Знакомство",
        desc: "Мин, һин, исем, дуҫ, башҡортса",
        status: "active",
        stars: 2,
        steps: [
          {
            type: "fill_blank",
            prompt: "Вставь пропущенное слово:",
            sentence_pre: "Мин башҡортса ",
            sentence_post: ".",
            correct: "һөйләшәм",
            options: ["һөйләшәм", "эсәм", "киләм", "алма"],
            hint: "«Һөйләшәм» означает «говорю» (Мин һөйләшәм = Я говорю)"
          },
          {
            type: "word_bank",
            prompt: "Собери фразу: «Меня зовут Ильдар»",
            target: ["Минең", "исемем", "—", "Ильдар"],
            bank: ["Минең", "исемем", "—", "Ильдар", "һин", "дуҫ", "сәй"]
          }
        ]
      },
      {
        id: 3,
        title: "Башкирское чаепитие",
        desc: "Сәй, бал, һөт, икмәк, тәмле",
        status: "open",
        stars: 0,
        steps: [
          {
            type: "fill_blank",
            prompt: "Вставь слово по смыслу:",
            sentence_pre: "Был башҡорт балы бик ",
            sentence_post: "!",
            correct: "тәмле",
            options: ["тәмле", "юҡ", "һаумы", "исем"],
            hint: "«Тәмле» — вкусный"
          },
          {
            type: "chat_choice",
            speaker: "Өләсәй",
            speaker_ba: "Сәй эсәйек, балам! Һөт ҡояйыммы?",
            prompt: "Бабушка предлагает чай с молоком. Ответь утвердительно:",
            options: [
              { text: "Эйе, рәхмәт, һөт ҡойоғоҙ!", is_correct: true },
              { text: "Юҡ, мин уҡыйым.", is_correct: false },
              { text: "Һаумыһығыҙ!", is_correct: false }
            ]
          }
        ]
      }
    ],

    // BOSS STORY QUEST («В гостях у Өләсәй»)
    final_boss_node: {
      node_type: "story_exam",
      quest_title: "В гостях у Өләсәй (Бабушки)",
      cultural_character: {
        id: "olasey",
        name: "Өләсәй (Бабушка Халима)",
        initial: "Ө",
        lore_intro: "Хранительница домашнего очага и традиций башкирского гостеприимства."
      },
      stages: [
        {
          step: 1,
          mechanic: "chat_choice",
          story_context: "Маскот заходит в юрту. За низким столиком сидит Өләсәй.",
          npc_speech_ba: "Һаумы, балам! Әйҙүк, түргә үт! Хәлдәрең нисек?",
          task_prompt: "Поздоровайся с бабушкой уважительно и ответь, как твои дела:",
          options: [
            {
              text_ba: "Һаумыһығыҙ, өләсәй! Рәхмәт, минең хәлдәрем һәйбәт!",
              is_correct: true,
              npc_reaction_ba: "Афарин! Ипле бала икәнең күренеп тора!"
            },
            {
              text_ba: "Һау бул! Мин һыу эсәм.",
              is_correct: false,
              error_hint: "«Һау бул» — это «Пока!», а ты только зашел в гости."
            },
            {
              text_ba: "Юҡ, был минең икмәк түгел.",
              is_correct: false,
              error_hint: "Бабушка спросила «Как дела?», а не про хлеб."
            }
          ]
        },
        {
          step: 2,
          mechanic: "interactive_table",
          story_context: "Өләсәй наливает чай из самовара и просит помочь накрыть на стол.",
          npc_speech_ba: "Кил әле, балам. Өҫтәлгә башҡорт балы, һөт һәм йылы икмәк ҡуй!",
          task_prompt: "Положи на стол ровно 3 продукта, которые назвала Өләсәй:",
          required_item_ids: ["honey", "milk", "bread"],
          table_items: [
            { id: "honey", label_ba: "Бал", label_ru: "Мёд" },
            { id: "milk", label_ba: "Һөт", label_ru: "Молоко" },
            { id: "bread", label_ba: "Икмәк", label_ru: "Хлеб" },
            { id: "water", label_ba: "Һыу", label_ru: "Вода" },
            { id: "apple", label_ba: "Алма", label_ru: "Яблоко" },
            { id: "meat", label_ba: "Ит", label_ru: "Мясо" }
          ]
        },
        {
          step: 3,
          mechanic: "grammar_trap",
          story_context: "Өләсәй угощает тебя и спрашивает, нравится ли тебе угощение.",
          npc_speech_ba: "Сәй эс, балам! Башҡорт балы бик тәмлеме?",
          task_prompt: "Вставь правильное слово по смыслу и грамматике в ответ:",
          sentence_start: "Эйе, рәхмәт! Был бал бик ",
          sentence_end: ", мин йылы сәй яратам!",
          correct_option: "тәмле",
          options: ["тәмле", "һаумы", "исем", "юҡ"],
          grammar_explanation: "«Тәмле» — вкусный. Подтверждаем: «бик тәмле»."
        },
        {
          step: 4,
          mechanic: "boss_word_bank",
          story_context: "Чаепитие подходит к концу. Поблагодари бабушку на чистом башкирском языке:",
          task_prompt: "Собери фразу: «Спасибо, бабушка! Я пью вкусный чай с молоком»",
          correct_sentence_ba: ["Рәхмәт,", "өләсәй!", "Мин", "һөтлө", "тәмле", "сәй", "эсәм"],
          distractor_words_ba: ["һыу", "юҡ", "һин", "ашайым"]
        },
        {
          step: 5,
          mechanic: "reward_screen",
          final_praise_ba: "Афарин! Һин ысын башҡортса һөйләшәһең! Киләһе осрашҡанға тиклем!",
          final_praise_ru: "Молодец! Ты говоришь прямо как знаток башкирского языка! До встречи!",
          reward_trophy: {
            trophy_id: "burzyan_honey",
            title: "Бочонок бурзянского мёда",
            cultural_fact: "Башкирский бортевой мёд собирают дикие тёмные лесные пчёлы (Бөрйән бал ҡорто), занесённые в Красную книгу."
          }
        }
      ]
    }
  },

  community_fragments: [
    {
      id: 1,
      text_ba: "Һаумыһығыҙ, ҡәҙерле ҡунаҡтар!",
      translation: "Здравствуйте, дорогие гости!",
      source: "М. Кәрим, «Өҙөлгән ҡағылдағы һәм хикәйәләр», Глава 2",
      confirmed: 8,
      is_correct: true
    },
    {
      id: 2,
      text_ba: "Башҡортостан — матур һәм бай ил.",
      translation: "Башкортостан — очень холодная страна.",
      correct_translation: "Башкортостан — прекрасная и богатая земля.",
      source: "З. Биишева, «Кәмһетелгән йондоҙ», Глава 1",
      confirmed: 2,
      is_correct: false
    },
    {
      id: 3,
      text_ba: "Мин мәктәптә яратып уҡыйм.",
      translation: "Я с удовольствием учусь в школе.",
      source: "Башҡорт теле дәреслеге, Урок 4",
      confirmed: 14,
      is_correct: true
    },
    {
      id: 4,
      text_ba: "Урманда һандуғастар һайрай.",
      translation: "В лесу поют соловьи.",
      source: "Р. Нигмәтуллин, «Йәшлек моңо», Глава 5",
      confirmed: 11,
      is_correct: true
    },
    {
      id: 5,
      text_ba: "Әсәйем тәмле сәй ҡайната.",
      translation: "Мама жарит мясо на огне.",
      correct_translation: "Мама заваривает вкусный чай.",
      source: "Башҡорт халыҡ ижады, Мәҡәлдәр",
      confirmed: 1,
      is_correct: false
    }
  ],

  user_submissions: [
    {
      ba: "Сәй эсәйек, дуҫтар!",
      ru: "Давайте выпьем чаю, друзья!",
      source: "Разговорная речь",
      status: "На проверке"
    },
    {
      ba: "Тыуған ил — алтын бишек.",
      ru: "Родная земля — золотая колыбель.",
      source: "Пословица",
      status: "Подтверждено (+20 XP)"
    }
  ],

  leaderboard: {
    students: [
      { rank: 1, name: "Айгуль Юсупова", meta: "Лицей №1, Уфа", points: 1520 },
      { rank: 2, name: "Тимур Валеев", meta: "Гимназия №3, Уфа", points: 1340 },
      { rank: 3, name: "Алсу Фаткуллина", meta: "Школа №5, Стерлитамак", points: 1200 },
      { rank: 4, name: "Ильдар Хабиров", meta: "Гимназия №3, Уфа (Вы)", points: 240, is_me: true },
      { rank: 5, name: "Динара Ишмуратова", meta: "Школа №12, Нефтекамск", points: 210 },
      { rank: 6, name: "Рустам Гареев", meta: "Лицей №2, Салават", points: 185 }
    ],
    schools: [
      { rank: 1, name: "Лицей №1, Уфа", meta: "124 ученика", points: 8420 },
      { rank: 2, name: "Гимназия №3, Уфа", meta: "98 учеников (Ваша школа)", points: 7890, is_me: true },
      { rank: 3, name: "Школа №5, Стерлитамак", meta: "76 учеников", points: 6210 },
      { rank: 4, name: "Школа №12, Нефтекамск", meta: "54 ученика", points: 4320 }
    ],
    classes: [
      { rank: 1, name: "9А класс", meta: "Лицей №1, Уфа", points: 2140 },
      { rank: 2, name: "8Б класс", meta: "Гимназия №3, Уфа (Ваш класс)", points: 1950, is_me: true },
      { rank: 3, name: "10В класс", meta: "Школа №5, Стерлитамак", points: 1780 }
    ]
  },

  badges: [
    { id: "traditions", icon: "kurai", colorClass: "gold", title: "Знаток традиций", desc: "Пройден контрольный квест у Өләсәй в юрте", status: "Получено" },
    { id: "steps", icon: "i-star", colorClass: "blue", title: "Первые шаги", desc: "Завершен первый урок курса", status: "Получено" },
    { id: "keeper", icon: "i-check", colorClass: "green", title: "Хранитель языка", desc: "Проверено 10 фраз в Китапхане переводов", status: "Получено" },
    { id: "lexicographer", icon: "i-pencil", colorClass: "gold", title: "Лексикограф", desc: "Предложен новый перевод в общую базу", status: "Получено" }
  ]
};

// ==========================================================================
// СОСТОЯНИЕ ПРИЛОЖЕНИЯ
// ==========================================================================

const State = {
  activeTab: 'course',

  // Обычный урок
  currentLesson: null,
  currentStepIndex: 0,
  lessonPhase: 'answering', // answering | feedback
  selectedAnswer: null,
  wordBankPlaced: [],

  // Boss Quest
  currentBossStageIndex: 0,
  bossPhase: 'answering', // answering | feedback
  bossSelectedItems: new Set(),
  bossChoiceSelected: null,
  bossWordBankPlaced: [],

  // Сообщество (проверка)
  commIndex: 0,
  commXpGained: 0,

  // Лидерборд
  activeBoard: 'students'
};

function showToast(text) {
  const toast = document.getElementById('toast');
  const toastText = document.getElementById('toast-text');
  if (!toast || !toastText) return;
  toastText.textContent = text;
  toast.classList.add('is-show');
  setTimeout(() => toast.classList.remove('is-show'), 2200);
}

function updateTopBar() {
  const streakEl = document.getElementById('top-streak');
  const pointsEl = document.getElementById('top-points');
  const heartsEl = document.getElementById('top-hearts');
  if (streakEl) streakEl.textContent = MOCK.user.streak;
  if (pointsEl) pointsEl.textContent = MOCK.user.points;
  if (heartsEl) heartsEl.textContent = MOCK.user.hearts;
}

// ==========================================================================
// НАВИГАЦИЯ МЕЖДУ 3 ТАБАМИ
// ==========================================================================

function switchTab(tabName) {
  State.activeTab = tabName;

  document.querySelectorAll('.duo-nav-tab').forEach(tab => {
    tab.classList.toggle('is-active', tab.dataset.tab === tabName);
  });

  const screens = {
    course: document.getElementById('screen-course'),
    community: document.getElementById('screen-community'),
    profile: document.getElementById('screen-profile')
  };

  Object.entries(screens).forEach(([key, el]) => {
    if (el) el.hidden = (key !== tabName);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabName === 'course') renderCourseTree();
  if (tabName === 'community') resetCommunityToHub();
  if (tabName === 'profile') renderProfile();
}

function initNavigation() {
  document.querySelectorAll('.duo-nav-tab').forEach(tab => {
    tab.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(tab.dataset.tab);
      location.hash = tab.dataset.tab;
    });
  });

  const hash = location.hash.replace('#', '');
  if (['course', 'community', 'profile'].includes(hash)) {
    switchTab(hash);
  } else {
    switchTab('course');
  }
}

// ==========================================================================
// КАРТА УРОКОВ (КУРС DUOLINGO)
// ==========================================================================

function renderCourseTree() {
  const tree = document.getElementById('path-tree');
  if (!tree) return;

  const positions = ['pos-c', 'pos-l1', 'pos-c'];
  let html = '';

  MOCK.unit1.lessons.forEach((lesson, idx) => {
    const pos = positions[idx % positions.length];
    const isDone = lesson.status === 'completed';
    const isActive = lesson.status === 'active';
    const isLocked = lesson.status === 'locked';

    const btnClass = isDone ? 'node-btn--done' : (isActive ? 'node-btn--active' : 'node-btn--locked');
    const starsHtml = isDone ? `
      <div class="node-stars">
        <svg class="icon icon-sm" style="color:var(--gold-500)"><use href="#i-star"></use></svg>
        <svg class="icon icon-sm" style="color:var(--gold-500)"><use href="#i-star"></use></svg>
        <svg class="icon icon-sm" style="color:var(--gold-500)"><use href="#i-star"></use></svg>
      </div>` : '';

    // Пузырь подсказки над активным уроком (без мультяшных картинок)
    const guideHtml = isActive ? `
      <div class="node-guide" style="left:50%;transform:translateX(-50%)">
        <div class="node-guide__bubble">Башлайбыҙмы? (Начнём?)</div>
      </div>` : '';

    html += `
      <div class="path-row ${pos}">
        <div class="node-wrap">
          ${guideHtml}
          ${starsHtml}
          <button class="node-btn ${btnClass}" type="button" data-lesson-id="${lesson.id}" ${isLocked ? 'disabled' : ''}>
            ${isDone ? '<svg class="icon"><use href="#i-check"></use></svg>' : '<svg class="icon"><use href="#i-star"></use></svg>'}
          </button>
          <span class="node-label">Урок ${lesson.id}</span>
        </div>
      </div>
    `;
  });

  // Финальный Большой Круг — Boss Quest
  html += `
    <div class="path-row pos-c" style="margin-top:var(--s4)">
      <div class="node-wrap">
        <div class="node-stars">
          <svg class="icon icon-sm" style="color:var(--gold-500)"><use href="#i-crown"></use></svg>
        </div>
        <button class="node-btn node-btn--active" id="btn-start-boss" type="button" style="width:84px;height:84px;border-color:var(--gold-600);background:var(--gold-500);color:var(--ink-900)">
          <svg class="icon" style="width:38px;height:38px"><use href="#i-crown"></use></svg>
        </button>
        <span class="node-label" style="font-weight:900;color:var(--gold-700)">Контрольная: Өләсәй</span>
      </div>
    </div>
  `;

  tree.innerHTML = html;

  tree.querySelectorAll('[data-lesson-id]').forEach(btn => {
    btn.addEventListener('click', () => {
      const lessonId = parseInt(btn.dataset.lessonId, 10);
      startLesson(lessonId);
    });
  });

  const bossBtn = document.getElementById('btn-start-boss');
  if (bossBtn) {
    bossBtn.addEventListener('click', startBossQuest);
  }
}

// ==========================================================================
// ОБЫЧНЫЙ УРОК: БЕЗ ГЛЮКОВ И БЕЗ БЛОКИРОВОК КНОПКИ «ПРОДОЛЖИТЬ»
// ==========================================================================

function startLesson(lessonId) {
  const lesson = MOCK.unit1.lessons.find(l => l.id === lessonId);
  if (!lesson) return;

  State.currentLesson = lesson;
  State.currentStepIndex = 0;
  State.lessonPhase = 'answering';
  State.selectedAnswer = null;
  State.wordBankPlaced = [];

  const modal = document.getElementById('modal-lesson');
  if (modal) modal.hidden = false;

  renderLessonStep();
}

function closeLesson() {
  const modal = document.getElementById('modal-lesson');
  if (modal) modal.hidden = true;
  State.currentLesson = null;
}

function renderLessonStep() {
  const lesson = State.currentLesson;
  const step = lesson.steps[State.currentStepIndex];
  const container = document.getElementById('lesson-step-container');
  const progressBar = document.getElementById('lesson-progress-bar');
  const actionBtn = document.getElementById('lesson-action-btn');
  const feedbackBox = document.getElementById('lesson-feedback-box');

  if (!step || !container) return;

  // Сброс фазы
  State.lessonPhase = 'answering';
  State.selectedAnswer = null;
  State.wordBankPlaced = [];

  // Сброс кнопки и фидбека
  if (feedbackBox) feedbackBox.hidden = true;
  if (actionBtn) {
    actionBtn.className = 'btn btn-primary btn-lg btn-block';
    actionBtn.textContent = 'Проверить';
    actionBtn.disabled = true;
  }

  // Прогресс
  const progressPct = Math.round(((State.currentStepIndex + 1) / lesson.steps.length) * 100);
  if (progressBar) progressBar.style.setProperty('--progress', `${progressPct}%`);

  if (step.type === 'word_bank') {
    container.innerHTML = `
      <h3 style="font-size:18px;margin-bottom:var(--s2)">Собери предложение</h3>
      <p class="t-15 muted" style="margin-bottom:var(--s3)">${step.prompt}</p>

      <div class="word-slot" id="lesson-word-slot"></div>

      <div class="word-bank" id="lesson-word-bank">
        ${step.bank.map(w => `<button type="button" class="word-chip" data-word="${w}">${w}</button>`).join('')}
      </div>
    `;

    const bankEl = document.getElementById('lesson-word-bank');
    const slotEl = document.getElementById('lesson-word-slot');

    bankEl.querySelectorAll('.word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (State.lessonPhase !== 'answering') return;
        const word = chip.dataset.word;
        State.wordBankPlaced.push(word);
        chip.classList.add('is-used');
        updateWordSlot(slotEl, bankEl);
        actionBtn.disabled = State.wordBankPlaced.length === 0;
      });
    });

  } else if (step.type === 'fill_blank') {
    container.innerHTML = `
      <h3 style="font-size:18px;margin-bottom:var(--s2)">Заполни пропуск</h3>
      <p class="t-15 muted" style="margin-bottom:var(--s3)">${step.prompt}</p>

      <div class="workout-card" style="font-size:20px;font-weight:800;text-align:center;padding:24px">
        <span>${step.sentence_pre}</span>
        <span id="blank-placeholder" style="display:inline-block;min-width:70px;border-bottom:3px solid var(--blue-500);color:var(--blue-600)">___</span>
        <span>${step.sentence_post}</span>
      </div>

      <div class="choice-list" id="lesson-choice-list">
        ${step.options.map(opt => `
          <button type="button" class="choice-btn" data-value="${opt}">
            <span style="width:24px;height:24px;border-radius:50%;border:2px solid var(--line-strong);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900">○</span>
            <span>${opt}</span>
          </button>
        `).join('')}
      </div>
    `;

    const choiceList = document.getElementById('lesson-choice-list');
    const placeholder = document.getElementById('blank-placeholder');
    choiceList.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (State.lessonPhase !== 'answering') return;
        choiceList.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        State.selectedAnswer = btn.dataset.value;
        placeholder.textContent = btn.dataset.value;
        actionBtn.disabled = false;
      });
    });

  } else if (step.type === 'chat_choice') {
    container.innerHTML = `
      <h3 style="font-size:18px;margin-bottom:var(--s3)">Мини-диалог</h3>

      <div class="story-dialog">
        <div class="avatar avatar--blue" style="width:48px;height:48px;font-weight:900;font-size:16px;flex-shrink:0">М</div>
        <div class="story-bubble">
          <div class="story-bubble__meta">${step.speaker}:</div>
          ${step.speaker_ba}
        </div>
      </div>

      <p class="t-14 muted" style="margin-bottom:var(--s2)">${step.prompt}</p>

      <div class="choice-list" id="lesson-chat-choices">
        ${step.options.map((opt, i) => `
          <button type="button" class="choice-btn" data-index="${i}">
            <span style="font-weight:900;color:var(--blue-500)">${i + 1}.</span>
            <span>${opt.text}</span>
          </button>
        `).join('')}
      </div>
    `;

    const choiceList = document.getElementById('lesson-chat-choices');
    choiceList.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (State.lessonPhase !== 'answering') return;
        choiceList.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        const optIndex = parseInt(btn.dataset.index, 10);
        State.selectedAnswer = step.options[optIndex];
        actionBtn.disabled = false;
      });
    });
  }
}

function updateWordSlot(slotEl, bankEl) {
  slotEl.innerHTML = State.wordBankPlaced.map((w, idx) => `
    <button type="button" class="word-chip" data-placed-idx="${idx}" style="background:var(--blue-50);border-color:var(--blue-500)">
      ${w}
    </button>
  `).join('');

  slotEl.querySelectorAll('[data-placed-idx]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (State.lessonPhase !== 'answering') return;
      const idx = parseInt(chip.dataset.placedIdx, 10);
      const removedWord = State.wordBankPlaced.splice(idx, 1)[0];

      const bankChips = Array.from(bankEl.querySelectorAll('.word-chip'));
      const matchingBankChip = bankChips.find(c => c.dataset.word === removedWord && c.classList.contains('is-used'));
      if (matchingBankChip) matchingBankChip.classList.remove('is-used');

      updateWordSlot(slotEl, bankEl);
      const actionBtn = document.getElementById('lesson-action-btn');
      if (actionBtn) actionBtn.disabled = State.wordBankPlaced.length === 0;
    });
  });
}

function handleLessonActionClick() {
  const lesson = State.currentLesson;
  const step = lesson.steps[State.currentStepIndex];
  const actionBtn = document.getElementById('lesson-action-btn');
  const feedbackBox = document.getElementById('lesson-feedback-box');

  // ФАЗА 1: ПРОВЕРКА ОТВЕТА
  if (State.lessonPhase === 'answering') {
    let isCorrect = false;

    if (step.type === 'word_bank') {
      isCorrect = JSON.stringify(State.wordBankPlaced) === JSON.stringify(step.target);
    } else if (step.type === 'fill_blank') {
      isCorrect = (State.selectedAnswer === step.correct);
    } else if (step.type === 'chat_choice') {
      isCorrect = State.selectedAnswer && State.selectedAnswer.is_correct;
    }

    State.lessonPhase = 'feedback';

    if (isCorrect) {
      MOCK.user.points += 10;
      updateTopBar();
      feedbackBox.className = 'modal-feedback-box modal-feedback-box--success';
      feedbackBox.innerHTML = `
        <div style="font-size:24px;font-weight:900;color:var(--green-600)">✓</div>
        <div>
          <div class="modal-feedback-box__title">Афарин! Всё верно!</div>
          <div class="modal-feedback-box__desc">+10 XP за правильный ответ</div>
        </div>
      `;
      feedbackBox.hidden = false;
      actionBtn.className = 'btn btn-success btn-lg btn-block';
      actionBtn.textContent = 'Продолжить →';
      actionBtn.disabled = false;
    } else {
      MOCK.user.hearts = Math.max(0, MOCK.user.hearts - 1);
      updateTopBar();
      feedbackBox.className = 'modal-feedback-box modal-feedback-box--error';
      feedbackBox.innerHTML = `
        <div style="font-size:24px;font-weight:900;color:var(--red-600)">✕</div>
        <div>
          <div class="modal-feedback-box__title">Не совсем так</div>
          <div class="modal-feedback-box__desc">Запомни правильный вариант и двигайся дальше</div>
        </div>
      `;
      feedbackBox.hidden = false;
      actionBtn.className = 'btn btn-primary btn-lg btn-block';
      actionBtn.textContent = 'Продолжить →';
      actionBtn.disabled = false;
    }

  // ФАЗА 2: ПЕРЕХОД К СЛЕДУЮЩЕМУ ШАГУ
  } else if (State.lessonPhase === 'feedback') {
    State.currentStepIndex++;

    if (State.currentStepIndex < State.currentLesson.steps.length) {
      renderLessonStep();
    } else {
      // Завершение урока
      State.currentLesson.status = 'completed';
      State.currentLesson.stars = 3;
      closeLesson();
      showToast('Урок успешно завершён! +30 XP');
      renderCourseTree();
    }
  }
}

// ==========================================================================
// BOSS STORY QUEST («В гостях у Өләсәй»)
// ==========================================================================

function startBossQuest() {
  State.currentBossStageIndex = 0;
  State.bossPhase = 'answering';
  State.bossSelectedItems.clear();
  State.bossChoiceSelected = null;
  State.bossWordBankPlaced = [];

  const modal = document.getElementById('modal-boss');
  if (modal) modal.hidden = false;

  renderBossStage();
}

function closeBossQuest() {
  const modal = document.getElementById('modal-boss');
  if (modal) modal.hidden = true;
}

function renderBossStage() {
  const stages = MOCK.unit1.final_boss_node.stages;
  const stage = stages[State.currentBossStageIndex];
  const container = document.getElementById('boss-step-container');
  const progressBar = document.getElementById('boss-progress-bar');
  const stepLabel = document.getElementById('boss-step-label');
  const actionBtn = document.getElementById('boss-action-btn');
  const feedbackBox = document.getElementById('boss-feedback-box');

  if (!stage || !container) return;

  State.bossPhase = 'answering';
  if (feedbackBox) feedbackBox.hidden = true;

  const progressPct = Math.round(((State.currentBossStageIndex + 1) / stages.length) * 100);
  if (progressBar) progressBar.style.setProperty('--progress', `${progressPct}%`);
  if (stepLabel) stepLabel.textContent = `${State.currentBossStageIndex + 1}/${stages.length}`;

  if (actionBtn) {
    actionBtn.className = 'btn btn-primary btn-lg btn-block';
    actionBtn.textContent = (stage.mechanic === 'reward_screen') ? 'Завершить контрольную (+100 XP)' : 'Проверить ответ';
    actionBtn.disabled = (stage.mechanic !== 'reward_screen');
  }

  // Шаг 1: chat_choice
  if (stage.mechanic === 'chat_choice') {
    container.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--gold-600);margin-bottom:4px">ШАГ 1: ГОСТЕПРИИМНАЯ ЮРТА</div>
      <p class="t-14 muted" style="margin-bottom:var(--s3)">${stage.story_context}</p>

      <div class="story-dialog">
        <div class="avatar avatar--gold" style="width:48px;height:48px;font-weight:900;font-size:18px;flex-shrink:0">Ө</div>
        <div class="story-bubble">
          <div class="story-bubble__meta">Өләсәй (Бабушка Халима):</div>
          ${stage.npc_speech_ba}
        </div>
      </div>

      <p class="t-14" style="font-weight:800;margin-bottom:var(--s2)">${stage.task_prompt}</p>

      <div class="choice-list" id="boss-chat-choices">
        ${stage.options.map((opt, i) => `
          <button type="button" class="choice-btn" data-index="${i}">
            <span style="font-weight:900;color:var(--gold-600)">${i + 1}.</span>
            <span>${opt.text_ba}</span>
          </button>
        `).join('')}
      </div>
    `;

    const choiceList = document.getElementById('boss-chat-choices');
    choiceList.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (State.bossPhase !== 'answering') return;
        choiceList.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        const idx = parseInt(btn.dataset.index, 10);
        State.bossChoiceSelected = stage.options[idx];
        actionBtn.disabled = false;
      });
    });

  // Шаг 2: interactive_table (Выбрать 3 продукта)
  } else if (stage.mechanic === 'interactive_table') {
    State.bossSelectedItems.clear();

    container.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--gold-600);margin-bottom:4px">ШАГ 2: НАКРЫВАЕМ НА СТОЛ</div>
      <p class="t-14 muted" style="margin-bottom:var(--s3)">${stage.story_context}</p>

      <div class="story-dialog">
        <div class="avatar avatar--gold" style="width:48px;height:48px;font-weight:900;font-size:18px;flex-shrink:0">Ө</div>
        <div class="story-bubble">
          <div class="story-bubble__meta">Өләсәй:</div>
          ${stage.npc_speech_ba}
        </div>
      </div>

      <p class="t-14" style="font-weight:800;margin-bottom:var(--s2)">
        ${stage.task_prompt} <span id="table-counter" style="color:var(--green-600)">(выбрано: 0 из 3)</span>
      </p>

      <div class="table-grid" id="boss-table-grid">
        ${stage.table_items.map(item => `
          <div class="table-card" data-item-id="${item.id}">
            <div style="font-size:16px;font-weight:900;color:var(--ink-900);margin-bottom:2px">${item.label_ba}</div>
            <div class="t-12 muted">${item.label_ru}</div>
          </div>
        `).join('')}
      </div>
    `;

    const grid = document.getElementById('boss-table-grid');
    const counter = document.getElementById('table-counter');

    grid.querySelectorAll('.table-card').forEach(card => {
      card.addEventListener('click', () => {
        if (State.bossPhase !== 'answering') return;
        const id = card.dataset.itemId;
        if (State.bossSelectedItems.has(id)) {
          State.bossSelectedItems.delete(id);
          card.classList.remove('is-selected');
        } else {
          if (State.bossSelectedItems.size < 3) {
            State.bossSelectedItems.add(id);
            card.classList.add('is-selected');
          }
        }
        counter.textContent = `(выбрано: ${State.bossSelectedItems.size} из 3)`;
        actionBtn.disabled = (State.bossSelectedItems.size !== 3);
      });
    });

  // Шаг 3: grammar_trap
  } else if (stage.mechanic === 'grammar_trap') {
    State.bossChoiceSelected = null;

    container.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--gold-600);margin-bottom:4px">ШАГ 3: БЕСЕДА</div>
      <p class="t-14 muted" style="margin-bottom:var(--s3)">${stage.story_context}</p>

      <div class="story-dialog">
        <div class="avatar avatar--gold" style="width:48px;height:48px;font-weight:900;font-size:18px;flex-shrink:0">Ө</div>
        <div class="story-bubble">
          <div class="story-bubble__meta">Өләсәй:</div>
          ${stage.npc_speech_ba}
        </div>
      </div>

      <p class="t-14" style="font-weight:800;margin-bottom:var(--s2)">${stage.task_prompt}</p>

      <div class="workout-card" style="font-size:18px;font-weight:800;padding:20px">
        <span>${stage.sentence_start}</span>
        <span id="boss-blank-box" style="display:inline-block;min-width:60px;border-bottom:3px solid var(--gold-500);color:var(--gold-700)">___</span>
        <span>${stage.sentence_end}</span>
      </div>

      <div class="choice-list" id="boss-trap-choices">
        ${stage.options.map(opt => `
          <button type="button" class="choice-btn" data-value="${opt}">
            <span style="font-weight:900;color:var(--blue-500)">○</span>
            <span>${opt}</span>
          </button>
        `).join('')}
      </div>
    `;

    const choiceList = document.getElementById('boss-trap-choices');
    const blankBox = document.getElementById('boss-blank-box');

    choiceList.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (State.bossPhase !== 'answering') return;
        choiceList.querySelectorAll('.choice-btn').forEach(b => b.classList.remove('is-selected'));
        btn.classList.add('is-selected');
        State.bossChoiceSelected = btn.dataset.value;
        blankBox.textContent = btn.dataset.value;
        actionBtn.disabled = false;
      });
    });

  // Шаг 4: boss_word_bank
  } else if (stage.mechanic === 'boss_word_bank') {
    State.bossWordBankPlaced = [];

    const allWords = [...stage.correct_sentence_ba, ...stage.distractor_words_ba].sort(() => Math.random() - 0.5);

    container.innerHTML = `
      <div style="font-size:12px;font-weight:800;color:var(--gold-600);margin-bottom:4px">ШАГ 4: БЛАГОДАРНОСТЬ</div>
      <p class="t-14 muted" style="margin-bottom:var(--s3)">${stage.story_context}</p>
      <p class="t-14" style="font-weight:800;margin-bottom:var(--s2)">${stage.task_prompt}</p>

      <div class="word-slot" id="boss-word-slot"></div>

      <div class="word-bank" id="boss-word-bank">
        ${allWords.map(w => `<button type="button" class="word-chip" data-word="${w}">${w}</button>`).join('')}
      </div>
    `;

    const bankEl = document.getElementById('boss-word-bank');
    const slotEl = document.getElementById('boss-word-slot');

    bankEl.querySelectorAll('.word-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (State.bossPhase !== 'answering') return;
        const word = chip.dataset.word;
        State.bossWordBankPlaced.push(word);
        chip.classList.add('is-used');
        updateBossWordSlot(slotEl, bankEl);
        actionBtn.disabled = State.bossWordBankPlaced.length === 0;
      });
    });

  // Шаг 5: reward_screen
  } else if (stage.mechanic === 'reward_screen') {
    container.innerHTML = `
      <div style="text-align:center;padding:var(--s3) 0">
        <div style="width:64px;height:64px;border-radius:50%;background:var(--gold-50);border:2px solid var(--gold-500);color:var(--gold-700);display:flex;align-items:center;justify-content:center;margin:0 auto var(--s3)">
          <svg class="icon" style="width:32px;height:32px"><use href="#i-crown"></use></svg>
        </div>
        <h2 style="font-size:22px;margin-bottom:6px">Контрольная успешно пройдена!</h2>
        <p class="lead" style="margin-bottom:var(--s4)">Ты подтвердил знание традиций и гостеприимства.</p>

        <div class="story-dialog" style="text-align:left;margin-bottom:var(--s4)">
          <div class="avatar avatar--gold" style="width:48px;height:48px;font-weight:900;font-size:18px;flex-shrink:0">Ө</div>
          <div class="story-bubble" style="background:var(--gold-50);border-color:var(--gold-500)">
            <div class="story-bubble__meta">Өләсәй:</div>
            ${stage.final_praise_ba}
            <div style="font-size:13px;font-weight:600;color:var(--ink-600);margin-top:6px">«${stage.final_praise_ru}»</div>
          </div>
        </div>

        <div class="card" style="border:2px solid var(--gold-500);background:var(--gold-50);margin-bottom:var(--s4);text-align:left">
          <div style="font-size:12px;font-weight:900;color:var(--gold-700);margin-bottom:2px">НОВАЯ НАГРАДА В ПРОФИЛЕ</div>
          <div style="font-size:17px;font-weight:800;color:var(--ink-900);margin-bottom:6px">${stage.reward_trophy.title}</div>
          <p class="t-13" style="line-height:1.45;color:var(--ink-600);margin:0">
            <strong>Культурный факт:</strong> ${stage.reward_trophy.cultural_fact}
          </p>
        </div>
      </div>
    `;

    actionBtn.disabled = false;
  }
}

function updateBossWordSlot(slotEl, bankEl) {
  slotEl.innerHTML = State.bossWordBankPlaced.map((w, idx) => `
    <button type="button" class="word-chip" data-boss-placed-idx="${idx}" style="background:var(--gold-50);border-color:var(--gold-500)">
      ${w}
    </button>
  `).join('');

  slotEl.querySelectorAll('[data-boss-placed-idx]').forEach(chip => {
    chip.addEventListener('click', () => {
      if (State.bossPhase !== 'answering') return;
      const idx = parseInt(chip.dataset.bossPlacedIdx, 10);
      const removedWord = State.bossWordBankPlaced.splice(idx, 1)[0];

      const bankChips = Array.from(bankEl.querySelectorAll('.word-chip'));
      const matching = bankChips.find(c => c.dataset.word === removedWord && c.classList.contains('is-used'));
      if (matching) matching.classList.remove('is-used');

      updateBossWordSlot(slotEl, bankEl);
      const actionBtn = document.getElementById('boss-action-btn');
      if (actionBtn) actionBtn.disabled = State.bossWordBankPlaced.length === 0;
    });
  });
}

function handleBossActionClick() {
  const stages = MOCK.unit1.final_boss_node.stages;
  const stage = stages[State.currentBossStageIndex];
  const actionBtn = document.getElementById('boss-action-btn');
  const feedbackBox = document.getElementById('boss-feedback-box');

  // ФИНАЛ: ВРУЧЕНИЕ НАГРАДЫ
  if (stage.mechanic === 'reward_screen') {
    MOCK.user.points += 100;
    updateTopBar();
    closeBossQuest();
    showToast('Контрольная завершена! +100 XP');
    renderCourseTree();
    return;
  }

  // ФАЗА 1: ПРОВЕРКА ОТВЕТА
  if (State.bossPhase === 'answering') {
    let isCorrect = true;
    if (stage.mechanic === 'chat_choice') {
      isCorrect = State.bossChoiceSelected && State.bossChoiceSelected.is_correct;
    } else if (stage.mechanic === 'interactive_table') {
      const req = new Set(stage.required_item_ids);
      isCorrect = (State.bossSelectedItems.size === req.size && [...State.bossSelectedItems].every(x => req.has(x)));
    } else if (stage.mechanic === 'grammar_trap') {
      isCorrect = (State.bossChoiceSelected === stage.correct_option);
    } else if (stage.mechanic === 'boss_word_bank') {
      isCorrect = JSON.stringify(State.bossWordBankPlaced) === JSON.stringify(stage.correct_sentence_ba);
    }

    State.bossPhase = 'feedback';

    if (isCorrect) {
      MOCK.user.points += 20;
      updateTopBar();
      feedbackBox.className = 'modal-feedback-box modal-feedback-box--success';
      feedbackBox.innerHTML = `
        <div style="font-size:24px;font-weight:900;color:var(--green-600)">✓</div>
        <div>
          <div class="modal-feedback-box__title">Афарин! (Отлично!)</div>
          <div class="modal-feedback-box__desc">+20 XP за правильный ответ</div>
        </div>
      `;
      feedbackBox.hidden = false;
      actionBtn.className = 'btn btn-success btn-lg btn-block';
      actionBtn.textContent = 'Следующий шаг →';
      actionBtn.disabled = false;
    } else {
      feedbackBox.className = 'modal-feedback-box modal-feedback-box--error';
      feedbackBox.innerHTML = `
        <div style="font-size:24px;font-weight:900;color:var(--red-600)">✕</div>
        <div>
          <div class="modal-feedback-box__title">Өләсәй ждала другого ответа</div>
          <div class="modal-feedback-box__desc">Внимательно перечитай реплику бабушки</div>
        </div>
      `;
      feedbackBox.hidden = false;
      actionBtn.className = 'btn btn-primary btn-lg btn-block';
      actionBtn.textContent = 'Следующий шаг →';
      actionBtn.disabled = false;
    }

  // ФАЗА 2: ПЕРЕХОД
  } else if (State.bossPhase === 'feedback') {
    State.currentBossStageIndex++;
    renderBossStage();
  }
}

// ==========================================================================
// СООБЩЕСТВО (КИТАПХАНА): 2 КАРТОЧКИ ВЫБОРА -> РЕЖИМЫ
// ==========================================================================

function resetCommunityToHub() {
  const hub = document.getElementById('comm-hub-view');
  const verify = document.getElementById('comm-verify-view');
  const suggest = document.getElementById('comm-suggest-view');
  if (hub) hub.hidden = false;
  if (verify) verify.hidden = true;
  if (suggest) suggest.hidden = true;
}

function initCommunity() {
  const cardVerify = document.getElementById('card-action-verify');
  const cardAdd = document.getElementById('card-action-add');
  const hubView = document.getElementById('comm-hub-view');
  const verifyView = document.getElementById('comm-verify-view');
  const suggestView = document.getElementById('comm-suggest-view');

  const backBtn1 = document.getElementById('btn-back-hub-1');
  const backBtn2 = document.getElementById('btn-back-hub-2');

  if (cardVerify) {
    cardVerify.addEventListener('click', () => {
      hubView.hidden = true;
      verifyView.hidden = false;
      suggestView.hidden = true;
      renderCommunityVerifyTask();
    });
  }

  if (cardAdd) {
    cardAdd.addEventListener('click', () => {
      hubView.hidden = true;
      verifyView.hidden = true;
      suggestView.hidden = false;
      renderUserSubmissions();
    });
  }

  if (backBtn1) backBtn1.addEventListener('click', resetCommunityToHub);
  if (backBtn2) backBtn2.addEventListener('click', resetCommunityToHub);

  // Буквы башкирского языка
  document.querySelectorAll('.ba-key').forEach(btn => {
    btn.addEventListener('click', () => {
      const letter = btn.dataset.letter;
      const input = document.getElementById('suggest-ba');
      if (!input) return;
      input.value += letter;
      input.focus();
    });
  });

  // Форма добавления нового перевода
  const formSuggest = document.getElementById('form-suggest-translation');
  if (formSuggest) {
    formSuggest.addEventListener('submit', (e) => {
      e.preventDefault();
      const baInput = document.getElementById('suggest-ba');
      const ruInput = document.getElementById('suggest-ru');
      const sourceInput = document.getElementById('suggest-source');

      const baText = baInput.value.trim();
      const ruText = ruInput.value.trim();
      const source = sourceInput.value;

      if (baText.length < 2 || ruText.length < 2) {
        showToast('Фраза слишком короткая');
        return;
      }

      MOCK.user_submissions.unshift({
        ba: baText,
        ru: ruText,
        source: source,
        status: "На проверке"
      });
      MOCK.user.points += 20;
      updateTopBar();
      showToast('Фраза добавлена в базу! +20 XP');

      baInput.value = '';
      ruInput.value = '';
      renderUserSubmissions();
    });
  }

  // Проверка карточек в блоке
  const btnCorrect = document.getElementById('btn-comm-correct');
  const btnFix = document.getElementById('btn-comm-fix');
  const btnSubmitFix = document.getElementById('btn-comm-submit-fix');
  const btnCancelFix = document.getElementById('btn-comm-cancel-fix');
  const btnNextBlock = document.getElementById('btn-comm-next-block');

  if (btnCorrect) {
    btnCorrect.addEventListener('click', () => handleCommunityAnswer(true));
  }

  if (btnFix) {
    btnFix.addEventListener('click', () => {
      document.getElementById('comm-fix-card').hidden = false;
      document.getElementById('comm-normal-actions').hidden = true;
      document.getElementById('comm-fix-actions').hidden = false;
      document.getElementById('comm-fix-input').focus();
    });
  }

  if (btnCancelFix) {
    btnCancelFix.addEventListener('click', () => {
      document.getElementById('comm-fix-card').hidden = true;
      document.getElementById('comm-normal-actions').hidden = false;
      document.getElementById('comm-fix-actions').hidden = true;
      document.getElementById('comm-fix-input').value = '';
    });
  }

  if (btnSubmitFix) {
    btnSubmitFix.addEventListener('click', () => {
      const fixInput = document.getElementById('comm-fix-input');
      if (!fixInput.value.trim()) {
        showToast('Введи исправленный вариант');
        return;
      }
      handleCommunityAnswer(false, fixInput.value.trim());
    });
  }

  if (btnNextBlock) {
    btnNextBlock.addEventListener('click', () => {
      State.commIndex = 0;
      State.commXpGained = 0;
      document.getElementById('comm-finish-card').hidden = true;
      document.getElementById('comm-normal-actions').hidden = false;
      renderCommunityVerifyTask();
    });
  }
}

function renderCommunityVerifyTask() {
  const fragments = MOCK.community_fragments;
  const item = fragments[State.commIndex];

  if (!item) {
    document.getElementById('comm-finish-card').hidden = false;
    document.getElementById('comm-normal-actions').hidden = true;
    document.getElementById('comm-fix-card').hidden = true;
    document.getElementById('comm-fix-actions').hidden = true;
    return;
  }

  document.getElementById('comm-task-index').textContent = State.commIndex + 1;
  document.getElementById('comm-ba-text').textContent = item.text_ba;
  document.getElementById('comm-source-text').innerHTML = `
    <svg class="icon icon-sm" aria-hidden="true" style="display:inline-block;vertical-align:middle;margin-right:4px"><use href="#i-book"></use></svg>
    ${item.source}
  `;
  document.getElementById('comm-ru-text').textContent = item.translation;
  document.getElementById('comm-confirmed-badge').textContent = `${item.confirmed} подтверждений`;

  document.getElementById('comm-fix-card').hidden = true;
  document.getElementById('comm-normal-actions').hidden = false;
  document.getElementById('comm-fix-actions').hidden = true;
  document.getElementById('comm-fix-input').value = '';
}

function handleCommunityAnswer(isConfirmed, fixText = '') {
  const earnedXp = isConfirmed ? 10 : 15;
  MOCK.user.points += earnedXp;
  MOCK.user.verified_count++;
  State.commXpGained += earnedXp;
  updateTopBar();

  showToast(isConfirmed ? 'Перевод подтверждён! +10 XP' : 'Исправление принято! +15 XP');
  State.commIndex++;
  renderCommunityVerifyTask();
}

function renderUserSubmissions() {
  const container = document.getElementById('comm-user-submissions');
  if (!container) return;

  container.innerHTML = MOCK.user_submissions.map(sub => `
    <div class="card" style="padding:12px 14px;border-left:4px solid var(--blue-500)">
      <div style="font-weight:800;font-size:15px;color:var(--ink-900);margin-bottom:2px">${sub.ba}</div>
      <div class="t-13" style="color:var(--ink-600);margin-bottom:4px">${sub.ru}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;color:var(--ink-500)">
        <span>${sub.source}</span>
        <span class="chip" style="font-size:11px;padding:2px 8px">${sub.status}</span>
      </div>
    </div>
  `).join('');
}

// ==========================================================================
// ПРОФИЛЬ, НАГРАДЫ И РЕЙТИНГИ
// ==========================================================================

function renderProfile() {
  document.getElementById('prof-name').textContent = MOCK.user.name;
  document.getElementById('prof-school').textContent = `${MOCK.user.school} · ${MOCK.user.class_name} класс`;
  document.getElementById('prof-points').textContent = MOCK.user.points;
  document.getElementById('prof-level').textContent = MOCK.user.level;
  document.getElementById('prof-streak').textContent = MOCK.user.streak;
  document.getElementById('prof-accuracy').textContent = `${MOCK.user.accuracy}%`;

  renderBadges();
  renderLeaderboard();
}

function renderBadges() {
  const list = document.getElementById('prof-badge-list');
  if (!list) return;

  list.innerHTML = MOCK.badges.map(b => `
    <div class="badge-item">
      <div class="badge-item__icon badge-item__icon--${b.colorClass}">
        <svg class="icon"><use href="#${b.icon}"></use></svg>
      </div>
      <div class="badge-item__info">
        <div class="badge-item__title">${b.title}</div>
        <div class="badge-item__desc">${b.desc}</div>
      </div>
      <span class="chip chip--green" style="font-size:11px;font-weight:800">${b.status}</span>
    </div>
  `).join('');
}

function renderLeaderboard() {
  const list = document.getElementById('board-list');
  if (!list) return;

  const data = MOCK.leaderboard[State.activeBoard] || MOCK.leaderboard.students;

  list.innerHTML = data.map((item) => {
    let rankBadgeClass = 'rank-badge--other';
    if (item.rank === 1) rankBadgeClass = 'rank-badge--1';
    if (item.rank === 2) rankBadgeClass = 'rank-badge--2';
    if (item.rank === 3) rankBadgeClass = 'rank-badge--3';

    const isMe = item.is_me;
    return `
      <div class="rank-item ${isMe ? 'is-me' : ''}" style="${isMe ? 'background:var(--blue-50);border:2px solid var(--blue-500)' : ''}">
        <div class="rank-badge ${rankBadgeClass}">${item.rank}</div>
        <div class="avatar" style="width:36px;height:36px;font-size:14px">${item.name.slice(0, 2).toUpperCase()}</div>
        <div class="rank-info">
          <div class="rank-name">${item.name}</div>
          <div class="rank-meta">${item.meta}</div>
        </div>
        <div class="rank-points">
          <span>${item.points}</span>
          <svg class="icon icon-sm stat-kurai" aria-hidden="true"><use href="#kurai"></use></svg>
        </div>
      </div>
    `;
  }).join('');
}

function initProfileTabs() {
  document.querySelectorAll('[data-board]').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('[data-board]').forEach(t => t.classList.remove('is-active'));
      tab.classList.add('is-active');
      State.activeBoard = tab.dataset.board;
      renderLeaderboard();
    });
  });

  const resetBtn = document.getElementById('btn-reset-demo');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      MOCK.user.points = 240;
      MOCK.user.hearts = 5;
      MOCK.unit1.lessons[0].status = 'completed';
      MOCK.unit1.lessons[1].status = 'active';
      MOCK.unit1.lessons[2].status = 'open';
      updateTopBar();
      renderCourseTree();
      renderProfile();
      showToast('Прогресс сброшен к начальному состоянию');
    });
  }
}

// ==========================================================================
// ТОЧКА ВХОДА
// ==========================================================================

document.addEventListener('DOMContentLoaded', () => {
  initNavigation();
  initCommunity();
  initProfileTabs();
  updateTopBar();

  // Слушатели модалок
  const lessonClose = document.getElementById('lesson-close');
  if (lessonClose) lessonClose.addEventListener('click', closeLesson);

  const lessonAction = document.getElementById('lesson-action-btn');
  if (lessonAction) lessonAction.addEventListener('click', handleLessonActionClick);

  const bossClose = document.getElementById('boss-close');
  if (bossClose) bossClose.addEventListener('click', closeBossQuest);

  const bossAction = document.getElementById('boss-action-btn');
  if (bossAction) bossAction.addEventListener('click', handleBossActionClick);
});
