import { API_URL, getStoredToken } from "./api.js";

let activeAudio = null;
let activeUrl = "";
let activeButton = null;
let requestId = 0;

function clearActive() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.src = "";
  }
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeButton?.classList.remove("is-speaking", "is-loading");
  activeButton?.removeAttribute("aria-busy");
  activeAudio = null;
  activeUrl = "";
  activeButton = null;
}

export async function speakBashkir(text, button = null) {
  const cleanText = String(text || "").trim();
  if (!cleanText) return;
  clearActive();
  const currentRequest = ++requestId;
  activeButton = button;
  button?.classList.add("is-loading");
  button?.setAttribute("aria-busy", "true");

  const response = await fetch(`${API_URL}/api/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "audio/wav",
      ...(getStoredToken() ? { Authorization: `Bearer ${getStoredToken()}` } : {}),
    },
    body: JSON.stringify({ text: cleanText }),
  });
  if (!response.ok) {
    let detail = "Не удалось запустить башкирскую озвучку.";
    try {
      const payload = await response.json();
      if (payload.detail) detail = payload.detail;
    } catch {
      // Сохраняем понятное сообщение без чтения бинарного ответа.
    }
    throw new Error(detail);
  }
  const blob = await response.blob();
  if (currentRequest !== requestId) return;
  activeUrl = URL.createObjectURL(blob);
  const audio = new Audio(activeUrl);
  activeAudio = audio;
  button?.classList.remove("is-loading");
  button?.classList.add("is-speaking");
  button?.removeAttribute("aria-busy");
  audio.addEventListener("ended", clearActive, { once: true });
  audio.addEventListener("error", () => {
    if (activeAudio === audio) clearActive();
  }, { once: true });
  await audio.play();
}
