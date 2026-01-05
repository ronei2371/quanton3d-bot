// Cliente robusto para a API pública do Quanton3D Bot (frontend seguro).
// Garante:
// 1) Nunca expõe chaves sensíveis.
// 2) Monta a URL base sem duplicar /api.
// 3) Retorna resultados seguros ([], objetos com success:false) mesmo em falha.

const DEFAULT_API_BASE = "https://quanton3d-bot-v2.onrender.com/api";

const normalizeUrl = (url) => (url || "").replace(/\/+$/, "");

function resolveBaseUrls() {
  const viteApi =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_API_URL
      : undefined;
  const browserApi =
    typeof window !== "undefined"
      ? window.API_BASE_URL || window.VITE_API_URL || window.env?.VITE_API_URL
      : undefined;

  const raw = normalizeUrl(viteApi || browserApi || DEFAULT_API_BASE);
  const hasApiSuffix = /\/api$/i.test(raw);
  const apiBase = hasApiSuffix ? raw : `${raw}/api`;
  const rootBase = hasApiSuffix ? raw.replace(/\/api$/i, "") : raw;

  return { apiBase, rootBase };
}

const { apiBase: API_BASE, rootBase: ROOT_BASE } = resolveBaseUrls();

async function request(path, options = {}, { useRoot = false } = {}) {
  const base = useRoot ? ROOT_BASE : API_BASE;
  const url = `${base}${path.startsWith("/") ? path : `/${path}`}`;
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  try {
    const response = await fetch(url, config);
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data.error || data.message || "Erro na requisição"
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return data;
  } catch (error) {
    console.error(`[apiClient] Falha em ${url}:`, error);
    if (options.expectArray) return [];
    return {
      success: false,
      error: error?.message || "Erro inesperado ao acessar a API"
    };
  }
}

export async function fetchResins() {
  const data = await request("/resins", { expectArray: true }, { useRoot: true });
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.resins)) return data.resins;
  return [];
}

export async function fetchPrinters(resinId) {
  const query = resinId ? `?resinId=${encodeURIComponent(resinId)}` : "";
  const data = await request(
    `/params/printers${query}`,
    { expectArray: true },
    { useRoot: false }
  );
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.printers)) return data.printers;
  return [];
}

export async function registerUser(payload) {
  return request(
    "/register-user",
    {
      method: "POST",
      body: JSON.stringify(payload || {})
    },
    { useRoot: false }
  );
}

export async function sendChatMessage(payload) {
  return request(
    "/chat",
    {
      method: "POST",
      body: JSON.stringify(payload || {})
    },
    { useRoot: false }
  );
}

export default {
  fetchResins,
  fetchPrinters,
  registerUser,
  sendChatMessage
};
