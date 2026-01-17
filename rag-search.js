// Modulo de busca semantica RAG (Retrieval-Augmented Generation)
// VERSAO MONGODB - Usa text-embedding-3-large da OpenAI e MongoDB para persistencia
// Busca conhecimento relevante para melhorar respostas do bot

import fs from 'fs';
import OpenAI from 'openai';
import winston from 'winston';
import { getDocumentsCollection, getVisualKnowledgeCollection, isConnected } from './db.js';
import { rerankDocuments } from './scripts/rag-reranker.js';

// Modelo de embeddings unificado (mesmo para salvar e buscar)
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072; // Dimensao do text-embedding-3-large

// Limiar minimo de relevancia para considerar um documento util (configuravel)
const ENV_RELEVANCE = Number(process.env.RAG_MIN_RELEVANCE ?? 0.55);
const MIN_RELEVANCE_THRESHOLD =
  Number.isFinite(ENV_RELEVANCE) && ENV_RELEVANCE > 0 && ENV_RELEVANCE < 1
    ? ENV_RELEVANCE
    : 0.55;

const LOG_DIR = 'logs';

if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

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
  return text
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
    
    // Log dos top 3 resultados para debug
    const top3 = results.sort((a, b) => b.similarity - a.similarity).slice(0, 3);
    logRAG(`Top 3 documentos: ${top3.map(r => `"${r.title}" (${(r.similarity * 100).toFixed(1)}%)`).join(', ')}`, 'DEBUG');

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
      const normalizedQuery = normalizeText(query);
      const keywords = normalizedQuery.split(' ').filter(w => w.length > 2);
      if (keywords.length === 0) {
        logRAG('Sem palavras-chave suficientes para fallback de texto.', 'WARN');
        return [];
      }

      const termFrequencies = results.map((doc) => {
        const normalizedContent = normalizeText(doc.content + ' ' + doc.title);
        const tf = {};
        keywords.forEach((kw) => {
          const occurrences = normalizedContent.split(kw).length - 1;
          tf[kw] = occurrences;
        });
        return { doc, tf, normalizedContent };
      });

      const docCount = termFrequencies.length;
      const scored = termFrequencies.map(({ doc, tf, normalizedContent }) => {
        let score = 0;
        keywords.forEach((kw) => {
          const df = termFrequencies.filter((t) => t.normalizedContent.includes(kw)).length || 1;
          const idf = Math.log(docCount / df);
          score += (tf[kw] || 0) * idf;
        });
        return { ...doc, similarity: score ? Math.min(1, score / keywords.length) : 0 };
      });

      const textResults = scored.filter((doc) => doc.similarity > 0).sort((a, b) => b.similarity - a.similarity).slice(0, 3);

      if (textResults.length > 0) {
        logRAG(`Busca por texto encontrou ${textResults.length} documentos`, 'INFO');
        return textResults;
      }

      return [];
    }

    // 6. Re-ranking inteligente com GPT-4o (usa rag-reranker.js)
    let finalResults = relevantResults;
    if (relevantResults.length > 1) {
      try {
        logRAG(
          `[RE-RANKING] Aplicando reordenacao inteligente em ${relevantResults.length} documentos`,
          'INFO'
        );
        finalResults = await rerankDocuments(query, relevantResults);
      } catch (err) {
        logRAG(
          `[RE-RANKING] Falha ao reranquear documentos: ${err.message}. Usando ordem original por similaridade.`,
          'WARN'
        );
        finalResults = relevantResults;
      }
    }

    const topResults = finalResults.slice(0, topK);

    logRAG(
      `Encontrados ${topResults.length} documentos relevantes (melhor: ${(topResults[0]?.similarity * 100).toFixed(1)}%)`,
      'INFO'
    );

    return topResults;
  } catch (err) {
    logRAG(`Erro na busca: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Formatar contexto para o GPT
export function formatContext(results) {
  if (!results || results.length === 0) {
    // Nenhum documento relevante encontrado - instruir o bot a ser honesto
    return '\n\n[AVISO DE SEGURANCA]\nNao foi encontrado conhecimento interno com relevancia suficiente para responder.\n\nREGRAS:\n- Nao invente parametros, precos, prazos ou garantias.\n- Se a pergunta for sobre produtos, valores ou configuracoes especificas de resina/impressora, responda: "Nao encontrei essa informacao no meu banco de dados interno. Posso acionar um atendente humano para te ajudar com precisao."\n- Para duvidas tecnicas gerais, responda de forma conservadora e convide para compartilhar mais detalhes ou encaminhar ao suporte humano.\n\n';
  }

  let context = '\n\n CONHECIMENTO TECNICO RELEVANTE:\n\n';

  results.forEach((result, index) => {
    context += `[Documento ${index + 1}] (Relevancia: ${(result.similarity * 100).toFixed(1)}%)\n`;
    context += `${result.content}\n\n`;
  });

  context += '---\n\n';
  context += 'Use EXCLUSIVAMENTE o conhecimento acima para responder. ';
  context += 'NAO invente informacoes que nao estejam no contexto.\n';
  context += 'Sempre cite qual documento usou (ex.: "Fonte: Documento 1").\n\n';

  return context;
}

// Limpar toda a coleção de conhecimento (usado antes de importações em lote)
export async function clearKnowledgeCollection() {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    const collection = getDocumentsCollection();
    const result = await collection.deleteMany({});
    documentsCount = 0;

    logRAG(`Colecao de conhecimento limpa antes de importacao (removidos ${result.deletedCount} documentos)`, 'WARN');

    return { success: true, deleted: result.deletedCount };
  } catch (err) {
    logRAG(`Erro ao limpar colecao de conhecimento: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Adicionar novo documento ao RAG (usado na aprovacao de sugestoes)
export async function addDocument(title, content, source = 'suggestion', tags = [], options = {}) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    logRAG(`Adicionando documento: ${title}`, 'INFO');
    
    // 🔍 LOG DETALHADO - Inicio
    console.log(`📝 [ADD-DOC] Titulo: ${title}`);
    console.log(`📝 [ADD-DOC] Tamanho do conteudo: ${content.length} caracteres`);
    console.log(`📝 [ADD-DOC] Source: ${source}`);
    const normalizedTags = Array.isArray(tags)
      ? tags.map(t => String(t).trim()).filter(Boolean)
      : [];
    console.log(`📝 [ADD-DOC] Tags: ${normalizedTags.join(', ') || 'nenhuma'}`);

    const providedEmbedding = Array.isArray(options.embedding) && options.embedding.length > 0
      ? options.embedding.map(value => Number(value)).filter(value => Number.isFinite(value))
      : null;

    if (providedEmbedding && providedEmbedding.length !== options.embedding.length) {
      console.warn('⚠️ [ADD-DOC] Embedding informado contém valores inválidos e foi normalizado.');
    }

    if (providedEmbedding && providedEmbedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding inválido: esperado ${EMBEDDING_DIMENSIONS} dimensões, recebido ${providedEmbedding.length}`);
    }

    // Gerar ou reaproveitar embedding do conteudo
    let embedding;
    if (providedEmbedding && providedEmbedding.length > 0) {
      embedding = providedEmbedding;
      console.log(`🔄 [ADD-DOC] Usando embedding fornecido (${embedding.length} dimensoes)`);
    } else {
      console.log(`🔄 [ADD-DOC] Gerando embedding...`);
      embedding = await generateEmbedding(content);
      console.log(`✅ [ADD-DOC] Embedding gerado! Dimensao: ${embedding.length}`);
    }

    if (!Array.isArray(embedding) || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Embedding gerado com tamanho inesperado: ${embedding?.length}`);
    }

    // Inserir no MongoDB
    const collection = getDocumentsCollection();
    console.log(`💾 [ADD-DOC] Salvando no MongoDB...`);

    const now = new Date();
    const baseDocument = {
      title,
      content,
      source,
      tags: normalizedTags,
      embedding,
      embeddingModel: EMBEDDING_MODEL,
      createdAt: now,
      updatedAt: now,
      ...(options.legacyId ? { legacyId: options.legacyId } : {})
    };

    const sanitizedDocument = { ...baseDocument };
    delete sanitizedDocument.createdAt;
    delete sanitizedDocument.updatedAt;

    let documentId = null;
    let inserted = false;

    if (options.upsert && options.legacyId) {
      const existing = await collection.findOne({ legacyId: options.legacyId }, { projection: { _id: 1, createdAt: 1 } });
      const createdAtValue = existing?.createdAt || baseDocument.createdAt;
      const result = await collection.updateOne(
        { legacyId: options.legacyId },
        {
          $set: { ...sanitizedDocument, updatedAt: baseDocument.updatedAt },
          $setOnInsert: { createdAt: createdAtValue }
        },
        { upsert: true }
      );

      documentId = existing?._id || result.upsertedId || options.legacyId;
      inserted = Boolean(result.upsertedId);
    } else {
      const result = await collection.insertOne(baseDocument);
      documentId = result.insertedId;
      inserted = true;
    }

    if (inserted) {
      documentsCount++;
    }

    console.log(`✅ [ADD-DOC] Documento salvo! ID: ${documentId}`);
    logRAG(`Documento adicionado com sucesso: ${documentId}`, 'INFO');

    return {
      success: true,
      documentId,
      title
    };
  } catch (err) {
    console.error(`❌ [ADD-DOC] ERRO ao adicionar documento:`, err);
    console.error(`❌ [ADD-DOC] Stack trace:`, err.stack);
    logRAG(`Erro ao adicionar documento: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Listar todos os documentos de conhecimento (para admin)
export async function listDocuments() {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    const collection = getDocumentsCollection();
    const documents = await collection.find(
      {},
      { projection: { _id: 1, title: 1, content: 1, source: 1, tags: 1, createdAt: 1 } }
    ).sort({ createdAt: -1 }).toArray();

    return documents;
  } catch (err) {
    logRAG(`Erro ao listar documentos: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Deletar documento de conhecimento
export async function deleteDocument(id) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    const collection = getDocumentsCollection();
    const { ObjectId } = await import('mongodb');
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount > 0) {
      documentsCount--;
      logRAG(`Documento deletado: ${id}`, 'INFO');
    }
    return { success: result.deletedCount > 0 };
  } catch (err) {
    logRAG(`Erro ao deletar documento: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Atualizar documento de conhecimento
export async function updateDocument(id, title, content) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    const collection = getDocumentsCollection();
    const { ObjectId } = await import('mongodb');
    
    // Gerar novo embedding para o conteudo atualizado
    const embedding = await generateEmbedding(content);
    
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          title, 
          content, 
          embedding,
          updatedAt: new Date() 
        } 
      }
    );
    
    if (result.modifiedCount > 0) {
      logRAG(`Documento atualizado: ${id}`, 'INFO');
    }
    return { success: result.modifiedCount > 0 };
  } catch (err) {
    logRAG(`Erro ao atualizar documento: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Verificar integridade do RAG
export async function checkRAGIntegrity() {
  if (!isConnected()) {
    return { isValid: false, reason: 'mongodb_not_connected' };
  }

  try {
    const collection = getDocumentsCollection();
    const totalDocs = await collection.countDocuments();
    const docsWithEmbedding = await collection.countDocuments({ 
      embedding: { $exists: true, $ne: [] } 
    });

    const isValid = totalDocs > 0 && docsWithEmbedding === totalDocs;

    return {
      isValid,
      totalDocuments: totalDocs,
      documentsWithEmbedding: docsWithEmbedding,
      embeddingModel: EMBEDDING_MODEL,
      reason: !isValid ? 'missing_embeddings' : null
    };
  } catch (err) {
    return { isValid: false, reason: 'verification_error', error: err.message };
  }
}

// Obter informacoes do RAG
export function getRAGInfo() {
  return {
    isInitialized: isConnected(),
    documentsCount,
    lastInitialization,
    embeddingModel: EMBEDDING_MODEL,
    embeddingDimensions: EMBEDDING_DIMENSIONS,
    storage: 'MongoDB'
  };
}

// ============================================================
// VISUAL RAG - Busca por similaridade de imagens via texto
// ============================================================

// Limiar de similaridade para Visual RAG
// Ajustado de 0.7 para 0.5 para melhor deteccao de problemas visuais
// Threshold mais baixo para busca visual (imagens sao mais subjetivas que texto)
// 0.35 = 35% de similaridade minima
const VISUAL_MIN_RELEVANCE_THRESHOLD = 0.35;

// Adicionar exemplo visual ao banco de conhecimento
export async function addVisualKnowledge(imageUrl, defectType, diagnosis, solution, visionDescription) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    logRAG(`Adicionando conhecimento visual: ${defectType}`, 'INFO');

    // Montar texto canonico para embedding (combina descricao visual + diagnostico + solucao)
    const textForEmbedding = `Problema: ${defectType}
Descricao: ${visionDescription.descricao || ''}
Causas: ${visionDescription.causas || ''}
Acoes: ${visionDescription.acoes || ''}
Diagnostico: ${diagnosis}
Solucao: ${solution}`;

    // Gerar embedding do texto
    const embedding = await generateEmbedding(textForEmbedding);

    // Inserir no MongoDB
    const collection = getVisualKnowledgeCollection();
    const result = await collection.insertOne({
      imageUrl,
      defectType,
      diagnosis,
      solution,
      visionDescription,
      textForEmbedding,
      embedding,
      embeddingModel: EMBEDDING_MODEL,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    logRAG(`Conhecimento visual adicionado: ${result.insertedId}`, 'INFO');

    return {
      success: true,
      documentId: result.insertedId,
      defectType
    };
  } catch (err) {
    logRAG(`Erro ao adicionar conhecimento visual: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Buscar conhecimento visual similar
export async function searchVisualKnowledge(visionDescription, topK = 3) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    // Montar texto de consulta a partir da descricao da imagem do cliente
    const queryText = `Problema: ${visionDescription.problema || ''}
Descricao: ${visionDescription.descricao || ''}
Causas: ${visionDescription.causas || ''}
Acoes: ${visionDescription.acoes || ''}`;

    logRAG(`Buscando conhecimento visual para: "${queryText.substring(0, 50)}..."`, 'INFO');

    // Gerar embedding da consulta
    const queryEmbedding = await generateEmbedding(queryText);

    // Buscar apenas documentos visuais aprovados com embeddings
    const collection = getVisualKnowledgeCollection();
    const documents = await collection.find(
      { 
        embedding: { $exists: true, $ne: [] },
        $or: [{ status: 'approved' }, { status: { $exists: false } }]
      },
      { projection: { _id: 1, imageUrl: 1, defectType: 1, diagnosis: 1, solution: 1, visionDescription: 1, embedding: 1 } }
    ).toArray();

    if (documents.length === 0) {
      logRAG('Nenhum conhecimento visual encontrado no banco (verifique se tem documentos com embedding e status correto)', 'WARN');
      return [];
    }

    logRAG(`[VISUAL-RAG] Encontrados ${documents.length} documentos visuais no banco`, 'INFO');

    // Calcular similaridade com cada documento
    const results = documents.map(doc => ({
      id: doc._id.toString(),
      imageUrl: doc.imageUrl,
      defectType: doc.defectType,
      diagnosis: doc.diagnosis,
      solution: doc.solution,
      visionDescription: doc.visionDescription,
      similarity: cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    // Ordenar por similaridade (maior primeiro)
    results.sort((a, b) => b.similarity - a.similarity);

    // Log detalhado dos top 3 resultados para diagnostico
    logRAG(
      `[VISUAL-RAG] Top 3 similaridades: ${results
        .slice(0, 3)
        .map(r => `${r.defectType}=${(r.similarity * 100).toFixed(1)}%`)
        .join(', ')}`,
      'INFO'
    );

    // Filtrar por limiar de relevancia
    const relevantResults = results.filter(r => r.similarity >= VISUAL_MIN_RELEVANCE_THRESHOLD);
    const topResults = relevantResults.slice(0, topK);

    if (topResults.length === 0) {
      logRAG(
        `[VISUAL-RAG] Nenhum match >= ${VISUAL_MIN_RELEVANCE_THRESHOLD * 100}% (melhor: ${(results[0]?.similarity * 100 || 0).toFixed(1)}% - ${results[0]?.defectType || 'N/A'})`,
        'WARN'
      );
    } else {
      logRAG(
        `[VISUAL-RAG] Match encontrado! ${topResults.length} resultados (melhor: ${(topResults[0]?.similarity * 100).toFixed(1)}% - ${topResults[0]?.defectType})`,
        'INFO'
      );
    }

    return topResults;
  } catch (err) {
    logRAG(`Erro na busca visual: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Formatar resposta do Visual RAG
export function formatVisualResponse(visualMatch) {
  if (!visualMatch) {
    return null;
  }

  return `**Analise Visual (baseada em exemplos do banco Quanton3D):**

**Problema identificado:** ${visualMatch.defectType}
(Similaridade: ${(visualMatch.similarity * 100).toFixed(0)}%)

**Diagnostico tecnico:**
${visualMatch.diagnosis}

**Solucao recomendada:**
${visualMatch.solution}`;
}

// Listar todos os conhecimentos visuais aprovados (para admin)
export async function listVisualKnowledge() {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    const collection = getVisualKnowledgeCollection();
    // Filtrar apenas documentos aprovados ou sem status (compatibilidade com antigos)
    const documents = await collection.find(
      { $or: [{ status: 'approved' }, { status: { $exists: false } }] },
      { projection: { _id: 1, imageUrl: 1, defectType: 1, diagnosis: 1, solution: 1, createdAt: 1, status: 1 } }
    ).sort({ createdAt: -1 }).toArray();

    return documents;
  } catch (err) {
    logRAG(`Erro ao listar conhecimento visual: ${err.message}`, 'ERROR');
    throw err;
  }
}

// Deletar conhecimento visual
export async function deleteVisualKnowledge(id) {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    const collection = getVisualKnowledgeCollection();
    const { ObjectId } = await import('mongodb');
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    
    logRAG(`Conhecimento visual deletado: ${id}`, 'INFO');
    return { success: result.deletedCount > 0 };
  } catch (err) {
    logRAG(`Erro ao deletar conhecimento visual: ${err.message}`, 'ERROR');
    throw err;
  }
}

export default {
  initializeRAG,
  searchKnowledge,
  formatContext,
  addDocument,
  listDocuments,
  deleteDocument,
  updateDocument,
  checkRAGIntegrity,
  getRAGInfo,
  generateEmbedding,
  // Visual RAG
  addVisualKnowledge,
  searchVisualKnowledge,
  formatVisualResponse,
  listVisualKnowledge,
  deleteVisualKnowledge
};
