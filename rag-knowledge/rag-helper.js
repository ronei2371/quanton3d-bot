import OpenAI from "openai";
import { ChromaClient } from "chromadb";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: "./quanton3d-db" });

export async function consultarComRAG(pergunta) {
  // Gerar embedding da pergunta
  const queryEmb = await client.embeddings.create({
    model: "text-embedding-3-large", // ✅ Mantido consistente
    input: pergunta
  });

  // Buscar documentos relevantes (aumentado de 3 para 5)
  const resultados = await chroma.query({
    queryEmbeddings: [queryEmb.data[0].embedding],
    nResults: 5 // ✅ MUDANÇA 1: Aumentado de 3 para 5
  });

  // ✅ ADICIONADO: Filtrar apenas resultados relevantes
  const chunksComScore = resultados.documents.flat().map((doc, idx) => ({
    content: doc,
    score: resultados.distances?.[0]?.[idx] || 0
  }));

  const chunksRelevantes = chunksComScore
    .filter(chunk => chunk.score < 0.7) // Apenas chunks com score bom
    .sort((a, b) => a.score - b.score)
    .slice(0, 3); // Pegar os 3 melhores

  // Se não houver contexto relevante, avisar
  if (chunksRelevantes.length === 0) {
    return "Desculpe, não encontrei informações específicas sobre isso na base de conhecimento Quanton3D. Poderia reformular sua pergunta com mais detalhes sobre impressão 3D de resina?";
  }

  const contexto = chunksRelevantes.map(c => c.content).join("\n\n");

  // ✅ MUDANÇA 2: Prompt melhorado e mais específico
  const prompt = `Você é o QuantonBot3D, assistente técnico especializado da Quanton3D.

REGRAS OBRIGATÓRIAS:
1. Responda APENAS com informações do CONTEXTO abaixo
2. Se o contexto NÃO tiver a resposta completa, diga: "Não encontrei essa informação específica na base de conhecimento"
3. NUNCA invente parâmetros técnicos (tempos de exposição, temperaturas, valores numéricos)
4. Seja direto, técnico e específico
5. Use listas numeradas para instruções passo a passo
6. SEMPRE mencione segurança e uso de EPIs quando relevante
7. Se mencionar uma resina, fale APENAS sobre ela, não cite outras sem necessidade

CONTEXTO DA BASE DE CONHECIMENTO:
${contexto}

PERGUNTA DO USUÁRIO:
${pergunta}

RESPOSTA (baseada SOMENTE no contexto acima, seja preciso e técnico):`;

  // ✅ MUDANÇA 3: Temperatura reduzida de 0.3 para 0.1
  const resposta = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.1, // ✅ Reduzido para máxima precisão
    messages: [{ role: "user", content: prompt }],
    max_tokens: 1000 // ✅ ADICIONADO: Limitar tamanho da resposta
  });

  return resposta.choices[0].message.content;
}
