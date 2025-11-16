// Módulo de busca semântica RAG (Retrieval-Augmented Generation)
// Busca conhecimento relevante para melhorar respostas do bot

import fs from 'fs';
import { pipeline } from '@xenova/transformers';

let database = null;
let extractor = null;

// Carregar database de embeddings
export async function initializeRAG() {
  console.log('📚 Carregando database de conhecimento...');
  
  const dbPath = '/home/ubuntu/quanton3d-bot/embeddings-database.json';
  database = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  
  console.log(`✅ Database carregado: ${database.length} documentos`);
  
  // Carregar modelo de embeddings
  console.log('🤖 Carregando modelo de embeddings...');
  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✅ Modelo carregado!');
}

// Calcular similaridade de cosseno entre dois vetores
function cosineSimilarity(a, b) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Buscar conhecimento relevante
export async function searchKnowledge(query, topK = 3) {
  if (!database || !extractor) {
    throw new Error('RAG não inicializado. Chame initializeRAG() primeiro.');
  }
  
  // Criar embedding da pergunta
  const queryOutput = await extractor(query, { pooling: 'mean', normalize: true });
  const queryEmbedding = Array.from(queryOutput.data);
  
  // Calcular similaridade com todos os documentos
  const results = database.map(doc => ({
    id: doc.id,
    content: doc.content,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding)
  }));
  
  // Ordenar por similaridade (maior primeiro)
  results.sort((a, b) => b.similarity - a.similarity);
  
  // Retornar top K resultados
  return results.slice(0, topK);
}

// Formatar contexto para o GPT
export function formatContext(results) {
  if (!results || results.length === 0) {
    return '';
  }
  
  let context = '\n\n📚 CONHECIMENTO TÉCNICO RELEVANTE:\n\n';
  
  results.forEach((result, index) => {
    context += `[Documento ${index + 1}] (Relevância: ${(result.similarity * 100).toFixed(1)}%)\n`;
    context += `${result.content}\n\n`;
  });
  
  context += '---\n\n';
  context += 'Use o conhecimento acima para responder com precisão técnica. ';
  context += 'Se a informação não estiver no conhecimento, use seu conhecimento geral.\n\n';
  
  return context;
}

export default {
  initializeRAG,
  searchKnowledge,
  formatContext
};
