// Cliente simples para consumir a API pública do Quanton3D Bot.
// Não depende de variáveis do backend como MONGODB_URI, evitando expor
// dados sensíveis no frontend.

const DEFAULT_API_BASE = "https://quanton3d-bot-v2.onrender.com";

const normalizeUrl = (url) => url.replace(/\/$/, "");

function resolveApiBase() {
  const viteApi =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_API_URL
      : undefined;
  const browserApi =
    typeof window !== "undefined"
      ? window.API_BASE_URL || window.VITE_API_URL || window.env?.VITE_API_URL
      : undefined;

  return normalizeUrl(viteApi || browserApi || DEFAULT_API_BASE);
}

const API_BASE = resolveApiBase();

async function request(path, options = {}) {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  const response = await fetch(url, config);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || data.message || "Erro na requisição");
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

export async function fetchResins() {
  return request("/resins");
}

export async function fetchPrinters(resinId) {
  const query = resinId ? `?resinId=${encodeURIComponent(resinId)}` : "";
  return request(`/api/params/printers${query}`);
}

export async function registerUser(payload) {
  return request("/api/register-user", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function sendChatMessage(payload) {
  return request("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export default {
  fetchResins,
  fetchPrinters,
  registerUser,
  sendChatMessage
};
