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
import { AVATAR_CHARACTERS, AVATAR_COLORS, AVATAR_UNLOCK, AWARDS } from "./cabinet-data.js";
import "./bashkir-keyboard.js";
import { speakBashkir } from "./speech.js";
import { initClouds } from "./clouds.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

const RATING_CATEGORIES = [
  { id: "top", label: "Ученики", endpoint: "/ratings/top" },
  { id: "classes", label: "Классы", endpoint: "/ratings/classes" },
  { id: "schools", label: "Школы", endpoint: "/ratings/schools" },
  { id: "my-school", label: "Моя школа", endpoint: "/ratings/top" },
];

const RATING_PERIODS = [
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "all", label: "Всё время" },
];

const RANK_LIST_LIMIT = 5;

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
  bossChat: [],
  bossChatStage: -1,
  bossPlayerStage: -1,
  lessonChat: [],
  lessonChatStep: -1,
  dailyTask: null,
  dailyMode: "actions",
  dailyResult: null,
  dailyCorrection: "",
  dailySubmitting: false,
  communityMode: "library",
  proposalStep: 1,
  proposalMeta: { kind: "", register: "literary", topics: [], pos: "", dialect: "unknown", example: "", source_kind: "" },
  searchRequest: 0,
  ratingCategory: "top",
  ratingPeriod: "week",
  ratingSchoolMode: "students",
  ratingRequest: 0,
  schools: [],
  schoolsMetadata: null,
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
  const values = [["#top-streak", formatNumber(State.user.streak_days)], ["#top-points", formatNumber(State.user.points)], ["#top-hearts", String(State.hearts)]];
  values.forEach(([selector, value]) => {
    const output = $(selector);
    if (output.textContent !== value) {
      const pill = output.closest(".stat-pill");
      pill.classList.remove("is-bumped");
      void pill.offsetWidth;
      pill.classList.add("is-bumped");
      setTimeout(() => pill.classList.remove("is-bumped"), 300);
    }
    output.textContent = value;
  });
  $(".stat-flame").classList.toggle("is-empty", !Number(State.user.streak_days));
  $("#rail-streak").textContent = formatNumber(State.user.streak_days);
  $("#library-streak").textContent = formatNumber(State.user.streak_days);
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

function directorySchool(value) {
  const key = schoolKey(value);
  return State.schools.find((school) => [school.name, school.short_name].some((name) => schoolKey(name) === key));
}

async function loadSchoolDirectory() {
  try {
    const first = await apiRequest("/schools?limit=100", { token: "" });
    const rows = [...first.items];
    while (rows.length < first.total && rows.length < 5000) {
      const page = await apiRequest(`/schools?limit=100&offset=${rows.length}`, { token: "" });
      rows.push(...page.items);
    }
    State.schools = rows;
    State.schoolsMetadata = first.metadata;
    $("#school-directory").innerHTML = rows.map((school) => `<option value="${esc(school.name)}" label="${esc([school.short_name, school.city || school.district].filter(Boolean).join(" · "))}"></option>`).join("");
  } catch {
    // Форма остаётся доступной: backend повторно проверит название школы.
  }
}

async function register(form) {
  const data = new FormData(form);
  const payload = Object.fromEntries(data.entries());
  $("#auth-status").textContent = "";
  const selectedSchool = directorySchool(payload.school);
  if (payload.school && !selectedSchool) {
    $("#auth-status").textContent = "Выберите школу из справочника.";
    return;
  }
  if (selectedSchool) {
    payload.school_id = selectedSchool.id;
    payload.school = selectedSchool.name;
  }
  const button = $("button[type='submit']", form);
  setBusy(button, true, "Создаём…");
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
  $("#cabinet-nav").hidden = false;
  $("#teacher-panel").hidden = !canTeach;
  $("#moderation-panel").hidden = !canModerate;
  $(".cabinet-tools-heading").hidden = !(canTeach || canModerate);
  $("#cabinet-subtitle").textContent = canModerate
    ? "Отчёты, экспертная модерация и подтверждение переводов."
    : "Сводная успеваемость вашего класса.";
  $(".duo-bottom-nav").style.setProperty("--nav-count", 4);
  $("#teacher-school").value = State.user.school || "";
  $("#teacher-class").value = State.user.class_name || (State.user.email === "teacher@example.com" ? "7А" : "");
}

function switchTab(tab) {
  if (tab === "profile") tab = "cabinet";
  if (!["course", "community", "ratings", "cabinet"].includes(tab)) tab = "course";
  State.activeTab = tab;
  document.body.dataset.activeTab = tab;
  const desktopTitles = { course: "Учебный путь", community: "Китапхана переводов", ratings: "Рейтинг", cabinet: "Личный кабинет" };
  $("#desktop-page-title").textContent = desktopTitles[tab];
  $$(".duo-nav-tab").forEach((link) => {
    const active = link.dataset.tab === tab;
    link.classList.toggle("is-active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });
  ["course", "community", "ratings", "cabinet"].forEach((name) => {
    $(`#screen-${name}`).hidden = name !== tab;
  });
  $("#top-hearts-wrap").hidden = ["community", "ratings", "cabinet"].includes(tab);
  if (location.hash !== `#${tab}`) history.replaceState(null, "", `#${tab}`);
  if (tab === "course") renderCourse();
  if (tab === "community") {
    setCommunityMode(State.communityMode);
    if (!State.dailyTask) loadDailyTask();
  }
  if (tab === "ratings") loadRatings();
  if (tab === "cabinet") {
    renderCabinetSafe();
    if (!$("#moderation-panel").hidden) loadModeration();
  }
  const resetScroll = () => window.scrollTo({ top: 0, behavior: "instant" });
  resetScroll();
  requestAnimationFrame(resetScroll);
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
const NODE_OFFSETS = [0, 18, 29, 18, 0, -18, -29, -18];
const COURSE_SCENES = [
  { image: "scenes/scene_granny_boy.png", alt: "Мальчик и бабушка за чаепитием с книгой" },
  { image: "scenes/scene_boy_girl.png", alt: "Мальчик и девочка в башкирских костюмах" },
  { image: "scenes/scene_boy_akbuzat.png", alt: "Мальчик летит на крылатом коне Акбузате" },
];

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
    const scene = COURSE_SCENES[unitIndex % COURSE_SCENES.length];
    const rows = [];
    unit.lessons.forEach((lesson, lessonIndex) => {
      const done = isComplete(unit.unit_id, lesson.lesson_id);
      const unlocked = isLessonUnlocked(unit, lessonIndex);
      const active = unlocked && !done;
      const className = done ? "is-done" : active ? "is-current" : "is-locked";
      const lessonIcon = done ? "i-check" : !unlocked ? "i-lock" : lesson.lesson_type === "flashcards" ? "i-book" : "i-star";
      const side = lessonIndex % 2 ? "right" : "left";
      rows.push(`<div class="path-row path-row--${side}"><div class="node-wrap">
        ${active ? `<div class="node-guide"><div class="node-guide__bubble"><strong>Начать</strong><span>${esc(lesson.lesson_title)}</span></div></div>` : ""}
        <div class="node-circle">${active ? '<span class="node__ring" aria-hidden="true"></span>' : ""}<button class="node ${className}" type="button" data-lesson-unit="${unit.unit_id}" data-lesson-id="${lesson.lesson_id}" data-locked="${!unlocked}" aria-label="${esc(lesson.lesson_title)}">${icon(lessonIcon)}</button></div>
      </div></div>`);
    });
    const bossUnlocked = isBossUnlocked(unit);
    const bossClass = bossDone ? "is-done" : bossUnlocked ? "" : "is-locked";
    return `<section class="course-unit course-unit--${unit.accent} ${unitUnlocked ? "" : "is-locked"}">
      <div class="unit-banner unit-banner--${unit.accent}">
        <div><div class="unit-banner__num">Раздел ${unitIndex + 1}</div><div class="unit-banner__title">${esc(unit.unit_title)}</div><div class="unit-banner__desc">${esc(unit.unit_subtitle)}</div></div>
        <span class="unit-banner__progress">${completedLessons}/${unit.lessons.length}</span>
      </div>
      <div class="unit-path-layout ${unitIndex % 2 ? "unit-path-layout--reverse" : ""}">
        <figure class="unit-scene unit-scene--${unitIndex + 1}"><img src="${scene.image}" width="512" height="512" alt="${esc(scene.alt)}" loading="${unitIndex ? "lazy" : "eager"}" draggable="false"></figure>
        <div class="path-tree path-tree--${unit.accent}"><svg class="path-svg" aria-hidden="true"></svg>${rows.join("")}
          <div class="path-row path-row--center boss-row"><div class="node-wrap"><div class="node-circle node-circle--boss"><button class="node node--boss ${bossClass}" type="button" data-boss-unit="${unit.unit_id}" data-locked="${!(bossUnlocked || bossDone)}" aria-label="${esc(unit.final_boss_node.quest_title)}">${icon(bossDone ? "i-check" : "i-crown")}</button></div></div></div>
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
    State.lessonChat = [];
    State.lessonChatStep = -1;
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

async function speakText(text, button = null) {
  try {
    await speakBashkir(text, button);
  } catch (error) {
    showToast(error.message || "Башкирская озвучка временно недоступна");
  }
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
  $("#lesson-character-mini").hidden = true;
  $("#lesson-scene").innerHTML = characterStage(PLAYER_CHAR, card.ba, { className: "stage--compact", lang: "ba", tts: card.audio_tts || card.ba });
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
    speakText(card.audio_tts || card.ba, event.currentTarget);
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
  $("#lesson-scene").innerHTML = characterStage(PLAYER_CHAR, question.prompt, { lang: isBashkir ? "ba" : "ru", tts: isBashkir ? question.prompt : "" });
  $("#lesson-step-container").innerHTML = `<div class="choice-list">${question.options.map((option) => `<button type="button" class="tile choice choice-btn" data-quiz-choice="${esc(option)}"><span class="choice-marker"></span><span ${question.direction === "ru_to_ba" ? 'lang="ba"' : ""}>${esc(option)}</span></button>`).join("")}</div>`;
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
    $("#modal-lesson").classList.remove("lesson--dialog");
    if (State.inQuiz) renderQuizQuestion();
    else renderFlashcard();
    return;
  }
  const lesson = State.currentLesson;
  const step = lesson.steps[State.currentStepIndex];
  State.lessonPhase = "answering";
  State.selectedAnswer = null;
  State.wordBankPlaced = [];
  State.wordBankTyped = "";
  State.pairSelection = { ba: null, ru: null };
  State.matchedPairs = new Set();
  const titles = { word_bank: "Собери фразу", fill_blank: "Выбери пропущенное слово", chat_choice: "Выбери ответ", match_pairs: "Соедини пары" };
  $("#lesson-modal-title").textContent = titles[step.type] || lesson.instruction;
  $("#lesson-hearts-wrap").hidden = false;
  $("#lesson-character-mini").hidden = true;
  const sentence = `${step.sentence_pre || ""} ____ ${step.sentence_post || ""}`.trim();
  const sceneLine = step.type === "fill_blank" ? sentence : step.prompt;
  const isDialog = step.type === "chat_choice";
  $("#modal-lesson").classList.toggle("lesson--dialog", isDialog);
  $("#lesson-scene").innerHTML = isDialog
    ? dialogScene("granny", step.prompt || "Диалог")
    : characterStage(currentLessonCharacter(), sceneLine, { lang: "ba" });
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
  container.innerHTML = `<div class="answer-line word-slot" id="lesson-word-slot"><span class="word-placeholder">Нажимай на слова ниже</span></div><div class="bank word-bank" id="lesson-word-bank">${step.bank.map((word, index) => `<button type="button" class="tile word-chip" lang="ba" data-bank-index="${index}">${esc(word)}</button>`).join("")}</div><details class="manual-answer"><summary>Ввести фразу вручную</summary><label class="field"><span class="label">Башкирская фраза</span><input id="word-bank-typed" class="input" type="text" lang="ba" data-bashkir-input autocomplete="off" placeholder="Мин …"></label></details>`;
  $$('[data-bank-index]', container).forEach((chip) => {
    chip.addEventListener("click", () => {
      if (State.lessonPhase !== "answering") return;
      State.wordBankPlaced.push({ word: step.bank[Number(chip.dataset.bankIndex)], bankIndex: Number(chip.dataset.bankIndex) });
      chip.classList.add("is-used");
      chip.disabled = true;
      updateWordSlot(step);
    });
  });
  $("#word-bank-typed").addEventListener("input", (event) => {
    State.wordBankTyped = event.currentTarget.value;
    $("#lesson-action-btn").disabled = !State.wordBankTyped.trim() && State.wordBankPlaced.length === 0;
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
  $("#lesson-action-btn").disabled = State.wordBankPlaced.length === 0 && !State.wordBankTyped.trim();
}

function renderFillBlank(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `<div class="sentence-card" lang="ba"><span>${esc(step.sentence_pre)}</span><span id="blank-placeholder" class="blank blank-placeholder">___</span><span>${esc(step.sentence_post)}</span></div><div class="choice-list">${step.options.map((option) => `<button type="button" class="tile choice choice-btn" data-choice="${esc(option)}"><span class="choice-marker"></span><span lang="ba">${esc(option)}</span></button>`).join("")}</div><details class="manual-answer"><summary>Вписать ответ</summary><label class="field"><span class="label">Пропущенное слово</span><input id="blank-typed" class="input" type="text" lang="ba" data-bashkir-input autocomplete="off"></label></details><p class="exercise-hint">${esc(step.hint)}</p>`;
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
  $("#blank-typed").addEventListener("input", (event) => {
    State.selectedAnswer = event.currentTarget.value;
    $$('[data-choice]', container).forEach((item) => item.classList.remove("is-selected"));
    $("#blank-placeholder").textContent = State.selectedAnswer.trim() || "___";
    $("#blank-placeholder").classList.toggle("is-selected", Boolean(State.selectedAnswer.trim()));
    $("#lesson-action-btn").disabled = !State.selectedAnswer.trim();
  });
}

function prefersReducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function dialogActor(id, side, state = "idle") {
  const player = side === "player";
  return `<div class="mascot-crop dialog__actor ${player ? "is-listening" : "is-speaking"}" data-dialog-side="${side}" data-facing="${player ? "right" : "left"}" data-mouth="${player ? "66 25" : "34 25"}" ${player ? "data-player-stage" : "data-boss-stage data-character-stage"} data-emotion="${state}"><div class="character" data-char="${id}" data-state="${state}" data-emotion="${state}" aria-hidden="true"><img class="character__img" src="${spriteUrl(id, state)}" width="320" height="320" alt="" draggable="false"></div></div>`;
}

function dialogScene(npcId, label, reward = false) {
  return `<div class="dialog__stage boss-duo-stage" data-dialog-stage aria-label="${esc(label)}">${dialogActor(PLAYER_CHAR, "player", reward ? "combo" : "idle")}${dialogActor(npcId, "npc", reward ? "special" : "idle")}</div>`;
}

let dialogResizeObserver;
let observedDialogStage = null;

function setBubbleMouthOrigin(bubble, stage) {
  const actor = $(`[data-dialog-side="${bubble.classList.contains("chat-bubble--player") ? "player" : "npc"}"]`, stage);
  if (!actor) return;
  const [x, y] = (actor.dataset.mouth || "50 25").split(" ").map(Number);
  const actorRect = actor.getBoundingClientRect();
  const bubbleRect = bubble.getBoundingClientRect();
  bubble.style.setProperty("--mouth-x", `${actorRect.left + actorRect.width * x / 100 - bubbleRect.left - bubbleRect.width / 2}px`);
  bubble.style.setProperty("--mouth-y", `${actorRect.top + actorRect.height * y / 100 - bubbleRect.top - bubbleRect.height / 2}px`);
}

function observeDialog(stage) {
  if (!stage) return;
  observedDialogStage = stage;
  if (!("ResizeObserver" in window)) return;
  if (!dialogResizeObserver) {
    dialogResizeObserver = new ResizeObserver(() => {
      if (!observedDialogStage?.isConnected) return;
      const modal = observedDialogStage.closest(".lesson");
      $$(".chat-bubble[data-side]", modal).forEach((bubble) => setBubbleMouthOrigin(bubble, observedDialogStage));
    });
  }
  dialogResizeObserver.disconnect();
  dialogResizeObserver.observe(stage);
  $$(".dialog__actor", stage).forEach((actor) => dialogResizeObserver.observe(actor));
}

function dialogBubble(message) {
  const translation = message.translation ? `<button class="chat-bubble__translate" type="button" data-translation-toggle aria-expanded="false">Перевод</button><span class="chat-bubble__translation" hidden>${esc(message.translation)}</span>` : "";
  return `<div class="cloud chat-bubble chat-bubble--${message.side}" data-side="${message.side}" lang="ba"><div class="chat-bubble__line">${message.side === "npc" ? `<button class="btn btn-ghost btn-icon chat-bubble__tts" type="button" data-character-tts="${esc(message.text)}" aria-label="Прослушать реплику">${icon("i-volume")}</button>` : ""}<span class="chat-bubble__content">${esc(message.text)}</span></div>${translation}</div>`;
}

function renderDialogMessages(chat, messages, stage, animateLast = false, originButton = null) {
  if (!chat || !stage) return;
  chat.innerHTML = messages.map(dialogBubble).join("");
  const bubbles = $$(".chat-bubble[data-side]", chat);
  bubbles.forEach((bubble) => setBubbleMouthOrigin(bubble, stage));
  const last = bubbles.at(-1);
  if (animateLast && last && !prefersReducedMotion()) {
    if (originButton) {
      const from = originButton.getBoundingClientRect();
      const to = last.getBoundingClientRect();
      last.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${Math.max(.45, from.width / to.width)})` },
        { transform: "translate(0, 0) scale(1)" },
      ], { duration: 350, easing: "cubic-bezier(.2,.8,.2,1)" });
    } else {
      last.classList.add("is-new");
    }
  }
  chat.scrollTop = chat.scrollHeight;
}

function renderChatChoice(step) {
  const container = $("#lesson-step-container");
  const stage = $("[data-dialog-stage]", $("#lesson-scene"));
  if (State.lessonChatStep !== State.currentStepIndex) {
    State.lessonChat = [{ side: "npc", text: step.speaker_ba || "", translation: step.speaker_ru || step.speaker_translation_ru || "" }];
    State.lessonChatStep = State.currentStepIndex;
  }
  container.innerHTML = `<div class="boss-chat dialog__chat" id="lesson-chat" aria-live="polite"></div><div class="choice-list dialog__choices">${step.options.map((option, index) => `<button type="button" class="tile choice choice-btn" data-chat-index="${index}"><span class="choice-marker"></span><span lang="ba">${esc(option.text)}</span></button>`).join("")}</div>`;
  observeDialog(stage);
  renderDialogMessages($("#lesson-chat"), State.lessonChat, stage, true);
  $$('[data-chat-index]', container).forEach((button) => {
    button.addEventListener("click", () => {
      if (State.lessonPhase !== "answering") return;
      State.selectedAnswer = step.options[Number(button.dataset.chatIndex)];
      button.classList.add("is-selected");
      State.lessonChat.push({ side: "player", text: State.selectedAnswer.text, translation: State.selectedAnswer.translation_ru || State.selectedAnswer.translation || "" });
      $(".dialog__choices", container).classList.add("is-resolved");
      renderDialogMessages($("#lesson-chat"), State.lessonChat, stage, true, button);
      $("#lesson-action-btn").disabled = false;
    });
  });
}

function renderMatchPairs(step) {
  const container = $("#lesson-step-container");
  container.innerHTML = `<div class="pair-grid pairs-grid"><div lang="ba">${shuffled(step.pairs, 1).map((pair) => `<button type="button" class="tile pair-btn ${State.matchedPairs.has(pair.ba) ? "is-matched" : ""} ${State.pairSelection.ba === pair.ba ? "is-selected" : ""}" data-pair-ba="${esc(pair.ba)}" ${State.matchedPairs.has(pair.ba) ? "disabled" : ""}>${esc(pair.ba)}</button>`).join("")}</div><div>${shuffled(step.pairs, 4).map((pair) => `<button type="button" class="tile pair-btn ${State.matchedPairs.has(pair.ba) ? "is-matched" : ""} ${State.pairSelection.ru === pair.ru ? "is-selected" : ""}" data-pair-ru="${esc(pair.ru)}" data-pair-key="${esc(pair.ba)}" ${State.matchedPairs.has(pair.ba) ? "disabled" : ""}>${esc(pair.ru)}</button>`).join("")}</div></div>`;
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
    reactToAnswer($("[data-character-stage]", $("#lesson-scene")), false, step.prompt);
  } else if (State.matchedPairs.size === step.pairs.length) {
    reactToAnswer($("[data-character-stage]", $("#lesson-scene")), true, step.prompt);
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
      reactToAnswer($("[data-character-stage]", $("#lesson-scene")), correct, question.prompt);
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
    if (step.type === "word_bank") {
      const typed = State.wordBankTyped.trim().replace(/\s+/g, " ").toLocaleLowerCase();
      const target = step.target.join(" ").trim().replace(/\s+/g, " ").toLocaleLowerCase();
      correct = typed ? typed === target : JSON.stringify(State.wordBankPlaced.map((item) => item.word)) === JSON.stringify(step.target);
    }
    if (step.type === "fill_blank") correct = State.selectedAnswer.trim().toLocaleLowerCase() === step.correct.trim().toLocaleLowerCase();
    if (step.type === "chat_choice") correct = Boolean(State.selectedAnswer?.is_correct);
    if (step.type === "match_pairs") correct = State.matchedPairs.size === step.pairs.length;
    State.lessonAnswers += 1;
    State.lessonCorrect += Number(correct);
    State.lessonPhase = "feedback";
    const answer = correctAnswerText(step);
    markLessonChoice(correct, answer);
    const scene = $("[data-character-stage]", $("#lesson-scene"));
    const idleLine = $(".speech__text", scene)?.textContent || "";
    reactToAnswer(scene, correct, idleLine);
    if (step.type === "chat_choice") {
      setState($("[data-player-stage]", $("#lesson-scene")), correct ? "success" : "fail");
      $(".chat-bubble--player:last-child", $("#lesson-chat"))?.classList.add(correct ? "is-correct" : "is-wrong");
    }
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
  $("#lesson-scene").innerHTML = characterStage(PLAYER_CHAR, "Афарин!", { state: "combo", lang: "ba" });
  $("#lesson-step-container").innerHTML = `<div class="ornament-bg" aria-hidden="true"></div><div class="lesson-complete"><div class="stat-grid lesson-complete__stats"><div class="card stat-card"><strong>+${formatNumber(response.awarded_xp)}</strong><span>очков</span></div><div class="card stat-card"><strong>${score}%</strong><span>точность</span></div><div class="card stat-card"><strong>${seconds} сек</strong><span>время</span></div></div></div>`;
  resetLessonFooter();
  const action = $("#lesson-action-btn");
  action.className = "btn btn-success btn-lg btn-block";
  action.textContent = "Продолжить";
  action.disabled = false;
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
    State.bossChat = [];
    State.bossChatStage = -1;
    State.bossPlayerStage = -1;
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

function bossScene(bossChar, title, reward = false) {
  return dialogScene(bossChar, title, reward);
}

function renderBossChatMessages(animateLast = false, originButton = null) {
  const stage = $("[data-dialog-stage]", $("#boss-scene"));
  observeDialog(stage);
  renderDialogMessages($("#boss-chat"), State.bossChat, stage, animateLast, originButton);
}

function renderBossStage() {
  const boss = State.bossUnit.final_boss_node;
  const stage = boss.stages[State.bossStageIndex];
  const container = $("#boss-step-container");
  const action = $("#boss-action-btn");
  const bossChar = (UNIT_CAST[State.bossUnit.unit_id] || UNIT_CAST[1]).boss;
  State.bossPhase = "answering";
  State.bossChoice = null;
  $("#boss-footer").className = "duo-modal__footer lesson__foot";
  $("#boss-feedback-box").hidden = true;
  $("#boss-progress-bar").style.setProperty("--progress", `${((State.bossStageIndex + 1) / boss.stages.length) * 100}%`);
  $("#boss-step-label").textContent = "";
  $("#boss-step-label").setAttribute("aria-label", `Страница ${State.bossStageIndex + 1} из ${boss.stages.length}`);
  action.disabled = stage.mechanic !== "reward_screen";
  action.className = `btn ${stage.mechanic === "reward_screen" ? "btn-success" : "btn-primary"} btn-lg btn-block`;
  action.textContent = stage.mechanic === "reward_screen" ? "Продолжить · +100 очков" : "Проверить ответ";
  $("#boss-scene").innerHTML = bossScene(bossChar, stage.mechanic === "reward_screen" ? "Афарин!" : boss.quest_title, stage.mechanic === "reward_screen");

  if (stage.mechanic === "chat_choice") {
    if (State.bossChatStage !== State.bossStageIndex) {
      State.bossChat.push({ side: "npc", text: stage.npc_speech_ba || "", translation: stage.npc_speech_ru || stage.npc_speech_translation_ru || "" });
      State.bossChatStage = State.bossStageIndex;
      State.bossPlayerStage = -1;
    }
    container.innerHTML = `<div class="boss-chat dialog__chat" id="boss-chat" aria-live="polite"></div><div class="choice-list boss-choices dialog__choices">${stage.options.map((option, index) => `<button class="tile choice choice-btn" type="button" data-boss-choice="${index}"><span class="choice-marker"></span><span lang="ba">${esc(option.text_ba)}</span></button>`).join("")}</div>`;
    renderBossChatMessages(true);
    $$('[data-boss-choice]', container).forEach((button) => button.addEventListener("click", () => {
      if (State.bossPhase !== "answering") return;
      State.bossPhase = "selected";
      State.bossChoice = stage.options[Number(button.dataset.bossChoice)];
      State.bossPlayerStage = State.bossStageIndex;
      State.bossChat.push({ side: "player", text: State.bossChoice.text_ba, translation: State.bossChoice.translation_ru || State.bossChoice.translation || "" });
      button.classList.add("is-selected");
      $(".boss-choices", container).classList.add("is-resolved");
      renderBossChatMessages(true, button);
      action.disabled = false;
    }));
  }
  if (stage.mechanic === "reward_screen") {
    container.innerHTML = `<div class="boss-reward"><div class="trophy-card"><span>Факт о Башкортостане</span><h3>${esc(stage.reward_trophy.title)}</h3><p>${esc(stage.reward_trophy.cultural_fact)}</p></div></div>`;
    $("#boss-modal-title").textContent = "Афарин!";
  } else {
    $("#boss-modal-title").textContent = stage.task_prompt || boss.quest_title;
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
  if (["answering", "selected"].includes(State.bossPhase)) {
    const correct = stage.mechanic === "chat_choice" && Boolean(State.bossChoice?.is_correct);
    State.bossAnswers += 1;
    State.bossCorrect += Number(correct);
    State.bossPhase = "feedback";
    const explanation = State.bossChoice?.error_hint || "Вспомни слова из карточек.";
    reactToAnswer($("[data-boss-stage]", $("#boss-scene")), correct);
    setState($("[data-player-stage]", $("#boss-scene")), correct ? "success" : "fail");
    $(".chat-bubble--player:last-child", $("#boss-chat"))?.classList.add(correct ? "is-correct" : "is-wrong");
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
  } else if (State.bossPhase === "feedback") {
    State.bossPhase = "typing";
    action.disabled = true;
    const chat = $("#boss-chat");
    chat.insertAdjacentHTML("beforeend", '<div class="chat-bubble chat-typing" aria-label="Персонаж печатает"><i></i><i></i><i></i></div>');
    chat.scrollTop = chat.scrollHeight;
    setTimeout(() => {
      State.bossStageIndex += 1;
      renderBossStage();
    }, 600);
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
  let title = source.file === "audio/news.mp3" ? "Новости" : source.chapter || source.file || "Материалы курса";
  if (title === "Трёхъязычный разговорник") title = "Разговорник";
  const rawTime = String(source.time || "");
  const date = rawTime && !/^0{1,2}:0{2}(?::0{2})?$/.test(rawTime) ? new Date(rawTime) : null;
  const time = date && !Number.isNaN(date.getTime()) ? date.toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "";
  return [title, time].filter(Boolean).join(" · ");
}

let communitySearchTimer;

const PROPOSAL_DRAFT_KEY = "aitalay.proposalDraft";
let communityTimers = [];

function clearCommunityTimeline() {
  communityTimers.forEach(clearTimeout);
  communityTimers = [];
}

function proposalDraftHasContent() {
  if (!$("#proposal-success").hidden) return false;
  return Boolean($("#proposal-ba").value.trim() || $("#proposal-ru").value.trim() || $("#proposal-example").value.trim() || State.proposalMeta.kind || State.proposalMeta.topics.length);
}

function saveProposalDraft() {
  if (State.communityMode !== "propose" || !proposalDraftHasContent()) return;
  const draft = {
    ba: $("#proposal-ba").value,
    ru: $("#proposal-ru").value,
    example: $("#proposal-example").value,
    step: State.proposalStep,
    meta: State.proposalMeta,
  };
  localStorage.setItem(PROPOSAL_DRAFT_KEY, JSON.stringify(draft));
}

function readProposalDraft() {
  try {
    return JSON.parse(localStorage.getItem(PROPOSAL_DRAFT_KEY) || "null");
  } catch {
    localStorage.removeItem(PROPOSAL_DRAFT_KEY);
    return null;
  }
}

function setCommunityMode(mode) {
  const previous = State.communityMode;
  const next = ["library", "verify", "propose"].includes(mode) ? mode : "library";
  if (previous === next && next !== "library") return;
  if (previous === "propose" && next === "library") saveProposalDraft();
  clearCommunityTimeline();
  State.communityMode = next;
  const open = next !== "library";
  const library = $("#community-library");
  const workspace = $("#community-workspace");
  library.classList.toggle("has-open", open);
  workspace.classList.remove("is-entering", "is-cover-opening", "is-ready", "is-closing", "is-leaving");
  if (open) {
    workspace.hidden = false;
    workspace.dataset.book = next;
    workspace.classList.add("is-entering");
    $("#community-verify").hidden = next !== "verify";
    $("#community-propose").hidden = next !== "propose";
    if (next === "propose" && previous !== "propose") restoreProposalWizard();
    if (prefersReducedMotion()) workspace.classList.add("is-cover-opening", "is-ready");
    else {
      communityTimers.push(setTimeout(() => workspace.classList.add("is-cover-opening"), 20));
      communityTimers.push(setTimeout(() => workspace.classList.add("is-ready"), 240));
    }
    if (window.matchMedia("(min-width: 1024px)").matches) {
      communityTimers.push(setTimeout(() => workspace.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }), 40));
    }
  } else if (previous !== "library") {
    workspace.classList.add("is-closing");
    if (prefersReducedMotion()) {
      workspace.hidden = true;
    } else {
      communityTimers.push(setTimeout(() => workspace.classList.add("is-leaving"), 140));
      communityTimers.push(setTimeout(() => { workspace.hidden = true; }, 240));
    }
  } else {
    workspace.hidden = true;
  }
  $$('[data-community-mode]').forEach((button) => {
    const active = button.dataset.communityMode === next;
    button.classList.toggle("is-open", active);
    button.setAttribute("aria-expanded", String(active));
  });
}

function requestCommunityClose() {
  if (State.communityMode !== "propose" || !proposalDraftHasContent()) {
    setCommunityMode("library");
    return;
  }
  saveProposalDraft();
  const backdrop = document.createElement("div");
  backdrop.className = "sheet-backdrop proposal-close-sheet";
  backdrop.innerHTML = `<div class="bottom-sheet" role="alertdialog" aria-modal="true" aria-labelledby="proposal-close-title"><h2 id="proposal-close-title">Сохранить черновик?</h2><p>Текст останется на этом устройстве до отправки.</p><button class="btn btn-primary btn-lg btn-block" type="button" data-draft-save>Сохранить и закрыть</button><button class="btn btn-ghost btn-block" type="button" data-draft-discard>Удалить черновик</button><button class="btn btn-ghost btn-block" type="button" data-draft-stay>Вернуться</button></div>`;
  const close = () => { backdrop.remove(); document.removeEventListener("keydown", onKeydown); };
  const onKeydown = (event) => { if (event.key === "Escape") close(); };
  $("[data-draft-save]", backdrop).addEventListener("click", () => { close(); setCommunityMode("library"); });
  $("[data-draft-discard]", backdrop).addEventListener("click", () => { resetProposalWizard(); localStorage.removeItem(PROPOSAL_DRAFT_KEY); close(); setCommunityMode("library"); });
  $("[data-draft-stay]", backdrop).addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  document.addEventListener("keydown", onKeydown);
  document.body.append(backdrop);
}

function restoreProposalWizard() {
  const draft = readProposalDraft();
  resetProposalWizard();
  if (!draft) return;
  $("#proposal-ba").value = draft.ba || "";
  $("#proposal-ru").value = draft.ru || "";
  $("#proposal-example").value = draft.example || "";
  State.proposalStep = Math.min(4, Math.max(1, Number(draft.step) || 1));
  State.proposalMeta = { ...State.proposalMeta, ...(draft.meta || {}), topics: [...(draft.meta?.topics || [])] };
  $$('[data-proposal-kind]').forEach((button) => button.classList.toggle("is-selected", button.dataset.proposalKind === State.proposalMeta.kind));
  $$('[data-proposal-group]').forEach((group) => {
    const name = group.dataset.proposalGroup;
    $$('.chip', group).forEach((button) => {
      const selected = name === "topics" ? State.proposalMeta.topics.includes(button.dataset.value) : State.proposalMeta[name] === button.dataset.value;
      button.classList.toggle("is-selected", selected);
      button.setAttribute("aria-pressed", String(selected));
    });
  });
  updateProposalCount($("#proposal-ba"));
  updateProposalCount($("#proposal-ru"));
  renderProposalStep();
}

function resetProposalWizard() {
  const form = $("#proposal-form");
  form.reset();
  form.hidden = false;
  $("#proposal-success").hidden = true;
  State.proposalStep = 1;
  State.proposalMeta = { kind: "", register: "literary", topics: [], pos: "", dialect: "unknown", example: "", source_kind: "" };
  $$('[data-proposal-kind], .chip-cloud .chip', form).forEach((button) => button.classList.remove("is-selected"));
  $('[data-proposal-group="register"] [data-value="literary"]', form).classList.add("is-selected");
  $('[data-proposal-group="dialect"] [data-value="unknown"]', form).classList.add("is-selected");
  updateProposalCount($("#proposal-ba"));
  updateProposalCount($("#proposal-ru"));
  $("#proposal-status").textContent = "";
  renderProposalStep();
}

function renderProposalStep() {
  $$('[data-proposal-page]').forEach((page) => { page.hidden = Number(page.dataset.proposalPage) !== State.proposalStep; });
  $("#proposal-prev").disabled = State.proposalStep === 1;
  $("#proposal-next").hidden = State.proposalStep === 4;
  $("#proposal-submit").hidden = State.proposalStep !== 4;
  $("#proposal-step-label").textContent = `${State.proposalStep} / 4`;
  $("#proposal-step-label").setAttribute("aria-label", `Страница ${State.proposalStep} из 4`);
  $("#proposal-topics-count").textContent = `${State.proposalMeta.topics.length}/3`;
  $("#proposal-pos-group").hidden = State.proposalMeta.kind !== "word";
  $("#proposal-next").disabled = State.proposalStep === 1 ? !State.proposalMeta.kind : State.proposalStep === 2 ? !proposalTextValid() : false;
  updateProposalSubmit();
}

function proposalTextValid() {
  return $("#proposal-ba").value.trim().length >= 2 && $("#proposal-ru").value.trim().length >= 2;
}

function updateProposalSubmit() {
  $("#proposal-submit").disabled = !(State.proposalMeta.kind && proposalTextValid());
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
    State.proposalMeta.example = $("#proposal-example").value.trim();
    const meta = { ...State.proposalMeta, topics: [...State.proposalMeta.topics] };
    await apiRequest("/fragments/propose", {
      method: "POST",
      body: {
        text_ba: $("#proposal-ba").value.trim(),
        translation: $("#proposal-ru").value.trim(),
        lang_pair: "ba-ru",
        meta,
      },
    });
    localStorage.setItem("aitalay.lastProposalMeta", JSON.stringify(meta));
    localStorage.removeItem(PROPOSAL_DRAFT_KEY);
    status.className = "form-status form-status--success";
    status.textContent = "";
    form.hidden = true;
    $("#proposal-success").hidden = false;
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
  State.dailyStep = State.dailyTask ? Math.min(5, (State.dailyStep || 1) + 1) : 1;
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
  const step = State.dailyStep || 1;
  const line = State.dailyMode === "fix" ? "Ничего, исправим" : State.dailyMode === "result" ? (State.dailyResult?.correct ? "Так и есть!" : "Ничего, исправим") : step >= 3 ? "Ты уже на полпути" : "Как переведёшь?";
  const emotion = State.dailyMode === "fix" ? "thinking" : State.dailyMode === "result" && State.dailyResult?.correct ? "success" : "happy";
  let actions = "";
  if (State.dailyMode === "actions") {
    actions = `<div class="daily-bottom"><div class="daily-actions"><button class="btn btn-success btn-lg" type="button" data-daily="correct" ${disabled}>${icon("i-check")}Верно</button><button class="btn btn-ghost btn-lg" type="button" data-daily="fix" ${disabled}>${icon("i-x")}Неверно</button></div><button class="daily-skip" type="button" data-daily="skip" ${disabled}>Пропустить</button></div>`;
  }
  if (State.dailyMode === "fix") {
    const correction = State.dailyCorrection || task.translation;
    actions = `<div class="correction-box"><div class="chip-cloud"><button class="chip" type="button" data-correction-reason>Ошибка смысла</button><button class="chip" type="button" data-correction-reason>Опечатка</button><button class="chip" type="button" data-correction-reason>Другой стиль</button></div><label class="field"><span class="label">Как правильно?</span><textarea id="daily-correction" class="input textarea" rows="3" minlength="2" required>${esc(correction)}</textarea></label><div class="daily-actions"><button class="btn btn-primary btn-lg" type="button" data-daily="submit-fix" ${disabled}>Отправить</button><button class="btn btn-ghost" type="button" data-daily="cancel" ${disabled}>Отмена</button></div></div>`;
  }
  if (State.dailyMode === "result" && State.dailyResult) {
    const result = State.dailyResult;
    const statusLabels = { confirmed: "Перевод подтверждён", expert_review: "Нужна экспертная проверка", pending: "Голос сохранён" };
    actions = `<div class="daily-result">${result.correct ? '<span class="book-stamp">Верно ✓</span>' : ""}<p>${esc(result.message)} ${esc(statusLabels[result.consensus] || result.consensus)}</p><button class="btn btn-primary btn-block" type="button" data-daily="next">Следующая фраза</button></div>`;
  }
  const progress = Array.from({ length: 5 }, (_, index) => `<span class="${index < step ? "is-filled" : ""}"></span>`).join("");
  body.innerHTML = `<article class="workout-card card-task daily-card ${State.dailySubmitting ? "is-turning" : ""}"><div class="daily-progress" role="progressbar" aria-label="Проверка фраз" aria-valuemin="1" aria-valuemax="5" aria-valuenow="${step}">${progress}</div><div class="daily-mascot" data-emotion="${emotion}"><div class="daily-mascot__crop"><img src="${spriteUrl("boy", emotion === "thinking" ? "thinking" : emotion === "success" ? "success" : "idle")}" width="156" height="156" alt="" draggable="false"></div><div class="cloud cloud--right">${line}</div></div><div class="daily-card__content"><div class="daily-phrase"><p class="text-ba" lang="ba">${esc(task.text_ba)}</p><button class="btn btn-ghost btn-icon" type="button" data-daily-tts="${esc(task.text_ba)}" aria-label="Прослушать фразу">${icon("i-volume")}</button></div><p class="source-line">${icon("i-book", "icon icon-sm")}${esc(sourceText(task.source))}</p><div class="translation-panel"><span>Предложенный перевод</span><p>${esc(task.translation)}</p></div></div>${actions}</article>`;
  if (State.dailyMode === "fix") {
    const textarea = $("#daily-correction");
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
      correct: isCorrect,
    };
    State.user.points = response.points;
    State.user.level = response.level;
    State.user.badges = response.badges;
    State.dailyMode = "result";
    updateTopBar();
    showToast(`Начислено ${formatNumber(response.answer.points_earned)} очков`);
  } catch (error) {
    showToast(error.message);
    if (error.status === 401) logout("Сессия истекла. Войдите снова.");
  } finally {
    State.dailySubmitting = false;
    renderDaily();
  }
}

async function downloadTranslations(format, button, scope = "translations") {
  setBusy(button, true, "…");
  try {
    const own = scope === "me";
    const blob = await apiRequest(own ? `/answers/me?format=${format}` : `/translations/export?format=${format}`, { responseType: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = own ? `my_answers.${format}` : `confirmed_translations.${format}`;
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

const ratingUI = {
  mounted: false,
  first: true,
  rows: [],
  countFrames: new Map(),
};

function renderRatingControls() {
  const categories = $("#rating-categories");
  const periods = $("#rating-periods");
  if (!categories.dataset.mounted) {
    categories.innerHTML = `<span class="sliding-indicator" aria-hidden="true"></span>${RATING_CATEGORIES.map((category) => `<button class="tab" type="button" role="tab" data-rating-category="${category.id}">${category.label}</button>`).join("")}`;
    periods.innerHTML = `<span class="sliding-indicator" aria-hidden="true"></span>${RATING_PERIODS.map((period) => `<button class="chip" type="button" data-rating-period="${period.id}">${period.label}</button>`).join("")}`;
    categories.dataset.mounted = "true";
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
    $$('[data-school-mode]').forEach((button) => button.addEventListener("click", () => {
      State.ratingSchoolMode = button.dataset.schoolMode;
      renderRatingControls();
      loadRatings();
    }));
  }
  const categoryIndex = RATING_CATEGORIES.findIndex((category) => category.id === State.ratingCategory);
  const periodIndex = RATING_PERIODS.findIndex((period) => period.id === State.ratingPeriod);
  categories.style.setProperty("--active-index", Math.max(0, categoryIndex));
  periods.style.setProperty("--active-index", Math.max(0, periodIndex));
  $$('[data-rating-category]').forEach((button) => {
    const active = button.dataset.ratingCategory === State.ratingCategory;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  $$('[data-rating-period]').forEach((button) => {
    const active = button.dataset.ratingPeriod === State.ratingPeriod;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
  $("#rating-school-mode").hidden = State.ratingCategory !== "my-school";
  $$('[data-school-mode]').forEach((button) => {
    const active = button.dataset.schoolMode === State.ratingSchoolMode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function schoolKey(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replaceAll("ё", "е").replace(/[«»„“”"‘’']/g, "").replace(/\bN\s*/gi, "№").replace(/№\s*/g, "№").replace(/\s+/g, " ").trim();
}

function mergeSchoolRows(rows) {
  const schools = new Map();
  const aliases = new Map();
  rows.forEach((item) => {
    const nameKey = schoolKey(item.school);
    const idKey = item.school_id == null ? "" : `id:${item.school_id}`;
    const key = aliases.get(nameKey) || idKey || `name:${nameKey}`;
    if (!schools.has(key)) schools.set(key, { ...item, points: 0, students: 0 });
    if (nameKey) aliases.set(nameKey, key);
    if (idKey) aliases.set(idKey, key);
    const school = schools.get(key);
    school.points += Number(item.points) || 0;
    school.students += Number(item.students) || 0;
  });
  return [...schools.values()].sort((a, b) => b.points - a.points);
}

async function loadRatings() {
  const requestId = ++State.ratingRequest;
  const body = $("#rating-body");
  const mySchool = State.ratingCategory === "my-school";
  if (mySchool && !schoolKey(State.user.school)) {
    renderRatings([], { title: "Школа не указана", text: "Выберите школу в профиле, чтобы увидеть локальный рейтинг.", action: true });
    return;
  }
  if (!ratingUI.mounted) body.innerHTML = loadingBlock("Считаем рейтинг…");
  body.classList.add("is-refreshing");
  const endpoint = mySchool && State.ratingSchoolMode === "classes" ? "/ratings/classes" : RATING_CATEGORIES.find((item) => item.id === State.ratingCategory).endpoint;
  try {
    let rows = await apiRequest(`${endpoint}?period=${State.ratingPeriod}`);
    if (requestId !== State.ratingRequest) return;
    if (State.ratingCategory === "schools") rows = mergeSchoolRows(rows);
    if (mySchool) rows = rows.filter((item) => State.user.school_id && item.school_id ? item.school_id === State.user.school_id : schoolKey(item.school) === schoolKey(State.user.school));
    rows = rows.map((item, index) => ({ ...item, rank: index + 1 }));
    renderRatings(rows);
  } catch (error) {
    if (requestId !== State.ratingRequest) return;
    if (ratingUI.mounted && ratingUI.rows.length) showToast("Не получилось обновить. Повторить");
    else renderError(body, error, loadRatings);
  } finally {
    if (requestId === State.ratingRequest) body.classList.remove("is-refreshing");
  }
}

function ratingPersonName(value) {
  return String(value || "Ученик").trim().toLocaleLowerCase("ru").split(/(\s+|-)/).map((part) => {
    if (!part || /^\s+$/.test(part) || part === "-") return part;
    return `${part[0].toLocaleUpperCase("ru")}${part.slice(1)}`;
  }).join("");
}

function ratingSchoolName(value) {
  return String(value || "").normalize("NFKC")
    .replace(/["„“”]([^"„“”]+)["„“”]/g, "«$1»")
    .replace(/«\s*([^»]+)\s*»/g, "«$1»")
    .replace(/\s*,?\s*(?:г\.?|город)\s+[^,]+$/i, "")
    .replace(/\b(?:No|N|№)\s*/gi, "№ ")
    .replace(/\s+/g, " ")
    .trim();
}

function ratingViewModel(item) {
  const category = State.ratingCategory;
  const classes = category === "classes" || (category === "my-school" && State.ratingSchoolMode === "classes");
  const school = ratingSchoolName(item.school);
  if (category === "schools") return { name: school, meta: `${formatNumber(item.students)} учеников`, value: item.points, suffix: " очков" };
  if (classes) return { name: `${item.class_name} класс`, meta: school, value: item.points, suffix: " очков" };
  const meta = [school, item.class_name].filter(Boolean).join(" · ");
  return { name: ratingPersonName(item.full_name), meta, value: item.points, suffix: " очков" };
}

function ratingKey(item) {
  const id = item.user_id ?? item.class_id ?? item.school_id ?? item.full_name ?? item.class_name ?? item.school;
  return `${State.ratingCategory}:${State.ratingSchoolMode}:${id}`;
}

function ratingDisplayName(item, view) {
  const isPerson = !["classes", "schools"].includes(State.ratingCategory) && !(State.ratingCategory === "my-school" && State.ratingSchoolMode === "classes");
  if (!isPerson) return view.name;
  const parts = String(view.name || "Ученик").trim().split(/\s+/);
  return `${parts[0]}${parts[1] ? ` ${parts[1][0].toLocaleUpperCase("ru")}.` : ""}`;
}

function mountRatingShell() {
  const body = $("#rating-body");
  if (ratingUI.mounted) return;
  body.innerHTML = `<section class="podium-card" aria-label="Лидеры рейтинга"><div class="podium" aria-label="Три лучших результата">${[2, 1, 3].map((rank) => `<button class="podium-place podium-place--${rank}" type="button" data-podium-rank="${rank}" hidden>${rank === 1 ? icon("i-crown", "icon podium-crown") : '<span class="podium-crown" aria-hidden="true"></span>'}<span class="podium-avatar"></span><span class="podium-name"></span><strong class="podium-points"><span data-rating-count>0</span>${icon("i-honey")}</strong><span class="podium-step">${rank}</span></button>`).join("")}</div><div class="podium-card__periods"></div></section><h3 class="rank-list__title" hidden>Остальные результаты</h3><div class="rank-list__rows"></div><button class="rank-row rank-item rank-row--me rank-item--me rank-row--sticky" type="button" data-rating-sticky hidden><span class="rank-badge rank-badge--other"></span><span class="avatar"></span><span class="rank-info"><span class="rank-name"></span><span class="rank-meta"></span></span><strong class="rank-points"><span data-rating-count>0</span>${icon("i-honey")}</strong></button><div class="empty-state rating-empty" hidden><strong></strong><p></p><button class="btn btn-primary" type="button" data-choose-school hidden>Выбрать школу</button></div>`;
  $(".podium-card__periods", body).append($("#rating-periods"));
  body.addEventListener("click", (event) => {
    const choose = event.target.closest("[data-choose-school]");
    if (choose) { switchTab("cabinet"); return; }
    const button = event.target.closest("[data-rank-key]");
    if (!button) return;
    const item = ratingUI.rows.find((row) => ratingKey(row) === button.dataset.rankKey);
    if (!item) return;
    const view = ratingViewModel(item);
    openInfoSheet(view.name, [view.meta, `${formatNumber(view.value)}${view.suffix}`].filter(Boolean).join(" · "));
  });
  ratingUI.mounted = true;
}

function tweenRatingNumber(output, target) {
  const previousFrame = ratingUI.countFrames.get(output);
  if (previousFrame) cancelAnimationFrame(previousFrame);
  const value = Number(target) || 0;
  const current = Number(output.dataset.display || 0);
  const start = ratingUI.first ? 0 : current;
  output.dataset.display = String(start);
  if (prefersReducedMotion() || start === value) {
    output.textContent = formatNumber(value);
    output.dataset.display = String(value);
    ratingUI.countFrames.delete(output);
    return;
  }
  const startedAt = performance.now();
  const tick = (now) => {
    if (!output.isConnected) { ratingUI.countFrames.delete(output); return; }
    const progress = Math.min(1, (now - startedAt) / 450);
    const raw = start + (value - start) * (1 - (1 - progress) ** 3);
    const shown = value % 1 ? Math.round(raw * 10) / 10 : Math.round(raw);
    output.textContent = formatNumber(shown);
    output.dataset.display = String(shown);
    if (progress < 1) ratingUI.countFrames.set(output, requestAnimationFrame(tick));
    else ratingUI.countFrames.delete(output);
  };
  ratingUI.countFrames.set(output, requestAnimationFrame(tick));
}

function flipElement(element, firstRect, duration = 500) {
  if (!firstRect || prefersReducedMotion()) return;
  const lastRect = element.getBoundingClientRect();
  const x = firstRect.left - lastRect.left;
  const y = firstRect.top - lastRect.top;
  if (Math.abs(x) < 1 && Math.abs(y) < 1) return;
  element.getAnimations().forEach((animation) => animation.cancel());
  element.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "translate(0, 0)" }], { duration, easing: "cubic-bezier(.2,.8,.2,1)" });
}

function updateRankRow(button, item, mine = false) {
  const view = ratingViewModel(item);
  const key = ratingKey(item);
  button.dataset.rankKey = key;
  button.hidden = false;
  $(".rank-badge", button).textContent = item.rank;
  $(".avatar", button).textContent = initials(view.name);
  $(".rank-name", button).textContent = `${ratingDisplayName(item, view)}${mine ? " · Вы" : ""}`;
  $(".rank-meta", button).textContent = view.meta;
  button.setAttribute("aria-label", `${item.rank} место: ${view.name}`);
  tweenRatingNumber($("[data-rating-count]", button), view.value);
}

function renderRatings(rows, empty = {}) {
  mountRatingShell();
  const body = $("#rating-body");
  body.dataset.ratingMetric = State.ratingCategory;
  const podium = $(".podium", body);
  const list = $(".rank-list__rows", body);
  const sticky = $("[data-rating-sticky]", body);
  const emptyState = $(".rating-empty", body);
  const oldAvatars = new Map($$("[data-rank-key]", podium).map((button) => [button.dataset.rankKey, $(".podium-avatar", button).getBoundingClientRect()]));
  const oldRows = new Map($$("[data-rank-key]", list).map((button) => [button.dataset.rankKey, button.getBoundingClientRect()]));
  ratingUI.rows = rows;
  emptyState.hidden = rows.length > 0;
  $(".rating-empty strong", body).textContent = empty.title || "Пока нет результатов";
  $(".rating-empty p", body).textContent = empty.text || "Выберите другой период или выполните задание первым.";
  $("[data-choose-school]", body).hidden = !empty.action;
  podium.hidden = !rows.length;
  $(".podium-card", body).hidden = !rows.length;
  [2, 1, 3].forEach((rank) => {
    const button = $(`[data-podium-rank="${rank}"]`, podium);
    const item = rows[rank - 1];
    button.hidden = !item;
    if (!item) { button.removeAttribute("data-rank-key"); return; }
    const view = ratingViewModel(item);
    button.dataset.rankKey = ratingKey(item);
    $(".podium-avatar", button).textContent = initials(view.name);
    $(".podium-name", button).textContent = ratingDisplayName(item, view);
    button.setAttribute("aria-label", `${rank} место: ${view.name}`);
    tweenRatingNumber($("[data-rating-count]", button), view.value);
    flipElement($(".podium-avatar", button), oldAvatars.get(button.dataset.rankKey));
  });
  const visible = rows.slice(0, RANK_LIST_LIMIT + 3);
  $(".rank-list__title", body).hidden = visible.length <= 3;
  const nextKeys = new Set();
  visible.slice(3).forEach((item, index) => {
    const key = ratingKey(item);
    nextKeys.add(key);
    let button = $(`[data-rank-key="${CSS.escape(key)}"]`, list);
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "rank-row rank-item";
      button.innerHTML = `<span class="rank-badge rank-badge--other"></span><span class="avatar"></span><span class="rank-info"><span class="rank-name"></span><span class="rank-meta"></span></span><strong class="rank-points"><span data-rating-count>0</span>${icon("i-honey")}</strong>`;
    }
    list.append(button);
    updateRankRow(button, item, item.user_id === State.user.id);
    button.classList.toggle("rank-row--me", item.user_id === State.user.id);
    button.classList.toggle("rank-item--me", item.user_id === State.user.id);
    flipElement(button, oldRows.get(key));
    if (ratingUI.first && !prefersReducedMotion()) button.animate([{ transform: "translateY(12px)" }, { transform: "translateY(0)" }], { duration: 250, delay: index * 40, easing: "ease-out" });
  });
  $$("[data-rank-key]", list).forEach((button) => { if (!nextKeys.has(button.dataset.rankKey)) button.remove(); });
  const myRow = rows.find((item) => item.user_id === State.user.id);
  sticky.hidden = !(myRow && myRow.rank > visible.length);
  if (myRow && myRow.rank > visible.length) updateRankRow(sticky, myRow, true);
  ratingUI.first = false;
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

const cabinetCountFrames = new Map();
let cabinetSheetSequence = 0;

function readStoredJson(key, fallback, storage = localStorage) {
  try {
    return JSON.parse(storage.getItem(key) || "null") ?? fallback;
  } catch {
    return fallback;
  }
}

function readAvatar() {
  const saved = readStoredJson("aitalay.avatar", {});
  const character = AVATAR_CHARACTERS.some((item) => item.id === saved.character) ? saved.character : "maskot";
  const color = AVATAR_COLORS.includes(saved.color) ? saved.color : "blue-500";
  return { character, color };
}

function cabinetSettings() {
  if (!State.cabinetSettings) {
    State.cabinetSettings = {
      autoVoice: false,
      sound: true,
      reminders: false,
      reminderTime: "19:00",
      ...readStoredJson("aitalay.settings", {}),
    };
  }
  return State.cabinetSettings;
}

function saveCabinetSettings() {
  localStorage.setItem("aitalay.settings", JSON.stringify(State.cabinetSettings));
}

function normalizeSchool(value) {
  return String(value || "").replace(/№\s+/g, "№").replace(/\s+/g, " ").trim();
}

function levelTitle(level) {
  return ["Новичок", "Знаток", "Друг языка", "Мастер слова", "Хранитель"][level - 1] || `Хранитель ${level}`;
}

function currentAwards() {
  const earned = new Set(State.user.badges || []);
  COURSE_UNITS.forEach((unit) => {
    if (isComplete(unit.unit_id, unit.final_boss_node.lesson_id)) earned.add(`boss-${unit.unit_id}`);
  });
  return AWARDS.map((award) => {
    const isEarned = earned.has(award.id);
    let value = isEarned ? award.goal : 0;
    if (award.id === "hundred_points") value = Math.min(award.goal, Number(State.user.points) || 0);
    if (award.unitId) {
      value = isEarned ? award.goal : [...State.progress].filter((key) => key.startsWith(`${award.unitId}:`)).length;
    }
    return { ...award, earned: isEarned, value: Math.min(award.goal, value) };
  });
}

function remainingText(award) {
  const remaining = Math.max(0, award.goal - award.value);
  const forms = award.id === "hundred_points" ? ["очко", "очка", "очков"] : award.unitId ? ["этап", "этапа", "этапов"] : ["шаг", "шага", "шагов"];
  const mod100 = remaining % 100;
  const mod10 = remaining % 10;
  const form = mod100 >= 11 && mod100 <= 14 ? forms[2] : mod10 === 1 ? forms[0] : mod10 >= 2 && mod10 <= 4 ? forms[1] : forms[2];
  return `Ещё ${remaining} ${form}`;
}

function avatarPortrait(avatar, user, className = "") {
  const character = AVATAR_CHARACTERS.find((item) => item.id === avatar.character) || AVATAR_CHARACTERS[0];
  const image = character.sprite
    ? `<img class="avatar__portrait" src="${spriteUrl(character.sprite)}" width="128" height="128" alt="" decoding="async" draggable="false">`
    : '<span class="avatar__portrait mascot-fallback" aria-hidden="true"></span>';
  return `<span class="avatar__pic ${className}" style="--avatar-bg:var(--${avatar.color})" data-character="${character.id}">${image}<span class="sr-only">${esc(character.name)}</span></span>`;
}

function tweenCabinetNumber(output, target, previous) {
  if (!output) return;
  const oldFrame = cabinetCountFrames.get(output);
  if (oldFrame) cancelAnimationFrame(oldFrame);
  const value = Number(target) || 0;
  const start = Number(previous) || 0;
  if (prefersReducedMotion() || start === value) {
    output.textContent = formatNumber(value);
    return;
  }
  const startedAt = performance.now();
  const tick = (now) => {
    if (!output.isConnected) { cabinetCountFrames.delete(output); return; }
    const progress = Math.min(1, (now - startedAt) / 500);
    output.textContent = formatNumber(Math.round(start + (value - start) * (1 - (1 - progress) ** 3)));
    if (progress < 1) cabinetCountFrames.set(output, requestAnimationFrame(tick));
    else cabinetCountFrames.delete(output);
  };
  cabinetCountFrames.set(output, requestAnimationFrame(tick));
}

function openCabinetSheet(title, content, className = "") {
  $("[data-cabinet-sheet]")?.remove();
  const backdrop = document.createElement("div");
  const titleId = `cabinet-sheet-title-${++cabinetSheetSequence}`;
  backdrop.className = `sheet-backdrop cabinet-sheet-backdrop ${className}`;
  backdrop.dataset.cabinetSheet = "";
  backdrop.innerHTML = `<div class="bottom-sheet" role="dialog" aria-modal="true" aria-labelledby="${titleId}"><div class="bottom-sheet__head"><h2 id="${titleId}">${esc(title)}</h2><button class="btn btn-ghost btn-icon" type="button" data-sheet-close aria-label="Закрыть">${icon("i-x")}</button></div><div class="cabinet-sheet__content">${content}</div></div>`;
  const sheet = $(".bottom-sheet", backdrop);
  let closing = false;
  let pointerStart = null;
  const onKeydown = (event) => { if (event.key === "Escape") close(); };
  const close = () => {
    if (closing) return;
    closing = true;
    backdrop.classList.remove("is-open");
    document.removeEventListener("keydown", onKeydown);
    setTimeout(() => backdrop.remove(), prefersReducedMotion() ? 0 : 200);
  };
  $("[data-sheet-close]", backdrop).addEventListener("click", close);
  backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
  sheet.addEventListener("pointerdown", (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
  sheet.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const deltaY = event.clientY - pointerStart.y;
    const deltaX = event.clientX - pointerStart.x;
    pointerStart = null;
    if (deltaY > 72 && Math.abs(deltaY) > Math.abs(deltaX)) close();
  });
  document.addEventListener("keydown", onKeydown);
  document.body.append(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("is-open"));
  return { backdrop, sheet, close, titleId };
}

function openLevelSheet() {
  const { close } = openCabinetSheet("Как получать уровни", '<div class="level-help"><p>Проходи уроки</p><p>Проверяй фразы в Китапхане</p><p>Занимайся каждый день</p></div><button class="btn btn-primary btn-lg btn-block" type="button" data-sheet-ok>Понятно</button>', "sheet--level");
  $("[data-sheet-ok]", document.body).addEventListener("click", close);
}

function openNewLevelSheet(level) {
  const { close } = openCabinetSheet("Новый уровень!", `<div class="new-level"><div class="new-level__mascot" data-emotion="proud"><img src="${spriteUrl("boy", "success")}" width="144" height="144" alt="" decoding="async"></div><div class="cloud">Уровень ${level} · ${esc(levelTitle(level))}</div><strong class="new-level__badge">${level}</strong></div><button class="btn btn-success btn-lg btn-block" type="button" data-level-continue>Продолжить</button>`, "sheet--new-level");
  $("[data-level-continue]", document.body).addEventListener("click", close);
}

function openAvatarSheet() {
  const awards = currentAwards();
  const earned = new Set(awards.filter((award) => award.earned).map((award) => award.id));
  const draft = { ...State.avatar };
  const { sheet, close } = openCabinetSheet("Аватар", '<div class="avatar-sheet__body"></div><button class="btn btn-primary btn-lg btn-block" type="button" data-avatar-save>Сохранить</button>', "sheet--avatar");
  const body = $(".avatar-sheet__body", sheet);
  const render = (pop = false) => {
    body.innerHTML = `<div class="avatar-preview">${avatarPortrait(draft, State.user, "avatar-preview__pic")}</div><h3>Персонаж</h3><div class="avatar-characters" aria-label="Персонажи">${AVATAR_CHARACTERS.map((character) => {
      const unlock = AVATAR_UNLOCK[character.id];
      const unlocked = !unlock || earned.has(unlock);
      const award = awards.find((item) => item.id === unlock);
      return `<button class="avatar-character ${draft.character === character.id ? "is-selected" : ""} ${unlocked ? "" : "is-locked"}" type="button" data-character="${character.id}" aria-pressed="${draft.character === character.id}" aria-label="${esc(character.name)}${unlocked ? "" : `, закрыто: ${award?.title || "награда"}`}"><span class="avatar-character__portrait">${avatarPortrait({ ...draft, character: character.id }, State.user)}</span>${unlocked ? "" : icon("i-lock")}</button>`;
    }).join("")}</div><h3>Цвет фона</h3><div class="avatar-colors" aria-label="Цвет фона">${AVATAR_COLORS.map((color) => `<button class="avatar-color ${draft.color === color ? "is-selected" : ""}" type="button" data-avatar-color="${color}" style="--swatch:var(--${color})" aria-pressed="${draft.color === color}" aria-label="Цвет ${color}">${draft.color === color ? icon("i-check") : ""}</button>`).join("")}</div>`;
    if (pop && !prefersReducedMotion()) $(".avatar-preview__pic", body).animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 250, easing: "ease-out" });
  };
  render();
  sheet.addEventListener("click", (event) => {
    const characterButton = event.target.closest("[data-character]");
    if (characterButton && body.contains(characterButton)) {
      const character = characterButton.dataset.character;
      const unlock = AVATAR_UNLOCK[character];
      if (unlock && !earned.has(unlock)) {
        const award = awards.find((item) => item.id === unlock);
        showToast(`Получи награду «${award?.title || "Награда"}», чтобы открыть`);
        if (!prefersReducedMotion()) characterButton.animate([{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }], { duration: 300 });
        return;
      }
      draft.character = character;
      render(true);
      return;
    }
    const color = event.target.closest("[data-avatar-color]");
    if (color) {
      draft.color = color.dataset.avatarColor;
      render();
      return;
    }
    if (event.target.closest("[data-avatar-save]")) {
      try {
        localStorage.setItem("aitalay.avatar", JSON.stringify(draft));
        State.avatar = draft;
        State.avatarJustSaved = true;
        close();
        renderProfile();
        showToast("Сохранено");
      } catch {
        showToast("Не получилось сохранить. Проверьте сеть и повторите");
      }
    }
  });
}

function openAwardSheet(awardId) {
  const awards = currentAwards();
  let index = Math.max(0, awards.findIndex((award) => award.id === awardId));
  const seen = readStoredJson("aitalay.awardSeen", {});
  seen[awardId] = true;
  localStorage.setItem("aitalay.awardSeen", JSON.stringify(seen));
  $(`[data-badge="${CSS.escape(awardId)}"] .medal__new`)?.remove();
  const { sheet, close } = openCabinetSheet("", '<div class="award-sheet__body"></div><button class="btn btn-primary btn-lg btn-block" type="button" data-award-ok>Понятно</button>', "sheet--award");
  const body = $(".award-sheet__body", sheet);
  let pointerStart = null;
  const render = (direction = 0) => {
    const award = awards[index];
    $(`#${sheet.getAttribute("aria-labelledby")}`).textContent = award.title;
    body.innerHTML = `<div class="award-sheet__medal ${award.earned ? "is-earned" : "is-locked"}"><img src="${award.earned ? award.img : award.imgLocked}" width="160" height="160" alt="${esc(award.title)}, ${award.earned ? "получена" : "ещё не получена"}" decoding="async"></div><span class="chip award-sheet__status ${award.earned ? "is-earned" : ""}">${award.earned ? `Получена${award.date ? ` · ${esc(award.date)}` : ""}` : remainingText(award)}</span><div class="award-condition"><strong>Как получить</strong><p>${esc(award.desc)}</p></div>${award.earned ? "" : `<div class="progress award-progress" role="progressbar" aria-valuenow="${award.value}" aria-valuemin="0" aria-valuemax="${award.goal}"><span class="progress__bar" style="--progress:${(award.value / award.goal) * 100}%"></span></div><span class="award-progress__text">${award.value}/${award.goal}</span>`}`;
    const medal = $(".award-sheet__medal img", body);
    if (direction && !prefersReducedMotion()) medal.animate([{ transform: `translateX(${direction * 48}px)` }, { transform: "translateX(0)" }], { duration: 250, easing: "ease-out" });
  };
  render();
  $("[data-award-ok]", sheet).addEventListener("click", close);
  sheet.addEventListener("pointerdown", (event) => { pointerStart = { x: event.clientX, y: event.clientY }; });
  sheet.addEventListener("pointerup", (event) => {
    if (!pointerStart) return;
    const deltaX = event.clientX - pointerStart.x;
    const deltaY = event.clientY - pointerStart.y;
    pointerStart = null;
    if (Math.abs(deltaX) < 56 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    const next = (index + (deltaX < 0 ? 1 : -1) + awards.length) % awards.length;
    index = next;
    render(deltaX < 0 ? 1 : -1);
  });
}

function openSchoolSheet() {
  const user = State.user;
  const current = directorySchool(user.school);
  const match = String(user.class_name || "1А").match(/^(\d{1,2})(.*)$/);
  const draft = { schoolId: current?.id || "", school: current?.name || "", grade: match?.[1] || "1", letter: match?.[2] || "А" };
  const { sheet, close } = openCabinetSheet("Школа и класс", '<label class="field"><span class="label">Город, район, номер или название</span><input class="input" type="search" data-school-search placeholder="Например, Уфа 12"></label><div class="school-options" data-school-options></div><div class="class-picker"><h3>Класс</h3><div class="chip-cloud" data-grade-options></div><h3>Буква</h3><div class="chip-cloud" data-letter-options></div></div><p class="form-status" data-school-status role="status"></p><button class="btn btn-primary btn-lg btn-block" type="button" data-school-save>Сохранить</button>', "sheet--school");
  const schoolOptions = $("[data-school-options]", sheet);
  const renderSchools = () => {
    const query = schoolKey($("[data-school-search]", sheet).value);
    const filtered = State.schools.filter((school) => schoolKey([school.name, school.short_name, school.city, school.district].join(" ")).includes(query));
    schoolOptions.innerHTML = filtered.length ? filtered.slice(0, 60).map((school) => `<button class="tile school-option ${draft.schoolId === school.id ? "is-selected" : ""}" type="button" data-school-id="${esc(school.id)}" aria-pressed="${draft.schoolId === school.id}"><span>${esc(school.short_name)}</span><small>${esc([school.city, school.district].filter(Boolean).join(" · "))}</small></button>`).join("") : '<p class="muted">Школа не найдена. Уточните город, район или номер.</p>';
  };
  const renderClasses = () => {
    $("[data-grade-options]", sheet).innerHTML = Array.from({ length: 11 }, (_, index) => String(index + 1)).map((grade) => `<button class="chip ${draft.grade === grade ? "is-selected" : ""}" type="button" data-grade="${grade}" aria-pressed="${draft.grade === grade}">${grade}</button>`).join("");
    $("[data-letter-options]", sheet).innerHTML = ["А", "Б", "В", "Г"].map((letter) => `<button class="chip ${draft.letter === letter ? "is-selected" : ""}" type="button" data-letter="${letter}" aria-pressed="${draft.letter === letter}">${letter}</button>`).join("");
  };
  renderSchools();
  renderClasses();
  $("[data-school-search]", sheet).addEventListener("input", renderSchools);
  sheet.addEventListener("click", async (event) => {
    const schoolButton = event.target.closest("[data-school-id]");
    const grade = event.target.closest("[data-grade]");
    const letter = event.target.closest("[data-letter]");
    if (schoolButton) {
      const school = State.schools.find((item) => item.id === schoolButton.dataset.schoolId);
      if (school) Object.assign(draft, { schoolId: school.id, school: school.name });
      renderSchools();
    }
    if (grade) { draft.grade = grade.dataset.grade; renderClasses(); }
    if (letter) { draft.letter = letter.dataset.letter; renderClasses(); }
    const save = event.target.closest("[data-school-save]");
    if (save) {
      if (!draft.schoolId) { showToast("Выберите школу из справочника"); return; }
      setBusy(save, true, "Сохраняем…");
      try {
        const updated = await apiRequest("/auth/me", { method: "PATCH", body: { school_id: draft.schoolId, school: draft.school, class_name: `${draft.grade}${draft.letter}` } });
        Object.assign(user, updated);
        localStorage.removeItem("aitalay.profileOverrides");
        $("#teacher-school").value = user.school;
        $("#teacher-class").value = user.class_name;
        close();
        renderProfile();
        showToast("Школа и класс сохранены");
      } catch (error) {
        $("[data-school-status]", sheet).textContent = error.message;
      } finally {
        setBusy(save, false);
      }
    }
  });
}

function openReminderSheet() {
  const settings = cabinetSettings();
  const { sheet, close } = openCabinetSheet("Время напоминания", `<div class="reminder-times">${["08:00", "12:00", "18:00", "20:00", "21:00"].map((time) => `<button class="chip ${settings.reminderTime === time ? "is-selected" : ""}" type="button" data-reminder-value="${time}">${time}</button>`).join("")}</div>`, "sheet--reminder");
  sheet.addEventListener("click", (event) => {
    const button = event.target.closest("[data-reminder-value]");
    if (!button) return;
    settings.reminderTime = button.dataset.reminderValue;
    saveCabinetSettings();
    close();
    renderProfile();
  });
}

function openExportSheet() {
  const staff = ["teacher", "expert", "admin"].includes(State.user.role);
  const content = `<h3>Мои ответы</h3><button class="tile" type="button" data-export="json" data-scope="me">JSON · мои ответы</button><button class="tile" type="button" data-export="csv" data-scope="me">CSV · мои ответы</button>${staff ? '<h3>Подтверждённый корпус</h3><button class="tile" type="button" data-export="json" data-scope="translations">JSON · все переводы</button><button class="tile" type="button" data-export="csv" data-scope="translations">CSV · все переводы</button>' : ""}`;
  const { sheet, close } = openCabinetSheet("Экспорт данных", content, "sheet--export");
  $$('[data-export]', sheet).forEach((button) => button.addEventListener("click", () => { close(); downloadTranslations(button.dataset.export, button, button.dataset.scope); }));
}

function settingsRow(iconName, label, value, attribute) {
  return `<button class="settings-row cabinet-settings-row" type="button" ${attribute}><span class="settings-row__label">${icon(iconName)}<span>${esc(label)}</span></span><span class="settings-row__value">${esc(value)}${icon("i-chevron-right")}</span></button>`;
}

function settingsSwitch(label, key, iconName) {
  const enabled = Boolean(cabinetSettings()[key]);
  return `<button class="settings-row cabinet-settings-row" type="button" role="switch" aria-checked="${enabled}" data-setting-toggle="${key}"><span class="settings-row__label">${icon(iconName)}<span>${esc(label)}</span></span><span class="settings-row__value"><span data-switch-label>${enabled ? "Вкл" : "Выкл"}</span><span class="switch" aria-hidden="true"><span class="switch__thumb">${enabled ? icon("i-check") : ""}</span></span></span></button>`;
}

function settingsGroup(title, rows) {
  return `<section class="settings-group"><h3>${esc(title)}</h3><div class="settings-card">${rows.join("")}</div></section>`;
}

function handleProfileClick(event) {
  const target = event.target.closest("button");
  if (!target) return;
  if (target.hasAttribute("data-avatar-edit")) { openAvatarSheet(); return; }
  if (target.hasAttribute("data-level-info")) { openLevelSheet(); return; }
  if (target.dataset.goTab) { switchTab(target.dataset.goTab); return; }
  if (target.hasAttribute("data-streak-card")) {
    $$(".week-day", target).forEach((day, index) => {
      if (!prefersReducedMotion()) day.animate([{ transform: "translateY(0)" }, { transform: "translateY(-6px)" }, { transform: "translateY(0)" }], { duration: 250, delay: index * 50, easing: "ease-out" });
    });
    return;
  }
  if (target.dataset.badge) { openAwardSheet(target.dataset.badge); return; }
  if (target.hasAttribute("data-profile-language")) { $("#language-sheet").hidden = false; return; }
  if (target.hasAttribute("data-school-settings")) { openSchoolSheet(); return; }
  if (target.dataset.settingToggle) {
    const settings = cabinetSettings();
    const key = target.dataset.settingToggle;
    settings[key] = !settings[key];
    saveCabinetSettings();
    renderProfile();
    return;
  }
  if (target.hasAttribute("data-reminder-time")) { openReminderSheet(); return; }
  if (target.hasAttribute("data-telegram")) {
    const connected = Boolean(window.Telegram?.WebApp?.initDataUnsafe?.user);
    const { close } = openCabinetSheet(connected ? "Отключить Telegram?" : "Telegram", connected ? '<p>Управление привязкой доступно в настройках Telegram.</p><button class="btn btn-primary btn-lg btn-block" type="button" data-telegram-ok>Понятно</button>' : '<p>Откройте Әйтәләй через Telegram, чтобы вход сохранялся автоматически.</p><button class="btn btn-primary btn-lg btn-block" type="button" data-telegram-ok>Понятно</button>', "sheet--telegram");
    $("[data-telegram-ok]", document.body).addEventListener("click", close);
    return;
  }
  if (target.dataset.roleTarget) { $(`#${target.dataset.roleTarget}`).scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" }); return; }
  if (target.hasAttribute("data-export-sheet")) { openExportSheet(); return; }
  if (target.hasAttribute("data-about")) {
    const { close } = openCabinetSheet("О проекте", '<p>Әйтәләй — башкирская языковая школа с уроками и народной библиотекой.</p><p class="muted">Версия 6.0</p><button class="btn btn-primary btn-lg btn-block" type="button" data-about-ok>Понятно</button>', "sheet--about");
    $("[data-about-ok]", document.body).addEventListener("click", close);
    return;
  }
  if (target.hasAttribute("data-help")) {
    const { close } = openCabinetSheet("Помощь", '<div class="level-help"><p>Начинай с карточек, затем переходи к заданиям.</p><p>Открывай новые медали за уроки и проверку фраз.</p><p>Нажми на аватар, чтобы изменить персонажа и цвет.</p></div><button class="btn btn-primary btn-lg btn-block" type="button" data-help-ok>Понятно</button>', "sheet--help");
    $("[data-help-ok]", document.body).addEventListener("click", close);
    return;
  }
  if (target.id === "logout-button") {
    const { sheet, close } = openCabinetSheet("Выйти из аккаунта?", '<button class="btn btn-success btn-lg btn-block" type="button" data-logout-stay>Остаться</button><button class="btn btn-ghost btn-lg btn-block danger-text" type="button" data-logout-confirm>Выйти</button>', "sheet--logout");
    $("[data-logout-stay]", sheet).addEventListener("click", close);
    $("[data-logout-confirm]", sheet).addEventListener("click", () => { close(); logout(); });
  }
}

function renderProfile() {
  const user = State.user;
  State.avatar = State.avatar || readAvatar();
  const settings = cabinetSettings();
  const awards = currentAwards();
  const earnedCount = awards.filter((award) => award.earned).length;
  const seen = readStoredJson("aitalay.awardSeen", {});
  const level = Math.max(1, Number(user.level) || 1);
  const points = Math.max(0, Number(user.points) || 0);
  const levelStart = (level - 1) * 100;
  const nextLevel = level * 100;
  const levelPercent = Math.max(0, Math.min(100, points - levelStart));
  const previousRing = Number(sessionStorage.getItem("aitalay.lastAvatarProgress") || 0);
  const previousPoints = Number(sessionStorage.getItem("aitalay.lastPoints") || 0);
  const lastSeenLevel = Number(localStorage.getItem("aitalay.lastSeenLevel") || 0);
  const roleLabels = { student: "Ученик", teacher: "Учитель", expert: "Эксперт УФИЦ РАН", admin: "Администратор УФИЦ РАН" };
  const firstCascade = !sessionStorage.getItem("aitalay.cabinetShown");
  const streak = Math.max(0, Number(user.streak_days) || 0);
  const today = (new Date().getDay() + 6) % 7;
  const week = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((label, index) => {
    const filled = streak > 0 && index <= today && index > today - streak;
    return `<span class="week-day ${filled ? "is-filled" : ""} ${index === today ? "is-today" : ""}"><span>${filled ? icon("i-check") : ""}</span><small>${label}</small></span>`;
  }).join("");
  const streakContent = `<span class="streak-summary">${icon("i-flame")}<strong>${formatNumber(streak)}</strong><span>дней подряд</span></span>${streak ? `<span class="streak-week">${week}</span>` : '<span class="streak-empty">Позанимайся сегодня, чтобы начать серию</span><span class="btn btn-primary">К урокам</span>'}`;
  const nearest = awards.filter((award) => !award.earned).sort((a, b) => (b.value / b.goal) - (a.value / a.goal))[0];
  const nearestBlock = nearest ? `<button class="next-award cabinet-block" type="button" data-badge="${nearest.id}" style="--cabinet-index:4"><img class="next-award__medal" src="${nearest.imgLocked}" width="72" height="72" alt="${esc(nearest.title)}, ещё не получена" decoding="async"><span class="next-award__content"><strong>${esc(nearest.title)}</strong><span class="progress"><span class="progress__bar" style="--progress:${(nearest.value / nearest.goal) * 100}%"></span></span><span>${remainingText(nearest)}</span></span><span class="next-award__scene"><span class="cloud">${nearest.value / nearest.goal > .8 ? "Почти!" : nearest.value / nearest.goal >= .3 ? "Ещё чуть-чуть" : "Ты начал!"}</span><img src="${spriteUrl("boy", "success")}" width="96" height="96" alt="" decoding="async" data-emotion="happy"></span></button>` : '<div class="all-awards cabinet-block" style="--cabinet-index:4">Все награды собраны</div>';
  const rows = [awards.slice(0, 3), awards.slice(3, 6), awards.slice(6)];
  const showcase = rows.map((row, rowIndex) => `<div class="shelf-row ${row.length === 1 ? "shelf-row--last" : ""}">${row.map((award) => `<button class="medal ${award.earned ? "is-earned" : "is-locked"}" type="button" data-badge="${award.id}" style="--medal-index:${rowIndex * 3 + row.indexOf(award)}" aria-label="${esc(award.title)}, ${award.earned ? "получена" : "ещё не получена"}"><span class="medal__art">${award.earned && !seen[award.id] ? '<span class="medal__new">Новая</span>' : ""}<img class="medal__img" src="${award.earned ? award.img : award.imgLocked}" width="88" height="88" alt="${esc(award.title)}, ${award.earned ? "получена" : "ещё не получена"}" decoding="async"></span><span class="medal__name">${esc(award.title)}</span>${award.earned ? '<span class="sr-only">получена</span>' : `<span class="medal__progress"><span class="progress"><span class="progress__bar" style="--progress:${(award.value / award.goal) * 100}%"></span></span><span>${award.value}/${award.goal}</span></span>`}</button>`).join("")}</div>`).join("");
  const roleRows = [];
  if (["teacher", "expert", "admin"].includes(user.role)) roleRows.push(settingsGroup("Для учителя", [settingsRow("i-teacher", "Отчёт по классу", "", 'data-role-target="teacher-panel"')]));
  if (["expert", "admin"].includes(user.role)) roleRows.push(settingsGroup("Для эксперта", [settingsRow("i-shield", "Спорные переводы", "", 'data-role-target="moderation-panel"')]));
  roleRows.push(settingsGroup("Данные", [settingsRow("i-download", "Экспорт данных", "JSON, CSV", "data-export-sheet")]));
  const container = $("#profile-content");
  container.innerHTML = `<div class="cabinet-stack ${firstCascade ? "cabinet-stack--first" : ""}"><section class="profile-passport profile-passport--${esc(user.role)} cabinet-block" style="--cabinet-index:0"><div class="profile-passport__waves" aria-hidden="true"><svg viewBox="0 0 400 112" preserveAspectRatio="none"><path class="wave-back" d="M0 44C70 4 125 84 205 42S335 8 400 46V112H0Z"/><path class="wave-front" d="M0 72C72 32 144 96 220 58S336 36 400 70V112H0Z"/></svg></div><button class="passport-avatar ${State.avatarJustSaved ? "is-saved" : ""}" type="button" data-avatar-edit aria-label="Изменить аватар"><svg class="avatar__ring" viewBox="0 0 136 136" aria-hidden="true"><circle class="track" cx="68" cy="68" r="60"/><circle class="fill" cx="68" cy="68" r="60" stroke-dasharray="376.99" stroke-dashoffset="${376.99 * (1 - previousRing / 100)}" data-avatar-ring/></svg>${avatarPortrait(State.avatar, user)}<span class="avatar__level ${lastSeenLevel && lastSeenLevel < level ? "is-popped" : ""}">${level}</span><span class="avatar__edit">${icon("i-pencil")}</span></button><h2>${esc(user.full_name)}</h2><p class="profile-passport__school"><span>${esc(normalizeSchool(user.school) || user.email || "Башкирская языковая школа")}</span>${user.class_name ? `<span>· ${esc(user.class_name)} класс</span>` : ""}</p><span class="chip role-badge">${esc(roleLabels[user.role] || user.role)}</span></section>
    <button class="level-card cabinet-block" type="button" data-level-info style="--cabinet-index:1"><span class="level-card__heading"><span class="level-card__icon">${icon("i-trophy")}</span><strong>Уровень ${level} · ${esc(levelTitle(level))}</strong><span>${formatNumber(points)}/${formatNumber(nextLevel)}</span></span><span class="progress level-card__progress" role="progressbar" aria-valuenow="${levelPercent}" aria-valuemin="0" aria-valuemax="100"><span class="progress__bar" style="--progress:${previousRing}%" data-level-progress></span></span><span class="level-card__caption">До уровня ${level + 1} осталось ${formatNumber(Math.max(0, nextLevel - points))} очков</span></button>
    <div class="cabinet-bento cabinet-block" style="--cabinet-index:2"><button class="stat-streak" type="button" ${streak ? "data-streak-card" : 'data-go-tab="course"'}>${streakContent}</button><button class="stat-small stat-small--points" type="button" data-go-tab="ratings">${icon("i-honey")}<strong data-cabinet-points>${formatNumber(previousPoints)}</strong><span>очков</span></button><button class="stat-small stat-small--stages" type="button" data-go-tab="course"><span class="stage-check">${icon("i-check")}</span><strong>${formatNumber(State.progress.size)}</strong><span>этапов курса</span></button></div>
    ${nearestBlock}
    <section class="awards-section cabinet-block" style="--cabinet-index:5"><div class="section-title-row"><h2>Награды</h2><span class="awards-count">${earnedCount}/${awards.length}<span class="mini-progress"><span style="width:${(earnedCount / awards.length) * 100}%"></span></span></span></div><div class="showcase ${firstCascade ? "showcase--first" : ""}">${showcase}</div></section>
    <section class="settings-section cabinet-block" style="--cabinet-index:6"><h2>Настройки</h2>${settingsGroup("Обучение", [settingsRow("i-school", "Школа и класс", `${normalizeSchool(user.school) || "Не выбрана"}${user.class_name ? ` · ${user.class_name}` : ""}`, "data-school-settings"), settingsRow("i-globe", "Языковая пара", "Башкирский ↔ русский", "data-profile-language"), settingsSwitch("Озвучка", "autoVoice", "i-speaker")])}${settingsGroup("Уведомления", [settingsSwitch("Звук", "sound", "i-volume"), settingsSwitch("Напоминания", "reminders", "i-bell"), `<div class="reminder-time-wrap ${settings.reminders ? "is-visible" : ""}">${settingsRow("i-clock", "Время напоминания", settings.reminderTime, `data-reminder-time tabindex="${settings.reminders ? "0" : "-1"}"`)}</div>`, settingsRow("i-telegram", "Telegram", window.Telegram?.WebApp?.initDataUnsafe?.user ? "Подключён" : "Подключить", "data-telegram")])}${roleRows.join("")}${settingsGroup("О проекте", [settingsRow("i-info", "О проекте", "", "data-about"), settingsRow("i-book", "Помощь", "", "data-help")])}</section>
    <button id="logout-button" class="profile-logout cabinet-block" type="button" style="--cabinet-index:7">${icon("i-logout")}Выйти</button><span class="app-version">Әйтәләй · версия 7.0</span></div>`;
  container.onclick = handleProfileClick;
  State.avatarJustSaved = false;
  sessionStorage.setItem("aitalay.cabinetShown", "1");
  sessionStorage.setItem("aitalay.lastAvatarProgress", String(levelPercent));
  sessionStorage.setItem("aitalay.lastPoints", String(points));
  localStorage.setItem("aitalay.lastSeenLevel", String(level));
  tweenCabinetNumber($("[data-cabinet-points]", container), points, previousPoints);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    $("[data-avatar-ring]", container)?.style.setProperty("stroke-dashoffset", String(376.99 * (1 - levelPercent / 100)));
    $("[data-level-progress]", container)?.style.setProperty("--progress", `${levelPercent}%`);
  }));
  if (lastSeenLevel && lastSeenLevel < level) setTimeout(() => openNewLevelSheet(level), 320);
}

function renderCabinetSafe() {
  try {
    renderProfile();
  } catch (error) {
    console.error("Не удалось открыть Кабинет", error);
    const container = $("#profile-content");
    container.innerHTML = '<div class="error-state"><strong>Не получилось открыть</strong><button class="btn btn-ghost" type="button">Повторить</button></div>';
    $("button", container).addEventListener("click", renderCabinetSafe);
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
  $("#language-close").addEventListener("click", () => { $("#language-sheet").hidden = true; });
  $("#language-current").addEventListener("click", () => { $("#language-sheet").hidden = true; });
  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-character-tts], [data-daily-tts]");
    if (button) speakText(button.dataset.characterTts || button.dataset.dailyTts, button);
    const toggle = event.target.closest("[data-translation-toggle]");
    if (toggle) {
      const translation = toggle.nextElementSibling;
      translation.hidden = !translation.hidden;
      toggle.setAttribute("aria-expanded", String(!translation.hidden));
      toggle.textContent = translation.hidden ? "Перевод" : "Скрыть перевод";
    }
  });
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    if (!$("#language-sheet").hidden) $("#language-sheet").hidden = true;
    else if (!$("#lesson-exit-sheet").hidden) $("#lesson-exit-sheet").hidden = true;
    else if (!$("#modal-lesson").hidden) requestLessonClose();
    else if (!$("#modal-boss").hidden) closeBoss();
    else if (State.communityMode !== "library" && State.activeTab === "community") requestCommunityClose();
  });
  $("#daily-body").addEventListener("click", (event) => {
    const reason = event.target.closest("[data-correction-reason]");
    if (reason) {
      $$('[data-correction-reason]', $("#daily-body")).forEach((button) => {
        const selected = button === reason;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      return;
    }
    const button = event.target.closest("[data-daily]");
    if (!button) return;
    const action = button.dataset.daily;
    if (action === "correct") submitDaily(true);
    if (action === "fix") { State.dailyMode = "fix"; renderDaily(); }
    if (action === "submit-fix") submitDaily(false);
    if (action === "cancel") { State.dailyMode = "actions"; renderDaily(); }
    if (action === "next" || action === "skip") loadDailyTask();
  });
  $("#dictionary-search").addEventListener("input", queueDictionarySearch);
  $$('[data-community-mode]').forEach((button) => button.addEventListener("click", () => setCommunityMode(button.dataset.communityMode)));
  $("[data-community-close]").addEventListener("click", requestCommunityClose);
  const proposalForm = $("#proposal-form");
  proposalForm.addEventListener("submit", submitProposal);
  proposalForm.addEventListener("click", (event) => {
    const kind = event.target.closest("[data-proposal-kind]");
    if (kind) {
      State.proposalMeta.kind = kind.dataset.proposalKind;
      $$('[data-proposal-kind]', proposalForm).forEach((button) => {
        const selected = button === kind;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
      renderProposalStep();
      saveProposalDraft();
      return;
    }
    const chip = event.target.closest("[data-proposal-group] .chip");
    if (!chip) return;
    const group = chip.closest("[data-proposal-group]");
    const name = group.dataset.proposalGroup;
    const value = chip.dataset.value;
    if (name === "topics") {
      const topics = State.proposalMeta.topics;
      const selected = topics.includes(value);
      if (!selected && topics.length >= 3) {
        showToast("Можно выбрать не больше трёх тем");
        return;
      }
      State.proposalMeta.topics = selected ? topics.filter((item) => item !== value) : [...topics, value];
      chip.classList.toggle("is-selected", !selected);
      chip.setAttribute("aria-pressed", String(!selected));
    } else {
      State.proposalMeta[name] = value;
      $$('.chip', group).forEach((button) => {
        const selected = button === chip;
        button.classList.toggle("is-selected", selected);
        button.setAttribute("aria-pressed", String(selected));
      });
    }
    renderProposalStep();
    saveProposalDraft();
  });
  $("#proposal-next").addEventListener("click", () => {
    if (State.proposalStep === 2 && !proposalTextValid()) {
      proposalForm.reportValidity();
      return;
    }
    State.proposalStep = Math.min(4, State.proposalStep + 1);
    renderProposalStep();
    saveProposalDraft();
  });
  $("#proposal-prev").addEventListener("click", () => {
    State.proposalStep = Math.max(1, State.proposalStep - 1);
    renderProposalStep();
    saveProposalDraft();
  });
  $("#proposal-again").addEventListener("click", resetProposalWizard);
  [$("#proposal-ba"), $("#proposal-ru")].forEach((input) => input.addEventListener("input", () => {
    updateProposalCount(input);
    renderProposalStep();
    saveProposalDraft();
  }));
  $("#proposal-example").addEventListener("input", (event) => {
    State.proposalMeta.example = event.currentTarget.value.trim();
    saveProposalDraft();
  });
  $("#teacher-form").addEventListener("submit", loadTeacherReport);
  $("#moderation-refresh").addEventListener("click", loadModeration);
}

async function init() {
  bindEvents();
  initClouds();
  await loadSchoolDirectory();
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
console.info(`Әйтәләй API: ${API_URL}`);
