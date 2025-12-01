// Modulo de busca semantica RAG (Retrieval-Augmented Generation)
// VERSAO MONGODB - Usa text-embedding-3-large da OpenAI e MongoDB para persistencia
// Busca conhecimento relevante para melhorar respostas do bot

import OpenAI from 'openai';
import { getDocumentsCollection, getVisualKnowledgeCollection, isConnected } from './db.js';

// Cliente OpenAI para embeddings
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Modelo de embeddings unificado (mesmo para salvar e buscar)
const EMBEDDING_MODEL = 'text-embedding-3-large';
const EMBEDDING_DIMENSIONS = 3072; // Dimensao do text-embedding-3-large

// Limiar minimo de relevancia para considerar um documento util
// Documentos com similaridade abaixo deste valor serao ignorados
// NOTA: Reduzido de 0.7 para 0.5 para melhorar recall - text-embedding-3-large
// pode ter scores mais baixos mesmo para documentos relevantes
const MIN_RELEVANCE_THRESHOLD = 0.5;

let lastInitialization = null;
let documentsCount = 0;

// Funcao para logging do RAG
function logRAG(message, level = 'INFO') {
  const timestamp = new Date().toISOString();
  console.log(`[RAG-${level}] ${timestamp} - ${message}`);
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
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: text,
    });
    return response.data[0].embedding;
  } catch (err) {
    logRAG(`Erro ao gerar embedding: ${err.message}`, 'ERROR');
    throw err;
  }
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

    // 1. Gerar embedding da pergunta
    const queryEmbedding = await generateEmbedding(query);

    // 2. Buscar todos os documentos com embeddings
    const collection = getDocumentsCollection();
    const documents = await collection.find(
      { embedding: { $exists: true, $ne: [] } },
      { projection: { _id: 1, title: 1, content: 1, embedding: 1 } }
    ).toArray();

    if (documents.length === 0) {
      logRAG('Nenhum documento com embedding encontrado', 'WARN');
      return [];
    }

    // 3. Calcular similaridade com cada documento
    const results = documents.map(doc => ({
      id: doc._id.toString(),
      title: doc.title || 'Sem titulo',
      content: doc.content,
      similarity: cosineSimilarity(queryEmbedding, doc.embedding)
    }));

    // 4. Ordenar por similaridade (maior primeiro)
    results.sort((a, b) => b.similarity - a.similarity);
    
    // 5. Filtrar por limiar de relevancia (apenas documentos com score >= 0.7)
    const relevantResults = results.filter(r => r.similarity >= MIN_RELEVANCE_THRESHOLD);
    const topResults = relevantResults.slice(0, topK);

    if (topResults.length === 0) {
      logRAG(`Nenhum documento com relevancia >= ${MIN_RELEVANCE_THRESHOLD * 100}% encontrado (melhor: ${(results[0]?.similarity * 100 || 0).toFixed(1)}%)`, 'WARN');
    } else {
      logRAG(`Encontrados ${topResults.length} documentos relevantes (melhor: ${(topResults[0]?.similarity * 100).toFixed(1)}%)`, 'INFO');
    }

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
    return '\n\n[AVISO: Nenhum documento com relevancia suficiente foi encontrado no banco de conhecimento da Quanton3D para esta pergunta. Se a pergunta for especifica sobre produtos, precos ou informacoes da empresa, responda: "Nao encontrei essa informacao especifica no meu banco de dados. Posso te passar para um atendente humano para essa informacao." Para perguntas tecnicas gerais sobre impressao 3D, voce pode usar seu conhecimento geral.]\n\n';
  }

  let context = '\n\n CONHECIMENTO TECNICO RELEVANTE:\n\n';

  results.forEach((result, index) => {
    context += `[Documento ${index + 1}] (Relevancia: ${(result.similarity * 100).toFixed(1)}%)\n`;
    context += `${result.content}\n\n`;
  });

  context += '---\n\n';
  context += 'Use EXCLUSIVAMENTE o conhecimento acima para responder. ';
  context += 'NAO invente informacoes que nao estejam no contexto.\n\n';

  return context;
}

// Adicionar novo documento ao RAG (usado na aprovacao de sugestoes)
export async function addDocument(title, content, source = 'suggestion') {
  if (!isConnected()) {
    throw new Error('MongoDB nao conectado');
  }

  try {
    logRAG(`Adicionando documento: ${title}`, 'INFO');

    // Gerar embedding do conteudo
    const embedding = await generateEmbedding(content);

    // Inserir no MongoDB
    const collection = getDocumentsCollection();
    const result = await collection.insertOne({
      title,
      content,
      source,
      embedding,
      embeddingModel: EMBEDDING_MODEL,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    documentsCount++;
    logRAG(`Documento adicionado com sucesso: ${result.insertedId}`, 'INFO');

    return {
      success: true,
      documentId: result.insertedId,
      title
    };
  } catch (err) {
    logRAG(`Erro ao adicionar documento: ${err.message}`, 'ERROR');
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

// Limiar de similaridade para Visual RAG (mais alto que texto)
const VISUAL_MIN_RELEVANCE_THRESHOLD = 0.7;

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
      logRAG('Nenhum conhecimento visual encontrado no banco', 'WARN');
      return [];
    }

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

    // Filtrar por limiar de relevancia
    const relevantResults = results.filter(r => r.similarity >= VISUAL_MIN_RELEVANCE_THRESHOLD);
    const topResults = relevantResults.slice(0, topK);

    if (topResults.length === 0) {
      logRAG(`Nenhum conhecimento visual com relevancia >= ${VISUAL_MIN_RELEVANCE_THRESHOLD * 100}% (melhor: ${(results[0]?.similarity * 100 || 0).toFixed(1)}%)`, 'WARN');
    } else {
      logRAG(`Encontrados ${topResults.length} exemplos visuais relevantes (melhor: ${(topResults[0]?.similarity * 100).toFixed(1)}%)`, 'INFO');
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
