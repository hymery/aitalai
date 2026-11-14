const viteApiUrl = typeof __AITALAI_API_URL__ !== "undefined"
  ? __AITALAI_API_URL__
  : "";

export const API_URL = String(
  viteApiUrl || window.AITALAI_API_URL || "http://localhost:8000"
).replace(/\/$/, "");

const TOKEN_KEY = "aitalai.jwt";

export class ApiError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export function getStoredToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function saveToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // Приложение продолжит работать в рамках текущей вкладки.
  }
}

function errorDetail(payload, status) {
  if (payload && typeof payload.detail === "string") return payload.detail;
  if (payload && Array.isArray(payload.errors)) {
    return payload.errors.map((item) => item.message).filter(Boolean).join(" ");
  }
  if (status === 401) return "Сессия истекла. Войдите снова.";
  if (status === 403) return "Этот раздел недоступен для вашей роли.";
  if (status === 404) return "Запрошенные данные не найдены.";
  if (status >= 500) return "Сервер временно недоступен. Повторите попытку.";
  return `Запрос завершился с ошибкой (${status}).`;
}

export async function apiRequest(path, options = {}) {
  const token = options.token === undefined ? getStoredToken() : options.token;
  const headers = { Accept: "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (options.body !== undefined) headers["Content-Type"] = "application/json";

  let response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(
      `Не удалось подключиться к API ${API_URL}. Проверьте, что backend запущен.`
    );
  }

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // У ошибки может не быть JSON-тела.
    }
    throw new ApiError(errorDetail(payload, response.status), response.status);
  }

  if (options.responseType === "blob") return response.blob();
  if (response.status === 204) return null;
  return response.json();
}

export async function fetchTelegramToken(telegramId) {
  const payload = await apiRequest(`/bot/state/${encodeURIComponent(telegramId)}`, {
    token: "",
  });
  const data = payload && typeof payload.data === "object" ? payload.data : {};
  return data.token || "";
}
