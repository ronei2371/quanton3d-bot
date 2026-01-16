// =========================
// API Client - Quanton3D
// Cliente para consumir a API do backend
// =========================

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

  // Remove /api do final se existir (CORREÇÃO CRÍTICA)
  let baseUrl = viteApi || browserApi || DEFAULT_API_BASE;
  baseUrl = baseUrl.replace(/\/api\/?$/, "");

  return normalizeUrl(baseUrl);
}

const API_BASE = resolveApiBase();

console.log("🔗 [apiClient] URL base:", API_BASE);

async function request(path, options = {}) {
  // Garantir que path comece com /
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const url = `${API_BASE}${normalizedPath}`;

  console.log("📤 [apiClient]", options.method || "GET", url);

  const config = {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    },
    ...options
  };

  try {
    const response = await fetch(url, config);

    // Verificar se resposta é JSON
    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      console.error("❌ [apiClient] Resposta não é JSON:", contentType);
      throw new Error(`Servidor retornou ${contentType} ao invés de JSON`);
    }

    const data = await response.json();

    if (!response.ok) {
      const error = new Error(data.error || data.message || "Erro na requisição");
      error.status = response.status;
      error.data = data;
      throw error;
    }

    console.log("✅ [apiClient] Sucesso");
    return data;
  } catch (error) {
    console.error("❌ [apiClient] Erro:", error.message);
    throw error;
  }
}

// =========================
// FUNÇÕES PÚBLICAS
// =========================

export async function fetchResins() {
  return request("/api/resins");
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
  return request("/api/ask", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function sendChatWithImage(payload) {
  return request("/api/ask-with-image", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function sendContact(payload) {
  return request("/api/contact", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function sendCustomRequest(payload) {
  return request("/api/custom-request", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function sendSuggestion(payload) {
  return request("/api/suggest-knowledge", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function fetchGallery(page = 1, limit = 12) {
  return request(`/api/gallery?page=${page}&limit=${limit}`);
}

export async function uploadToGallery(payload) {
  return request("/api/gallery", {
    method: "POST",
    body: JSON.stringify(payload || {})
  });
}

export async function loginAdmin(credentials) {
  return request("/auth/login", {
    method: "POST",
    body: JSON.stringify(credentials || {})
  });
}

export default {
  fetchResins,
  fetchPrinters,
  registerUser,
  sendChatMessage,
  sendChatWithImage,
  sendContact,
  sendCustomRequest,
  sendSuggestion,
  fetchGallery,
  uploadToGallery,
  loginAdmin
};
