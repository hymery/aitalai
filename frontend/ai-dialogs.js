import { apiRequest } from "./api.js";
import { preload, setState, spriteUrl } from "./characters.js";
import { initBashkirKeyboards } from "./bashkir-keyboard.js";

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function icon(name) {
  return `<svg class="icon" aria-hidden="true"><use href="#${name}"></use></svg>`;
}

export function initAiDialogs(options = {}) {
  const state = {
    enabled: false,
    dailyLeft: 0,
    scenarios: [],
    error: "",
    refreshPromise: null,
    session: null,
    mode: "tutor",
    scenario: null,
    character: "boy",
    busy: false,
    typing: false,
    skipTyping: false,
    requestId: 0,
    lastFocus: null,
    emotionTimer: null,
    sheetMode: "close",
  };

  const modal = $("#modal-dialog");
  const log = $("#dialog-log");
  const input = $("#dialog-input");
  const sendButton = $("#dialog-send");
  const composer = $("#dialog-composer");
  const sheet = $("#dialog-action-sheet");

  function showToast(text) {
    options.showToast?.(text);
  }

  function renderHub() {
    const hub = $("#dialogs-hub");
    if (state.error) {
      hub.innerHTML = `<div class="error-state"><strong>Не получилось загрузить диалоги</strong><p>${esc(state.error)}</p><button class="btn btn-ghost" id="dialogs-retry" type="button">Повторить</button></div>`;
      $("#dialogs-retry").addEventListener("click", show);
      return;
    }
    if (!state.enabled) {
      hub.innerHTML = `<div class="card dialogs-soon"><img src="${spriteUrl("akbuzat", "idle")}" width="160" height="160" alt="Акбузат" loading="lazy"><div><h3>Диалоги скоро откроются</h3><p>ИИ-собеседник пока не настроен. Уроки и остальные разделы работают как обычно.</p></div></div>`;
      return;
    }
    hub.innerHTML = `
      <div class="dialogs-limit">${icon("i-spark")}<span>Сегодня осталось сообщений: <strong>${state.dailyLeft}</strong></span></div>
      <article class="card dialog-tutor-card">
        <img class="dialog-card__character" src="${spriteUrl("boy", "thinking")}" width="96" height="96" alt="Устаз">
        <div class="dialog-card__copy"><h3>Устаз — спроси что угодно</h3><p>Объяснит грамматику и разберёт слова</p><button class="btn btn-primary" type="button" data-open-tutor>Спросить</button></div>
      </article>
      <div class="dialogs-grid">${state.scenarios.map((scenario, index) => `
        <article class="card dialog-scenario-card ${scenario.unlocked ? "" : "is-locked"}" style="--dialog-order:${index}">
          <div class="dialog-card__top"><img class="dialog-card__character char-breathe" src="${spriteUrl(scenario.character, "idle")}" width="96" height="96" alt="${esc(scenario.title_ru)}" loading="lazy"><span class="chip">${esc(scenario.unit_title)}</span></div>
          <h3>${esc(scenario.title_ru)}</h3><p>${esc(scenario.description_ru)}</p>
          ${scenario.completed ? `<span class="dialog-card__done">${icon("i-check")}Диалог пройден</span>` : ""}
          ${scenario.unlocked
            ? `<button class="btn btn-primary btn-block" type="button" data-open-scenario="${esc(scenario.id)}">Начать диалог</button>`
            : `<div class="dialog-card__lock">${icon("i-lock")}<span>Пройди 1 этап курса, чтобы открыть</span></div>`}
        </article>`).join("")}</div>`;
    $("[data-open-tutor]", hub).addEventListener("click", () => open("tutor"));
    $$('[data-open-scenario]', hub).forEach((button) => button.addEventListener("click", () => open("scenario", button.dataset.openScenario)));
  }

  async function refresh() {
    if (state.refreshPromise) return state.refreshPromise;
    state.refreshPromise = (async () => {
      state.error = "";
      try {
        const status = await apiRequest("/ai/status");
        state.enabled = Boolean(status.enabled);
        state.dailyLeft = Number(status.daily_left) || 0;
        state.scenarios = state.enabled ? await apiRequest("/ai/scenarios") : [];
      } catch (error) {
        state.error = error.message || "Сервер временно недоступен";
        throw error;
      } finally {
        if (!$("#screen-dialogs").hidden) renderHub();
        options.onScenariosUpdated?.();
      }
      return state.scenarios;
    })().finally(() => { state.refreshPromise = null; });
    return state.refreshPromise;
  }

  async function show() {
    $("#dialogs-hub").innerHTML = '<div class="state-block"><span class="spinner" aria-hidden="true"></span><span>Загружаем диалоги…</span></div>';
    try { await refresh(); } catch { /* Ошибка показана на экране с кнопкой повтора. */ }
  }

  function setEmotion(emotion = "idle") {
    clearTimeout(state.emotionTimer);
    const stage = $("#dialog-character-stage");
    setState(stage, emotion);
    if (emotion !== "idle") {
      state.emotionTimer = setTimeout(() => setState(stage, "idle"), emotion === "special" ? 1600 : 1400);
    }
  }

  function configureCharacter() {
    const hero = $("#dialog-character-stage .character");
    hero.dataset.char = state.character;
    hero.dataset.state = "idle";
    $("#dialog-character").src = spriteUrl(state.character, "idle");
    $("#dialog-character-name").textContent = state.mode === "tutor" ? "Устаз" : ({ granny: "Өләсәй", boy: "Азамат", akbuzat: "Аҡбуҙат" }[state.character] || "Герой");
    $("#dialog-modal-title").textContent = state.mode === "tutor" ? "Вопрос учителю" : state.scenario?.title_ru || "Диалог";
  }

  function scrollLog() {
    requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; });
  }

  function toggleTranslation(article) {
    const open = article.classList.toggle("is-translation-open");
    $(".ai-bubble", article)?.setAttribute("aria-expanded", String(open));
    const toggle = $(".ai-bubble__translation-toggle", article);
    if (toggle) toggle.textContent = open ? "Скрыть перевод" : "Показать перевод";
  }

  function extrasMarkup(reply) {
    const corrections = (reply?.corrections || []).map((item) => `
      <div class="ai-extra ai-correction"><strong>Исправление</strong><span><s>${esc(item.wrong)}</s> → <b lang="ba">${esc(item.correct)}</b></span><p>${esc(item.explanation_ru)}</p></div>`).join("");
    const words = reply?.new_words?.length ? `<div class="ai-extra ai-new-words"><strong>Новые слова</strong><div>${reply.new_words.map((word) => `<span lang="ba">${esc(word.ba)}</span> — ${esc(word.ru)}`).join("<br>")}</div></div>` : "";
    return corrections + words;
  }

  async function typeText(article, text, requestId) {
    const output = $(".ai-bubble__text", article);
    state.typing = true;
    state.skipTyping = false;
    if (reducedMotion()) state.skipTyping = true;
    output.textContent = "";
    for (let index = 0; index < text.length; index += 1) {
      if (state.skipTyping || requestId !== state.requestId || modal.hidden) break;
      output.textContent += text[index];
      if (index % 2 === 0) scrollLog();
      await wait(20);
    }
    if (requestId !== state.requestId) return;
    output.textContent = text;
    state.typing = false;
    article.classList.add("is-typed");
    $(".ai-bubble__skip", article)?.remove();
    scrollLog();
  }

  function appendAssistant(reply, { animate = false, requestId = state.requestId } = {}) {
    const article = document.createElement("article");
    article.className = "ai-message ai-message--assistant";
    if (!animate) article.classList.add("is-typed", "no-animation");
    article.innerHTML = `
      <div class="ai-bubble ai-bubble--assistant" role="button" tabindex="0" aria-expanded="false" aria-label="Сообщение собеседника. Показать перевод">
        <span class="ai-bubble__text" lang="ba"></span>
        ${animate && !reducedMotion() ? '<span class="ai-bubble__skip">Показать сразу</span>' : ""}
        <span class="ai-bubble__translation">${esc(reply.reply_ru || "")}</span>
        ${reply.reply_ru ? '<span class="ai-bubble__translation-toggle">Показать перевод</span>' : ""}
      </div>${extrasMarkup(reply)}`;
    $(".ai-bubble__text", article).textContent = animate && !reducedMotion() ? "" : (reply.reply_ba || "");
    $$(".ai-extra", article).forEach((extra, index) => { extra.style.setProperty("--extra-order", index); });
    const bubble = $(".ai-bubble", article);
    const activate = () => {
      if (state.typing && !article.classList.contains("is-typed")) state.skipTyping = true;
      else if (reply.reply_ru) toggleTranslation(article);
    };
    bubble.addEventListener("click", activate);
    bubble.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); activate(); }
    });
    log.append(article);
    scrollLog();
    if (animate) typeText(article, reply.reply_ba || "", requestId);
    return article;
  }

  function appendUser(text, animate = true) {
    const article = document.createElement("article");
    article.className = "ai-message ai-message--user";
    if (!animate) article.classList.add("no-animation");
    article.innerHTML = `<div class="ai-bubble ai-bubble--user">${esc(text)}</div>`;
    log.append(article);
    scrollLog();
  }

  function renderHistory(messages) {
    log.innerHTML = "";
    messages.forEach((message) => {
      if (message.role === "user") appendUser(message.text, false);
      else appendAssistant(message.reply || { reply_ba: message.text, reply_ru: message.meta?.reply_ru || "" });
    });
    scrollLog();
  }

  function showTyping() {
    hideTyping();
    const article = document.createElement("article");
    article.className = "ai-message ai-message--assistant ai-typing";
    article.id = "dialog-typing";
    article.innerHTML = '<div class="ai-bubble ai-bubble--assistant" aria-label="Собеседник печатает"><span></span><span></span><span></span></div>';
    log.append(article);
    scrollLog();
  }

  function hideTyping() {
    $("#dialog-typing")?.remove();
  }

  function renderHints(value) {
    const hints = Array.isArray(value) ? value : String(value || "").split("|").map((item) => item.trim()).filter(Boolean);
    const container = $("#dialog-hints");
    container.innerHTML = hints.slice(0, 4).map((hint) => `<button class="chip" type="button">${esc(hint)}</button>`).join("");
    container.hidden = !hints.length;
    $$("button", container).forEach((button) => button.addEventListener("click", () => {
      input.value = button.textContent;
      updateSendState();
      input.focus();
    }));
  }

  function updateSendState() {
    sendButton.disabled = state.busy || !input.value.trim() || state.dailyLeft <= 0;
  }

  function renderLimit() {
    state.dailyLeft = 0;
    input.disabled = true;
    sendButton.disabled = true;
    renderHints([]);
    const card = document.createElement("div");
    card.className = "ai-limit-card";
    card.innerHTML = `<img src="${spriteUrl("bear", "special")}" width="112" height="112" alt="Айыу спит"><strong>На сегодня диалоги закончились</strong><p>Возвращайся завтра — история сохранится.</p>`;
    log.append(card);
    scrollLog();
  }

  async function open(mode, scenarioId = null) {
    if (!state.enabled) { showToast("Диалоги скоро откроются"); return; }
    const scenario = mode === "scenario" ? state.scenarios.find((item) => item.id === scenarioId) : null;
    if (mode === "scenario" && !scenario) { showToast("Сценарий не найден"); return; }
    if (scenario && !scenario.unlocked) { showToast("Сначала пройди первый этап курса"); return; }
    state.requestId += 1;
    const requestId = state.requestId;
    state.mode = mode;
    state.scenario = scenario;
    state.character = mode === "tutor" ? "boy" : scenario.character;
    state.session = null;
    state.busy = false;
    state.lastFocus = document.activeElement;
    configureCharacter();
    $("#dialog-results").hidden = true;
    sheet.hidden = true;
    modal.hidden = false;
    document.body.classList.add("modal-open");
    log.innerHTML = '<div class="state-block"><span class="spinner" aria-hidden="true"></span><span>Открываем диалог…</span></div>';
    composer.hidden = true;
    initBashkirKeyboards(modal);
    await preload([state.character]);
    try {
      const created = await apiRequest("/ai/sessions", {
        method: "POST",
        body: { mode, ...(mode === "scenario" ? { scenario_id: scenarioId } : {}) },
      });
      const history = await apiRequest(`/ai/sessions/${created.session_id}`);
      if (requestId !== state.requestId) return;
      state.session = history.session;
      renderHistory(history.messages);
      composer.hidden = history.session.status !== "active";
      input.disabled = state.dailyLeft <= 0;
      updateSendState();
      const lastAssistant = [...history.messages].reverse().find((message) => message.role === "assistant");
      const hasUserMessage = history.messages.some((message) => message.role === "user");
      renderHints(!hasUserMessage && scenario ? scenario.hint_chips : lastAssistant?.reply?.hint || "");
      if (state.dailyLeft <= 0) renderLimit();
      input.focus({ preventScroll: true });
    } catch (error) {
      if (requestId !== state.requestId) return;
      log.innerHTML = `<div class="error-state"><strong>Диалог не открылся</strong><p>${esc(error.message)}</p></div>`;
      showToast(error.status === 429 ? "На сегодня диалоги закончились" : "Сервер временно недоступен");
      if (error.status === 429) renderLimit();
    }
  }

  async function send(event) {
    event.preventDefault();
    const text = input.value.trim();
    if (!text || state.busy || !state.session || state.session.status !== "active") return;
    state.busy = true;
    const requestId = state.requestId;
    input.value = "";
    input.disabled = true;
    updateSendState();
    appendUser(text);
    renderHints([]);
    showTyping();
    setEmotion("thinking");
    try {
      const reply = await apiRequest(`/ai/sessions/${state.session.id}/messages`, {
        method: "POST",
        body: { text },
      });
      if (requestId !== state.requestId) return;
      state.dailyLeft = Math.max(0, state.dailyLeft - 1);
      hideTyping();
      setEmotion(reply.emotion || "idle");
      appendAssistant(reply, { animate: true, requestId });
      renderHints(reply.hint || "");
    } catch (error) {
      if (requestId !== state.requestId) return;
      hideTyping();
      setEmotion("fail");
      if (error.status === 429) {
        showToast("На сегодня диалоги закончились, возвращайся завтра");
        renderLimit();
      } else {
        showToast("Сервер временно недоступен");
        appendAssistant({
          reply_ba: "Ағай, мин аңламаҙым. Тағы бер тапҡыр әйтегеҙ.",
          reply_ru: "Не удалось получить ответ. Попробуй ещё раз чуть позже.",
          emotion: "fail",
        });
      }
    } finally {
      if (requestId === state.requestId) {
        state.busy = false;
        input.disabled = state.dailyLeft <= 0;
        updateSendState();
        if (state.dailyLeft > 0) input.focus({ preventScroll: true });
      }
    }
  }

  function closeSheet() {
    sheet.hidden = true;
    $("#dialog-close").focus({ preventScroll: true });
  }

  function closeModal() {
    state.requestId += 1;
    state.typing = false;
    state.skipTyping = true;
    clearTimeout(state.emotionTimer);
    sheet.hidden = true;
    modal.hidden = true;
    $("#dialog-results").hidden = true;
    document.body.classList.remove("modal-open");
    state.session = null;
    if (state.lastFocus instanceof HTMLElement && state.lastFocus.isConnected) state.lastFocus.focus({ preventScroll: true });
  }

  function requestAction(mode) {
    if (!state.session) { closeModal(); return; }
    if (state.busy) { showToast("Дождись ответа собеседника"); return; }
    state.sheetMode = mode;
    const finishing = mode === "finish";
    $("#dialog-action-title").textContent = finishing ? "Завершить диалог?" : "Выйти из диалога?";
    $("#dialog-action-text").textContent = finishing
      ? "Покажем статистику. После трёх твоих сообщений начислим 30 очков."
      : "Сообщения сохранятся, можно будет продолжить позже.";
    $("#dialog-action-confirm").textContent = finishing ? "Завершить" : "Выйти";
    sheet.hidden = false;
    $("#dialog-stay").focus({ preventScroll: true });
  }

  function countPoints(element, points) {
    element.textContent = reducedMotion() ? `+${points}` : "+0";
    if (reducedMotion() || !points) return;
    const started = performance.now();
    const tick = (now) => {
      const progress = Math.min(1, (now - started) / 650);
      element.textContent = `+${Math.round(points * (1 - (1 - progress) ** 3))}`;
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function showResults(result) {
    const results = $("#dialog-results");
    const report = result.report;
    results.innerHTML = `<div class="ai-results__confetti" aria-hidden="true">${Array.from({ length: 9 }, (_, index) => `<svg style="--honey-order:${index}"><use href="#i-honey"></use></svg>`).join("")}</div>
      <img class="ai-results__mascot" src="${spriteUrl(state.character, result.points ? "special" : "success")}" width="184" height="184" alt="">
      <span class="ai-results__eyebrow">Диалог завершён</span><h2 lang="ba">Афарин!</h2>
      <div class="ai-results__points">${icon("i-honey")}<strong id="dialog-result-points">+0</strong><span>очков</span></div>
      <div class="ai-results__stats"><div><strong>${report.messages_count}</strong><span>сообщений</span></div><div><strong>${report.corrections_count}</strong><span>исправлений</span></div><div><strong>${report.new_words}</strong><span>новых слов</span></div></div>
      ${!result.points ? '<p class="muted">Для 30 очков напиши в новом диалоге хотя бы три сообщения.</p>' : ""}
      <div class="ai-results__actions"><button class="btn btn-primary btn-lg" id="dialog-again" type="button">Ещё раз</button><button class="btn btn-ghost btn-lg" id="dialog-to-hub" type="button">К диалогам</button></div>`;
    results.hidden = false;
    countPoints($("#dialog-result-points"), result.points);
    $("#dialog-again").addEventListener("click", () => open(state.mode, state.scenario?.id));
    $("#dialog-to-hub").addEventListener("click", () => { closeModal(); options.onGoHub?.(); });
    $("#dialog-again").focus({ preventScroll: true });
  }

  async function finish() {
    if (!state.session) return;
    const button = $("#dialog-action-confirm");
    button.disabled = true;
    button.textContent = "Завершаем…";
    try {
      const result = await apiRequest(`/ai/sessions/${state.session.id}/finish`, { method: "POST" });
      sheet.hidden = true;
      state.session.status = "finished";
      options.onPoints?.(result.total_points);
      showResults(result);
      try { await refresh(); } catch { /* Итог уже показан; список обновится при следующем открытии. */ }
    } catch (error) {
      showToast(error.message || "Сервер временно недоступен");
    } finally {
      button.disabled = false;
      button.textContent = "Завершить";
    }
  }

  function trapFocus(event) {
    if (modal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (!sheet.hidden) closeSheet();
      else requestAction("close");
      return;
    }
    if (event.key !== "Tab") return;
    const results = $("#dialog-results");
    const root = !sheet.hidden ? sheet : !results.hidden ? results : modal;
    const focusable = $$('button:not([disabled]), input:not([disabled]), [tabindex="0"]', root).filter((element) => !element.hidden && element.getClientRects().length);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  $("#dialog-form").addEventListener("submit", send);
  input.addEventListener("input", updateSendState);
  $("#dialog-close").addEventListener("click", () => requestAction("close"));
  $("#dialog-finish").addEventListener("click", () => requestAction("finish"));
  $("#dialog-stay").addEventListener("click", closeSheet);
  $("#dialog-action-confirm").addEventListener("click", () => state.sheetMode === "finish" ? finish() : closeModal());
  sheet.addEventListener("click", (event) => { if (event.target === sheet) closeSheet(); });
  document.addEventListener("keydown", trapFocus, true);
  initBashkirKeyboards(modal);

  return {
    show,
    refresh,
    open,
    close: closeModal,
    isEnabled: () => state.enabled,
    scenarioForUnit: (unitId) => state.enabled ? state.scenarios.find((item) => item.unit_id === unitId) : null,
    reset: () => {
      closeModal();
      state.enabled = false;
      state.scenarios = [];
      state.error = "";
      state.dailyLeft = 0;
    },
  };
}
