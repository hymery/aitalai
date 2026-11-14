import { pickLine } from "./lines.ba.js";

const BASE = import.meta.env.BASE_URL + "characters/";
const mk = (id, special, extra = {}) => ({
  idle: `${id}_idle.webp`,
  success: `${id}_success.webp`,
  fail: `${id}_fail.webp`,
  special,
  ...extra,
});

export const CHARACTERS = {
  boy: { name: "Мальчик", facing: "right", sprites: mk("boy", "boy_starstuck.webp", { thinking: "boy_thinking.webp", combo: "boy_combo.webp" }) },
  girl: { name: "Девочка", facing: "right", sprites: mk("girl", "girl_sassy.webp") },
  granny: { name: "Өләсәй", facing: "right", sprites: mk("granny", "granny_TeaTime.webp") },
  bear: { name: "Айыу", facing: "right", sprites: mk("bear", "bear_sleepy.webp") },
  akbuzat: { name: "Акбузат", facing: "right", sprites: mk("akbuzat", "akbuzat_flying.webp") },
};

const FALLBACK = { thinking: "idle", combo: "success", special: "success" };
const cache = new Map();
const returnTimers = new WeakMap();
let streak = 0;

export function spriteUrl(id, state = "idle") {
  const character = CHARACTERS[id] || CHARACTERS.boy;
  const sprites = character.sprites;
  return BASE + (sprites[state] || sprites[FALLBACK[state]] || sprites.idle);
}

export function preload(ids) {
  const jobs = [...new Set(ids)].filter((id) => CHARACTERS[id]).flatMap((id) => Object.values(CHARACTERS[id].sprites).map((file) => {
    const url = BASE + file;
    if (!cache.has(url)) {
      const img = new Image();
      img.decoding = "async";
      img.src = url;
      cache.set(url, img.decode().catch(() => {}));
    }
    return cache.get(url);
  }));
  return Promise.race([Promise.all(jobs), new Promise((resolve) => setTimeout(resolve, 800))]);
}

function esc(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

export function mascotFallback() {
  return '<span class="character character--fallback mascot-fallback" aria-hidden="true"></span>';
}

export function characterStage(id, line = "", options = {}) {
  const character = CHARACTERS[id] || CHARACTERS.boy;
  const state = options.state || "idle";
  const stacked = options.stacked || (options.lang === "ba" && line.length > 12);
  const classes = ["stage", "character-stage", stacked ? "stage--stacked-speech" : "", options.className || ""].filter(Boolean).join(" ");
  const speechClasses = ["cloud", "speech", "cloud--right", options.lang === "ba" ? "cloud--ba" : "", options.right ? "speech--right" : ""].filter(Boolean).join(" ");
  const facing = options.facing || character.facing || "right";
  const tts = options.tts ? `<button class="btn btn-ghost btn-icon speech__audio" type="button" data-character-tts="${esc(options.tts)}" aria-label="Прослушать фразу"><svg class="icon" aria-hidden="true"><use href="#i-volume"></use></svg></button>` : "";
  return `<div class="${classes}" data-character-stage data-emotion="${esc(state)}">
    <div class="mascot-crop" data-facing="${esc(facing)}">
      <div class="character stage__mascot${options.static ? " character--static" : ""}" data-char="${esc(character === CHARACTERS[id] ? id : "boy")}" data-state="${esc(state)}" data-emotion="${esc(state)}" aria-hidden="true">
        <img class="character__img" src="${spriteUrl(id, state)}" width="512" height="512" alt="" decoding="async" draggable="false">
        <svg class="character__spark" aria-hidden="true"><use href="#i-spark"></use></svg><svg class="character__spark" aria-hidden="true"><use href="#i-spark"></use></svg><svg class="character__spark" aria-hidden="true"><use href="#i-spark"></use></svg>
      </div>
    </div>
    <div class="${speechClasses}">${tts}<span class="speech__text" ${options.lang === "ba" ? 'lang="ba"' : ""}>${esc(line)}</span></div>
  </div>`;
}

export function setState(stageEl, state, line) {
  if (!stageEl) return;
  const hero = stageEl.querySelector(".character");
  const img = stageEl.querySelector(".character__img");
  if (!hero || !img) return;
  img.src = spriteUrl(hero.dataset.char, state);
  hero.removeAttribute("data-state");
  void hero.offsetWidth;
  hero.dataset.state = state;
  hero.dataset.emotion = state;
  stageEl.dataset.emotion = state;
  if (line !== undefined && stageEl.querySelector(".speech__text")) stageEl.querySelector(".speech__text").textContent = line;
}

export function reactToAnswer(stageEl, ok, idleLine = "") {
  const state = onAnswer(ok);
  setState(stageEl, state, pickLine(state));
  clearTimeout(returnTimers.get(stageEl));
  const timer = setTimeout(() => setState(stageEl, "idle", idleLine), state === "special" ? 1600 : 1200);
  returnTimers.set(stageEl, timer);
  return state;
}

export function onAnswer(ok) {
  streak = ok ? streak + 1 : 0;
  if (!ok) return "fail";
  if (streak % 3 === 0) return "special";
  if (streak === 2) return "combo";
  return "success";
}

export const resetStreak = () => { streak = 0; };

document.addEventListener("error", (event) => {
  const img = event.target;
  if (!(img instanceof HTMLImageElement) || !img.classList.contains("character__img")) return;
  img.closest(".character")?.classList.add("character--fallback", "mascot-fallback");
  img.hidden = true;
}, true);
