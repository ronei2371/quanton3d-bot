import { connectToMongo, isConnected } from "../../db.js";
import { getRAGInfo } from "../../rag-search.js";

/**
 * Garante que o MongoDB está pronto
 * @returns {Promise<boolean>}
 */
export async function ensureMongoReady() {
  try {
    if (isConnected()) {
      return true;
    }

    if (process.env.MONGODB_URI) {
      await connectToMongo();
      return isConnected();
    }

    return false;
  } catch (error) {
    console.error("[COMMON] Erro ao conectar MongoDB:", error.message);
    return false;
  }
}

/**
 * Verifica se o MongoDB deve ser inicializado
 * @returns {boolean}
 */
export function shouldInitMongo() {
  return Boolean(process.env.MONGODB_URI);
}

/**
 * Verifica se o RAG deve ser inicializado
 * @returns {boolean}
 */
export function shouldInitRAG() {
  // RAG precisa de OpenAI API e MongoDB
  const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
  const hasMongo = Boolean(process.env.MONGODB_URI);

  if (!hasOpenAI) {
    return false;
  }

  if (!hasMongo) {
    return false;
  }

  // Verificar se RAG está inicializado
  try {
    const ragInfo = getRAGInfo();
    return ragInfo.isInitialized && ragInfo.documentsCount > 0;
  } catch (error) {
    return false;
  }
}

/**
 * Formata erro para resposta da API
 * @param {Error} error
 * @returns {object}
 */
export function formatApiError(error) {
  return {
    success: false,
    error: error.message || "Erro desconhecido",
    code: error.code || "UNKNOWN_ERROR",
    timestamp: new Date().toISOString()
  };
}

export default {
  ensureMongoReady,
  shouldInitMongo,
  shouldInitRAG,
  formatApiError
};
