import OpenAI from "openai";
import { ChromaClient } from "chromadb";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const chroma = new ChromaClient({ path: "./quanton3d-db" });

export async function consultarComRAG(pergunta) {
  const queryEmb = await client.embeddings.create({
    model: "text-embedding-3-large",
    input: pergunta
  });

  const resultados = await chroma.query({
    queryEmbeddings: [queryEmb.data[0].embedding],
    nResults: 3
  });

  const contexto = resultados.documents.flat().join("\n\n");
  const prompt = `
  Você é um especialista técnico da Quanton3D.
  Baseando-se no contexto abaixo, responda de forma clara e precisa.
  ---
  CONTEXTO:
  ${contexto}
  ---
  PERGUNTA:
  ${pergunta}
  `;

  const resposta = await client.chat.completions.create({
    model: "gpt-4o",
    temperature: 0.3,
    messages: [{ role: "user", content: prompt }]
  });

  return resposta.choices[0].message.content;
}
