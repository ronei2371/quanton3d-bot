// Modulo de busca semantica RAG (Retrieval-Augmented Generation)
// VERSAO MONGODB - Usa text-embedding-3-large da OpenAI e MongoDB para persistencia
// Busca conhecimento relevante para melhorar respostas do bot

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import winston from 'winston';
import { ObjectId } from 'mongodb'; // Import no topo para organização
import { getDocumentsCollection, getVisualKnowledgeCollection, getExpertKnowledgeCollection, isConnected } from './db.js';

// Modelo de embeddings unificado (mesmo para salvar e buscar)
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072; // Dimensao do text-embedding-3-large

// Limiar minimo de relevancia para considerar um documento util (configuravel)
const DEFAULT_MIN_RELEVANCE = 0.55;
const ENV_RELEVANCE = Number(process.env.RAG_MIN_RELEVANCE);
const MIN_RELEVANCE_THRESHOLD =
  Number.isFinite(ENV_RELEVANCE) && ENV_RELEVANCE > 0 && ENV_RELEVANCE < 1
    ? ENV_RELEVANCE
    : DEFAULT_MIN_RELEVANCE;

const LOG_DIR = 'logs';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const KB_INDEX_PATH = process.env.KB_INDEX_PATH || path.join(process.cwd(), 'kb_index.json');
const KB_AUTO_IMPORT_LIMIT = Number.isFinite(Number(process.env.KB_AUTO_IMPORT_LIMIT))
  ? Number(process.env.KB_AUTO_IMPORT_LIMIT)
  : null;

const ragLogger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({ level: 'debug' }),
    new winston.transports.File({
      filename: `${LOG_DIR}/rag-operations.log`,
      maxsize: 5e6,
      maxFiles: 3,
      tailable: true
    })
  ]
});

let lastInitialization = null;
let documentsCount = 0;
let openaiClient = null;

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY nao configurada');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

// Funcao para logging do RAG
function logRAG(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const payload = `[RAG-${level}] ${timestamp} - ${message}`;
  ragLogger.log(level.toLowerCase(), payload);
}

// Inicializar RAG (verificar conexao e contar documentos)
export async function initializeRAG() {
  try {
    logRAG('Iniciando inicializacao do RAG com MongoDB', 'INFO');

    if (!isConnected()) {
      throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
    }

    const collection = getDocumentsCollection();
    documentsCount = await collection.countDocuments();
    
    logRAG(`RAG inicializado: ${documentsCount} documentos na colecao`, 'INFO');
    logRAG(`Modelo de embeddings: ${EMBEDDING_MODEL}`, 'INFO');

    lastInitialization = new Date().toISOString();

    return {
      success: true,
      documentsCount,
      initializedAt: lastInitialization,
      embeddingModel: EMBEDDING_MODEL
    };
  } catch (err) {
    logRAG(`Erro critico na inicializacao do RAG: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Gerar embedding usando OpenAI text-embedding-3-large
export async function generateEmbedding(text) {
  try {
    const client = getOpenAIClient();
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  } catch (err) {
    logRAG(`Erro ao gerar embedding: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Normalizar texto para melhorar busca
function normalizeText(text) {
  return (text || "")
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, ' ') // Remove pontuação
    .replace(/\s+/g, ' ') // Remove espaços múltiplos
    .trim();
}

// Calcular similaridade de cosseno entre dois vetores
function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

// Buscar conhecimento relevante no MongoDB
export async function searchKnowledge(query, topK = 5) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    logRAG(`Buscando conhecimento para: "${query.substring(0, 50)}..."`, 'INFO');

    const normalizedQuery = normalizeText(query);
    const lcdDiagnosticKeywords = ['listras', 'luz constante'];
    const hasLcdSymptom = lcdDiagnosticKeywords.some(keyword => normalizedQuery.includes(keyword));

    // 1. Gerar embedding da pergunta
    const queryEmbedding = await generateEmbedding(query);

    // 1.1. Buscar em expert_knowledge (respostas de ouro) primeiro
    const expertKnowledgeCollection = getExpertKnowledgeCollection();
    if (expertKnowledgeCollection) {
      const expertAnswers = await expertKnowledgeCollection.find({}).toArray();
      let bestExpertMatch = null;
      let highestExpertSimilarity = 0;

      for (const expertAnswer of expertAnswers) {
        if (!expertAnswer.embedding) continue;
        const similarity = cosineSimilarity(queryEmbedding, expertAnswer.embedding);

        if (similarity > highestExpertSimilarity) {
          highestExpertSimilarity = similarity;
          bestExpertMatch = expertAnswer;
        }
      }

      // Definir um limiar mais alto para respostas de ouro
      const EXPERT_KNOWLEDGE_THRESHOLD = 0.85; 
      if (bestExpertMatch && highestExpertSimilarity >= EXPERT_KNOWLEDGE_THRESHOLD) {
        logRAG(`[EXPERT] Resposta de ouro encontrada com ${(highestExpertSimilarity * 100).toFixed(1)}% de similaridade.`, 'INFO');
        return [{
          id: bestExpertMatch._id.toString(),
          title: bestExpertMatch.question,
          content: bestExpertMatch.answer,
          tags: bestExpertMatch.tags || [],
          similarity: highestExpertSimilarity,
          source: 'expert_knowledge'
        }];
      }
    }

    // 2. Buscar documentos com embeddings (preferindo índice vetorial quando configurado)
    const collection = getDocumentsCollection();
    let documents = [];
    const vectorIndex = process.env.RAG_VECTOR_INDEX;

    if (vectorIndex) {
      try {
        const vectorResults = await collection
          .aggregate([
            {
              $vectorSearch: {
                index: vectorIndex,
                path: 'embedding',
                queryVector: queryEmbedding,
                numCandidates: 200,
                limit: Math.max(topK * 2, 10)
              }
            },
            {
              $project: {
                _id: 1,
                title: 1,
                content: 1,
                tags: 1,
                embedding: 1,
                similarity: { $meta: 'vectorSearchScore' }
              }
            }
          ])
          .toArray();

        documents = vectorResults.map((doc) => ({
          ...doc,
          similarity: Number(doc.similarity) || 0
        }));
        logRAG(`[VECTOR] Busca via índice ${vectorIndex} retornou ${documents.length} documentos`, 'INFO');
      } catch (error) {
        logRAG(`[VECTOR] Falha ao usar índice vetorial: ${error.message}. Recuando para busca tradicional.`, 'WARN');
      }
    }

    if (documents.length === 0) {
      documents = await collection.find(
        { embedding: { $exists: true, $ne: [] } },
        { projection: { _id: 1, title: 1, content: 1, embedding: 1, tags: 1 } }
      ).toArray();
    }

    const validDocuments = documents.filter(
      (doc) => Array.isArray(doc.embedding) && doc.embedding.length === EMBEDDING_DIMENSIONS
    );

    if (validDocuments.length === 0) {
      logRAG('Nenhum documento com embedding válido encontrado', 'WARN');
      return [];
    }

    // 3. Calcular similaridade com cada documento
    const results = validDocuments.map(doc => {
      const similarity = typeof doc.similarity === 'number'
        ? doc.similarity
        : cosineSimilarity(queryEmbedding, doc.embedding);
      const tags = Array.isArray(doc.tags) ? doc.tags : [];

      const boostedSimilarity = hasLcdSymptom && tags.some(tag => String(tag).toLowerCase() === 'hardware:lcd_check')
        ? Math.min(1, similarity + 0.1)
        : similarity;

      return {
        id: doc._id.toString(),
        title: doc.title || 'Sem titulo',
        content: doc.content,
        tags,
        similarity: boostedSimilarity
      };
    });
    
    // 4. Ordenar por similaridade (maior primeiro)
    results.sort((a, b) => b.similarity - a.similarity);
    
    // 5. Filtrar por limiar de relevancia
    const relevantResults = results.filter(r => r.similarity >= MIN_RELEVANCE_THRESHOLD);

    if (relevantResults.length === 0) {
      logRAG(
        `Nenhum documento com relevancia >= ${MIN_RELEVANCE_THRESHOLD * 100}% encontrado (melhor: ${(results[0]?.similarity * 100 || 0).toFixed(1)}%)`,
        'WARN'
      );
      
      // FALLBACK: Busca por texto com TF-IDF simples se busca vetorial falhar
      logRAG('Tentando busca por texto como fallback (TF-IDF)...', 'INFO');
      const keywords = normalizedQuery.split(' ').filter(w => w.length > 2);
      if (keywords.length === 0) {
        logRAG('Sem palavras-chave suficientes para fallback de texto.', 'WARN');
        return [];
      }

      const termFrequencies = results.map((doc) => {
        const normalizedContent = normalizeText(doc.content || "");
        let score = 0;
        keywords.forEach((kw) => {
          if (normalizedContent.includes(kw)) {
            const docCount = results.length;
            const docsWithTerm = results.filter(d => normalizeText(d.content || "").includes(kw)).length;
            // BLINDAGEM: Proteção contra divisão por zero no IDF
            const idf = docsWithTerm > 0 ? Math.log10(docCount / docsWithTerm) : 0;
            score += idf;
          }
        });
        return { ...doc, similarity: score };
      });

      return termFrequencies.sort((a, b) => b.similarity - a.similarity).slice(0, topK);
    }

    return relevantResults.slice(0, topK);
  } catch (err) {
    logRAG(`Erro na busca de conhecimento: ${err.message}`, 'ERROR');
    return [];
  }
}

/**
 * Busca conhecimento visual usando similaridade semântica real (MELHORIA ELITE)
 */
export async function searchVisualKnowledge(visualDescription, limit = 5) {
  if (!isConnected()) throw new Error('MongoDB nao conectado.');
  if (!visualDescription) return [];

  try {
    logRAG(`Buscando conhecimento visual para: "${visualDescription.substring(0, 50)}..."`, 'INFO');
    const visualCollection = getVisualKnowledgeCollection();
    const queryEmbedding = await generateEmbedding(visualDescription);
    
    const allDocs = await visualCollection.find({ embedding: { $exists: true } }).toArray();
    
    const results = allDocs.map(doc => ({
      ...doc,
      score: cosineSimilarity(queryEmbedding, doc.embedding)
    }))
    .filter(doc => doc.score >= MIN_RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

    return results.map(doc => ({
      imageUrl: doc.imageUrl,
      // MAPEAMENTO CORRIGIDO: Lê de visionDescription conforme salvo no addVisualKnowledge
      causas: doc.visionDescription?.causas || doc.causes || 'Causas nao disponiveis',
      solucoes: doc.visionDescription?.solucoes || doc.solution || 'Solucoes nao disponiveis',
      score: doc.score
    }));
  } catch (err) {
    logRAG(`Erro na busca visual semantica: ${err.message}`, 'ERROR');
    return [];
  }
}

export function formatContext(documents) {
  if (!documents || documents.length === 0) {
    return "Nenhum conhecimento previo encontrado para esta pergunta.";
  }

  return documents
    .map((doc, i) => {
      const source = doc.source === 'expert_knowledge' ? 'ESPECIALISTA' : 'DOCUMENTAÇÃO';
      return `[Fonte: ${source} - Ref ${i + 1}]: ${doc.content}`;
    })
    .join('\n\n');
}

/**
 * Adiciona novo conhecimento visual ao MongoDB
 */
export async function addVisualKnowledge(imageUrl, visionDescription) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    const visualCollection = getVisualKnowledgeCollection();
    if (!visualCollection) {
      throw new Error('Colecao visual_knowledge nao encontrada.');
    }

    // Gerar embedding combinando os campos da descrição visual para busca semântica
    const textToEmbed = `${visionDescription.tipo_de_defeito} ${visionDescription.diagnostico} ${visionDescription.causas} ${visionDescription.solucoes}`;
    const embedding = await generateEmbedding(textToEmbed);

    const newVisualKnowledge = {
      imageUrl,
      visionDescription,
      embedding,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await visualCollection.insertOne(newVisualKnowledge);
    logRAG(`Novo conhecimento visual adicionado: ${imageUrl} (ID: ${result.insertedId})`, 'INFO');
    return result.insertedId;
  } catch (err) {
    logRAG(`Erro ao adicionar conhecimento visual: ${err.message}`, 'ERROR');
    throw err;
  }
}
// ====================================================================
// FUNÇÕES DE COMPATIBILIDADE (PONTE ENTRE O NOVO E O ANTIGO)
// ====================================================================

// Ponte para o sistema de sugestões e admin (aceita os formatos antigos)
export const addDocument = async (title, content, source = 'manual', tags = []) => {
  try {
    // Se for uma sugestão, usamos o conteúdo completo
    const textToProcess = content || title;
    const metadata = { source, tags, originalTitle: title };
    
    // Chama a nova função de conhecimento visual
    const resultId = await addVisualKnowledge(textToProcess, metadata);
    return { success: true, documentId: resultId };
  } catch (err) {
    logRAG(`Erro na ponte addDocument: ${err.message}`, 'ERROR');
    throw err;
  }
};

// Informações completas para o Painel Administrativo
export const getRAGInfo = () => {
  return {
    status: 'active',
    isInitialized: lastInitialization !== null,
    documentsCount: documentsCount || 0,
    lastInitialization,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    provider: 'OpenAI',
    storage: 'MongoDB'
  };
};

// Função de integridade para o painel de status
export const checkRAGIntegrity = async () => {
  try {
    const count = await getDocumentsCollection().countDocuments({ embedding: { $exists: true } });
    return { isValid: true, totalDocuments: count, documentsWithEmbedding: count };
  } catch (err) {
    return { isValid: false, reason: err.message };
  }
};
