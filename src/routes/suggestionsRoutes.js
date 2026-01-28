// ====================================================================
// ROTAS DE GERENCIAMENTO DE SUGESTOES (ADMIN + PÚBLICO)
// ====================================================================

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ObjectId } from "mongodb";
import { requireJWT } from "./authRoutes.js";
import {
  getSuggestionsCollection,
  getMetricasCollection,
  isConnected,
  ensureMongoReady, // Adicionado para garantir conexão na rota pública
  getDb
} from "../../db.js";
import {
  checkRAGIntegrity,
  getRAGInfo,
  addDocument
} from "../../rag-search.js";
import { metrics } from "../utils/metrics.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");

const router = express.Router();

// ====================================================================
// 1. ROTA PÚBLICA (Para o Chat enviar sugestões sem senha)
// ====================================================================
router.post('/suggestion', async (req, res) => {
  try {
    const { suggestion, history, userName } = req.body;
    
    // Garante que o banco está conectado
    await ensureMongoReady();
    const db = getDb();
    
    // Salva na coleção 'suggestions'
    await db.collection('suggestions').insertOne({
      suggestion: suggestion || "Sem texto",
      userName: userName || "Anônimo do Chat",
      history: history || [],
      status: 'pending', // Fica pendente para você aprovar no painel
      createdAt: new Date()
    });
    
    // Responde SUCESSO para o site não dar erro
    res.json({ success: true, message: "Sugestão recebida!" });

  } catch (error) {
    console.error("Erro ao salvar sugestão:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ====================================================================
// 2. MIDDLEWARE DE AUTENTICAÇÃO (Para as rotas de baixo)
// ====================================================================
const requireAuth = (req, res, next) => {
  // Tentar JWT primeiro (novo sistema)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireJWT(req, res, next);
  }
  
  // Fallback: token legado via query param ou body (compatibilidade)
  const legacyToken = req.query.auth || req.body?.auth;
  const ADMIN_SECRET = process.env.ADMIN_SECRET || 'quanton3d_admin_secret';
  if (legacyToken === ADMIN_SECRET) {
    return next();
  }
  
  return res.status(401).json({ success: false, message: 'Nao autorizado' });
};

// ====================================================================
// 3. ROTAS ADMINISTRATIVAS (Painel Admin)
// ====================================================================

// GET /suggestions - Listar todas as sugestoes
router.get("/suggestions", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    }
    
    const collection = getSuggestionsCollection();
    const suggestions = await collection
      .find({})
      .sort({ createdAt: -1 })
      .toArray();
    
    // Formatar para compatibilidade com frontend
    const formattedSuggestions = suggestions.map(s => ({
      id: s._id.toString(),
      odId: s._id.toString(),
      odIdLegacy: s.odIdLegacy || null,
      suggestion: s.suggestion,
      userName: s.userName || 'Anonimo',
      userPhone: s.userPhone || null,
      userEmail: s.userEmail || null,
      lastUserMessage: s.lastUserMessage || null,
      lastBotReply: s.lastBotReply || null,
      status: s.status || 'pending',
      timestamp: s.createdAt || new Date(),
      approvedAt: s.approvedAt || null,
      rejectedAt: s.rejectedAt || null,
      rejectionReason: s.rejectionReason || null,
      fileName: s.fileName || null
    }));
    
    res.json({
      success: true,
      suggestions: formattedSuggestions,
      count: formattedSuggestions.length
    });
  } catch (err) {
    console.error('[SUGGESTIONS] Erro ao listar sugestoes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /approve-suggestion/:id - Aprovar sugestao
router.put("/approve-suggestion/:id", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    }
    
    const suggestionId = req.params.id;
    console.log(`[APPROVE] Tentativa de aprovacao da sugestao ID: ${suggestionId}`);
    
    const collection = getSuggestionsCollection();
    
    // Buscar sugestao
    let suggestion;
    try {
      suggestion = await collection.findOne({ _id: new ObjectId(suggestionId) });
    } catch (e) {
      // Tentar buscar por ID legado se ObjectId falhar
      suggestion = await collection.findOne({ odIdLegacy: suggestionId });
    }
    
    if (!suggestion) {
      console.log(`[APPROVE] Sugestao ${suggestionId} nao encontrada`);
      return res.status(404).json({ success: false, message: 'Sugestao nao encontrada' });
    }
    
    console.log(`[APPROVE] Aprovando sugestao de ${suggestion.userName}: ${(suggestion.suggestion || '').substring(0, 50)}...`);
    
    // Criar arquivo de conhecimento
    const timestamp = Date.now();
    const safeTitle = `sugestao_aprovada_${suggestionId}_${timestamp}`;
    const fileName = `${safeTitle}.txt`;
    const ragKnowledgeDir = path.join(rootDir, 'rag-knowledge');
    
    // Criar diretorio se nao existir
    if (!fs.existsSync(ragKnowledgeDir)) {
      fs.mkdirSync(ragKnowledgeDir, { recursive: true });
    }
    
    const filePath = path.join(ragKnowledgeDir, fileName);
    
    // Formatar conteudo com metadados
    const formattedContent = `SUGESTAO APROVADA - ${suggestion.userName || 'Anonimo'}
Data da Sugestao: ${suggestion.createdAt || new Date()}
Data de Aprovacao: ${new Date().toISOString()}
Usuario: ${suggestion.userName || 'Anonimo'}
Telefone: ${suggestion.userPhone || 'N/A'}

CONTEUDO DA SUGESTAO:
${suggestion.suggestion}

CONTEXTO DA CONVERSA:
Ultima mensagem do usuario: ${suggestion.lastUserMessage || 'N/A'}
Ultima resposta do bot: ${suggestion.lastBotReply || 'N/A'}`;
    
    // Salvar arquivo
    fs.writeFileSync(filePath, formattedContent, 'utf-8');
    console.log(`[APPROVE] Arquivo de conhecimento criado: ${fileName}`);
    
    // Atualizar status no MongoDB
    await collection.updateOne(
      { _id: suggestion._id },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date(),
          approvedBy: 'admin',
          fileName: fileName
        }
      }
    );
    
    // Tentar adicionar ao RAG via MongoDB
    try {
      await addDocument(
        `Sugestao: ${(suggestion.suggestion || '').substring(0, 50)}`,
        formattedContent,
        'user_suggestion',
        ['sugestao', 'usuario', suggestion.userName || 'anonimo']
      );
      console.log('[APPROVE] Documento adicionado ao RAG via MongoDB');
    } catch (ragErr) {
      console.warn('[APPROVE] Falha ao adicionar ao RAG:', ragErr.message);
    }
    
    console.log(`[APPROVE] Sugestao ${suggestionId} aprovada com sucesso!`);
    
    res.json({
      success: true,
      message: 'Sugestao aprovada e conhecimento adicionado ao RAG com sucesso!',
      fileName,
      suggestionId,
      approvedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[APPROVE] Erro ao aprovar sugestao ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao aprovar sugestao',
      message: err.message
    });
  }
});

// PUT /reject-suggestion/:id - Rejeitar sugestao
router.put("/reject-suggestion/:id", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    }
    
    const suggestionId = req.params.id;
    const { reason } = req.body;
    
    console.log(`[REJECT] Tentativa de rejeicao da sugestao ID: ${suggestionId}`);
    
    const collection = getSuggestionsCollection();
    
    // Buscar sugestao
    let suggestion;
    try {
      suggestion = await collection.findOne({ _id: new ObjectId(suggestionId) });
    } catch (e) {
      suggestion = await collection.findOne({ odIdLegacy: suggestionId });
    }
    
    if (!suggestion) {
      console.log(`[REJECT] Sugestao ${suggestionId} nao encontrada`);
      return res.status(404).json({ success: false, message: 'Sugestao nao encontrada' });
    }
    
    console.log(`[REJECT] Rejeitando sugestao de ${suggestion.userName}: ${(suggestion.suggestion || '').substring(0, 50)}...`);
    
    // Atualizar status no MongoDB
    await collection.updateOne(
      { _id: suggestion._id },
      {
        $set: {
          status: 'rejected',
          rejectedAt: new Date(),
          rejectedBy: 'admin',
          rejectionReason: reason || 'Nao especificado'
        }
      }
    );
    
    console.log(`[REJECT] Sugestao ${suggestionId} rejeitada com sucesso!`);
    
    res.json({
      success: true,
      message: 'Sugestao rejeitada com sucesso!',
      suggestionId,
      rejectedAt: new Date().toISOString(),
      reason: reason || 'Nao especificado'
    });
  } catch (err) {
    console.error(`[REJECT] Erro ao rejeitar sugestao ${req.params.id}:`, err);
    res.status(500).json({
      success: false,
      error: 'Erro interno ao rejeitar sugestao',
      message: err.message
    });
  }
});

// GET /rag-status - Status do sistema RAG (compatibilidade)
router.get("/rag-status", requireAuth, async (req, res) => {
  try {
    // Usar funcoes existentes do sistema RAG
    const integrity = await checkRAGIntegrity();
    const ragInfo = getRAGInfo();
    
    // Verificar arquivos de conhecimento
    const ragKnowledgeDir = path.join(rootDir, 'rag-knowledge');
    let knowledgeFiles = 0;
    if (fs.existsSync(ragKnowledgeDir)) {
      knowledgeFiles = fs.readdirSync(ragKnowledgeDir).filter(f => f.endsWith('.txt')).length;
    }
    
    const status = {
      knowledgeFiles: knowledgeFiles,
      databaseEntries: ragInfo.documentsCount || 0,
      databaseStatus: integrity.isValid ? 'loaded' : 'error',
      isHealthy: integrity.isValid && (ragInfo.documentsCount > 0 || knowledgeFiles > 0),
      lastCheck: new Date().toISOString(),
      integrity: integrity,
      ragInfo: ragInfo
    };
    
    console.log('[RAG-STATUS] Status verificado:', status);
    
    res.json({
      success: true,
      status
    });
  } catch (err) {
    console.error('[RAG-STATUS] Erro ao verificar status:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /intelligence-stats - Estatisticas de inteligencia
router.get("/intelligence-stats", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    }
    
    const metricasCollection = getMetricasCollection();
    
    // Buscar metricas com dados de inteligencia
    const metricas = await metricasCollection
      .find({ questionType: { $exists: true } })
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray();
    
    if (metricas.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhuma conversa com metricas de inteligencia encontrada',
        stats: null
      });
    }
    
    // Calcular estatisticas
    const questionTypes = {};
    const sentiments = { positive: 0, negative: 0, neutral: 0 };
    const urgencyLevels = { normal: 0, high: 0 };
    let totalRelevance = 0;
    let relevanceCount = 0;
    let totalEntities = 0;
    
    metricas.forEach(m => {
      // Tipos de pergunta
      if (m.questionType) {
        questionTypes[m.questionType] = (questionTypes[m.questionType] || 0) + 1;
      }
      
      // Sentimentos
      if (m.sentiment) {
        sentiments[m.sentiment] = (sentiments[m.sentiment] || 0) + 1;
      }
      
      // Urgencia
      if (m.urgency) {
        urgencyLevels[m.urgency] = (urgencyLevels[m.urgency] || 0) + 1;
      }
      
      // Relevancia media
      if (m.intelligenceMetrics?.contextRelevance) {
        totalRelevance += m.intelligenceMetrics.contextRelevance;
        relevanceCount++;
      }
      
      // Entidades detectadas
      if (m.entitiesDetected) {
        totalEntities += Object.values(m.entitiesDetected).flat().length;
      }
    });
    
    const stats = {
      totalIntelligentConversations: metricas.length,
      questionTypes,
      sentiments,
      urgencyLevels,
      averageRelevance: relevanceCount > 0 ? totalRelevance / relevanceCount : 0,
      averageEntitiesPerConversation: metricas.length > 0 ? totalEntities / metricas.length : 0,
      lastUpdated: new Date().toISOString(),
      recentConversations: metricas.slice(0, 10).map(m => ({
        timestamp: m.timestamp,
        questionType: m.questionType,
        sentiment: m.sentiment,
        entitiesCount: m.entitiesDetected ? Object.values(m.entitiesDetected).flat().length : 0,
        relevance: m.intelligenceMetrics?.contextRelevance || 0
      }))
    };
    
    // Incluir metricas do sistema Winston se disponiveis
    stats.systemMetrics = metrics.getStats();
    
    console.log('[INTELLIGENCE-STATS] Estatisticas calculadas');
    
    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('[INTELLIGENCE-STATS] Erro ao calcular estatisticas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as suggestionsRoutes };
