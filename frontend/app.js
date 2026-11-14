import { applyUnitDetail, COURSE_UNITS, replaceCourseUnits } from "./course-data.js";
import {
  ApiError,
  API_URL,
  apiRequest,
  fetchTelegramToken,
  getStoredToken,
  saveToken,
} from "./api.js";
import { characterStage, preload, reactToAnswer, resetStreak, setState, spriteUrl } from "./characters.js";
import { lessonCharacter, PLAYER_CHAR, UNIT_CAST } from "./cast.js";

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
  { id: "hundred_points", title: "Сотня очков", desc: "Набрано 100 очков опыта", icon: "kurai" },
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
  inQuiz: false,
  quizIndex: 0,
  lessonAnswers: 0,
  lessonCorrect: 0,
  pairSelection: { ba: null, ru: null },
  matchedPairs: new Set(),
  hearts: 5,
  completing: false,
  loadingCourseAction: false,
  bossUnit: null,
  bossStageIndex: 0,
  bossPhase: "answering",
  bossChoice: null,
  bossItems: new Set(),
  bossWords: [],
  bossAnswers: 0,
  bossCorrect: 0,
  dailyTask: null,
  dailyMode: "actions",
  dailyResult: null,
  dailyCorrection: "",
  dailySubmitting: false,
  communityMode: "verify",
  searchRequest: 0,
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
  $("#rail-streak").textContent = formatNumber(State.user.streak_days);
  $("#top-points").textContent = formatNumber(State.user.points);
  $("#top-hearts").textContent = State.hearts;
  $("#lesson-hearts").textContent = State.hearts;
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
  $("#auth-screen").hidden = true;
  $("#app-shell").hidden = false;
  applyRoleLayout();
  updateTopBar();
  renderRatingControls();
  await loadCourseUnits();
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
  $("#top-hearts-wrap").hidden = ["community", "ratings", "profile", "cabinet"].includes(tab);
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

async function loadCourseUnits() {
  const container = $("#course-content");
  container.innerHTML = loadingBlock("Загружаем курсы и ваш прогресс…");
  try {
    const summaries = await apiRequest("/courses/units");
    replaceCourseUnits(summaries);
    State.progress = new Set();
    COURSE_UNITS.forEach((unit) => {
      unit.lessons.forEach((lesson) => {
        if (unit.api_progress[lesson.circle]?.completed) {
          State.progress.add(progressKey(unit.unit_id, lesson.lesson_id));
        }
      });
      if (unit.api_progress.boss_story?.completed) {
        State.progress.add(progressKey(unit.unit_id, unit.final_boss_node.lesson_id));
      }
    });
    renderCourse();
  } catch (error) {
    renderError(container, error, loadCourseUnits);
  }
}

let courseResizeObserver;
const NODE_OFFSETS = [0, 40, 64, 40, 0, -40, -64, -40];

function renderCourse() {
  const container = $("#course-content");
  if (!COURSE_UNITS.length) {
    container.innerHTML = emptyBlock("Курсы пока не добавлены", "Запустите build_courses.py на backend и повторите загрузку.");
    return;
  }
  container.innerHTML = COURSE_UNITS.map((unit, unitIndex) => {
    const unitUnlocked = isUnitUnlocked(unitIndex);
    const completedLessons = unit.lessons.filter((lesson) => isComplete(unit.unit_id, lesson.lesson_id)).length;
    const bossDone = isComplete(unit.unit_id, unit.final_boss_node.lesson_id);
    const cast = UNIT_CAST[unit.unit_id] || UNIT_CAST[1];
    const lessonsHtml = unit.lessons.map((lesson, lessonIndex) => {
      const done = isComplete(unit.unit_id, lesson.lesson_id);
      const unlocked = isLessonUnlocked(unit, lessonIndex);
      const active = unlocked && !done;
      const className = done ? "is-done" : active ? "is-current" : "is-locked";
      const lessonIcon = done ? "i-check" : !unlocked ? "i-lock" : lesson.lesson_type === "flashcards" ? "i-book" : "i-star";
      const dx = NODE_OFFSETS[lessonIndex % NODE_OFFSETS.length];
      const guide = cast.guides[lessonIndex % cast.guides.length];
      const character = Math.abs(dx) >= 40 ? `<img class="path-character ${dx > 0 ? "path-character--left" : "path-character--right"}" src="${spriteUrl(guide)}" width="96" height="96" alt="" aria-hidden="true" draggable="false">` : "";
      return `<div class="path-row">
        ${character}
        <div class="node-wrap">
          ${active ? `<div class="node-guide"><div class="node-guide__bubble">Начать · ${esc(lesson.lesson_title)}</div></div>` : ""}
          <button class="node ${className}" style="--dx:${dx}" type="button" data-lesson-unit="${unit.unit_id}" data-lesson-id="${lesson.lesson_id}" data-locked="${!unlocked}" aria-label="${esc(lesson.lesson_title)}">${icon(lessonIcon)}</button>
        </div>
      </div>`;
    }).join("");
    const bossUnlocked = isBossUnlocked(unit);
    const bossClass = bossDone ? "is-done" : bossUnlocked ? "" : "is-locked";
    return `<section class="course-unit ${unitUnlocked ? "" : "is-locked"}">
      <div class="unit-banner unit-banner--${unit.accent}">
        <div><div class="unit-banner__num">Раздел ${unitIndex + 1}</div><div class="unit-banner__title">${esc(unit.unit_title)}</div><div class="unit-banner__desc">${esc(unit.unit_subtitle)}</div></div>
        <span class="unit-banner__progress">${completedLessons}/${unit.lessons.length}</span>
      </div>
      <div class="path-tree"><svg class="path-svg" aria-hidden="true"></svg>${lessonsHtml}
        <div class="path-row boss-row">
          <img class="path-character path-character--right path-character--boss" src="${spriteUrl(cast.boss)}" width="112" height="112" alt="" aria-hidden="true" draggable="false">
          <div class="node-wrap"><button class="node node--boss ${bossClass}" type="button" data-boss-unit="${unit.unit_id}" data-locked="${!(bossUnlocked || bossDone)}" aria-label="${esc(unit.final_boss_node.quest_title)}">${icon(bossDone ? "i-check" : "i-crown")}</button></div>
        </div>
      </div>
    </section>`;
  }).join("");

  $$('[data-lesson-unit]', container).forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.locked === "true") showToast("Сначала пройди предыдущий урок");
      else startLesson(Number(button.dataset.lessonUnit), Number(button.dataset.lessonId), button);
    });
  });
  $$('[data-boss-unit]', container).forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.locked === "true") showToast("Сначала пройди все уроки раздела");
      else startBoss(Number(button.dataset.bossUnit), button);
    });
  });
  preload([...new Set(COURSE_UNITS.flatMap((unit) => {
    const cast = UNIT_CAST[unit.unit_id] || UNIT_CAST[1];
    return [...cast.guides, cast.boss];
  }))]);
  courseResizeObserver?.disconnect();
  courseResizeObserver = new ResizeObserver(() => drawCoursePaths(container));
  $$(".path-tree", container).forEach((tree) => courseResizeObserver.observe(tree));
  requestAnimationFrame(() => drawCoursePaths(container));
}

function drawCoursePaths(container) {
  $$(".path-tree", container).forEach((tree) => {
    const treeBox = tree.getBoundingClientRect();
    const nodes = $$(".node", tree);
    const svg = $(".path-svg", tree);
    if (!treeBox.width || !treeBox.height || !svg) return;
    svg.setAttribute("viewBox", `0 0 ${treeBox.width} ${treeBox.height}`);
    svg.replaceChildren();
    nodes.slice(0, -1).forEach((node, index) => {
      const from = node.getBoundingClientRect();
      const to = nodes[index + 1].getBoundingClientRect();
      const x1 = from.left - treeBox.left + from.width / 2;
      const y1 = from.top - treeBox.top + from.height / 2;
      const x2 = to.left - treeBox.left + to.width / 2;
      const y2 = to.top - treeBox.top + to.height / 2;
      const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
      path.setAttribute("d", `M ${x1} ${y1} C ${x1} ${(y1 + y2) / 2}, ${x2} ${(y1 + y2) / 2}, ${x2} ${y2}`);
      if (node.classList.contains("is-done")) path.classList.add("is-done");
      svg.append(path);
    });
  });
}

async function startLesson(unitId, lessonId, button) {
  const unit = COURSE_UNITS.find((item) => item.unit_id === unitId);
  const lessonIndex = unit?.lessons.findIndex((item) => item.lesson_id === lessonId) ?? -1;
  if (!unit || lessonIndex < 0 || !isLessonUnlocked(unit, lessonIndex) || State.loadingCourseAction) return;
  State.loadingCourseAction = true;
  setBusy(button, true, "…");
  try {
    const detail = await apiRequest(`/courses/units/${unitId}`);
    applyUnitDetail(unit, detail);
    State.currentUnit = unit;
    State.currentLesson = unit.lessons[lessonIndex];
    State.currentStepIndex = 0;
    State.lessonPhase = "answering";
    State.flashIndex = 0;
    State.flashFlipped = false;
    State.inQuiz = false;
    State.quizIndex = 0;
    State.lessonAnswers = 0;
    State.lessonCorrect = 0;
    State.lessonStartedAt = Date.now();
    State.hearts = 5;
    State.completing = false;
    resetStreak();
    await preload([lessonId === 1 ? PLAYER_CHAR : lessonCharacter(unitId, lessonId)]);
    $("#modal-lesson").hidden = false;
    document.body.classList.add("modal-open");
    updateTopBar();
    renderLesson();
  } catch (error) {
    showToast(error.message);
  } finally {
    State.loadingCourseAction = false;
    setBusy(button, false);
  }
}

function closeLesson() {
  if (State.completing) return;
  $("#modal-lesson").hidden = true;
  $("#lesson-exit-sheet").hidden = true;
  document.body.classList.remove("modal-open");
  State.currentLesson = null;
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

function resetLessonFooter(mode = "") {
  const footer = $("#lesson-footer");
  footer.className = `duo-modal__footer lesson__foot ${mode}`.trim();
  $("#lesson-feedback-box").hidden = true;
  $("#flashcard-prev")?.remove();
}

function currentLessonCharacter() {
  if (!State.currentLesson) return PLAYER_CHAR;
  if (State.currentLesson.lesson_type === "flashcards") return PLAYER_CHAR;
  return lessonCharacter(State.currentUnit.unit_id, State.currentLesson.lesson_id, State.currentStepIndex);
}

function renderFlashcard() {
  const lesson = State.currentLesson;
  const card = lesson.cards[State.flashIndex];
  const container = $("#lesson-step-container");
  $("#lesson-modal-title").textContent = lesson.instruction;
  $("#lesson-hearts-wrap").hidden = true;
  $("#lesson-character-mini").hidden = false;
  $("#lesson-progress-bar").style.setProperty("--progress", `${((State.flashIndex + 1) / lesson.cards.length) * 100}%`);
  resetLessonFooter("is-flashcards");
  const action = $("#lesson-action-btn");
  action.disabled = false;
  action.className = "btn btn-primary btn-lg";
  action.textContent = State.flashIndex === lesson.cards.length - 1 ? (lesson.quiz.length ? "Перейти к квизу" : "Завершить этап") : "Дальше";
  container.innerHTML = `<div class="flip flashcard ${State.flashFlipped ? "is-flipped" : ""}" id="flashcard-flip" role="button" tabindex="0" aria-label="Перевернуть карточку">
    <div class="flip__inner">
      <div class="flip__face flashcard-side flashcard-front"><strong class="flip__word" lang="ba">${esc(card.ba)}</strong><button class="btn btn-ghost btn-icon flip__audio" id="flashcard-audio" type="button" aria-label="Прослушать башкирское слово">${icon("i-volume")}</button><span class="flashcard-hint">Нажми, чтобы увидеть перевод</span></div>
      <div class="flip__face flip__face--back flashcard-side flashcard-back"><strong class="flip__word">${esc(card.ru)}</strong><div class="flashcard-example"><strong lang="ba">${esc(card.example_ba)}</strong><p>${esc(card.example_ru)}</p></div><span class="flashcard-hint">Нажми, чтобы вернуться</span></div>
    </div>
  </div>`;
  const flip = $("#flashcard-flip");
  const toggleCard = () => {
    State.flashFlipped = !State.flashFlipped;
    flip.classList.toggle("is-flipped", State.flashFlipped);
  };
  flip.addEventListener("click", (event) => {
    if (!event.target.closest("#flashcard-audio")) toggleCard();
  });
  flip.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      toggleCard();
    }
  });
  $("#flashcard-audio").addEventListener("click", (event) => {
    event.stopPropagation();
    speakText(card.audio_tts || card.ba);
  });
  const previous = document.createElement("button");
  previous.id = "flashcard-prev";
  previous.type = "button";
  previous.className = "btn btn-ghost btn-icon";
  previous.disabled = State.flashIndex === 0;
  previous.setAttribute("aria-label", "Предыдущая карточка");
  previous.innerHTML = icon("i-arrow-left");
  previous.addEventListener("click", () => {
    if (State.flashIndex > 0) {
      State.flashIndex -= 1;
      State.flashFlipped = false;
      renderFlashcard();
    }
  });
  $("#lesson-footer").insertBefore(previous, action);
}

function shuffled(items, salt = 0) {
  return items
    .map((item, index) => ({ item, order: ((index + 1) * 37 + salt * 17) % 101 }))
    .sort((a, b) => a.order - b.order)
    .map(({ item }) => item);
}

function renderQuizQuestion() {
  const lesson = State.currentLesson;
  const question = lesson.quiz[State.quizIndex];
  State.lessonPhase = "answering";
  State.selectedAnswer = null;
  $("#lesson-modal-title").textContent = question.direction === "ba_to_ru" ? "Выбери перевод на русский" : "Выбери башкирский вариант";
  $("#lesson-hearts-wrap").hidden = false;
  $("#lesson-character-mini").hidden = true;
  $("#lesson-progress-bar").style.setProperty("--progress", `${((lesson.cards.length + State.quizIndex + 1) / (lesson.cards.length + lesson.quiz.length)) * 100}%`);
  resetLessonFooter();
  const action = $("#lesson-action-btn");
  action.disabled = true;
  action.className = "btn btn-success btn-lg btn-block";
  action.textContent = "Проверить";
  const isBashkir = question.direction === "ba_to_ru";
  $("#lesson-step-container").innerHTML = `${characterStage(PLAYER_CHAR, question.prompt, { lang: isBashkir ? "ba" : "ru", tts: isBashkir ? question.prompt : "" })}<div class="choice-list">${question.options.map((option) => `<button type="button" class="tile choice choice-btn" data-quiz-choice="${esc(option)}"><span class="choice-marker"></span><span ${question.direction === "ru_to_ba" ? 'lang="ba"' : ""}>${esc(option)}</span></button>`).join("")}</div>`;
  $$('[data-quiz-choice]').forEach((button) => button.addEventListener("click", () => {
    if (State.lessonPhase !== "answering") return;
    $$('[data-quiz-choice]').forEach((item) => item.classList.remove("is-selected"));
    button.classList.add("is-selected");
    State.selectedAnswer = button.dataset.quizChoice;
    action.disabled = false;
  }));
}

function renderLesson() {
  if (State.currentLesson.lesson_type === "flashcards") {
    if (State.inQuiz) renderQuizQuestion();
    else renderFlashcard();
    return;
  }
  const lesson = State.currentLesson;
  const step = lesson.steps[State.currentStepIndex];
  State.lessonPhase = "answering";
  State.selectedAnswer = null;
  State.wordBankPlaced = [];
  State.pairSelection = { ba: null, ru: null };
  State.matchedPairs = new Set();
  const titles = { word_bank: "Собери фразу", fill_blank: "Выбери пропущенное слово", chat_choice: "Выбери ответ", match_pairs: "Соедини пары" };
  $("#lesson-modal-title").textContent = titles[step.type] || lesson.instruction;
  $("#lesson-hearts-wrap").hidden = false;
  $("#lesson-character-mini").hidden = true;
  $("#lesson-progress-bar").style.setProperty("--progress", `${((State.currentStepIndex + 1) / lesson.steps.length) * 100}%`);
  resetLessonFooter();
  const action = $("#lesson-action-btn");
  action.disabled = true;
  action.className = "btn btn-success btn-lg btn-block";
  action.textContent = "Проверить";
  if (step.type === "word_bank") renderWordBank(step);
  if (step.type === "fill_blank") renderFillBlank(step);
  if (step.type === "chat_choice") renderChatChoice(step);
  if (step.type === "match_pairs") renderMatchPairs(step);
}

function renderWordBank(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `${characterStage(currentLessonCharacter(), step.prompt)}<div class="answer-line word-slot" id="lesson-word-slot"><span class="word-placeholder">Нажимай на слова ниже</span></div><div class="bank word-bank" id="lesson-word-bank">${step.bank.map((word, index) => `<button type="button" class="tile word-chip" lang="ba" data-bank-index="${index}">${esc(word)}</button>`).join("")}</div>`;
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
    ? State.wordBankPlaced.map((item, index) => `<button type="button" class="tile word-chip word-chip--placed" lang="ba" data-placed-index="${index}">${esc(item.word)}</button>`).join("")
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
  const sentence = `${step.sentence_pre} ____ ${step.sentence_post}`.trim();
  container.innerHTML = `${characterStage(currentLessonCharacter(), sentence, { lang: "ba", stacked: true })}<div class="sentence-card" lang="ba"><span>${esc(step.sentence_pre)}</span><span id="blank-placeholder" class="blank blank-placeholder">___</span><span>${esc(step.sentence_post)}</span></div><div class="choice-list">${step.options.map((option) => `<button type="button" class="tile choice choice-btn" data-choice="${esc(option)}"><span class="choice-marker"></span><span lang="ba">${esc(option)}</span></button>`).join("")}</div><p class="exercise-hint">${esc(step.hint)}</p>`;
  $$('[data-choice]', container).forEach((button) => {
    button.addEventListener("click", () => {
      if (State.lessonPhase !== "answering") return;
      $$('[data-choice]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.selectedAnswer = button.dataset.choice;
      $("#blank-placeholder").textContent = button.dataset.choice;
      $("#blank-placeholder").classList.add("is-selected");
      $("#lesson-action-btn").disabled = false;
    });
  });
}

function renderChatChoice(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `${characterStage("granny", step.speaker_ba, { lang: "ba", tts: step.speaker_ba })}<p class="exercise-prompt">${esc(step.prompt)}</p><div class="choice-list">${step.options.map((option, index) => `<button type="button" class="tile choice choice-btn" data-chat-index="${index}"><span class="choice-marker"></span><span lang="ba">${esc(option.text)}</span></button>`).join("")}</div>`;
  $$('[data-chat-index]', container).forEach((button) => {
    button.addEventListener("click", () => {
      if (State.lessonPhase !== "answering") return;
      $$('[data-chat-index]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.selectedAnswer = step.options[Number(button.dataset.chatIndex)];
      $("#lesson-action-btn").disabled = false;
    });
  });
}

function renderMatchPairs(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `${characterStage(currentLessonCharacter(), step.prompt)}<div class="pair-grid pairs-grid"><div lang="ba">${shuffled(step.pairs, 1).map((pair) => `<button type="button" class="tile pair-btn ${State.matchedPairs.has(pair.ba) ? "is-matched" : ""} ${State.pairSelection.ba === pair.ba ? "is-selected" : ""}" data-pair-ba="${esc(pair.ba)}" ${State.matchedPairs.has(pair.ba) ? "disabled" : ""}>${esc(pair.ba)}</button>`).join("")}</div><div>${shuffled(step.pairs, 4).map((pair) => `<button type="button" class="tile pair-btn ${State.matchedPairs.has(pair.ba) ? "is-matched" : ""} ${State.pairSelection.ru === pair.ru ? "is-selected" : ""}" data-pair-ru="${esc(pair.ru)}" data-pair-key="${esc(pair.ba)}" ${State.matchedPairs.has(pair.ba) ? "disabled" : ""}>${esc(pair.ru)}</button>`).join("")}</div></div>`;
  $$('[data-pair-ba]', container).forEach((button) => button.addEventListener("click", () => selectPair(step, "ba", button.dataset.pairBa, button.dataset.pairBa)));
  $$('[data-pair-ru]', container).forEach((button) => button.addEventListener("click", () => selectPair(step, "ru", button.dataset.pairKey, button.dataset.pairRu)));
  $("#lesson-action-btn").disabled = State.matchedPairs.size !== step.pairs.length;
}

function selectPair(step, side, key, value) {
  if (State.lessonPhase !== "answering") return;
  State.pairSelection[side] = value;
  if (side === "ba") State.pairSelection.baKey = key;
  else State.pairSelection.ruKey = key;
  if (!State.pairSelection.ba || !State.pairSelection.ru) {
    renderMatchPairs(step);
    return;
  }
  State.lessonPhase = "pair-check";
  const selectedBa = $$('[data-pair-ba]', $("#lesson-step-container")).find((button) => button.dataset.pairBa === State.pairSelection.baKey);
  const selectedRu = $$('[data-pair-ru]', $("#lesson-step-container")).find((button) => button.dataset.pairKey === State.pairSelection.ruKey);
  const matched = State.pairSelection.baKey === State.pairSelection.ruKey;
  if (matched) State.matchedPairs.add(State.pairSelection.baKey);
  [selectedBa, selectedRu].filter(Boolean).forEach((button) => button.classList.add(matched ? "is-correct" : "is-wrong"));
  if (!matched) {
    State.hearts = Math.max(0, State.hearts - 1);
    updateTopBar();
    reactToAnswer($("[data-character-stage]", $("#lesson-step-container")), false, step.prompt);
  } else if (State.matchedPairs.size === step.pairs.length) {
    reactToAnswer($("[data-character-stage]", $("#lesson-step-container")), true, step.prompt);
  }
  State.pairSelection = { ba: null, ru: null };
  setTimeout(() => {
    State.lessonPhase = "answering";
    renderMatchPairs(step);
  }, 300);
}

function correctAnswerText(step) {
  if (step.type === "word_bank") return step.target.join(" ");
  if (step.type === "fill_blank") return step.hint || step.correct;
  if (step.type === "chat_choice") return step.options.find((option) => option.is_correct)?.text || "";
  return "Все пары соединены верно.";
}

function showLessonFeedback(correct, answer, finalStep) {
  const footer = $("#lesson-footer");
  const feedback = $("#lesson-feedback-box");
  const action = $("#lesson-action-btn");
  const titles = ["Верно!", "Точно", "Так и есть"];
  footer.className = `duo-modal__footer lesson__foot feedback-sheet is-open ${correct ? "" : "feedback-sheet--error"}`;
  feedback.hidden = false;
  feedback.innerHTML = `<span class="feedback-sheet__icon">${icon(correct ? "i-check" : "i-x")}</span><div><div class="feedback-sheet__title">${correct ? titles[State.lessonAnswers % titles.length] : "Правильный ответ"}</div><div class="feedback-sheet__text">${correct ? "Можно двигаться дальше." : esc(answer)}</div></div>`;
  action.className = `btn ${correct ? "btn-success" : "btn-danger"} btn-lg btn-block`;
  action.textContent = correct ? (finalStep ? "Завершить урок" : "Дальше") : "Понятно";
  action.disabled = false;
}

function markLessonChoice(correct, correctAnswer) {
  const selected = $(".choice-btn.is-selected", $("#lesson-step-container"));
  selected?.classList.add(correct ? "is-correct" : "is-wrong");
  if (!correct) {
    $$(".choice-btn", $("#lesson-step-container")).find((button) => (button.dataset.quizChoice || button.dataset.choice || button.textContent) === correctAnswer)?.classList.add("is-correct");
  }
}

async function handleLessonAction() {
  if (State.completing || !State.currentLesson) return;
  if (State.lessonPhase === "complete") {
    const message = State.completionMessage;
    closeLesson();
    updateTopBar();
    await loadCourseUnits();
    showToast(message);
    return;
  }
  const lesson = State.currentLesson;
  const action = $("#lesson-action-btn");
  if (lesson.lesson_type === "flashcards") {
    if (!State.inQuiz) {
      if (State.flashIndex < lesson.cards.length - 1) {
        State.flashIndex += 1;
        State.flashFlipped = false;
        renderFlashcard();
      } else if (lesson.quiz.length) {
        State.inQuiz = true;
        State.quizIndex = 0;
        renderQuizQuestion();
      } else {
        await completeCurrentLesson();
      }
      return;
    }
    const question = lesson.quiz[State.quizIndex];
    if (State.lessonPhase === "answering") {
      const correct = State.selectedAnswer === question.correct_answer;
      State.lessonAnswers += 1;
      State.lessonCorrect += Number(correct);
      State.lessonPhase = "feedback";
      markLessonChoice(correct, question.correct_answer);
      reactToAnswer($("[data-character-stage]", $("#lesson-step-container")), correct, question.prompt);
      showLessonFeedback(correct, question.correct_answer, State.quizIndex === lesson.quiz.length - 1);
      if (!correct) {
        State.hearts = Math.max(0, State.hearts - 1);
        updateTopBar();
      }
    } else {
      State.quizIndex += 1;
      if (State.quizIndex < lesson.quiz.length) renderQuizQuestion();
      else await completeCurrentLesson();
    }
    return;
  }
  const step = lesson.steps[State.currentStepIndex];
  if (State.lessonPhase === "answering") {
    let correct = false;
    if (step.type === "word_bank") correct = JSON.stringify(State.wordBankPlaced.map((item) => item.word)) === JSON.stringify(step.target);
    if (step.type === "fill_blank") correct = State.selectedAnswer === step.correct;
    if (step.type === "chat_choice") correct = Boolean(State.selectedAnswer?.is_correct);
    if (step.type === "match_pairs") correct = State.matchedPairs.size === step.pairs.length;
    State.lessonAnswers += 1;
    State.lessonCorrect += Number(correct);
    State.lessonPhase = "feedback";
    const answer = correctAnswerText(step);
    markLessonChoice(correct, answer);
    const scene = $("[data-character-stage]", $("#lesson-step-container"));
    const idleLine = $(".speech__text", scene)?.textContent || "";
    reactToAnswer(scene, correct, idleLine);
    showLessonFeedback(correct, answer, State.currentStepIndex === lesson.steps.length - 1);
    if (!correct) {
      State.hearts = Math.max(0, State.hearts - 1);
      updateTopBar();
    }
  } else {
    State.currentStepIndex += 1;
    if (State.currentStepIndex < lesson.steps.length) renderLesson();
    else await completeCurrentLesson();
  }
}

function showConfetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const confetti = document.createElement("div");
  confetti.className = "confetti";
  confetti.setAttribute("aria-hidden", "true");
  const colors = ["var(--blue-500)", "var(--green-500)", "var(--gold-500)", "var(--red-500)"];
  for (let index = 0; index < 24; index += 1) {
    const piece = document.createElement("i");
    piece.style.setProperty("--i", index);
    piece.style.setProperty("--x", (index * 41) % 100);
    piece.style.setProperty("--dx", (index % 7) * 16 - 48);
    piece.style.setProperty("--r", 180 + (index % 5) * 135);
    piece.style.setProperty("--c", colors[index % colors.length]);
    confetti.append(piece);
  }
  document.body.append(confetti);
  setTimeout(() => confetti.remove(), 1600);
}

function renderLessonComplete(response, score) {
  State.lessonPhase = "complete";
  State.completionMessage = response.already_completed ? "Этап уже был пройден — повторные очки не начислены" : `Этап завершён! +${response.awarded_xp} очков`;
  $("#lesson-modal-title").textContent = "Урок пройден!";
  $("#lesson-hearts-wrap").hidden = true;
  $("#lesson-character-mini").hidden = true;
  $("#lesson-progress-bar").style.setProperty("--progress", "100%");
  const seconds = Math.max(1, Math.round((Date.now() - State.lessonStartedAt) / 1000));
  $("#lesson-step-container").innerHTML = `<div class="ornament-bg" aria-hidden="true"></div><div class="lesson-complete">${characterStage(PLAYER_CHAR, "Афарин!", { state: "combo", lang: "ba", stacked: true })}<div class="stat-grid lesson-complete__stats"><div class="card stat-card"><strong>+${formatNumber(response.awarded_xp)}</strong><span>очков</span></div><div class="card stat-card"><strong>${score}%</strong><span>точность</span></div><div class="card stat-card"><strong>${seconds} сек</strong><span>время</span></div></div></div>`;
  resetLessonFooter();
  const action = $("#lesson-action-btn");
  action.className = "btn btn-success btn-lg btn-block";
  action.textContent = "Продолжить";
  action.disabled = false;
  showConfetti();
}

async function completeCurrentLesson() {
  const lesson = State.currentLesson;
  const score = State.lessonAnswers ? Math.round((State.lessonCorrect / State.lessonAnswers) * 100) : 100;
  State.completing = true;
  const action = $("#lesson-action-btn");
  setBusy(action, true, "Сохраняем прогресс…");
  try {
    const response = await apiRequest(`/courses/units/${lesson.unit_id}/complete`, {
      method: "POST",
      body: { circle: lesson.circle, score },
    });
    State.progress.add(progressKey(lesson.unit_id, lesson.lesson_id));
    State.user.points = response.points;
    State.user.level = response.level;
    State.completing = false;
    updateTopBar();
    renderLessonComplete(response, score);
  } catch (error) {
    State.completing = false;
    setBusy(action, false);
    showToast(error.message);
  }
}

// ---------------------------------------------------------------------------
// Сюжетные квесты
// ---------------------------------------------------------------------------

async function startBoss(unitId, button) {
  const unit = COURSE_UNITS.find((item) => item.unit_id === unitId);
  if (!unit || (!isBossUnlocked(unit) && !isComplete(unitId, unit.final_boss_node.lesson_id)) || State.loadingCourseAction) return;
  State.loadingCourseAction = true;
  setBusy(button, true, "…");
  try {
    const detail = await apiRequest(`/courses/units/${unitId}`);
    applyUnitDetail(unit, detail);
    State.bossUnit = unit;
    State.bossStageIndex = 0;
    State.bossPhase = "answering";
    State.bossAnswers = 0;
    State.bossCorrect = 0;
    State.completing = false;
    resetStreak();
    await preload([(UNIT_CAST[unitId] || UNIT_CAST[1]).boss, PLAYER_CHAR]);
    $("#modal-boss").hidden = false;
    document.body.classList.add("modal-open");
    $("#boss-modal-title").textContent = unit.final_boss_node.quest_title;
    renderBossStage();
  } catch (error) {
    showToast(error.message);
  } finally {
    State.loadingCourseAction = false;
    setBusy(button, false);
  }
}

function closeBoss() {
  if (State.completing) return;
  $("#modal-boss").hidden = true;
  document.body.classList.remove("modal-open");
  State.bossUnit = null;
}

function bossDialog(stage) {
  const bossChar = (UNIT_CAST[State.bossUnit.unit_id] || UNIT_CAST[1]).boss;
  return `<p class="story-context">${esc(stage.story_context)}</p>${characterStage(bossChar, stage.npc_speech_ba || "", { lang: "ba", tts: stage.npc_speech_ba, className: "character-stage--duel", stacked: true })}<div class="boss-player-stage" data-player-stage><div class="character character--static" data-char="${PLAYER_CHAR}" data-state="idle" aria-hidden="true"><img class="character__img" src="${spriteUrl(PLAYER_CHAR)}" width="512" height="512" alt=""></div></div><p class="exercise-prompt">${esc(stage.task_prompt || "")}</p>`;
}

function renderBossStage() {
  const boss = State.bossUnit.final_boss_node;
  const stage = boss.stages[State.bossStageIndex];
  const container = $("#boss-step-container");
  const action = $("#boss-action-btn");
  State.bossPhase = "answering";
  State.bossChoice = null;
  $("#boss-footer").className = "duo-modal__footer lesson__foot";
  $("#boss-feedback-box").hidden = true;
  $("#boss-progress-bar").style.setProperty("--progress", `${((State.bossStageIndex + 1) / boss.stages.length) * 100}%`);
  $("#boss-step-label").textContent = `${State.bossStageIndex + 1}/${boss.stages.length}`;
  action.disabled = stage.mechanic !== "reward_screen";
  action.className = `btn ${stage.mechanic === "reward_screen" ? "btn-success" : "btn-primary"} btn-lg btn-block`;
  action.textContent = stage.mechanic === "reward_screen" ? "Продолжить · +100 очков" : "Проверить ответ";

  if (stage.mechanic === "chat_choice") {
    container.innerHTML = `${bossDialog(stage)}<div class="choice-list">${stage.options.map((option, index) => `<button class="tile choice choice-btn" type="button" data-boss-choice="${index}"><span class="choice-marker"></span><span lang="ba">${esc(option.text_ba)}</span></button>`).join("")}</div>`;
    $$('[data-boss-choice]', container).forEach((button) => button.addEventListener("click", () => {
      if (State.bossPhase !== "answering") return;
      $$('[data-boss-choice]', container).forEach((item) => item.classList.remove("is-selected"));
      button.classList.add("is-selected");
      State.bossChoice = stage.options[Number(button.dataset.bossChoice)];
      action.disabled = false;
    }));
  }
  if (stage.mechanic === "reward_screen") {
    const bossChar = (UNIT_CAST[State.bossUnit.unit_id] || UNIT_CAST[1]).boss;
    container.innerHTML = `<div class="ornament-bg" aria-hidden="true"></div><div class="boss-reward"><div class="reward-characters">${characterStage(bossChar, stage.final_praise_ba, { state: "special", lang: "ba", stacked: true })}<div class="character" data-char="${PLAYER_CHAR}" data-state="combo" aria-hidden="true"><img class="character__img" src="${spriteUrl(PLAYER_CHAR, "combo")}" width="512" height="512" alt=""></div></div><div class="trophy-card"><span>Факт о Башкортостане</span><h3>${esc(stage.reward_trophy.title)}</h3><p>${esc(stage.reward_trophy.cultural_fact)}</p></div></div>`;
    $("#boss-modal-title").textContent = "Афарин!";
    showConfetti();
  } else {
    $("#boss-modal-title").textContent = boss.quest_title;
  }
}

async function handleBossAction() {
  if (State.completing || !State.bossUnit) return;
  const boss = State.bossUnit.final_boss_node;
  const stage = boss.stages[State.bossStageIndex];
  if (stage.mechanic === "reward_screen") {
    await completeBoss();
    return;
  }
  const action = $("#boss-action-btn");
  const feedback = $("#boss-feedback-box");
  if (State.bossPhase === "answering") {
    const correct = stage.mechanic === "chat_choice" && Boolean(State.bossChoice?.is_correct);
    State.bossAnswers += 1;
    State.bossCorrect += Number(correct);
    State.bossPhase = "feedback";
    const explanation = State.bossChoice?.error_hint || "Вспомни слова из карточек.";
    const scene = $("[data-character-stage]", $("#boss-step-container"));
    reactToAnswer(scene, correct, stage.npc_speech_ba || "");
    setState($("[data-player-stage]", $("#boss-step-container")), correct ? "success" : "fail");
    $(".choice-btn.is-selected", $("#boss-step-container"))?.classList.add(correct ? "is-correct" : "is-wrong");
    $("#boss-footer").className = `duo-modal__footer lesson__foot feedback-sheet is-open ${correct ? "" : "feedback-sheet--error"}`;
    feedback.hidden = false;
    feedback.innerHTML = `<span class="feedback-sheet__icon">${icon(correct ? "i-check" : "i-x")}</span><div><div class="feedback-sheet__title">${correct ? "Верно!" : "Попробуем разобраться"}</div><div class="feedback-sheet__text">${correct ? "Ответ принят." : esc(explanation)}</div></div>`;
    action.className = `btn ${correct ? "btn-success" : "btn-danger"} btn-lg btn-block`;
    action.textContent = correct ? "Дальше" : "Понятно";
    action.disabled = false;
    if (!correct) {
      State.hearts = Math.max(0, State.hearts - 1);
      updateTopBar();
    }
  } else {
    State.bossStageIndex += 1;
    renderBossStage();
  }
}

async function completeBoss() {
  const boss = State.bossUnit.final_boss_node;
  const score = State.bossAnswers ? Math.round((State.bossCorrect / State.bossAnswers) * 100) : 100;
  State.completing = true;
  const action = $("#boss-action-btn");
  setBusy(action, true, "Сохраняем награду…");
  try {
    const response = await apiRequest(`/courses/units/${boss.unit_id}/complete`, {
      method: "POST",
      body: { circle: "boss_story", score },
    });
    State.progress.add(progressKey(boss.unit_id, boss.lesson_id));
    State.user.points = response.points;
    State.user.level = response.level;
    State.user.badges = response.badges || State.user.badges;
    State.completing = false;
    closeBoss();
    updateTopBar();
    await loadCourseUnits();
    showToast(response.already_completed ? "Квест пройден повторно — повторные очки не начислены" : `Победа! +${response.awarded_xp} очков`);
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
  if (!source) return "Материалы курса";
  const title = source.file === "audio/news.mp3" ? "Новости" : source.chapter || source.file || "Материалы курса";
  const date = source.time ? new Date(source.time) : null;
  const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : source.time;
  return [title, time].filter(Boolean).join(" · ");
}

let communitySearchTimer;

function setCommunityMode(mode) {
  State.communityMode = mode;
  $$('[data-community-mode]').forEach((button) => {
    const active = button.dataset.communityMode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $("#community-verify").hidden = mode !== "verify";
  $("#community-propose").hidden = mode !== "propose";
}

function queueDictionarySearch() {
  clearTimeout(communitySearchTimer);
  const query = $("#dictionary-search").value.trim();
  const requestId = ++State.searchRequest;
  if (!query) {
    $("#dictionary-results").innerHTML = "";
    return;
  }
  $("#dictionary-results").innerHTML = loadingBlock("Ищем в общем словаре…");
  communitySearchTimer = setTimeout(() => searchDictionary(query, requestId), 280);
}

async function searchDictionary(query, requestId = ++State.searchRequest) {
  const container = $("#dictionary-results");
  container.innerHTML = loadingBlock("Ищем в общем словаре…");
  try {
    const rows = await apiRequest(`/fragments/search?q=${encodeURIComponent(query)}&limit=20&lang_pair=ba-ru`);
    if (requestId !== State.searchRequest) return;
    if (!rows.length) {
      container.innerHTML = emptyBlock("В словаре пока нет такой фразы", "Переключитесь на «Предложить», чтобы добавить её первым.");
      return;
    }
    const statusLabels = { confirmed: "Подтверждено", pending: "На проверке", expert_review: "Экспертная проверка" };
    container.innerHTML = `<div class="dictionary-results__head"><strong>Найдено: ${rows.length}</strong><span>Башҡортса — русский</span></div>${rows.map((row) => `<article class="dictionary-result"><div><p class="dictionary-result__ba" lang="ba">${esc(row.text_ba)}</p><p class="dictionary-result__ru">${esc(row.translation)}</p></div><div class="dictionary-result__meta"><span class="chip-static">${esc(statusLabels[row.status] || row.status)}</span>${row.confirmed ? `<span>${formatNumber(row.confirmed)} подтверждений</span>` : ""}<small>${esc(sourceText(row.source))}</small></div></article>`).join("")}`;
  } catch (error) {
    if (requestId === State.searchRequest) renderError(container, error, () => searchDictionary(query, requestId));
  }
}

function updateProposalCount(input) {
  $(`#${input.id}-count`).textContent = `${input.value.length}/200`;
}

async function submitProposal(event) {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const button = $("button[type='submit']", form);
  const status = $("#proposal-status");
  setBusy(button, true, "Отправляем…");
  status.textContent = "";
  try {
    const response = await apiRequest("/fragments/propose", {
      method: "POST",
      body: {
        text_ba: $("#proposal-ba").value.trim(),
        translation: $("#proposal-ru").value.trim(),
        lang_pair: "ba-ru",
      },
    });
    State.user.points = response.points;
    State.user.level = response.level;
    State.user.badges = response.badges;
    updateTopBar();
    form.reset();
    updateProposalCount($("#proposal-ba"));
    updateProposalCount($("#proposal-ru"));
    status.className = "form-status form-status--success";
    status.textContent = `${response.message} +${response.awarded_xp} очков.`;
  } catch (error) {
    status.className = "form-status form-status--error";
    status.textContent = error.message;
  } finally {
    setBusy(button, false);
  }
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
    actions = `<div class="daily-actions"><button class="btn btn-success btn-lg" type="button" data-daily="correct" ${disabled}>${icon("i-check")}Верно · +10 очков</button><button class="btn btn-ghost btn-lg" type="button" data-daily="fix" ${disabled}>${icon("i-x")}Неверно</button></div>`;
  }
  if (State.dailyMode === "fix") {
    const correction = State.dailyCorrection || task.translation;
    actions = `<div class="correction-box"><label class="field"><span class="label">Как правильно?</span><textarea id="daily-correction" class="input textarea" rows="3" minlength="2" required>${esc(correction)}</textarea></label><div class="daily-actions"><button class="btn btn-primary btn-lg" type="button" data-daily="submit-fix" ${disabled}>Отправить · +15 очков</button><button class="btn btn-ghost" type="button" data-daily="cancel" ${disabled}>Отмена</button></div></div>`;
  }
  if (State.dailyMode === "result" && State.dailyResult) {
    const result = State.dailyResult;
    const statusLabels = { confirmed: "Перевод подтверждён", expert_review: "Нужна экспертная проверка", pending: "Голос сохранён" };
    actions = `<div class="daily-result"><strong>+${formatNumber(result.pointsEarned)} очков</strong><p>${esc(result.message)} ${esc(statusLabels[result.consensus] || result.consensus)}</p><button class="btn btn-primary btn-block" type="button" data-daily="next">Следующая фраза</button></div>`;
  }
  const resultScene = State.dailyMode === "result" ? characterStage("granny", "Афарин!", { state: "special", lang: "ba" }) : "";
  body.innerHTML = `${resultScene}<article class="workout-card card-task daily-card"><div class="daily-card__top"><span class="chip-static">Задание дня</span><span>+15 очков</span></div><div class="daily-phrase"><p class="text-ba" lang="ba">${esc(task.text_ba)}</p><button class="btn btn-ghost btn-icon" type="button" data-daily-tts="${esc(task.text_ba)}" aria-label="Прослушать фразу">${icon("i-volume")}</button></div><p class="source-line">${icon("i-book", "icon icon-sm")}${esc(sourceText(task.source))}</p><div class="translation-panel"><span>Предложенный перевод</span><p>${esc(task.translation)}</p></div>${actions}</article>`;
  if (State.dailyMode === "fix") {
    const textarea = $("#daily-correction");
    textarea.focus();
    textarea.addEventListener("input", () => { $('[data-daily="submit-fix"]').disabled = textarea.value.trim().length < 2; });
  }
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
  if (category === "schools") return { name: item.school, meta: `${formatNumber(item.students)} учеников`, value: `${formatNumber(item.points)} очков` };
  if (category === "classes") return { name: `${item.class_name} класс`, meta: item.school, value: `${formatNumber(item.points)} очков` };
  if (category === "accuracy") return { name: item.full_name, meta: `${formatNumber(item.correct_answers)} из ${formatNumber(item.total_answers)} ответов`, value: `${formatNumber(item.accuracy)}%` };
  if (category === "vocabulary") return { name: item.full_name, meta: [item.school, item.class_name].filter(Boolean).join(" · "), value: `${formatNumber(item.unique_translations)} слов` };
  if (category === "corrections") return { name: item.full_name, meta: `${formatNumber(item.points)} очков за исправления`, value: formatNumber(item.corrections) };
  return { name: item.full_name, meta: [item.school, item.class_name].filter(Boolean).join(" · "), value: `${formatNumber(item.points)} очков` };
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
    return `<div class="rank-row rank-item ${mine ? "rank-row--me rank-item--me" : ""}"><div class="rank-badge rank-badge--${item.rank <= 3 ? item.rank : "other"}">${item.rank}</div><div class="avatar">${esc(initials(view.name))}</div><div class="rank-info"><span class="rank-name">${esc(view.name)}${mine ? " · Вы" : ""}</span><span class="rank-meta">${esc(view.meta)}</span></div><strong class="rank-points">${esc(view.value)}</strong></div>`;
  }).join("");
}

// ---------------------------------------------------------------------------
// Профиль, учитель и модерация
// ---------------------------------------------------------------------------

function openInfoSheet(title, text) {
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop";
  backdrop.innerHTML = `<div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="info-sheet-title"><h2 id="info-sheet-title">${esc(title)}</h2><p>${esc(text)}</p><button class="btn btn-primary btn-lg btn-block" type="button">Понятно</button></div>`;
  const onKeydown = (event) => { if (event.key === "Escape") close(); };
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKeydown);
  };
  $("button", backdrop).addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", onKeydown);
  document.body.append(backdrop);
}

function renderProfile() {
  const user = State.user;
  const earned = new Set(user.badges || []);
  const canExport = ["teacher", "expert", "admin"].includes(user.role);
  COURSE_UNITS.forEach((unit) => {
    if (isComplete(unit.unit_id, unit.final_boss_node.lesson_id)) earned.add(`boss-${unit.unit_id}`);
  });
  const badges = [
    ...BADGE_CATALOG,
    ...COURSE_UNITS.map((unit) => ({ id: `boss-${unit.unit_id}`, title: unit.final_boss_node.quest_title, desc: `Пройдите сюжетный квест с персонажем ${unit.character_name}`, icon: "i-crown" })),
  ];
  const exportBlock = canExport ? `<div class="card section-gap"><h3>Экспорт переводов</h3><p class="muted">Подтверждённый корпус в JSON или CSV.</p><div class="profile-export"><button class="btn btn-ghost" type="button" data-export="json">Скачать JSON</button><button class="btn btn-ghost" type="button" data-export="csv">Скачать CSV</button></div></div>` : "";
  const cabinetRow = canExport ? `<button class="settings-row" type="button" data-profile-nav="cabinet"><span class="settings-row__label">${icon("i-shield")}Кабинет</span><span class="settings-row__value">Открыть</span></button>` : "";
  $("#profile-content").innerHTML = `<div class="profile-hero"><div class="avatar avatar--blue profile-avatar">${esc(initials(user.full_name))}</div><h2>${esc(user.full_name)}</h2><p>${esc([user.school, user.class_name && `${user.class_name} класс`].filter(Boolean).join(" · ") || user.email || "Башкирская языковая школа")}</p><span class="role-badge">${esc({ student: "Ученик", teacher: "Учитель", expert: "Эксперт УФИЦ РАН", admin: "Администратор УФИЦ РАН" }[user.role] || user.role)}</span></div>
    <div class="stat-grid profile-stats"><div class="stat stat--gold"><div class="stat__icon">${icon("kurai")}</div><div class="stat__body"><div class="stat__value">${formatNumber(user.points)}</div><div class="stat__label">очков</div></div></div><div class="stat"><div class="stat__icon">${icon("i-cup")}</div><div class="stat__body"><div class="stat__value">${formatNumber(user.level)}</div><div class="stat__label">уровень</div></div></div><div class="stat stat--gold"><div class="stat__icon">${icon("i-flame")}</div><div class="stat__body"><div class="stat__value">${formatNumber(user.streak_days)}</div><div class="stat__label">дней серии</div></div></div><div class="stat stat--green"><div class="stat__icon">${icon("i-check")}</div><div class="stat__body"><div class="stat__value">${State.progress.size}</div><div class="stat__label">этапов курса</div></div></div></div>
    <div class="section-title-row"><h3>Награды</h3><span class="muted">${earned.size}/${badges.length}</span></div><div class="badge-list">${badges.map((badge) => `<button class="badge-item ${earned.has(badge.id) ? "" : "badge-item--locked"}" type="button" data-badge="${esc(badge.id)}"><span class="badge-item__icon">${icon(badge.icon)}</span><span class="badge-item__info"><span class="badge-item__title">${esc(badge.title)}</span><span class="badge-status">${earned.has(badge.id) ? "Получено" : "Впереди"}</span></span></button>`).join("")}</div>
    <div class="section-title-row"><h3>Настройки</h3></div><div class="card settings-card"><button class="settings-row" type="button" data-profile-language><span class="settings-row__label">${icon("i-book")}Языковая пара</span><span class="settings-row__value">Башкирский ↔ русский</span></button><div class="settings-row"><span class="settings-row__label">${icon("i-volume")}Звук</span><span class="settings-row__value">Включён при нажатии</span></div><div class="settings-row"><span class="settings-row__label">${icon("i-profile")}Telegram</span><span class="settings-row__value">Вход сохраняется</span></div>${cabinetRow}</div>
    ${exportBlock}
    <div class="profile-actions"><button id="logout-button" class="profile-logout btn-block" type="button">Выйти из аккаунта</button></div>`;
  $("#logout-button").addEventListener("click", () => logout());
  $("[data-profile-language]").addEventListener("click", () => { $("#language-sheet").hidden = false; });
  $("[data-profile-nav]")?.addEventListener("click", () => switchTab("cabinet"));
  $$('[data-badge]', $("#profile-content")).forEach((button) => button.addEventListener("click", () => {
    const badge = badges.find((item) => item.id === button.dataset.badge);
    openInfoSheet(badge.title, `${badge.desc}. ${earned.has(badge.id) ? "Награда уже в вашей коллекции." : "Награда ещё впереди."}`);
  }));
  $$('[data-export]', $("#profile-content")).forEach((button) => button.addEventListener("click", () => downloadTranslations(button.dataset.export, button)));
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
  container.innerHTML = `<div class="report-summary"><div><span>Учеников</span><strong>${report.total_students}</strong></div><div><span>Средняя точность</span><strong>${formatNumber(average.toFixed(1))}%</strong></div></div><div class="table-scroll"><table class="report-table"><thead><tr><th>Ученик</th><th>Очки</th><th>Уровень</th><th>Ответы</th><th>Точность</th></tr></thead><tbody>${report.students.map((student) => `<tr><td>${esc(student.full_name)}</td><td>${formatNumber(student.points)}</td><td>${formatNumber(student.level)}</td><td>${formatNumber(student.total_answers)}</td><td><strong>${formatNumber(student.accuracy)}%</strong></td></tr>`).join("")}</tbody></table></div><p class="report-caption">${esc(report.school)} · ${esc(report.class_name)}</p>`;
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
  $$('[data-rail-nav]').forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.railNav)));
  window.addEventListener("hashchange", () => {
    if (State.user) switchTab(location.hash.slice(1));
  });
  const requestLessonClose = () => {
    if (State.lessonPhase === "complete") closeLesson();
    else $("#lesson-exit-sheet").hidden = false;
  };
  $("#lesson-close").addEventListener("click", requestLessonClose);
  $("#lesson-stay").addEventListener("click", () => { $("#lesson-exit-sheet").hidden = true; });
  $("#lesson-exit").addEventListener("click", closeLesson);
  $("#lesson-action-btn").addEventListener("click", handleLessonAction);
  $("#boss-close").addEventListener("click", closeBoss);
  $("#boss-action-btn").addEventListener("click", handleBossAction);
  $("#language-pair-button").addEventListener("click", () => { $("#language-sheet").hidden = false; });
  $("#language-close").addEventListener("click", () => { $("#language-sheet").hidden = true; });
  $("#language-current").addEventListener("click", () => { $("#language-sheet").hidden = true; });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-character-tts], [data-daily-tts]");
    if (button) speakText(button.dataset.characterTts || button.dataset.dailyTts);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#language-sheet").hidden) $("#language-sheet").hidden = true;
    else if (!$("#lesson-exit-sheet").hidden) $("#lesson-exit-sheet").hidden = true;
    else if (!$("#modal-lesson").hidden) requestLessonClose();
    else if (!$("#modal-boss").hidden) closeBoss();
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
  $("#dictionary-search").addEventListener("input", queueDictionarySearch);
  $$('[data-community-mode]').forEach((button) => button.addEventListener("click", () => setCommunityMode(button.dataset.communityMode)));
  $("#proposal-form").addEventListener("submit", submitProposal);
  [$("#proposal-ba"), $("#proposal-ru")].forEach((input) => input.addEventListener("input", () => updateProposalCount(input)));
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
