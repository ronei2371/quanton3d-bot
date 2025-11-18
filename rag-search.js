// Módulo de busca semântica RAG (Retrieval-Augmented Generation)
// Busca conhecimento relevante para melhorar respostas do bot

import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

let database = null;
let extractor = null;

// Processar todos os arquivos e criar database
async function buildDatabase() {
  console.log('🔨 Construindo database de embeddings...');
  
  const knowledgeDir = path.join(process.cwd(), 'rag-knowledge');
  const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.txt'));
  
  console.log(`📂 Encontrados ${files.length} arquivos para processar`);
  
  // Carregar modelo de embeddings
  console.log('🤖 Carregando modelo de embeddings...');
  const localExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  console.log('✅ Modelo carregado!');
  
  const newDatabase = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(knowledgeDir, file);
    const content = fs.readFileSync(filePath, 'utf-8').trim();

if (!content) {
  console.log(`⚠️ Ignorado: ${file} (arquivo vazio ou só espaços)`);
  continue;
}

    
    // Criar embedding
    const output = await localExtractor(content, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data);
    
    newDatabase.push({
      id: file,
      content: content,
      embedding: embedding
    });
    
    if ((i + 1) % 10 === 0) {
      console.log(`⏳ Processados ${i + 1}/${files.length} arquivos...`);
    }
  }
  
  // Salvar database
  const dbPath = path.join(process.cwd(), 'embeddings-database.json');
  fs.writeFileSync(dbPath, JSON.stringify(newDatabase, null, 2));
  
  console.log(`✅ Database criado com ${newDatabase.length} documentos!`);
  console.log(`💾 Salvo em: ${dbPath}`);
  
  return newDatabase;
}

// Carregar database de embeddings
export async function initializeRAG() {
  console.log('📚 Carregando database de conhecimento...');
  
  const dbPath = path.join(process.cwd(), 'embeddings-database.json');
  
  // Verificar se database existe
  if (!fs.existsSync(dbPath)) {
    console.log('⚠️ Database não encontrado! Gerando automaticamente...');
    database = await buildDatabase();
  } else {
    database = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
    console.log(`✅ Database carregado: ${database.length} documentos`);
  }
  
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
import { ChromaClient } from "chromadb";
const chroma = new ChromaClient({ path: "./quanton3d-db" });

const collection = await chroma.getOrCreateCollection({ name: "quanton3d" });

await collection.add({
  ids: newDatabase.map((entry, idx) => `doc-${idx}`),
  documents: newDatabase.map(entry => entry.content),
  embeddings: newDatabase.map(entry => entry.embedding),
});
console.log("[CHROMA] Dados enviados para a ChromaDB.");
