// Modulo de busca semantica RAG (Retrieval-Augmented Generation)
// VERSAO MONGODB - Usa text-embedding-3-large da OpenAI e MongoDB para persistencia
// Busca conhecimento relevante para melhorar respostas do bot

import fs from 'fs';
import path from 'path';
import OpenAI from 'openai';
import winston from 'winston';
import { ObjectId } from 'mongodb';
import {
  getDocumentsCollection,
  getVisualKnowledgeCollection,
  getExpertKnowledgeCollection,
  isConnected
} from './db.js';
import { rerankDocuments } from './scripts/rag-reranker.js';

// Modelo de embeddings unificado (mesmo para salvar e buscar)
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072;

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
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

function logRAG(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  const payload = `[RAG-${level}] ${timestamp} - ${message}`;
  ragLogger.log(level.toLowerCase(), payload);
}

// ====================================================================
// INICIALIZAR RAG
// ====================================================================
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

// ====================================================================
// GERAR EMBEDDING
// ====================================================================
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

// ====================================================================
// UTILITÁRIOS INTERNOS
// ====================================================================
function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ====================================================================
// BUSCAR CONHECIMENTO
// ====================================================================
export async function searchKnowledge(query, topK = 5) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    logRAG(`Buscando conhecimento para: "${query.substring(0, 50)}..."`, 'INFO');

    const normalizedQuery = normalizeText(query);
    const lcdDiagnosticKeywords = ['listras', 'luz constante'];
    const hasLcdSymptom = lcdDiagnosticKeywords.some(kw => normalizedQuery.includes(kw));

    const queryEmbedding = await generateEmbedding(query);

    // 1. Buscar em expert_knowledge primeiro
    const expertKnowledgeCollection = getExpertKnowledgeCollection();
    if (expertKnowledgeCollection) {
      const expertAnswers = await expertKnowledgeCollection.find({}).toArray();
      let bestExpertMatch = null;
      let highestExpertSimilarity = 0;

      for (const ea of expertAnswers) {
        if (!ea.embedding) continue;
        const sim = cosineSimilarity(queryEmbedding, ea.embedding);
        if (sim > highestExpertSimilarity) {
          highestExpertSimilarity = sim;
          bestExpertMatch = ea;
        }
      }

      const EXPERT_THRESHOLD = 0.85;
      if (bestExpertMatch && highestExpertSimilarity >= EXPERT_THRESHOLD) {
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

    // 2. Buscar documentos com embeddings
    const collection = getDocumentsCollection();
    let documents = [];
    const vectorIndex = process.env.RAG_VECTOR_INDEX;

    if (vectorIndex) {
      try {
        const vectorResults = await collection.aggregate([
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
              _id: 1, title: 1, content: 1, tags: 1, embedding: 1,
              similarity: { $meta: 'vectorSearchScore' }
            }
          }
        ]).toArray();

        documents = vectorResults.map(doc => ({ ...doc, similarity: Number(doc.similarity) || 0 }));
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
      doc => Array.isArray(doc.embedding) && doc.embedding.length === EMBEDDING_DIMENSIONS
    );

    if (validDocuments.length === 0) {
      logRAG('Nenhum documento com embedding válido encontrado', 'WARN');
      return [];
    }

    // 3. Calcular similaridade
    const results = validDocuments.map(doc => {
      const similarity = typeof doc.similarity === 'number'
        ? doc.similarity
        : cosineSimilarity(queryEmbedding, doc.embedding);
      const tags = Array.isArray(doc.tags) ? doc.tags : [];
      const boostedSimilarity = hasLcdSymptom && tags.some(t => String(t).toLowerCase() === 'hardware:lcd_check')
        ? Math.min(1, similarity + 0.1)
        : similarity;
      return { id: doc._id.toString(), title: doc.title || 'Sem titulo', content: doc.content, tags, similarity: boostedSimilarity };
    });

    // Log top 3 para debug
    const top3 = [...results].sort((a, b) => b.similarity - a.similarity).slice(0, 3);
    logRAG(`Top 3 docs: ${top3.map(r => `"${r.title}" (${(r.similarity * 100).toFixed(1)}%)`).join(', ')}`, 'DEBUG');

    // 4. Ordenar
    results.sort((a, b) => b.similarity - a.similarity);

    // 5. Filtrar por limiar
    const relevantResults = results.filter(r => r.similarity >= MIN_RELEVANCE_THRESHOLD);

    if (relevantResults.length === 0) {
      logRAG(
        `Nenhum doc com relevancia >= ${MIN_RELEVANCE_THRESHOLD * 100}% (melhor: ${(results[0]?.similarity * 100 || 0).toFixed(1)}%)`,
        'WARN'
      );

      // FALLBACK TF-IDF
      logRAG('Tentando busca por texto como fallback (TF-IDF)...', 'INFO');
      const keywords = normalizedQuery.split(' ').filter(w => w.length > 2);
      if (keywords.length === 0) {
        logRAG('Sem palavras-chave suficientes para fallback de texto.', 'WARN');
        return [];
      }

      const termFrequencies = results.map(doc => {
        const normalizedContent = normalizeText((doc.content || '') + ' ' + (doc.title || ''));
        const tf = {};
        keywords.forEach(kw => { tf[kw] = normalizedContent.split(kw).length - 1; });
        return { doc, tf, normalizedContent };
      });

      const docCount = termFrequencies.length;
      const scored = termFrequencies.map(({ doc, tf, normalizedContent }) => {
        let score = 0;
        keywords.forEach(kw => {
          const docsWithTerm = termFrequencies.filter(d => d.normalizedContent.includes(kw)).length;
          const idf = docsWithTerm > 0 ? Math.log(docCount / docsWithTerm) : 0;
          score += (tf[kw] || 0) * idf;
        });
        return { ...doc, similarity: score ? Math.min(1, score / keywords.length) : 0 };
      });

      const textResults = scored.filter(d => d.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, topK);
      if (textResults.length > 0) {
        logRAG(`Busca por texto encontrou ${textResults.length} documentos`, 'INFO');
        return textResults;
      }
      return [];
    }

    // 6. Re-ranking com GPT-4o
    return rerankDocuments(relevantResults.slice(0, topK), query);
  } catch (err) {
    logRAG(`Erro na busca de conhecimento: ${err.message}`, 'ERROR');
    throw err;
  }
}

// ====================================================================
// FORMAT CONTEXT
// ====================================================================
export function formatContext(documents, visualContext = null) {
  let context = '';

  if (visualContext && visualContext.length > 0) {
    context += '### Contexto Visual (Analise de Imagem)\n';
    visualContext.forEach((item, i) => {
      context += `**Problema ${i + 1}:** ${item.problema}\n`;
      context += `**Descricao:** ${item.descricao}\n`;
      context += `**Causas:** ${item.causas}\n`;
      context += `**Acoes Recomendadas:** ${item.acoes}\n\n`;
    });
  }

  if (documents && documents.length > 0) {
    context += '### Conhecimento Relevante\n';
    documents.forEach((doc, i) => {
      if (doc.source === 'expert_knowledge') {
        context += `**RESPOSTA DO ESPECIALISTA (Ronei):**\n`;
        context += `**Pergunta:** ${doc.title}\n`;
        context += `**Resposta:** ${doc.content}\n\n`;
      } else {
        context += `**Documento ${i + 1}:** ${doc.title}\n`;
        context += `${doc.content}\n\n`;
      }
    });
  }

  return context || 'Nenhum conhecimento relevante encontrado.';
}

// ====================================================================
// BUSCAR CONHECIMENTO VISUAL
// ====================================================================
export async function searchVisualKnowledge(imageUrl, visualDescription = null) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    logRAG('Buscando conhecimento visual semantico...', 'INFO');

    const visualKnowledgeCollection = getVisualKnowledgeCollection();
    if (!visualKnowledgeCollection) {
      logRAG('Colecao visual_knowledge nao encontrada.', 'WARN');
      return [];
    }

    const searchQuery = visualDescription || 'diagnostico visual impressao 3d resina defeitos comuns';
    const queryEmbedding = await generateEmbedding(searchQuery);

    const visualDocs = await visualKnowledgeCollection.find({
      embedding: { $exists: true, $ne: [] }
    }).toArray();

    if (visualDocs.length === 0) {
      logRAG('Nenhum documento com embedding na colecao visual_knowledge', 'WARN');
      return [];
    }

    const results = visualDocs
      .map(doc => ({ ...doc, similarity: cosineSimilarity(queryEmbedding, doc.embedding) }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5);

    logRAG(`Busca visual retornou ${results.length} casos similares`, 'INFO');

    return results.map(doc => {
      const vDesc = doc.visionDescription || {};
      return {
        problema: doc.defectType || vDesc.problema || 'Problema visual detectado',
        descricao: doc.diagnosis || vDesc.descricao || 'Descricao nao disponivel',
        causas: vDesc.causas || doc.causes || 'Causas nao disponiveis',
        acoes: doc.solution || vDesc.acoes || 'Acoes nao disponiveis',
        similarity: doc.similarity
      };
    });
  } catch (err) {
    logRAG(`Erro na busca visual: ${err.message}`, 'ERROR');
    return [];
  }
}

// ====================================================================
// ADICIONAR CONHECIMENTO VISUAL
// ====================================================================
export async function addVisualKnowledge(imageUrl, defectType, diagnosis, solution, visionDescription) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    const visualKnowledgeCollection = getVisualKnowledgeCollection();
    if (!visualKnowledgeCollection) throw new Error('Colecao visual_knowledge nao encontrada.');

    const textToEmbed = `${defectType}. ${diagnosis}. ${solution}. ${JSON.stringify(visionDescription)}`;
    const embedding = await generateEmbedding(textToEmbed);

    const result = await visualKnowledgeCollection.insertOne({
      imageUrl, defectType, diagnosis, solution, visionDescription, embedding,
      createdAt: new Date(), updatedAt: new Date()
    });

    logRAG(`Conhecimento visual adicionado: ${defectType} (ID: ${result.insertedId})`, 'INFO');
    return result.insertedId;
  } catch (err) {
    logRAG(`Erro ao adicionar conhecimento visual: ${err.message}`, 'ERROR');
    throw err;
  }
}

// ====================================================================
// ADICIONAR CONHECIMENTO DE ESPECIALISTA
// ====================================================================
export async function addExpertKnowledge(question, answer, tags, category, priority) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    const expertKnowledgeCollection = getExpertKnowledgeCollection();
    if (!expertKnowledgeCollection) throw new Error('Colecao expert_knowledge nao encontrada.');

    const embedding = await generateEmbedding(question);

    await expertKnowledgeCollection.insertOne({
      question, answer, tags, category, priority, embedding,
      createdAt: new Date(), updatedAt: new Date()
    });

    logRAG(`Conhecimento de especialista adicionado: ${question}`, 'INFO');
  } catch (err) {
    logRAG(`Erro ao adicionar conhecimento de especialista: ${err.message}`, 'ERROR');
    throw err;
  }
}

// ====================================================================
// ATUALIZAR EMBEDDING DE ESPECIALISTA
// ====================================================================
export async function updateExpertKnowledgeEmbedding(id, embedding) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }

  try {
    const expertKnowledgeCollection = getExpertKnowledgeCollection();
    if (!expertKnowledgeCollection) throw new Error('Colecao expert_knowledge nao encontrada.');

    const result = await expertKnowledgeCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { embedding, updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      logRAG(`Nenhum expert_knowledge encontrado com ID: ${id}`, 'WARN');
      return false;
    }

    logRAG(`Embedding atualizado para expert_knowledge ID: ${id}`, 'INFO');
    return true;
  } catch (err) {
    logRAG(`Erro ao atualizar embedding ID ${id}: ${err.message}`, 'ERROR');
    throw err;
  }
}

// ====================================================================
// FUNÇÕES DE COMPATIBILIDADE / ADMIN
// ====================================================================

// Limpar toda a collection de documentos RAG
export async function clearKnowledgeCollection() {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }
  try {
    const collection = getDocumentsCollection();
    const result = await collection.deleteMany({});
    documentsCount = 0;
    logRAG(`clearKnowledgeCollection: ${result.deletedCount} documentos removidos`, 'INFO');
    return { deleted: result.deletedCount };
  } catch (err) {
    logRAG(`Erro ao limpar colecao: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Adicionar documento de texto (ponte para admin/sugestoes)
export const addDocument = async (title, content, source = 'manual', tags = [], options = {}) => {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado. Conecte primeiro usando connectToMongo()');
  }
  try {
    const collection = getDocumentsCollection();
    const textToEmbed = `${title} ${content}`;
    const embedding = options.embedding || await generateEmbedding(textToEmbed);

    const doc = {
      title: title.trim(),
      content: content.trim(),
      source,
      tags,
      embedding,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...(options.legacyId ? { legacyId: options.legacyId } : {})
    };

    let result;
    if (options.upsert && options.legacyId) {
      result = await collection.findOneAndUpdate(
        { legacyId: options.legacyId },
        { $set: doc },
        { upsert: true, returnDocument: 'after' }
      );
      const documentId = result?._id || result?.value?._id;
      documentsCount = await collection.countDocuments();
      return { success: true, documentId };
    }

    result = await collection.insertOne(doc);
    documentsCount = await collection.countDocuments();
    logRAG(`Documento adicionado: "${title}" (ID: ${result.insertedId})`, 'INFO');
    return { success: true, documentId: result.insertedId };
  } catch (err) {
    logRAG(`Erro na addDocument: ${err.message}`, 'ERROR');
    throw err;
  }
};

// Info do RAG para o painel admin
export const getRAGInfo = () => ({
  status: 'active',
  isInitialized: lastInitialization !== null,
  documentsCount: documentsCount || 0,
  lastInitialization,
  embeddingModel: EMBEDDING_MODEL,
  embeddingDimensions: EMBEDDING_DIMENSIONS,
  provider: 'OpenAI',
  storage: 'MongoDB'
});

// Integridade do RAG para o painel de status
export const checkRAGIntegrity = async () => {
  try {
    const count = await getDocumentsCollection().countDocuments({ embedding: { $exists: true } });
    return { isValid: true, totalDocuments: count, documentsWithEmbedding: count };
  } catch (err) {
    return { isValid: false, reason: err.message };
  }
};
