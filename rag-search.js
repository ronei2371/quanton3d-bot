// Módulo de busca semântica RAG (Retrieval-Augmented Generation)
// Busca conhecimento relevante para melhorar respostas do bot
// VERSÃO MELHORADA - Com verificação de integridade e logs detalhados

import fs from 'fs';
import path from 'path';
import { pipeline } from '@xenova/transformers';

let database = null;
let extractor = null;
let lastInitialization = null;

// Função para logging do RAG
function logRAG(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[RAG-${level}] ${timestamp} - ${message}`);

  // Salvar log em arquivo se possível
  try {
    const logFile = path.join(process.cwd(), 'rag-operations.log');
    const logEntry = `${timestamp} [${level}] ${message}\n`;
    fs.appendFileSync(logFile, logEntry, 'utf-8');
  } catch (err) {
    // Ignorar erros de log para não quebrar o sistema
  }
}

// Verificar integridade do database
function verifyDatabaseIntegrity() {
  try {
    const knowledgeDir = path.join(process.cwd(), 'rag-knowledge');
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.txt'));
    const dbPath = path.join(process.cwd(), 'embeddings-database.json');

    if (!fs.existsSync(dbPath)) {
      logRAG('Database não encontrado', 'WARN');
      return { isValid: false, reason: 'database_not_found', filesCount: files.length, dbCount: 0 };
    }

    const database = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));

    if (!Array.isArray(database)) {
      logRAG('Database corrompido - não é um array', 'ERROR');
      return { isValid: false, reason: 'database_corrupted', filesCount: files.length, dbCount: 0 };
    }

    if (files.length !== database.length) {
      logRAG(`Inconsistência: ${files.length} arquivos vs ${database.length} entradas no DB`, 'WARN');
      return { isValid: false, reason: 'count_mismatch', filesCount: files.length, dbCount: database.length };
    }

    // Verificar se todos os arquivos têm entrada no database
    const dbIds = new Set(database.map(entry => entry.id));
    const missingFiles = files.filter(file => !dbIds.has(file));

    if (missingFiles.length > 0) {
      logRAG(`Arquivos sem embedding: ${missingFiles.join(', ')}`, 'WARN');
      return { isValid: false, reason: 'missing_embeddings', filesCount: files.length, dbCount: database.length, missingFiles };
    }

    logRAG(`Integridade verificada: ${files.length} arquivos, ${database.length} embeddings`, 'INFO');
    return { isValid: true, filesCount: files.length, dbCount: database.length };
  } catch (err) {
    logRAG(`Erro ao verificar integridade: ${err.message}`, 'ERROR');
    return { isValid: false, reason: 'verification_error', error: err.message };
  }
}

// Processar todos os arquivos e criar database
async function buildDatabase() {
  logRAG('Iniciando construção do database de embeddings', 'INFO');

  const knowledgeDir = path.join(process.cwd(), 'rag-knowledge');

  if (!fs.existsSync(knowledgeDir)) {
    logRAG(`Diretório de conhecimento não encontrado: ${knowledgeDir}`, 'ERROR');
    throw new Error(`Diretório de conhecimento não encontrado: ${knowledgeDir}`);
  }

  const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.txt'));
  logRAG(`Encontrados ${files.length} arquivos para processar`, 'INFO');

  if (files.length === 0) {
    logRAG('Nenhum arquivo .txt encontrado no diretório de conhecimento', 'WARN');
    return [];
  }

  // Carregar modelo de embeddings
  logRAG('Carregando modelo de embeddings Xenova/all-MiniLM-L6-v2...', 'INFO');
  const localExtractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  logRAG('Modelo de embeddings carregado com sucesso', 'INFO');

  const newDatabase = [];
  const startTime = Date.now();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const filePath = path.join(knowledgeDir, file);

    try {
      const content = fs.readFileSync(filePath, 'utf-8');

      // Validar conteúdo
      if (content.trim().length < 10) {
        logRAG(`Arquivo ${file} muito pequeno (${content.length} chars), pulando`, 'WARN');
        continue;
      }

      // Criar embedding
      const output = await localExtractor(content, { pooling: 'mean', normalize: true });
      const embedding = Array.from(output.data);

      newDatabase.push({
        id: file,
        content: content.trim(),
        embedding: embedding,
        processedAt: new Date().toISOString(),
        contentLength: content.length
      });

      if ((i + 1) % 5 === 0) {
        logRAG(`Processados ${i + 1}/${files.length} arquivos...`, 'INFO');
      }
    } catch (err) {
      logRAG(`Erro ao processar arquivo ${file}: ${err.message}`, 'ERROR');
    }
  }

  // Criar backup do database anterior se existir
  const dbPath = path.join(process.cwd(), 'embeddings-database.json');
  if (fs.existsSync(dbPath)) {
    const backupPath = path.join(process.cwd(), `embeddings-database-backup-${Date.now()}.json`);
    fs.copyFileSync(dbPath, backupPath);
    logRAG(`Backup do database anterior criado: ${backupPath}`, 'INFO');
  }

  // Salvar novo database
  fs.writeFileSync(dbPath, JSON.stringify(newDatabase, null, 2));

  const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
  logRAG(`Database criado com ${newDatabase.length} documentos em ${processingTime}s`, 'INFO');
  logRAG(`Database salvo em: ${dbPath}`, 'INFO');

  return newDatabase;
}

// Carregar database de embeddings
export async function initializeRAG() {
  try {
    logRAG('Iniciando inicialização do RAG', 'INFO');

    // Verificar integridade primeiro
    const integrity = verifyDatabaseIntegrity();

    if (!integrity.isValid) {
      logRAG(`Database inválido: ${integrity.reason}`, 'WARN');
      logRAG('Reconstruindo database automaticamente...', 'INFO');
      database = await buildDatabase();
    } else {
      // Carregar database existente
      const dbPath = path.join(process.cwd(), 'embeddings-database.json');
      database = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
      logRAG(`Database carregado: ${database.length} documentos`, 'INFO');
    }

    // Carregar modelo de embeddings
    logRAG('Carregando modelo de embeddings...', 'INFO');
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    logRAG('Modelo de embeddings carregado com sucesso', 'INFO');

    lastInitialization = new Date().toISOString();
    logRAG(`RAG inicializado com sucesso em ${lastInitialization}`, 'INFO');

    return {
      success: true,
      documentsCount: database.length,
      initializedAt: lastInitialization
    };
  } catch (err) {
    logRAG(`Erro crítico na inicialização do RAG: ${err.message}`, 'ERROR');
    throw err;
  }
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

// Exportar função de verificação de integridade
export function checkRAGIntegrity() {
  return verifyDatabaseIntegrity();
}

// Exportar informações do RAG
export function getRAGInfo() {
  return {
    isInitialized: database !== null && extractor !== null,
    documentsCount: database ? database.length : 0,
    lastInitialization,
    modelLoaded: extractor !== null
  };
}

export default {
  initializeRAG,
  searchKnowledge,
  formatContext,
  checkRAGIntegrity,
  getRAGInfo
};
