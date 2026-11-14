const TARGET_SELECTOR = [
  "#dictionary-search",
  "#proposal-ba",
  "#proposal-ru",
  "#proposal-example",
  "#daily-correction",
  "[data-bashkir-input]",
].join(",");

const SPECIAL_LETTERS = ["ә", "ө", "ү", "ҡ", "ғ", "ҫ", "ҙ", "һ", "ң"];
const KEYBOARD_ROWS = [
  [..."абвгғдеёжзҙи"],
  [..."йкҡлмнңоөпрс"],
  [..."ҫтуүфхһцчшщъы"],
  [..."ьэәюя"],
];

const keyboardIcon = `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="2.5" y="5" width="19" height="14" rx="3" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 12h.01M10 12h.01M14 12h.01M18 12h.01M7 15h10" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const shiftIcon = `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="m12 4 7 8h-4v6H9v-6H5l7-8Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const backspaceIcon = `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M20 6H9L3 12l6 6h11V6Z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/><path d="m11 9 5 6m0-6-5 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;

let activeInstance = null;
let instanceId = 0;

function emitInput(input) {
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

function insertText(input, text) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  input.setRangeText(text, start, end, "end");
  input.focus({ preventScroll: true });
  emitInput(input);
}

function removeBeforeCaret(input) {
  const start = input.selectionStart ?? input.value.length;
  const end = input.selectionEnd ?? start;
  if (start !== end) {
    input.setRangeText("", start, end, "end");
  } else if (start > 0) {
    input.setRangeText("", start - 1, start, "end");
  } else {
    input.focus({ preventScroll: true });
    return;
  }
  input.focus({ preventScroll: true });
  emitInput(input);
}

function makeButton(className, label, ariaLabel = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.innerHTML = label;
  if (ariaLabel) button.setAttribute("aria-label", ariaLabel);
  return button;
}

function mountInput(input) {
  if (!(input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement)) return;
  if (input.dataset.baKeyboardMounted === "true" || input.disabled || input.readOnly) return;
  if (input instanceof HTMLInputElement && ["email", "password", "number", "date", "checkbox", "radio"].includes(input.type)) return;

  const id = `ba-keyboard-${++instanceId}`;
  const instance = { input, shift: false, caps: false, panel: null, toggle: null, letterKeys: [] };
  input.dataset.baKeyboardMounted = "true";
  input.classList.add("ba-keyboard-input");

  const shell = document.createElement("div");
  shell.className = "ba-input-shell";
  input.before(shell);
  shell.append(input);

  const toggle = makeButton("ba-keyboard-toggle", keyboardIcon, "Открыть башкирскую экранную клавиатуру");
  toggle.setAttribute("aria-controls", id);
  toggle.setAttribute("aria-expanded", "false");
  instance.toggle = toggle;
  shell.append(toggle);

  const quickbar = document.createElement("div");
  quickbar.className = "ba-quickbar";
  quickbar.setAttribute("role", "toolbar");
  quickbar.setAttribute("aria-label", "Башкирские буквы");

  const quickShift = makeButton("ba-key ba-key--shift", shiftIcon, "Переключить регистр");
  quickShift.setAttribute("aria-pressed", "false");
  quickShift.dataset.action = "shift";
  quickbar.append(quickShift);
  SPECIAL_LETTERS.forEach((letter) => {
    const key = makeButton("ba-key ba-key--special", `${letter.toUpperCase()}${letter}`, `Вставить ${letter.toUpperCase()} или ${letter}`);
    key.dataset.letter = letter;
    quickbar.append(key);
    instance.letterKeys.push(key);
  });
  shell.after(quickbar);

  const panel = document.createElement("div");
  panel.className = "ba-full-keyboard";
  panel.id = id;
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "Башкирская экранная клавиатура");

  KEYBOARD_ROWS.forEach((letters) => {
    const row = document.createElement("div");
    row.className = "ba-keyboard-row";
    letters.forEach((letter) => {
      const key = makeButton("ba-key ba-key--letter", letter, `Буква ${letter}`);
      key.dataset.letter = letter;
      row.append(key);
      instance.letterKeys.push(key);
    });
    panel.append(row);
  });

  const controls = document.createElement("div");
  controls.className = "ba-keyboard-row ba-keyboard-row--controls";
  const caps = makeButton("ba-key ba-key--control", "Caps", "Фиксировать верхний регистр");
  caps.dataset.action = "caps";
  caps.setAttribute("aria-pressed", "false");
  const backspace = makeButton("ba-key ba-key--control", backspaceIcon, "Удалить символ");
  backspace.dataset.action = "backspace";
  const space = makeButton("ba-key ba-key--space", "Пробел", "Вставить пробел");
  space.dataset.action = "space";
  controls.append(caps, space, backspace);
  if (input instanceof HTMLTextAreaElement) {
    const enter = makeButton("ba-key ba-key--control", "Enter", "Новая строка");
    enter.dataset.action = "enter";
    controls.append(enter);
  }
  panel.append(controls);
  quickbar.after(panel);
  instance.panel = panel;

  function updateCase() {
    const uppercase = instance.caps !== instance.shift;
    instance.letterKeys.forEach((key) => {
      const letter = key.dataset.letter;
      if (key.classList.contains("ba-key--special")) {
        key.textContent = `${letter.toUpperCase()}${letter}`;
        key.classList.toggle("is-uppercase", uppercase);
      } else {
        key.textContent = uppercase ? letter.toUpperCase() : letter;
      }
    });
    quickShift.classList.toggle("is-active", instance.shift);
    quickShift.setAttribute("aria-pressed", String(instance.shift));
    caps.classList.toggle("is-active", instance.caps);
    caps.setAttribute("aria-pressed", String(instance.caps));
  }

  function setOpen(open) {
    panel.hidden = !open;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", `${open ? "Закрыть" : "Открыть"} башкирскую экранную клавиатуру`);
    shell.classList.toggle("is-keyboard-open", open);
    if (!open && activeInstance === instance) activeInstance = null;
  }

  function close() {
    setOpen(false);
  }
  instance.close = close;

  toggle.addEventListener("click", () => {
    if (activeInstance && activeInstance !== instance) activeInstance.close();
    const open = panel.hidden;
    setOpen(open);
    if (open) activeInstance = instance;
    input.focus({ preventScroll: true });
  });

  [quickbar, panel].forEach((keyboard) => {
    keyboard.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) event.preventDefault();
    });
    keyboard.addEventListener("click", (event) => {
      const key = event.target.closest("button");
      if (!key) return;
      if (activeInstance && activeInstance !== instance) activeInstance.close();
      activeInstance = instance;
      if (key.dataset.letter) {
        const uppercase = instance.caps !== instance.shift;
        const letter = uppercase ? key.dataset.letter.toUpperCase() : key.dataset.letter;
        insertText(input, letter);
        if (instance.shift) {
          instance.shift = false;
          updateCase();
        }
        return;
      }
      const action = key.dataset.action;
      if (action === "shift") {
        instance.shift = !instance.shift;
        updateCase();
        input.focus({ preventScroll: true });
      }
      if (action === "caps") {
        instance.caps = !instance.caps;
        updateCase();
        input.focus({ preventScroll: true });
      }
      if (action === "space") insertText(input, " ");
      if (action === "enter") insertText(input, "\n");
      if (action === "backspace") removeBeforeCaret(input);
    });
  });

  input.addEventListener("focusin", () => {
    if (activeInstance && activeInstance !== instance) activeInstance.close();
    activeInstance = instance;
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      event.stopPropagation();
      close();
      input.focus({ preventScroll: true });
    }
  });
}

export function initBashkirKeyboards(root = document) {
  if (root instanceof Element && root.matches(TARGET_SELECTOR)) mountInput(root);
  root.querySelectorAll?.(TARGET_SELECTOR).forEach(mountInput);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => initBashkirKeyboards(), { once: true });
} else {
  initBashkirKeyboards();
}

const keyboardObserver = new MutationObserver((records) => {
  records.forEach((record) => record.addedNodes.forEach((node) => {
    if (node instanceof Element) initBashkirKeyboards(node);
  }));
});
keyboardObserver.observe(document.documentElement, { childList: true, subtree: true });
