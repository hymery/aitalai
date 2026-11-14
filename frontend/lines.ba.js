// Реплики из мастер-промпта. Русский перевод оставлен для проверки преподавателем.
export const LINES = {
  success: [
    { ba: "Шәп!", ru: "Молодец!" },
    { ba: "Бик яҡшы!", ru: "Очень хорошо!" },
    { ba: "Дөрөҫ!", ru: "Верно!" },
  ],
  special: [{ ba: "Афарин!", ru: "Браво!" }],
  fail: [
    { ba: "Эх, яңылыш…", ru: "Эх, ошибка…" },
    { ba: "Тағы бер тапҡыр!", ru: "Попробуй ещё раз!" },
  ],
};

export function pickLine(state) {
  const pool = LINES[state] || [];
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)].ba;
}
