"use strict";

/* ------------------------------------------------------------------ */
/*  Настройки Mini App                                                 */
/*  USE_MOCK держите синхронно с bot/.env: 1 -> true, 0 -> false.      */
/* ------------------------------------------------------------------ */

const CONFIG = {
  apiUrl: "http://localhost:8000",
  useMock: false,
  devTelegramId: 1,
};

const tg =
  window.Telegram && window.Telegram.WebApp ? window.Telegram.WebApp : null;

const RATING_TABS = [
  { id: "students", label: "Ученики", endpoint: "/ratings/top" },
  { id: "schools", label: "Школы", endpoint: "/ratings/schools" },
  { id: "classes", label: "Классы", endpoint: "/ratings/classes" },
  { id: "accuracy", label: "Точность", endpoint: "/ratings/accuracy" },
  { id: "vocabulary", label: "Словарь", endpoint: "/ratings/vocabulary" },
  { id: "corrections", label: "Исправления", endpoint: "/ratings/corrections" },
];

const PERIODS = [
  { id: "day", label: "День" },
  { id: "week", label: "Неделя" },
  { id: "month", label: "Месяц" },
  { id: "year", label: "Год" },
  { id: "all", label: "Всё время" },
];

const SCREENS = ["task", "ratings", "profile", "teacher"];

const state = {
  telegramId: null,
  token: null,
  devMode: false,
  task: null,
  taskResult: null,
  taskSubmitting: false,
  ratingTab: "students",
  ratingPeriod: "all",
  me: null,
  report: null,
};

/* ------------------------------------------------------------------ */
/*  Мок-данные (USE_MOCK=1)                                            */
/* ------------------------------------------------------------------ */

const MOCK = {
  task: {
    fragment_id: 1,
    text_ba: "Һаумыһығыҙ",
    translation: "Здравствуйте",
    lang_pair: "ba-ru",
    source: { file: "test.txt", chapter: "1", time: null },
  },
  submit: { points_earned: 10, total_points: 100, level: 2 },
  me: {
    full_name: "Тест",
    points: 100,
    level: 2,
    streak_days: 3,
    accuracy: 84,
    school: "Школа №1",
    class_name: "9А",
    lang_pair: "ba-ru",
  },
  ratings: {
    students: [
      { full_name: "Тест Тестов", points: 500, level: 5 },
      { full_name: "Иван Иванов", points: 470, level: 4 },
      { full_name: "Айгөл Юлдашева", points: 430, level: 4 },
      { full_name: "Пётр Петров", points: 390, level: 3 },
      { full_name: "Гульнара Сафина", points: 350, level: 3 },
      { full_name: "Тимур Ахметов", points: 310, level: 3 },
      { full_name: "Мария Смирнова", points: 280, level: 2 },
      { full_name: "Рустам Хайруллин", points: 240, level: 2 },
      { full_name: "Алина Насырова", points: 200, level: 2 },
      { full_name: "Дмитрий Козлов", points: 160, level: 1 },
    ],
    schools: [
      { name: "Школа №1", points: 1500 },
      { name: "Гимназия №2", points: 1380 },
      { name: "Башкирская гимназия", points: 1240 },
      { name: "Школа №5", points: 1100 },
      { name: "Лицей №3", points: 960 },
      { name: "Школа с. Кушнаренково", points: 820 },
      { name: "Школа №7", points: 700 },
      { name: "Школа №12", points: 560 },
      { name: "Школа с. Иглино", points: 420 },
      { name: "Школа №9", points: 300 },
    ],
    classes: [
      { class_name: "9А", school: "Школа №1", points: 620 },
      { class_name: "8Б", school: "Гимназия №2", points: 580 },
      { class_name: "7А", school: "Башкирская гимназия", points: 540 },
      { class_name: "10А", school: "Школа №5", points: 500 },
      { class_name: "6В", school: "Лицей №3", points: 460 },
      { class_name: "9Б", school: "Школа №1", points: 420 },
      { class_name: "11А", school: "Гимназия №2", points: 380 },
      { class_name: "5А", school: "Школа №7", points: 340 },
      { class_name: "8А", school: "Школа №12", points: 300 },
      { class_name: "7Б", school: "Школа №9", points: 260 },
    ],
    accuracy: [
      { full_name: "Айгөл Юлдашева", accuracy: 98 },
      { full_name: "Тест Тестов", accuracy: 95 },
      { full_name: "Иван Иванов", accuracy: 92 },
      { full_name: "Гульнара Сафина", accuracy: 89 },
      { full_name: "Пётр Петров", accuracy: 86 },
      { full_name: "Алина Насырова", accuracy: 83 },
      { full_name: "Тимур Ахметов", accuracy: 80 },
      { full_name: "Мария Смирнова", accuracy: 76 },
      { full_name: "Рустам Хайруллин", accuracy: 72 },
      { full_name: "Дмитрий Козлов", accuracy: 68 },
    ],
    vocabulary: [
      { full_name: "Гульнара Сафина", words: 420 },
      { full_name: "Айгөл Юлдашева", words: 395 },
      { full_name: "Иван Иванов", words: 360 },
      { full_name: "Тест Тестов", words: 330 },
      { full_name: "Тимур Ахметов", words: 300 },
      { full_name: "Пётр Петров", words: 270 },
      { full_name: "Мария Смирнова", words: 240 },
      { full_name: "Алина Насырова", words: 210 },
      { full_name: "Рустам Хайруллин", words: 180 },
      { full_name: "Дмитрий Козлов", words: 150 },
    ],
    corrections: [
      { full_name: "Иван Иванов", corrections: 54 },
      { full_name: "Тест Тестов", corrections: 48 },
      { full_name: "Пётр Петров", corrections: 41 },
      { full_name: "Айгөл Юлдашева", corrections: 37 },
      { full_name: "Тимур Ахметов", corrections: 32 },
      { full_name: "Гульнара Сафина", corrections: 28 },
      { full_name: "Мария Смирнова", corrections: 24 },
      { full_name: "Алина Насырова", corrections: 19 },
      { full_name: "Рустам Хайруллин", corrections: 15 },
      { full_name: "Дмитрий Козлов", corrections: 11 },
    ],
  },
  report: {
    students: [
      { full_name: "Иван Иванов", points: 120, accuracy: 88 },
      { full_name: "Айгөл Юлдашева", points: 115, accuracy: 96 },
      { full_name: "Пётр Петров", points: 98, accuracy: 79 },
      { full_name: "Мария Смирнова", points: 74, accuracy: 71 },
    ],
  },
};

const MOCK_RATING_KEYS = {
  "/ratings/top": "students",
  "/ratings/students": "students",
  "/ratings/schools": "schools",
  "/ratings/classes": "classes",
  "/ratings/accuracy": "accuracy",
  "/ratings/vocabulary": "vocabulary",
  "/ratings/corrections": "corrections",
};

/* ------------------------------------------------------------------ */
/*  Вспомогательные функции                                            */
/* ------------------------------------------------------------------ */

const $ = (selector) => document.querySelector(selector);

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(text, className, onClick) {
  const node = el("button", className, text);
  node.type = "button";
  node.addEventListener("click", onClick);
  return node;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  return number.toLocaleString("ru-RU");
}

function plural(number, one, few, many) {
  const abs = Math.abs(Math.trunc(Number(number) || 0));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function sourceText(source) {
  if (!source || typeof source !== "object") return "";
  const parts = [];
  if (source.file) parts.push(source.file);
  if (source.chapter) parts.push(`глава ${source.chapter}`);
  return parts.join(" · ");
}

function loadingNode(text) {
  const node = el("div", "state");
  node.append(el("span", "spinner"), el("span", "", text));
  return node;
}

function emptyNode(text) {
  return el("div", "empty-box", text);
}

function errorNode(message, onRetry) {
  const box = el("div", "error-box");
  box.append(el("p", "", message));
  if (onRetry) {
    const retry = button("Повторить", "btn btn-outline", onRetry);
    box.append(retry);
  }
  return box;
}

let toastTimer = null;

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

/* ------------------------------------------------------------------ */
/*  API                                                                */
/* ------------------------------------------------------------------ */

async function mockRequest(path, method, body) {
  await delay(220);
  const url = new URL(path, "http://mock.local");
  const route = url.pathname;

  if (route === "/tasks/daily" && method === "GET") {
    return clone(MOCK.task);
  }
  if (route === "/tasks/submit" && method === "POST") {
    const correct = body && body.is_correct !== false;
    return {
      ...clone(MOCK.submit),
      points_earned: correct ? MOCK.submit.points_earned : 0,
      is_correct: correct,
    };
  }
  if (route === "/auth/me" && method === "GET") {
    return clone(MOCK.me);
  }
  if (route === "/teacher/class-report" && method === "GET") {
    return clone(MOCK.report);
  }
  if (route.startsWith("/ratings/") && method === "GET") {
    const key = MOCK_RATING_KEYS[route] || "students";
    return clone(MOCK.ratings[key]);
  }

  throw new Error(`Нет мок-данных для ${method} ${route}`);
}

async function request(path, options = {}) {
  const method = options.method || "GET";
  const body = options.body;

  if (CONFIG.useMock) {
    return mockRequest(path, method, body);
  }

  const headers = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  let response;
  try {
    response = await fetch(`${CONFIG.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    throw new Error("Не удалось связаться с сервером. Проверьте подключение.");
  }

  if (!response.ok) {
    let detail = "";
    try {
      const payload = await response.json();
      detail = payload.detail || payload.message || "";
      if (Array.isArray(detail)) {
        detail = detail
          .map((item) => (item && (item.msg || item.message)) || String(item))
          .join("; ");
      }
    } catch (error) {
      /* тело не JSON — оставляем общий текст */
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Доступ истёк. Перезайдите в приложение через бота.");
    }
    throw new Error(
      detail
        ? `Ошибка сервера (${response.status}): ${detail}`
        : `Ошибка сервера (${response.status}). Попробуйте позже.`
    );
  }

  if (response.status === 204) return null;
  return response.json();
}

async function fetchToken() {
  if (CONFIG.useMock) return "fake_token_123";

  const response = await fetch(
    `${CONFIG.apiUrl}/bot/state/${encodeURIComponent(state.telegramId)}`,
    { headers: { Accept: "application/json" } }
  );

  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`Не удалось получить доступ (${response.status}).`);
  }

  const payload = await response.json();
  let data = payload && payload.data !== undefined ? payload.data : payload;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (error) {
      return null;
    }
  }
  return (data && data.token) || null;
}

/* ------------------------------------------------------------------ */
/*  Ежедневное задание                                                 */
/* ------------------------------------------------------------------ */

async function loadTask(force = false) {
  if (state.task && !force) {
    renderTask();
    return;
  }

  const body = $("#task-body");
  body.replaceChildren(loadingNode("Загружаем задание…"));

  try {
    state.task = await request("/tasks/daily");
    state.taskResult = null;
    renderTask();
  } catch (error) {
    state.task = null;
    body.replaceChildren(errorNode(error.message, () => loadTask(true)));
  }
}

function renderTask() {
  const body = $("#task-body");
  if (!state.task) {
    body.replaceChildren(emptyNode("Задание пока недоступно."));
    return;
  }

  const task = state.task;
  const card = el("article", "card task-card");
  card.append(el("span", "chip", "Ежедневное задание"));
  card.append(el("p", "task-phrase", task.text_ba || "—"));

  const source = sourceText(task.source);
  if (source) card.append(el("p", "task-source", source));

  const translation = el("div", "translation-box");
  translation.append(el("span", "translation-label", "Перевод"));
  translation.append(el("p", "translation-text", task.translation || "—"));
  card.append(translation);

  const actions = el("div", "actions");
  const correct = button("✅ Верно", "btn btn-primary", () => submitTask(true));
  const fix = button("✏️ Исправить", "btn btn-outline", () => submitTask(false));
  if (state.taskResult || state.taskSubmitting) {
    correct.disabled = true;
    fix.disabled = true;
  }
  actions.append(correct, fix);
  card.append(actions);

  if (state.taskResult) {
    card.append(renderTaskResult(state.taskResult));
  }

  body.replaceChildren(card);
}

function renderTaskResult(result) {
  const box = el("div", result.isCorrect ? "result" : "result is-fix");
  if (result.isCorrect) {
    box.append(el("p", "result-title", `+${formatNumber(result.points)} очков!`));
    const note = [];
    if (result.total != null) note.push(`Всего: ${formatNumber(result.total)}`);
    if (result.level != null) note.push(`Уровень ${formatNumber(result.level)}`);
    if (note.length) box.append(el("p", "result-note", note.join(" · ")));
  } else {
    box.append(el("p", "result-title", "Правильный перевод"));
    box.append(el("p", "result-note", result.translation || "—"));
    if (result.total != null) {
      box.append(
        el(
          "p",
          "result-note",
          `Исправление сохранено · Всего: ${formatNumber(result.total)}`
        )
      );
    } else {
      box.append(el("p", "result-note", "Исправление сохранено."));
    }
  }
  return box;
}

async function submitTask(isCorrect) {
  if (!state.task || state.taskSubmitting || state.taskResult) return;

  state.taskSubmitting = true;
  renderTask();

  try {
    const response = await request("/tasks/submit", {
      method: "POST",
      body: {
        fragment_id: state.task.fragment_id,
        translation: state.task.translation,
        is_correct: isCorrect,
      },
    });

    state.taskResult = {
      isCorrect,
      points: Number(response && response.points_earned) || 0,
      total: response ? response.total_points : null,
      level: response ? response.level : null,
      translation: state.task.translation,
    };

    if (isCorrect) {
      showToast(`+${formatNumber(state.taskResult.points)} очков!`);
    }
  } catch (error) {
    showToast(error.message);
  } finally {
    state.taskSubmitting = false;
    renderTask();
  }
}

/* ------------------------------------------------------------------ */
/*  Рейтинг                                                            */
/* ------------------------------------------------------------------ */

function renderRatingControls() {
  const tabs = $("#rating-tabs");
  tabs.replaceChildren();
  RATING_TABS.forEach((tab) => {
    const node = button(tab.label, "tab", () => {
      if (state.ratingTab === tab.id) return;
      state.ratingTab = tab.id;
      renderRatingControls();
      loadRatings();
    });
    node.setAttribute("role", "tab");
    node.setAttribute("aria-selected", String(state.ratingTab === tab.id));
    if (state.ratingTab === tab.id) node.classList.add("active");
    tabs.append(node);
  });

  const periods = $("#rating-periods");
  periods.replaceChildren();
  PERIODS.forEach((period) => {
    const node = button(period.label, "period", () => {
      if (state.ratingPeriod === period.id) return;
      state.ratingPeriod = period.id;
      renderRatingControls();
      loadRatings();
    });
    if (state.ratingPeriod === period.id) node.classList.add("active");
    periods.append(node);
  });
}

async function loadRatings() {
  const body = $("#rating-body");
  body.replaceChildren(loadingNode("Загружаем рейтинг…"));

  const tab =
    RATING_TABS.find((item) => item.id === state.ratingTab) || RATING_TABS[0];

  try {
    const data = await request(
      `${tab.endpoint}?period=${encodeURIComponent(state.ratingPeriod)}`
    );
    const items = Array.isArray(data)
      ? data
      : (data && (data.items || data.top || data.results)) || [];
    renderRatingList(items);
  } catch (error) {
    body.replaceChildren(errorNode(error.message, loadRatings));
  }
}

function ratingMetric(tabId, item) {
  switch (tabId) {
    case "students":
      return {
        main: `${formatNumber(item.points)} очков`,
        sub: item.level != null ? `Уровень ${formatNumber(item.level)}` : "",
      };
    case "schools":
      return { main: `${formatNumber(item.points)} очков`, sub: "" };
    case "classes":
      return {
        main: `${formatNumber(item.points)} очков`,
        sub: item.school || "",
      };
    case "accuracy":
      return { main: `${formatNumber(item.accuracy)}%`, sub: "точность" };
    case "vocabulary": {
      const words = item.words != null ? item.words : item.vocabulary;
      return {
        main: formatNumber(words),
        sub: plural(words, "слово", "слова", "слов"),
      };
    }
    case "corrections": {
      const count =
        item.corrections != null ? item.corrections : item.corrections_count;
      return {
        main: formatNumber(count),
        sub: plural(count, "исправление", "исправления", "исправлений"),
      };
    }
    default:
      return { main: "—", sub: "" };
  }
}

function ratingName(tabId, item) {
  if (tabId === "schools") return item.name || item.school || "Школа";
  if (tabId === "classes") {
    const className = item.class_name || item.name || "Класс";
    return item.school ? `${className} · ${item.school}` : className;
  }
  return item.full_name || item.name || "Ученик";
}

function renderRatingList(items) {
  const body = $("#rating-body");

  if (!Array.isArray(items) || items.length === 0) {
    body.replaceChildren(emptyNode("Рейтинг пока пуст."));
    return;
  }

  const list = el("ol", "rating-list");
  items.slice(0, 10).forEach((item, index) => {
    const row = el("li", "rating-row");
    const rank = el("span", index < 3 ? "rank top" : "rank", String(index + 1));
    const info = el("div", "rating-info");
    info.append(el("p", "rating-name", ratingName(state.ratingTab, item)));

    const metric = ratingMetric(state.ratingTab, item);
    if (metric.sub) info.append(el("p", "rating-sub", metric.sub));

    const value = el("div", "rating-metric", metric.main);
    row.append(rank, info, value);
    list.append(row);
  });

  body.replaceChildren(list);
}

/* ------------------------------------------------------------------ */
/*  Профиль                                                            */
/* ------------------------------------------------------------------ */

async function loadProfile(force = false) {
  if (state.me && !force) {
    renderProfile();
    return;
  }

  const body = $("#profile-body");
  body.replaceChildren(loadingNode("Загружаем профиль…"));

  try {
    state.me = await request("/auth/me");
    renderProfile();
    prefillTeacherForm();
  } catch (error) {
    body.replaceChildren(errorNode(error.message, () => loadProfile(true)));
  }
}

function renderProfile() {
  const body = $("#profile-body");
  const me = state.me;
  if (!me) {
    body.replaceChildren(emptyNode("Профиль пока недоступен."));
    return;
  }

  const card = el("section", "card profile-card");
  const name = me.full_name || me.name || "Ученик";
  const letter = String(name).trim().charAt(0).toUpperCase() || "У";
  card.append(el("div", "avatar", letter));

  const info = el("div");
  info.append(el("h3", "profile-name", name));

  const meta = [];
  if (me.school) meta.push(me.school);
  if (me.class_name) meta.push(`${me.class_name} класс`);
  if (me.lang_pair) meta.push(me.lang_pair);
  info.append(el("p", "profile-meta", meta.join(" · ") || "Языковая школа"));
  card.append(info);

  const stats = el("section", "stats-grid");
  const accuracy = me.accuracy != null ? `${formatNumber(me.accuracy)}%` : "—";
  const streak = me.streak_days != null ? formatNumber(me.streak_days) : "0";
  const values = [
    ["Очки", formatNumber(me.points)],
    ["Уровень", formatNumber(me.level)],
    ["Серия дней", streak],
    ["Точность", accuracy],
  ];

  values.forEach(([label, value]) => {
    const stat = el("div", "stat");
    stat.append(el("span", "stat-value", value));
    stat.append(el("span", "stat-label", label));
    stats.append(stat);
  });

  body.replaceChildren(card, stats);
}

/* ------------------------------------------------------------------ */
/*  Кабинет учителя                                                    */
/* ------------------------------------------------------------------ */

function prefillTeacherForm() {
  const me = state.me;
  if (!me) return;
  const schoolInput = $("#report-school");
  const classInput = $("#report-class");
  if (schoolInput && !schoolInput.value && me.school) {
    schoolInput.value = me.school;
  }
  if (classInput && !classInput.value && me.class_name) {
    classInput.value = me.class_name;
  }
}

async function loadReport(event) {
  if (event) event.preventDefault();

  const school = $("#report-school").value.trim();
  const className = $("#report-class").value.trim();
  if (!school || !className) {
    showToast("Укажите школу и класс.");
    return;
  }

  const body = $("#report-body");
  body.replaceChildren(loadingNode("Готовим отчёт…"));

  try {
    state.report = await request(
      `/teacher/class-report?school=${encodeURIComponent(
        school
      )}&class=${encodeURIComponent(className)}`
    );
    renderReport();
  } catch (error) {
    state.report = null;
    body.replaceChildren(errorNode(error.message, () => loadReport()));
  }
}

function renderReport() {
  const body = $("#report-body");
  const report = state.report;
  if (!report) {
    body.replaceChildren(emptyNode("Введите школу и класс, чтобы увидеть отчёт."));
    return;
  }

  const students = Array.isArray(report.students) ? report.students : [];
  if (students.length === 0) {
    body.replaceChildren(emptyNode("В этом классе пока нет данных."));
    return;
  }

  const card = el("section", "card");
  card.append(el("h3", "report-title", "Отчёт по классу"));
  card.append(
    el(
      "p",
      "report-caption",
      `${$("#report-school").value.trim()} · ${$("#report-class").value.trim()}`
    )
  );

  const table = el("table", "report-table");
  const thead = el("thead");
  const headRow = el("tr");
  headRow.append(
    el("th", "", "Ученик"),
    el("th", "num", "Очки"),
    el("th", "num", "Точность")
  );
  thead.append(headRow);

  const tbody = el("tbody");
  students.forEach((student) => {
    const row = el("tr");
    row.append(el("td", "", student.full_name || student.name || "Ученик"));
    row.append(el("td", "num", formatNumber(student.points)));
    row.append(
      el(
        "td",
        "num",
        student.accuracy != null ? `${formatNumber(student.accuracy)}%` : "—"
      )
    );
    tbody.append(row);
  });

  table.append(thead, tbody);
  card.append(table);
  body.replaceChildren(card);
}

/* ------------------------------------------------------------------ */
/*  Маршрутизация и запуск                                             */
/* ------------------------------------------------------------------ */

function currentScreen() {
  const hash = window.location.hash.replace(/^#/, "").trim().toLowerCase();
  return SCREENS.includes(hash) ? hash : "task";
}

function renderRoute() {
  const screen = currentScreen();

  document.querySelectorAll("[data-screen]").forEach((section) => {
    section.classList.toggle("active", section.dataset.screen === screen);
  });
  document.querySelectorAll("[data-nav]").forEach((link) => {
    const active = link.dataset.nav === screen;
    link.classList.toggle("active", active);
    if (active) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (screen === "task") loadTask();
  if (screen === "ratings") loadRatings();
  if (screen === "profile") loadProfile();
  if (screen === "teacher") {
    prefillTeacherForm();
    if (state.report) renderReport();
  }

  window.scrollTo({ top: 0, behavior: "auto" });
}

function showAuthError(title, text) {
  const overlay = $("#auth-error");
  $("#auth-title").textContent = title;
  $("#auth-text").textContent = text;
  overlay.classList.remove("hidden");
}

async function init() {
  if (tg) {
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor("#ffffff");
      if (tg.setBackgroundColor) tg.setBackgroundColor("#ffffff");
    } catch (error) {
      /* старые клиенты Telegram могут не поддерживать методы */
    }
  }

  const user = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;
  if (user && user.id) {
    state.telegramId = user.id;
  } else if (CONFIG.useMock) {
    state.telegramId = CONFIG.devTelegramId;
    state.devMode = true;
  } else {
    showAuthError(
      "Откройте приложение через Telegram",
      "Mini App доступен только внутри Telegram. Запустите бота и нажмите «Открыть приложение»."
    );
    return;
  }

  try {
    state.token = await fetchToken();
  } catch (error) {
    showAuthError("Не удалось получить доступ", error.message);
    return;
  }

  if (!state.token) {
    showAuthError(
      "Сначала пройди регистрацию в боте",
      "Откройте Telegram-бота, отправьте /start и пройдите регистрацию. После этого вернитесь в приложение."
    );
    return;
  }

  $("#auth-error").classList.add("hidden");
  if (CONFIG.useMock) $("#dev-note").classList.remove("hidden");

  renderRatingControls();
  $("#report-form").addEventListener("submit", loadReport);
  window.addEventListener("hashchange", renderRoute);
  await loadProfile();
  renderRoute();
}

document.addEventListener("DOMContentLoaded", init);
