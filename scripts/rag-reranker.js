// rag-reranker.js
// ===== SISTEMA DE RE-RANKING INTELIGENTE =====
// Reordena os documentos retornados pelo RAG usando GPT-4o-mini

import OpenAI from "openai";
import dotenv from "dotenv";

dotenv.config();

let openaiClient = null;

function getRerankerClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY nao configurada");
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey });
  }
  return openaiClient;
}

/**
 * Re-ranqueia documentos usando GPT-4o para melhor relevância
 * @param {string} query - Pergunta do usuário
 * @param {Array} documents - Documentos retornados pelo RAG
 * @returns {Array} - Documentos reordenados por relevância
 */
export async function rerankDocuments(query, documents) {
  if (!documents || documents.length === 0) {
    return [];
  }

  try {
    const client = getRerankerClient();
    console.log(`🔄 [RE-RANKING] Reordenando ${documents.length} documentos...`);

    // Preparar documentos para análise (limite de 500 caracteres por documento)
    const docsForAnalysis = documents.map((doc, index) => {
      // Garante que sempre tenha algum texto para enviar
      const rawContent =
        doc.content ||
        doc.text ||
        doc.body ||
        JSON.stringify(doc, null, 2).substring(0, 500);

      return {
        index,
        content: String(rawContent).substring(0, 500),
      };
    });

    // Prompt para GPT-4o analisar relevância
    const rerankPrompt = `Você é um especialista em impressão 3D com resina da Quanton3D.

PERGUNTA DO USUÁRIO:
"${query}"

DOCUMENTOS ENCONTRADOS:
${docsForAnalysis
  .map((doc, i) => `[${i}] ${doc.content}`)
  .join("\n\n")}

TAREFA:
Analise qual documento é MAIS RELEVANTE para responder a pergunta.
Considere:
1. Responde diretamente a pergunta?
2. Contém informações específicas sobre o problema/resina mencionada?
3. Tem soluções práticas e acionáveis?

RESPONDA APENAS com os índices em ordem de relevância (mais relevante primeiro).
Formato: 2,0,4,1,3

ÍNDICES:`;

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini", // mais barato e rápido para re-ranking
      temperature: 0,
      messages: [
        { role: "system", content: "Você é um especialista em ranking de documentos." },
        { role: "user", content: rerankPrompt },
      ],
      max_tokens: 50,
    });

    const rankingRaw = response.choices?.[0]?.message?.content || "";
    const ranking = rankingRaw.trim();

    console.log(`📊 [RE-RANKING] Ranking calculado (bruto): ${ranking}`);

    // Extrair índices do ranking
    const indices = ranking
      .split(",")
      .map((i) => parseInt(i.trim(), 10))
      .filter((i) => !Number.isNaN(i) && i >= 0 && i < documents.length);

    if (!indices.length) {
      console.warn(
        "⚠️ [RE-RANKING] Nenhum índice válido retornado. Mantendo ordem original."
      );
      return documents;
    }

    // Reordenar documentos
    const rerankedDocs = [];
    indices.forEach((index) => {
      if (documents[index]) {
        rerankedDocs.push(documents[index]);
      }
    });

    // Adicionar documentos que não foram ranqueados (por segurança)
    documents.forEach((doc, i) => {
      if (!indices.includes(i)) {
        rerankedDocs.push(doc);
      }
    });

    console.log(`✅ [RE-RANKING] Documentos reordenados com sucesso`);
    return rerankedDocs;
  } catch (err) {
    console.error("❌ [RE-RANKING] Erro ao reranquear:", err);
    // Em caso de erro, retorna documentos originais
    return documents;
  }
}
