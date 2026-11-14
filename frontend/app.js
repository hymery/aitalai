import { COURSE_UNITS } from "./course-data.js";
import {
  ApiError,
  API_URL,
  apiRequest,
  fetchTelegramToken,
  getStoredToken,
  saveToken,
} from "./api.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const RATING_CATEGORIES = [
  { id: "top", label: "Ученики", endpoint: "/ratings/top" },
  { id: "schools", label: "Школы", endpoint: "/ratings/schools" },
  { id: "classes", label: "Классы", endpoint: "/ratings/classes" },
  { id: "accuracy", label: "Точность", endpoint: "/ratings/accuracy" },
  { id: "vocabulary", label: "Словарь", endpoint: "/ratings/vocabulary" },
  { id: "corrections", label: "Исправления", endpoint: "/ratings/corrections" },
];

const RATING_PERIODS = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
  { id: "all", label: "Всё время" },
];

const BADGE_CATALOG = [
  { id: "first_answer", title: "Первый голос", desc: "Оценён первый перевод", icon: "i-check" },
  { id: "corrector", title: "Внимательный редактор", desc: "Предложено первое исправление", icon: "i-pencil" },
  { id: "hundred_points", title: "Сотня XP", desc: "Набрано 100 очков опыта", icon: "kurai" },
  { id: "ten_answers", title: "Хранитель языка", desc: "Отправлено 10 оценок переводов", icon: "i-shield" },
];

const State = {
  user: null,
  activeTab: "course",
  progress: new Set(),
  currentUnit: null,
  currentLesson: null,
  currentStepIndex: 0,
  lessonPhase: "answering",
  selectedAnswer: null,
  wordBankPlaced: [],
  flashIndex: 0,
  flashFlipped: false,
  pairSelection: { ba: null, ru: null },
  matchedPairs: new Set(),
  hearts: 5,
  completing: false,
  bossUnit: null,
  bossStageIndex: 0,
  bossPhase: "answering",
  bossChoice: null,
  bossItems: new Set(),
  bossWords: [],
  dailyTask: null,
  dailyMode: "actions",
  dailyResult: null,
  dailyCorrection: "",
  dailySubmitting: false,
  ratingCategory: "top",
  ratingPeriod: "all",
  ratingRequest: 0,
  teacherReport: null,
  moderation: [],
  lastFocused: null,
};

let toastTimer;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toLocaleString("ru-RU") : "0";
}

function initials(name) {
  return String(name || "У")
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] || "")
    .join("")
    .toUpperCase();
}

function icon(name, className = "icon") {
  return `<svg class="${className}" aria-hidden="true"><use href="#${name}"></use></svg>`;
}

function showToast(message) {
  const toast = $("#toast");
  $("#toast-text").textContent = message;
  toast.classList.remove("is-visible");
  void toast.offsetWidth;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
}

function loadingBlock(text) {
  return `<div class="state-block"><span class="spinner" aria-hidden="true"></span><span>${esc(text)}</span></div>`;
}

function emptyBlock(title, text = "") {
  return `<div class="empty-state">${icon("i-book")}<strong>${esc(title)}</strong>${text ? `<p>${esc(text)}</p>` : ""}</div>`;
}

function renderError(container, error, retry) {
  container.innerHTML = `<div class="error-state"><strong>Не получилось загрузить данные</strong><p>${esc(error.message || error)}</p><button class="btn btn-ghost" type="button">Повторить</button></div>`;
  $("button", container).addEventListener("click", retry);
}

function setBusy(button, busy, busyText = "Отправляем…") {
  if (!button) return;
  if (busy) {
    if (button.dataset.originalHtml === undefined) {
      button.dataset.originalHtml = button.innerHTML;
    }
    button.textContent = busyText;
    button.disabled = true;
  } else {
    if (button.dataset.originalHtml !== undefined) {
      button.innerHTML = button.dataset.originalHtml;
      delete button.dataset.originalHtml;
    }
    button.disabled = false;
  }
}

function updateTopBar() {
  if (!State.user) return;
  $("#top-streak").textContent = formatNumber(State.user.streak_days);
  $("#top-points").textContent = formatNumber(State.user.points);
  $("#top-hearts").textContent = State.hearts;
  $("#lesson-hearts").textContent = State.hearts;
  $("#top-avatar").textContent = initials(State.user.full_name);
}

function setAuthMode(mode) {
  const login = mode === "login";
  $("#login-form").hidden = !login;
  $("#register-form").hidden = login;
  $("#auth-show-login").classList.toggle("is-active", login);
  $("#auth-show-register").classList.toggle("is-active", !login);
  $("#auth-show-login").setAttribute("aria-selected", String(login));
  $("#auth-show-register").setAttribute("aria-selected", String(!login));
  $("#auth-status").textContent = "";
}

function showAuth(message = "") {
  $("#app-shell").hidden = true;
  $("#auth-screen").hidden = false;
  $("#auth-status").textContent = message;
  State.user = null;
  State.progress.clear();
}

async function finishAuth(payload) {
  saveToken(payload.access_token);
  State.user = payload.user;
  const progress = await apiRequest("/course/progress");
  State.progress = new Set(
    progress.map((item) => `${item.unit_id}:${item.lesson_id}`)
  );
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  applyRoleLayout();
  updateTopBar();
  renderCourse();
  renderRatingControls();
  const requested = location.hash.slice(1);
  switchTab(["course", "community", "ratings", "cabinet", "profile"].includes(requested) ? requested : "course");
}

async function login(email, password, button) {
  setBusy(button, true, "Входим…");
  $("#auth-status").textContent = "";
  try {
    const payload = await apiRequest("/auth/login", {
      method: "POST",
      body: { email, password },
      token: "",
    });
    await finishAuth(payload);
  } catch (error) {
    saveToken("");
    $("#auth-status").textContent = error.message;
  } finally {
    setBusy(button, false);
  }
}

async function register(form) {
  const button = $("button[type='submit']", form);
  setBusy(button, true, "Создаём…");
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  $("#auth-status").textContent = "";
  try {
    const response = await apiRequest("/auth/register", {
      method: "POST",
      body: { ...payload, lang_pair: "ba-ru" },
      token: "",
    });
    await finishAuth(response);
    showToast("Профиль создан. Начнём с карточек!");
  } catch (error) {
    saveToken("");
    State.user = null;
    $("#auth-status").textContent = error.message;
  } finally {
    setBusy(button, false);
  }
}

function applyRoleLayout() {
  const role = State.user.role;
  const canTeach = ["teacher", "expert", "admin"].includes(role);
  const canModerate = ["expert", "admin"].includes(role);
  $("#cabinet-nav").hidden = !(canTeach || canModerate);
  $("#teacher-panel").hidden = !canTeach;
  $("#moderation-panel").hidden = !canModerate;
  $("#cabinet-subtitle").textContent = canModerate
    ? "Отчёты, экспертная модерация и подтверждение переводов."
    : "Сводная успеваемость вашего класса.";
  $(".duo-bottom-nav").style.setProperty("--nav-count", canTeach || canModerate ? 5 : 4);
  $("#teacher-school").value = State.user.school || "";
  $("#teacher-class").value = State.user.class_name || (State.user.email === "teacher@example.com" ? "7А" : "");
}

function switchTab(tab) {
  if (tab === "cabinet" && $("#cabinet-nav").hidden) tab = "course";
  State.activeTab = tab;
  $$(".duo-nav-tab").forEach((link) => {
    const active = link.dataset.tab === tab;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  ["course", "community", "ratings", "cabinet", "profile"].forEach((name) => {
    $(`#screen-${name}`).hidden = name !== tab;
  });
  if (location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (tab === "course") renderCourse();
  if (tab === "community" && !State.dailyTask) loadDailyTask();
  if (tab === "ratings") loadRatings();
  if (tab === "profile") renderProfile();
  if (tab === "cabinet" && !$("#moderation-panel").hidden) loadModeration();
}

// ---------------------------------------------------------------------------
// Карта курса и прогресс
// ---------------------------------------------------------------------------

function progressKey(unitId, lessonId) {
  return `${unitId}:${lessonId}`;
}

function isComplete(unitId, lessonId) {
  return State.progress.has(progressKey(unitId, lessonId));
}

function isUnitUnlocked(unitIndex) {
  if (unitIndex === 0) return true;
  const previous = COURSE_UNITS[unitIndex - 1];
  return isComplete(previous.unit_id, previous.final_boss_node.lesson_id);
}

function isLessonUnlocked(unit, lessonIndex) {
  const unitIndex = COURSE_UNITS.findIndex((item) => item.unit_id === unit.unit_id);
  if (!isUnitUnlocked(unitIndex)) return false;
  if (lessonIndex === 0) return true;
  return isComplete(unit.unit_id, unit.lessons[lessonIndex - 1].lesson_id);
}

function isBossUnlocked(unit) {
  const unitIndex = COURSE_UNITS.findIndex((item) => item.unit_id === unit.unit_id);
  return isUnitUnlocked(unitIndex) && unit.lessons.every((lesson) => isComplete(unit.unit_id, lesson.lesson_id));
}

function renderCourse() {
  const container = $("#course-content");
  container.innerHTML = COURSE_UNITS.map((unit, unitIndex) => {
    const unitUnlocked = isUnitUnlocked(unitIndex);
    const completedLessons = unit.lessons.filter((lesson) => isComplete(unit.unit_id, lesson.lesson_id)).length;
    const bossDone = isComplete(unit.unit_id, unit.final_boss_node.lesson_id);
    const positions = ["pos-c", "pos-l1", "pos-r1"];
    const lessonsHtml = unit.lessons.map((lesson, lessonIndex) => {
      const done = isComplete(unit.unit_id, lesson.lesson_id);
      const unlocked = isLessonUnlocked(unit, lessonIndex);
      const active = unlocked && !done;
      const className = done ? "node-btn--done" : active ? "node-btn--active" : "node-btn--locked";
      const lessonIcon = done ? "i-check" : !unlocked ? "i-lock" : lesson.lesson_type === "flashcards" ? "i-book" : "i-star";
      return `<div class="path-row ${positions[lessonIndex % positions.length]}">
        <div class="node-wrap">
          ${active ? `<div class="node-guide"><div class="node-guide__bubble">${lesson.lesson_type === "flashcards" ? "Сначала новые слова" : "Башлайбыҙмы?"}</div></div>` : ""}
          <button class="node-btn ${className}" type="button" data-lesson-unit="${unit.unit_id}" data-lesson-id="${lesson.lesson_id}" ${unlocked ? "" : "disabled"} aria-label="${esc(lesson.lesson_title)}">${icon(lessonIcon)}</button>
          <span class="node-label">${lesson.lesson_id}. ${esc(lesson.lesson_title)}</span>
          <span class="node-type">${lesson.lesson_type === "flashcards" ? "Карточки" : "Практика"}</span>
        </div>
      </div>`;
    }).join("");
    const bossUnlocked = isBossUnlocked(unit);
    const bossClass = bossDone ? "node-btn--done" : bossUnlocked ? "node-btn--chest node-btn--boss" : "node-btn--locked";
    return `<section class="course-unit ${unitUnlocked ? "" : "is-locked"}">
      <div class="unit-banner unit-banner--${unit.accent}">
        <div><div class="unit-banner__num">РАЗДЕЛ ${unit.unit_id}</div><div class="unit-banner__title">${esc(unit.unit_title)}</div><div class="unit-banner__desc">${esc(unit.unit_subtitle)} · ${completedLessons}/${unit.lessons.length} уроков</div></div>
        <button class="unit-banner__btn" type="button" data-unit-guide="${unit.unit_id}" ${unitUnlocked ? "" : "disabled"} aria-label="Открыть карточки раздела">${icon(unitUnlocked ? "i-book" : "i-lock")}</button>
      </div>
      <div class="path-tree">${lessonsHtml}
        <div class="path-row pos-c boss-row"><div class="node-wrap">
          <button class="node-btn ${bossClass}" type="button" data-boss-unit="${unit.unit_id}" ${bossUnlocked || bossDone ? "" : "disabled"} aria-label="${esc(unit.final_boss_node.quest_title)}">${icon(bossDone ? "i-check" : bossUnlocked ? "i-crown" : "i-lock")}</button>
          <span class="node-label boss-label">${esc(unit.final_boss_node.quest_title)}</span>
          <span class="node-type">${bossDone ? "Пройдено" : "Финальный квест"}</span>
        </div></div>
      </div>
    </section>`;
  }).join("");

  $$('[data-lesson-unit]', container).forEach((button) => {
    button.addEventListener("click", () => startLesson(Number(button.dataset.lessonUnit), Number(button.dataset.lessonId)));
  });
  $$('[data-boss-unit]', container).forEach((button) => {
    button.addEventListener("click", () => startBoss(Number(button.dataset.bossUnit)));
  });
  $$('[data-unit-guide]', container).forEach((button) => {
    button.addEventListener("click", () => startLesson(Number(button.dataset.unitGuide), 1));
  });
}

function startLesson(unitId, lessonId) {
  const unit = COURSE_UNITS.find((item) => item.unit_id === unitId);
  const lessonIndex = unit?.lessons.findIndex((item) => item.lesson_id === lessonId) ?? -1;
  if (!unit || lessonIndex < 0 || !isLessonUnlocked(unit, lessonIndex)) return;
  State.currentUnit = unit;
  State.currentLesson = unit.lessons[lessonIndex];
  State.currentStepIndex = 0;
  State.lessonPhase = "answering";
  State.flashIndex = 0;
  State.flashFlipped = false;
  State.hearts = 5;
  State.completing = false;
  State.lastFocused = document.activeElement;
  $("#modal-lesson").hidden = false;
  document.body.classList.add("modal-open");
  updateTopBar();
  renderLesson();
  $("#lesson-close").focus();
}

function closeLesson() {
  if (State.completing) return;
  $("#modal-lesson").hidden = true;
  document.body.classList.remove("modal-open");
  State.currentLesson = null;
  State.lastFocused?.focus();
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    showToast("Озвучивание не поддерживается этим браузером");
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const voices = window.speechSynthesis.getVoices();
  utterance.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith("ba")) || voices.find((voice) => voice.lang.toLowerCase().startsWith("ru")) || null;
  utterance.lang = utterance.voice?.lang || "ba-RU";
  utterance.rate = 0.82;
  window.speechSynthesis.speak(utterance);
}

function renderFlashcard() {
  const lesson = State.currentLesson;
  const card = lesson.cards[State.flashIndex];
  const container = $("#lesson-step-container");
  $("#lesson-kind").textContent = "Карточки · без ошибок и жизней";
  $("#lesson-modal-title").textContent = lesson.lesson_title;
  $("#lesson-instruction").textContent = lesson.instruction;
  $("#lesson-hearts-wrap").hidden = true;
  $("#lesson-feedback-box").hidden = true;
  $("#lesson-progress-bar").style.setProperty("--progress", `${((State.flashIndex + 1) / lesson.cards.length) * 100}%`);
  const action = $("#lesson-action-btn");
  action.disabled = false;
  action.className = "btn btn-primary btn-lg btn-block";
  action.textContent = State.flashIndex === lesson.cards.length - 1 ? "Завершить карточки · +10 XP" : "Следующая карточка →";
  container.innerHTML = `<div class="flashcard-counter">${State.flashIndex + 1} / ${lesson.cards.length}</div>
    <button class="flashcard ${State.flashFlipped ? "is-flipped" : ""}" id="flashcard-flip" type="button" aria-label="Перевернуть карточку">
      <span class="flashcard-side flashcard-front"><span class="flashcard-lang">БАШҠОРТСА</span><strong>${esc(card.ba)}</strong><span class="flashcard-hint">Нажми, чтобы увидеть перевод</span></span>
      <span class="flashcard-side flashcard-back"><span class="flashcard-lang">РУССКИЙ</span><strong>${esc(card.ru)}</strong><span class="flashcard-hint">Нажми, чтобы вернуться</span></span>
    </button>
    <button class="audio-button" id="flashcard-audio" type="button">${icon("i-volume", "icon icon-sm")}Прослушать башкирское слово</button>
    <div class="flashcard-example"><span>Пример</span><strong>${esc(card.example_ba)}</strong><p>${esc(card.example_ru)}</p></div>
    <button class="btn btn-ghost btn-block" id="flashcard-prev" type="button" ${State.flashIndex === 0 ? "disabled" : ""}>← Предыдущая карточка</button>`;
  $("#flashcard-flip").addEventListener("click", () => {
    State.flashFlipped = !State.flashFlipped;
    renderFlashcard();
    $("#flashcard-flip").focus();
  });
  $("#flashcard-audio").addEventListener("click", () => speakText(card.audio_tts || card.ba));
  $("#flashcard-prev").addEventListener("click", () => {
    if (State.flashIndex > 0) {
      State.flashIndex -= 1;
      State.flashFlipped = false;
      renderFlashcard();
    }
  });
}

function shuffled(items, salt = 0) {
  return items
    .map((item, index) => ({ item, order: ((index + 1) * 37 + salt * 17) % 101 }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function renderLesson() {
  if (State.currentLesson.lesson_type === "flashcards") {
    renderFlashcard();
    return;
  }
  const lesson = State.currentLesson;
  const step = lesson.steps[State.currentStepIndex];
  State.lessonPhase = "answering";
  State.selectedAnswer = null;
  State.wordBankPlaced = [];
  State.pairSelection = { ba: null, ru: null };
  State.matchedPairs = new Set();
  $("#lesson-kind").textContent = `Практика · шаг ${State.currentStepIndex + 1}/${lesson.steps.length}`;
  $("#lesson-modal-title").textContent = lesson.lesson_title;
  $("#lesson-instruction").textContent = lesson.instruction;
  $("#lesson-hearts-wrap").hidden = false;
  $("#lesson-feedback-box").hidden = true;
  $("#lesson-progress-bar").style.setProperty("--progress", `${((State.currentStepIndex + 1) / lesson.steps.length) * 100}%`);
  const action = $("#lesson-action-btn");
  action.disabled = true;
  action.className = "btn btn-primary btn-lg btn-block";
  action.textContent = "Проверить";
  if (step.type === "word_bank") renderWordBank(step);
  if (step.type === "fill_blank") renderFillBlank(step);
  if (step.type === "chat_choice") renderChatChoice(step);
  if (step.type === "match_pairs") renderMatchPairs(step);
}

function renderWordBank(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `<h3 class="exercise-title">Собери предложение</h3><p class="exercise-prompt">${esc(step.prompt)}</p><div class="word-slot" id="lesson-word-slot"><span class="word-placeholder">Нажимай на слова ниже</span></div><div class="word-bank" id="lesson-word-bank">${step.bank.map((word, index) => `<button type="button" class="word-chip" data-bank-index="${index}">${esc(word)}</button>`).join("")}</div>`;
  $$('[data-bank-index]', container).forEach((chip) => {
    chip.addEventListener("click", () => {
      if (State.lessonPhase !== "answering") return;
      State.wordBankPlaced.push({ word: step.bank[Number(chip.dataset.bankIndex)], bankIndex: Number(chip.dataset.bankIndex) });
      chip.classList.add("is-used");
      chip.disabled = true;
      updateWordSlot(step);
    });
  });
}

function updateWordSlot(step) {
  const slot = $("#lesson-word-slot");
  slot.innerHTML = State.wordBankPlaced.length
    ? State.wordBankPlaced.map((item, index) => `<button type="button" class="word-chip word-chip--placed" data-placed-index="${index}">${esc(item.word)}</button>`).join("")
    : '<span class="word-placeholder">Нажимай на слова ниже</span>';
  $$('[data-placed-index]', slot).forEach((chip) => {
    chip.addEventListener("click", () => {
      if (State.lessonPhase !== "answering") return;
      const [removed] = State.wordBankPlaced.splice(Number(chip.dataset.placedIndex), 1);
      const bankChip = $(`[data-bank-index="${removed.bankIndex}"]`, $("#lesson-word-bank"));
      bankChip.classList.remove("is-used");
      bankChip.disabled = false;
      updateWordSlot(step);
    });
  });
  $("#lesson-action-btn").disabled = State.wordBankPlaced.length === 0;
}

function renderFillBlank(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `<h3 class="exercise-title">Заполни пропуск</h3><p class="exercise-prompt">${esc(step.prompt)}</p><div class="workout-card sentence-card"><span>${esc(step.sentence_pre)}</span><span id="blank-placeholder" class="blank-placeholder">___</span><span>${esc(step.sentence_post)}</span></div><div class="choice-list">${step.options.map((option) => `<button type="button" class="choice-btn" data-choice="${esc(option)}"><span class="choice-marker"></span><span>${esc(option)}</span></button>`).join("")}</div><p class="exercise-hint">${esc(step.hint)}</p>`;
  $$('[data-choice]', container).forEach((button) => {
    button.addEventListener("click", () => {
      $$('[data-choice]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.selectedAnswer = button.dataset.choice;
      $("#blank-placeholder").textContent = button.dataset.choice;
      $("#lesson-action-btn").disabled = false;
    });
  });
}

function renderChatChoice(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `<h3 class="exercise-title">Мини-диалог</h3><div class="story-dialog"><div class="avatar avatar--gold">${esc(step.speaker[0] || "Ө")}</div><div class="story-bubble"><div class="story-bubble__meta">${esc(step.speaker)}</div>${esc(step.speaker_ba)}</div></div><p class="exercise-prompt">${esc(step.prompt)}</p><div class="choice-list">${step.options.map((option, index) => `<button type="button" class="choice-btn" data-chat-index="${index}"><span class="choice-number">${index + 1}</span><span>${esc(option.text)}</span></button>`).join("")}</div>`;
  $$('[data-chat-index]', container).forEach((button) => {
    button.addEventListener("click", () => {
      $$('[data-chat-index]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.selectedAnswer = step.options[Number(button.dataset.chatIndex)];
      $("#lesson-action-btn").disabled = false;
    });
  });
}

function renderMatchPairs(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `<h3 class="exercise-title">Найди пары</h3><p class="exercise-prompt">${esc(step.prompt)}</p><div class="pairs-progress">Соединено: <strong>${State.matchedPairs.size}/${step.pairs.length}</strong></div><div class="pairs-grid"><div>${shuffled(step.pairs, 1).map((pair) => `<button type="button" class="pair-btn ${State.matchedPairs.has(pair.ba) ? "is-matched" : ""} ${State.pairSelection.ba === pair.ba ? "is-selected" : ""}" data-pair-ba="${esc(pair.ba)}" ${State.matchedPairs.has(pair.ba) ? "disabled" : ""}>${esc(pair.ba)}</button>`).join("")}</div><div>${shuffled(step.pairs, 4).map((pair) => `<button type="button" class="pair-btn ${State.matchedPairs.has(pair.ba) ? "is-matched" : ""} ${State.pairSelection.ru === pair.ru ? "is-selected" : ""}" data-pair-ru="${esc(pair.ru)}" data-pair-key="${esc(pair.ba)}" ${State.matchedPairs.has(pair.ba) ? "disabled" : ""}>${esc(pair.ru)}</button>`).join("")}</div></div>`;
  $$('[data-pair-ba]', container).forEach((button) => button.addEventListener("click", () => selectPair(step, "ba", button.dataset.pairBa, button.dataset.pairBa)));
  $$('[data-pair-ru]', container).forEach((button) => button.addEventListener("click", () => selectPair(step, "ru", button.dataset.pairKey, button.dataset.pairRu)));
  $("#lesson-action-btn").disabled = State.matchedPairs.size !== step.pairs.length;
}

function selectPair(step, side, key, value) {
  State.pairSelection[side] = value;
  if (side === "ba") State.pairSelection.baKey = key;
  else State.pairSelection.ruKey = key;
  if (State.pairSelection.ba && State.pairSelection.ru) {
    if (State.pairSelection.baKey === State.pairSelection.ruKey) {
      State.matchedPairs.add(State.pairSelection.baKey);
    } else {
      showToast("Это не пара. Попробуй ещё раз");
    }
    State.pairSelection = { ba: null, ru: null };
  }
  renderMatchPairs(step);
}

function correctAnswerText(step) {
  if (step.type === "word_bank") return step.target.join(" ");
  if (step.type === "fill_blank") return step.hint || step.correct;
  if (step.type === "chat_choice") return step.options.find((option) => option.is_correct)?.text || "";
  return "Все пары соединены верно.";
}

async function handleLessonAction() {
  if (State.completing || !State.currentLesson) return;
  if (State.currentLesson.lesson_type === "flashcards") {
    if (State.flashIndex < State.currentLesson.cards.length - 1) {
      State.flashIndex += 1;
      State.flashFlipped = false;
      renderFlashcard();
    } else {
      await completeCurrentLesson();
    }
    return;
  }
  const step = State.currentLesson.steps[State.currentStepIndex];
  const action = $("#lesson-action-btn");
  const feedback = $("#lesson-feedback-box");
  if (State.lessonPhase === "answering") {
    let correct = false;
    if (step.type === "word_bank") correct = JSON.stringify(State.wordBankPlaced.map((item) => item.word)) === JSON.stringify(step.target);
    if (step.type === "fill_blank") correct = State.selectedAnswer === step.correct;
    if (step.type === "chat_choice") correct = Boolean(State.selectedAnswer?.is_correct);
    if (step.type === "match_pairs") correct = State.matchedPairs.size === step.pairs.length;
    State.lessonPhase = "feedback";
    feedback.hidden = false;
    feedback.className = `modal-feedback-box ${correct ? "modal-feedback-box--success" : "modal-feedback-box--error"}`;
    feedback.innerHTML = `<div class="feedback-symbol">${correct ? "✓" : "×"}</div><div><div class="modal-feedback-box__title">${correct ? "Афарин! Всё верно" : "Посмотри правильный вариант"}</div><div class="modal-feedback-box__desc">${correct ? "Можно двигаться дальше." : esc(correctAnswerText(step))}</div></div>`;
    if (!correct) {
      State.hearts = Math.max(0, State.hearts - 1);
      updateTopBar();
    }
    action.className = `btn ${correct ? "btn-success" : "btn-primary"} btn-lg btn-block`;
    action.textContent = State.currentStepIndex === State.currentLesson.steps.length - 1 ? "Завершить урок · +30 XP" : "Продолжить →";
    action.disabled = false;
  } else {
    State.currentStepIndex += 1;
    if (State.currentStepIndex < State.currentLesson.steps.length) renderLesson();
    else await completeCurrentLesson();
  }
}

async function completeCurrentLesson() {
  const lesson = State.currentLesson;
  State.completing = true;
  const action = $("#lesson-action-btn");
  setBusy(action, true, "Сохраняем прогресс…");
  try {
    const response = await apiRequest("/course/complete", {
      method: "POST",
      body: { unit_id: lesson.unit_id, lesson_id: lesson.lesson_id, lesson_type: lesson.lesson_type },
    });
    State.progress.add(progressKey(lesson.unit_id, lesson.lesson_id));
    State.user.points = response.points;
    State.user.level = response.level;
    State.completing = false;
    closeLesson();
    updateTopBar();
    renderCourse();
    showToast(response.already_completed ? "Урок пройден повторно — прогресс сохранён" : `Урок завершён! +${response.awarded_xp} XP`);
  } catch (error) {
    State.completing = false;
    setBusy(action, false);
    showToast(error.message);
  }
}

// ---------------------------------------------------------------------------
// Босс-квест Өләсәй
// ---------------------------------------------------------------------------

function startBoss(unitId) {
  const unit = COURSE_UNITS.find((item) => item.unit_id === unitId);
  if (!unit || (!isBossUnlocked(unit) && !isComplete(unitId, unit.final_boss_node.lesson_id))) return;
  State.bossUnit = unit;
  State.bossStageIndex = 0;
  State.bossPhase = "answering";
  State.completing = false;
  State.lastFocused = document.activeElement;
  $("#modal-boss").hidden = false;
  document.body.classList.add("modal-open");
  $("#boss-modal-title").textContent = unit.final_boss_node.quest_title;
  renderBossStage();
  $("#boss-close").focus();
}

function closeBoss() {
  if (State.completing) return;
  $("#modal-boss").hidden = true;
  document.body.classList.remove("modal-open");
  State.lastFocused?.focus();
}

function bossDialog(stage) {
  return `<p class="story-context">${esc(stage.story_context)}</p><div class="story-dialog"><div class="avatar avatar--gold">Ө</div><div class="story-bubble"><div class="story-bubble__meta">Өләсәй</div>${esc(stage.npc_speech_ba || "")}</div></div><p class="exercise-prompt">${esc(stage.task_prompt || "")}</p>`;
}

function renderBossStage() {
  const boss = State.bossUnit.final_boss_node;
  const stage = boss.stages[State.bossStageIndex];
  const container = $("#boss-step-container");
  const action = $("#boss-action-btn");
  State.bossPhase = "answering";
  State.bossChoice = null;
  State.bossItems = new Set();
  State.bossWords = [];
  $("#boss-feedback-box").hidden = true;
  $("#boss-progress-bar").style.setProperty("--progress", `${((State.bossStageIndex + 1) / boss.stages.length) * 100}%`);
  $("#boss-step-label").textContent = `${State.bossStageIndex + 1}/${boss.stages.length}`;
  action.disabled = stage.mechanic !== "reward_screen";
  action.className = "btn btn-primary btn-lg btn-block";
  action.textContent = stage.mechanic === "reward_screen" ? "Забрать награду · +100 XP" : "Проверить ответ";

  if (stage.mechanic === "chat_choice") {
    container.innerHTML = `${bossDialog(stage)}<div class="choice-list">${stage.options.map((option, index) => `<button class="choice-btn" type="button" data-boss-choice="${index}"><span class="choice-number">${index + 1}</span><span>${esc(option.text_ba)}</span></button>`).join("")}</div>`;
    $$('[data-boss-choice]', container).forEach((button) => button.addEventListener("click", () => {
      $$('[data-boss-choice]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.bossChoice = stage.options[Number(button.dataset.bossChoice)];
      action.disabled = false;
    }));
  }
  if (stage.mechanic === "interactive_table") {
    container.innerHTML = `${bossDialog(stage)}<div class="pairs-progress">Выбрано: <strong id="boss-items-count">0/${stage.required_item_ids.length}</strong></div><div class="table-grid">${stage.table_items.map((item) => `<button class="table-card" type="button" data-table-item="${item.id}"><strong>${esc(item.label_ba)}</strong><span>${esc(item.label_ru)}</span></button>`).join("")}</div>`;
    $$('[data-table-item]', container).forEach((button) => button.addEventListener("click", () => {
      const id = button.dataset.tableItem;
      if (State.bossItems.has(id)) {
        State.bossItems.delete(id);
        button.classList.remove("is-selected");
      } else if (State.bossItems.size < stage.required_item_ids.length) {
        State.bossItems.add(id);
        button.classList.add("is-selected");
      }
      $("#boss-items-count").textContent = `${State.bossItems.size}/${stage.required_item_ids.length}`;
      action.disabled = State.bossItems.size !== stage.required_item_ids.length;
    }));
  }
  if (stage.mechanic === "grammar_trap") {
    container.innerHTML = `${bossDialog(stage)}<div class="workout-card sentence-card"><span>${esc(stage.sentence_start)}</span><span id="boss-blank" class="blank-placeholder">___</span><span>${esc(stage.sentence_end)}</span></div><div class="choice-list">${stage.options.map((option) => `<button class="choice-btn" type="button" data-boss-grammar="${esc(option)}"><span class="choice-marker"></span><span>${esc(option)}</span></button>`).join("")}</div>`;
    $$('[data-boss-grammar]', container).forEach((button) => button.addEventListener("click", () => {
      $$('[data-boss-grammar]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.bossChoice = button.dataset.bossGrammar;
      $("#boss-blank").textContent = State.bossChoice;
      action.disabled = false;
    }));
  }
  if (stage.mechanic === "boss_word_bank") {
    const words = shuffled([...stage.correct_sentence_ba, ...stage.distractor_words_ba], 3);
    container.innerHTML = `${bossDialog(stage)}<div class="word-slot" id="boss-word-slot"><span class="word-placeholder">Собери фразу из слов</span></div><div class="word-bank" id="boss-word-bank">${words.map((word, index) => `<button class="word-chip" type="button" data-boss-bank="${index}">${esc(word)}</button>`).join("")}</div>`;
    $$('[data-boss-bank]', container).forEach((button) => button.addEventListener("click", () => {
      State.bossWords.push({ word: words[Number(button.dataset.bossBank)], bankIndex: Number(button.dataset.bossBank) });
      button.disabled = true;
      button.classList.add("is-used");
      updateBossWords();
    }));
  }
  if (stage.mechanic === "reward_screen") {
    container.innerHTML = `<div class="boss-reward"><div class="reward-crown">${icon("i-crown")}</div><h3>Квест пройден!</h3><div class="story-dialog"><div class="avatar avatar--gold">Ө</div><div class="story-bubble"><strong>${esc(stage.final_praise_ba)}</strong><p>«${esc(stage.final_praise_ru)}»</p></div></div><div class="trophy-card"><span>НОВАЯ НАГРАДА</span><h3>${esc(stage.reward_trophy.title)}</h3><p>${esc(stage.reward_trophy.cultural_fact)}</p></div></div>`;
  }
}

function updateBossWords() {
  const slot = $("#boss-word-slot");
  slot.innerHTML = State.bossWords.length ? State.bossWords.map((item, index) => `<button class="word-chip word-chip--placed" type="button" data-boss-placed="${index}">${esc(item.word)}</button>`).join("") : '<span class="word-placeholder">Собери фразу из слов</span>';
  $$('[data-boss-placed]', slot).forEach((button) => button.addEventListener("click", () => {
    const [removed] = State.bossWords.splice(Number(button.dataset.bossPlaced), 1);
    const bank = $(`[data-boss-bank="${removed.bankIndex}"]`);
    bank.disabled = false;
    bank.classList.remove("is-used");
    updateBossWords();
  }));
  $("#boss-action-btn").disabled = State.bossWords.length === 0;
}

async function handleBossAction() {
  if (State.completing) return;
  const boss = State.bossUnit.final_boss_node;
  const stage = boss.stages[State.bossStageIndex];
  if (stage.mechanic === "reward_screen") {
    await completeBoss();
    return;
  }
  const action = $("#boss-action-btn");
  const feedback = $("#boss-feedback-box");
  if (State.bossPhase === "answering") {
    let correct = false;
    if (stage.mechanic === "chat_choice") correct = Boolean(State.bossChoice?.is_correct);
    if (stage.mechanic === "interactive_table") correct = stage.required_item_ids.every((id) => State.bossItems.has(id)) && State.bossItems.size === stage.required_item_ids.length;
    if (stage.mechanic === "grammar_trap") correct = State.bossChoice === stage.correct_option;
    if (stage.mechanic === "boss_word_bank") correct = JSON.stringify(State.bossWords.map((item) => item.word)) === JSON.stringify(stage.correct_sentence_ba);
    State.bossPhase = "feedback";
    const explanation = State.bossChoice?.error_hint || stage.grammar_explanation || stage.correct_sentence_ba?.join(" ") || "Вспомни слова из карточек.";
    feedback.hidden = false;
    feedback.className = `modal-feedback-box ${correct ? "modal-feedback-box--success" : "modal-feedback-box--error"}`;
    feedback.innerHTML = `<div class="feedback-symbol">${correct ? "✓" : "×"}</div><div><div class="modal-feedback-box__title">${correct ? "Өләсәй довольна!" : "Попробуем разобраться"}</div><div class="modal-feedback-box__desc">${correct ? "Ответ принят." : esc(explanation)}</div></div>`;
    action.textContent = "Следующий шаг →";
    action.disabled = false;
  } else {
    State.bossStageIndex += 1;
    renderBossStage();
  }
}

async function completeBoss() {
  const boss = State.bossUnit.final_boss_node;
  State.completing = true;
  const action = $("#boss-action-btn");
  setBusy(action, true, "Сохраняем награду…");
  try {
    const response = await apiRequest("/course/complete", {
      method: "POST",
      body: { unit_id: boss.unit_id, lesson_id: boss.lesson_id, lesson_type: "boss" },
    });
    State.progress.add(progressKey(boss.unit_id, boss.lesson_id));
    State.user.points = response.points;
    State.user.level = response.level;
    State.completing = false;
    closeBoss();
    updateTopBar();
    renderCourse();
    showToast(response.already_completed ? "Квест пройден повторно" : `Победа! +${response.awarded_xp} XP`);
  } catch (error) {
    State.completing = false;
    setBusy(action, false);
    showToast(error.message);
  }
}

// ---------------------------------------------------------------------------
// Ежедневный краудсорсинг и экспорт
// ---------------------------------------------------------------------------

function sourceText(source) {
  if (!source) return "Источник не указан";
  return [source.file, source.chapter, source.time].filter(Boolean).join(" · ");
}

async function loadDailyTask() {
  const body = $("#daily-body");
  body.innerHTML = loadingBlock("Подбираем фрагмент для проверки…");
  State.dailyMode = "actions";
  State.dailyResult = null;
  State.dailyCorrection = "";
  try {
    State.dailyTask = await apiRequest("/tasks/daily");
    renderDaily();
  } catch (error) {
    State.dailyTask = null;
    renderError(body, error, loadDailyTask);
  }
}

function renderDaily() {
  const task = State.dailyTask;
  const body = $("#daily-body");
  if (!task) return;
  const disabled = State.dailySubmitting ? "disabled" : "";
  let actions = "";
  if (State.dailyMode === "actions") {
    actions = `<div class="daily-actions"><button class="btn btn-success" type="button" data-daily="correct" ${disabled}>${icon("i-check")}Перевод верный · +10 XP</button><button class="btn btn-ghost" type="button" data-daily="fix" ${disabled}>${icon("i-pencil")}Исправить · +15 XP</button></div>`;
  }
  if (State.dailyMode === "fix") {
    const correction = State.dailyCorrection || task.translation;
    actions = `<div class="correction-box"><label class="field"><span class="label">Правильный перевод на русский</span><textarea id="daily-correction" class="input textarea" rows="3" required>${esc(correction)}</textarea></label><div class="daily-actions"><button class="btn btn-primary" type="button" data-daily="submit-fix" ${disabled}>Отправить исправление</button><button class="btn btn-ghost" type="button" data-daily="cancel" ${disabled}>Отмена</button></div></div>`;
  }
  if (State.dailyMode === "result" && State.dailyResult) {
    const result = State.dailyResult;
    const statusLabels = { confirmed: "Достигнут консенсус", expert_review: "Нужна экспертная проверка", pending: "Голос сохранён" };
    actions = `<div class="daily-result"><strong>+${formatNumber(result.pointsEarned)} XP · всего ${formatNumber(result.points)} XP</strong><p>${esc(result.message)} ${esc(statusLabels[result.consensus] || result.consensus)}</p><button class="btn btn-primary btn-block" type="button" data-daily="next">Следующий фрагмент →</button></div>`;
  }
  body.innerHTML = `<article class="workout-card daily-card"><div class="daily-card__top"><span class="chip-static">Ежедневное задание</span><span>${esc(task.lang_pair)}</span></div><p class="text-ba">${esc(task.text_ba)}</p><p class="source-line">${icon("i-book", "icon icon-sm")}${esc(sourceText(task.source))}</p><div class="translation-panel"><span>Предложенный перевод</span><p>${esc(task.translation)}</p></div>${actions}</article>`;
  if (State.dailyMode === "fix") $("#daily-correction").focus();
}

async function submitDaily(isCorrect) {
  if (State.dailySubmitting) return;
  const translation = isCorrect ? State.dailyTask.translation : $("#daily-correction")?.value.trim();
  if (!translation) {
    showToast("Введите исправленный перевод");
    return;
  }
  State.dailyCorrection = isCorrect ? "" : translation;
  State.dailySubmitting = true;
  renderDaily();
  try {
    const response = await apiRequest("/tasks/submit", {
      method: "POST",
      body: { fragment_id: State.dailyTask.fragment_id, translation, is_correct: isCorrect },
    });
    State.dailyResult = {
      pointsEarned: response.answer.points_earned,
      points: response.points,
      message: response.message,
      consensus: response.consensus_status,
    };
    State.user.points = response.points;
    State.user.level = response.level;
    State.user.badges = response.badges;
    State.dailyMode = "result";
    updateTopBar();
  } catch (error) {
    showToast(error.message);
    if (error.status === 401) logout("Сессия истекла. Войдите снова.");
  } finally {
    State.dailySubmitting = false;
    renderDaily();
  }
}

async function downloadTranslations(format, button) {
  setBusy(button, true, "…");
  try {
    const blob = await apiRequest(`/translations/export?format=${format}`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `confirmed_translations.${format}`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast(`Выгрузка ${format.toUpperCase()} готова`);
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
}

// ---------------------------------------------------------------------------
// Рейтинги
// ---------------------------------------------------------------------------

function renderRatingControls() {
  $("#rating-categories").innerHTML = RATING_CATEGORIES.map((category) => `<button class="tab ${category.id === State.ratingCategory ? "is-active" : ""}" type="button" role="tab" aria-selected="${category.id === State.ratingCategory}" data-rating-category="${category.id}">${category.label}</button>`).join("");
  $("#rating-periods").innerHTML = RATING_PERIODS.map((period) => `<button class="chip ${period.id === State.ratingPeriod ? "is-active" : ""}" type="button" aria-pressed="${period.id === State.ratingPeriod}" data-rating-period="${period.id}">${period.label}</button>`).join("");
  $$('[data-rating-category]').forEach((button) => button.addEventListener("click", () => {
    State.ratingCategory = button.dataset.ratingCategory;
    renderRatingControls();
    loadRatings();
  }));
  $$('[data-rating-period]').forEach((button) => button.addEventListener("click", () => {
    State.ratingPeriod = button.dataset.ratingPeriod;
    renderRatingControls();
    loadRatings();
  }));
}

async function loadRatings() {
  const requestId = ++State.ratingRequest;
  const body = $("#rating-body");
  body.innerHTML = loadingBlock("Считаем рейтинг…");
  const category = RATING_CATEGORIES.find((item) => item.id === State.ratingCategory);
  try {
    const rows = await apiRequest(`${category.endpoint}?period=${State.ratingPeriod}`);
    if (requestId !== State.ratingRequest) return;
    renderRatings(rows);
  } catch (error) {
    if (requestId === State.ratingRequest) renderError(body, error, loadRatings);
  }
}

function ratingViewModel(category, item) {
  if (category === "schools") return { name: item.school, meta: `${formatNumber(item.students)} учеников`, value: `${formatNumber(item.points)} XP` };
  if (category === "classes") return { name: `${item.class_name} класс`, meta: item.school, value: `${formatNumber(item.points)} XP` };
  if (category === "accuracy") return { name: item.full_name, meta: `${formatNumber(item.correct_answers)} из ${formatNumber(item.total_answers)} ответов`, value: `${formatNumber(item.accuracy)}%` };
  if (category === "vocabulary") return { name: item.full_name, meta: [item.school, item.class_name].filter(Boolean).join(" · "), value: `${formatNumber(item.unique_translations)} слов` };
  if (category === "corrections") return { name: item.full_name, meta: `${formatNumber(item.points)} XP за исправления`, value: formatNumber(item.corrections) };
  return { name: item.full_name, meta: [item.school, item.class_name].filter(Boolean).join(" · "), value: `${formatNumber(item.points)} XP` };
}

function renderRatings(rows) {
  const body = $("#rating-body");
  if (!rows.length) {
    body.innerHTML = emptyBlock("За этот период пока нет результатов", "Переключите период или выполните задание первым.");
    return;
  }
  body.innerHTML = rows.map((item) => {
    const view = ratingViewModel(State.ratingCategory, item);
    const mine = item.user_id === State.user.id;
    return `<div class="rank-item ${mine ? "rank-item--me" : ""}"><div class="rank-badge rank-badge--${item.rank <= 3 ? item.rank : "other"}">${item.rank}</div><div class="avatar">${esc(initials(view.name))}</div><div class="rank-info"><span class="rank-name">${esc(view.name)}${mine ? " · Вы" : ""}</span><span class="rank-meta">${esc(view.meta)}</span></div><strong class="rank-points">${esc(view.value)}</strong></div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Профиль, учитель и модерация
// ---------------------------------------------------------------------------

function renderProfile() {
  const user = State.user;
  const earned = new Set(user.badges || []);
  COURSE_UNITS.forEach((unit) => {
    if (isComplete(unit.unit_id, unit.final_boss_node.lesson_id)) earned.add(`boss-${unit.unit_id}`);
  });
  const badges = [
    ...BADGE_CATALOG,
    ...COURSE_UNITS.map((unit) => ({ id: `boss-${unit.unit_id}`, title: unit.final_boss_node.quest_title, desc: "Финальный квест с Өләсәй пройден", icon: "i-crown" })),
  ];
  $("#profile-content").innerHTML = `<div class="profile-hero"><div class="avatar avatar--blue profile-avatar">${esc(initials(user.full_name))}</div><h2>${esc(user.full_name)}</h2><p>${esc([user.school, user.class_name && `${user.class_name} класс`].filter(Boolean).join(" · ") || user.email || "Башкирская языковая школа")}</p><span class="role-badge">${esc({ student: "Ученик", teacher: "Учитель", expert: "Эксперт УФИЦ РАН", admin: "Администратор УФИЦ РАН" }[user.role] || user.role)}</span></div>
    <div class="stat-grid profile-stats"><div class="stat stat--gold"><div class="stat__icon">${icon("kurai")}</div><div class="stat__body"><div class="stat__value">${formatNumber(user.points)}</div><div class="stat__label">очков XP</div></div></div><div class="stat"><div class="stat__icon">${icon("i-cup")}</div><div class="stat__body"><div class="stat__value">${formatNumber(user.level)}</div><div class="stat__label">уровень</div></div></div><div class="stat stat--gold"><div class="stat__icon">${icon("i-flame")}</div><div class="stat__body"><div class="stat__value">${formatNumber(user.streak_days)}</div><div class="stat__label">дней серии</div></div></div><div class="stat stat--green"><div class="stat__icon">${icon("i-check")}</div><div class="stat__body"><div class="stat__value">${State.progress.size}</div><div class="stat__label">этапов курса</div></div></div></div>
    <div class="section-title-row"><h3>Награды</h3><span class="muted">${earned.size}/${badges.length}</span></div><div class="badge-list">${badges.map((badge) => `<div class="badge-item ${earned.has(badge.id) ? "" : "badge-item--locked"}"><div class="badge-item__icon">${icon(badge.icon)}</div><div class="badge-item__info"><div class="badge-item__title">${esc(badge.title)}</div><div class="badge-item__desc">${esc(badge.desc)}</div></div><span class="badge-status">${earned.has(badge.id) ? "Получено" : "Впереди"}</span></div>`).join("")}</div>
    <div class="profile-actions"><button id="profile-refresh" class="btn btn-ghost btn-block" type="button">Обновить данные профиля</button><button id="logout-button" class="btn btn-ghost btn-block danger-text" type="button">Выйти из аккаунта</button></div>`;
  $("#profile-refresh").addEventListener("click", refreshProfile);
  $("#logout-button").addEventListener("click", () => logout());
}

async function refreshProfile() {
  try {
    State.user = await apiRequest("/auth/me");
    updateTopBar();
    renderProfile();
    showToast("Профиль обновлён");
  } catch (error) {
    showToast(error.message);
  }
}

async function loadTeacherReport(event) {
  event?.preventDefault();
  const school = $("#teacher-school").value.trim();
  const className = $("#teacher-class").value.trim();
  const container = $("#teacher-report");
  container.innerHTML = loadingBlock("Готовим отчёт…");
  try {
    State.teacherReport = await apiRequest(`/teacher/class-report?school=${encodeURIComponent(school)}&class_name=${encodeURIComponent(className)}`);
    renderTeacherReport();
  } catch (error) {
    renderError(container, error, () => loadTeacherReport());
  }
}

function renderTeacherReport() {
  const report = State.teacherReport;
  const container = $("#teacher-report");
  if (!report.students.length) {
    container.innerHTML = emptyBlock("В этом классе пока нет учеников", "Проверьте точное название школы и класс.");
    return;
  }
  const average = report.students.reduce((sum, student) => sum + student.accuracy, 0) / report.students.length;
  container.innerHTML = `<div class="report-summary"><div><span>Учеников</span><strong>${report.total_students}</strong></div><div><span>Средняя точность</span><strong>${formatNumber(average.toFixed(1))}%</strong></div></div><div class="table-scroll"><table class="report-table"><thead><tr><th>Ученик</th><th>XP</th><th>Уровень</th><th>Ответы</th><th>Точность</th></tr></thead><tbody>${report.students.map((student) => `<tr><td>${esc(student.full_name)}</td><td>${formatNumber(student.points)}</td><td>${formatNumber(student.level)}</td><td>${formatNumber(student.total_answers)}</td><td><strong>${formatNumber(student.accuracy)}%</strong></td></tr>`).join("")}</tbody></table></div><p class="report-caption">${esc(report.school)} · ${esc(report.class_name)}</p>`;
}

async function loadModeration() {
  const container = $("#moderation-list");
  container.innerHTML = loadingBlock("Загружаем спорные переводы…");
  try {
    State.moderation = await apiRequest("/moderation/disputed");
    renderModeration();
  } catch (error) {
    renderError(container, error, loadModeration);
  }
}

function renderModeration() {
  const container = $("#moderation-list");
  if (!State.moderation.length) {
    container.innerHTML = emptyBlock("Спорных переводов нет", "Все фрагменты проверены. Отличная работа!");
    return;
  }
  container.innerHTML = State.moderation.map((item) => `<article class="moderation-card"><div class="moderation-card__head"><span class="chip-static">Фрагмент #${item.fragment_id}</span><span>${esc(item.lang_pair)}</span></div><p class="moderation-ba">${esc(item.text_ba)}</p><p class="source-line">${esc(sourceText(item.source))}</p><div class="moderation-current"><span>Текущий спорный вариант</span><p>${esc(item.translation)}</p></div><div class="variant-list">${item.variants.map((variant) => `<div><p>${esc(variant.translation)}</p><span>${variant.votes} голосов · ${variant.correct_votes} за · ${variant.correction_votes} исправлений</span></div>`).join("")}</div><label class="field"><span class="label">Итоговый эталонный перевод</span><textarea class="input textarea" rows="3" id="moderation-text-${item.translation_id}">${esc(item.translation)}</textarea></label><div class="daily-actions"><button class="btn btn-success" type="button" data-moderation-id="${item.translation_id}" data-approved="true">${icon("i-check")}Подтвердить</button><button class="btn btn-primary" type="button" data-moderation-id="${item.translation_id}" data-approved="false">Сохранить исправление</button></div></article>`).join("");
  $$('[data-moderation-id]', container).forEach((button) => button.addEventListener("click", () => resolveModeration(button)));
}

async function resolveModeration(button) {
  const id = Number(button.dataset.moderationId);
  const approved = button.dataset.approved === "true";
  const item = State.moderation.find((entry) => entry.translation_id === id);
  const finalTranslation = approved ? item.translation : $(`#moderation-text-${id}`).value.trim();
  if (!finalTranslation) {
    showToast("Введите итоговый перевод");
    return;
  }
  setBusy(button, true, "Сохраняем…");
  try {
    const response = await apiRequest("/moderation/resolve", {
      method: "POST",
      body: { translation_id: id, final_translation: finalTranslation, approved },
    });
    showToast(response.message);
    await loadModeration();
  } catch (error) {
    showToast(error.message);
    setBusy(button, false);
  }
}

function logout(message = "") {
  saveToken("");
  window.speechSynthesis?.cancel();
  State.dailyTask = null;
  State.teacherReport = null;
  State.moderation = [];
  closeLesson();
  closeBoss();
  showAuth(message);
  setAuthMode("login");
}

// ---------------------------------------------------------------------------
// Инициализация
// ---------------------------------------------------------------------------

function bindEvents() {
  $("#auth-show-login").addEventListener("click", () => setAuthMode("login"));
  $("#auth-show-register").addEventListener("click", () => setAuthMode("register"));
  $("#login-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    login(data.get("email").trim(), data.get("password"), $("button[type='submit']", event.currentTarget));
  });
  $("#register-form").addEventListener("submit", (event) => {
    event.preventDefault();
    register(event.currentTarget);
  });
  $$('[data-demo-email]').forEach((button) => button.addEventListener("click", () => {
    setAuthMode("login");
    $("#login-form [name='email']").value = button.dataset.demoEmail;
    $("#login-form [name='password']").value = "1234";
    login(button.dataset.demoEmail, "1234", button);
  }));
  $$('.duo-nav-tab').forEach((link) => link.addEventListener("click", (event) => {
    event.preventDefault();
    switchTab(link.dataset.tab);
  }));
  $("#top-avatar").addEventListener("click", (event) => {
    event.preventDefault();
    switchTab("profile");
  });
  window.addEventListener("hashchange", () => {
    if (State.user) switchTab(location.hash.slice(1));
  });
  $("#lesson-close").addEventListener("click", closeLesson);
  $("#lesson-action-btn").addEventListener("click", handleLessonAction);
  $("#boss-close").addEventListener("click", closeBoss);
  $("#boss-action-btn").addEventListener("click", handleBossAction);
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#modal-lesson").hidden) closeLesson();
    if (!$("#modal-boss").hidden) closeBoss();
  });
  $("#daily-body").addEventListener("click", (event) => {
    const button = event.target.closest("[data-daily]");
    if (!button) return;
    const action = button.dataset.daily;
    if (action === "correct") submitDaily(true);
    if (action === "fix") { State.dailyMode = "fix"; renderDaily(); }
    if (action === "submit-fix") submitDaily(false);
    if (action === "cancel") { State.dailyMode = "actions"; renderDaily(); }
    if (action === "next") loadDailyTask();
  });
  $$('[data-export]').forEach((button) => button.addEventListener("click", () => downloadTranslations(button.dataset.export, button)));
  $("#teacher-form").addEventListener("submit", loadTeacherReport);
  $("#moderation-refresh").addEventListener("click", loadModeration);
}

async function init() {
  bindEvents();
  const telegram = window.Telegram?.WebApp;
  if (telegram) {
    telegram.ready();
    telegram.expand();
  }
  let token = getStoredToken();
  if (!token) {
    const telegramId = telegram?.initDataUnsafe?.user?.id;
    if (telegramId) {
      $("#auth-status").textContent = "Восстанавливаем вход через Telegram…";
      try {
        token = await fetchTelegramToken(telegramId);
        if (token) saveToken(token);
      } catch (error) {
        if (error.status !== 404) $("#auth-status").textContent = error.message;
      }
    }
  }
  if (!token) {
    showAuth();
    return;
  }
  $("#auth-status").textContent = "Проверяем сохранённую сессию…";
  try {
    const user = await apiRequest("/auth/me", { token });
    await finishAuth({ access_token: token, user });
  } catch (error) {
    saveToken("");
    showAuth(error.status === 401 ? "Сессия истекла. Войдите снова." : error.message);
  }
}

document.addEventListener("DOMContentLoaded", init);

// Удобно проверить адрес API в консоли без вывода токена.
console.info(`Айталай API: ${API_URL}`);
