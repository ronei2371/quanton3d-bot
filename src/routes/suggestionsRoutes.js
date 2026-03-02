// ====================================================================
// ROTAS DE GERENCIAMENTO DE SUGESTOES (ADMIN + PÚBLICO)
// ====================================================================

import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { ObjectId } from "mongodb";
import { requireJWT } from "./authRoutes.js";
import { ensureMongoReady } from "./common.js"; 
import {
  getSuggestionsCollection,
  getMetricasCollection,
  isConnected,
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
    const { suggestion, history, userName, attachment, attachments } = req.body;
    
    // Garante que o banco está conectado
    await ensureMongoReady();
    const db = getDb();

    const normalizedAttachments = [];
    if (Array.isArray(attachments)) normalizedAttachments.push(...attachments.filter(Boolean));
    if (attachment) normalizedAttachments.push(attachment);
    
    // Salva na coleção 'suggestions'
    await db.collection('suggestions').insertOne({
      suggestion: suggestion || "Sem texto",
      userName: userName || "Anônimo do Chat",
      history: history || [],
      attachments: normalizedAttachments,
      status: 'pending', 
      createdAt: new Date()
    });
    
    res.json({ success: true, message: "Sugestão recebida!" });

  } catch (error) {
    console.error("Erro ao salvar sugestão:", error);
    res.status(500).json({ success: false, error: "Erro interno" });
  }
});

// ====================================================================
// 2. MIDDLEWARE DE AUTENTICAÇÃO
// ====================================================================
const ADMIN_LEGACY_TOKEN = process.env.ADMIN_SECRET_OVERRIDE || process.env.ADMIN_SECRET;

const requireAuth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireJWT(req, res, next);
  }

  const legacyToken = req.query.auth || req.body?.auth;
  if (legacyToken && ADMIN_LEGACY_TOKEN && legacyToken === ADMIN_LEGACY_TOKEN) {
    return next();
  }

  if (!ADMIN_LEGACY_TOKEN && legacyToken) {
    console.warn('[ADMIN] Token legado recebido, mas ADMIN_SECRET não está configurado.');
  }

  return res.status(401).json({ success: false, message: 'Nao autorizado' });
};

// ====================================================================
// 3. ROTAS ADMINISTRATIVAS
// ====================================================================

router.get("/suggestions", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    const collection = getSuggestionsCollection();
    const suggestions = await collection.find({}).sort({ createdAt: -1 }).toArray();
    
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
      attachments: Array.isArray(s.attachments) ? s.attachments.filter(Boolean) : [],
      status: s.status || 'pending',
      timestamp: s.createdAt || new Date(),
      approvedAt: s.approvedAt || null,
      rejectedAt: s.rejectedAt || null,
      rejectionReason: s.rejectionReason || null,
      fileName: s.fileName || null
    }));
    
    res.json({ success: true, suggestions: formattedSuggestions, count: formattedSuggestions.length });
  } catch (err) {
    console.error('[SUGGESTIONS] Erro ao listar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.put("/approve-suggestion/:id", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    const suggestionId = req.params.id;
    const collection = getSuggestionsCollection();
    let suggestion;
    try { suggestion = await collection.findOne({ _id: new ObjectId(suggestionId) }); } 
    catch (e) { suggestion = await collection.findOne({ odIdLegacy: suggestionId }); }
    
    if (!suggestion) return res.status(404).json({ success: false, message: 'Sugestao nao encontrada' });
    
    const timestamp = Date.now();
    const fileName = `sugestao_aprovada_${suggestionId}_${timestamp}.txt`;
    const ragKnowledgeDir = path.join(rootDir, 'rag-knowledge');
    if (!fs.existsSync(ragKnowledgeDir)) fs.mkdirSync(ragKnowledgeDir, { recursive: true });
    
    const formattedContent = `SUGESTAO APROVADA - ${suggestion.userName || 'Anonimo'}\nData: ${new Date().toISOString()}\n\nCONTEUDO:\n${suggestion.suggestion}`;
    fs.writeFileSync(path.join(ragKnowledgeDir, fileName), formattedContent, 'utf-8');
    
    await collection.updateOne({ _id: suggestion._id }, { $set: { status: 'approved', approvedAt: new Date(), approvedBy: 'admin', fileName: fileName } });
    
    try {
      await addDocument(`Sugestao: ${(suggestion.suggestion || '').substring(0, 50)}`, formattedContent, 'user_suggestion', ['sugestao']);
    } catch (ragErr) { console.warn('Falha RAG:', ragErr.message); }
    
    res.json({ success: true, message: 'Aprovada!', fileName });
  } catch (err) {
    console.error(`Erro approve ${req.params.id}:`, err);
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put("/reject-suggestion/:id", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    const suggestionId = req.params.id;
    const { reason } = req.body;
    const collection = getSuggestionsCollection();
    let suggestion;
    try { suggestion = await collection.findOne({ _id: new ObjectId(suggestionId) }); } 
    catch (e) { suggestion = await collection.findOne({ odIdLegacy: suggestionId }); }
    
    if (!suggestion) return res.status(404).json({ success: false, message: 'Sugestao nao encontrada' });
    
    await collection.updateOne({ _id: suggestion._id }, { $set: { status: 'rejected', rejectedAt: new Date(), rejectionReason: reason || 'Nao especificado' } });
    res.json({ success: true, message: 'Rejeitada!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/rag-status", requireAuth, async (req, res) => {
  try {
    const integrity = await checkRAGIntegrity();
    const ragInfo = getRAGInfo();
    const ragKnowledgeDir = path.join(rootDir, 'rag-knowledge');
    let knowledgeFiles = 0;
    if (fs.existsSync(ragKnowledgeDir)) {
      knowledgeFiles = fs.readdirSync(ragKnowledgeDir).filter((f) => f.endsWith('.txt')).length;
    }

    const databaseStatus = isConnected() ? 'connected' : 'disconnected';
    const status = {
      knowledgeFiles,
      databaseEntries: ragInfo.documentsCount || 0,
      databaseStatus,
      isHealthy: Boolean(integrity?.isValid && databaseStatus === 'connected'),
      lastCheck: new Date().toISOString(),
      integrity: {
        totalDocuments: integrity?.totalDocuments ?? 0,
        documentsWithEmbedding: integrity?.documentsWithEmbedding ?? 0,
        reason: integrity?.reason || null
      },
      ragInfo: {
        initializedAt: ragInfo?.lastInitialization || null,
        embeddingModel: ragInfo?.embeddingModel || null,
        embeddingDimensions: ragInfo?.embeddingDimensions || null,
        storage: ragInfo?.storage || 'MongoDB'
      }
    };

    res.json({ success: true, status });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/intelligence-stats", requireAuth, async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ success: false, error: "MongoDB nao conectado" });
    }

    const metricas = await getMetricasCollection()
      .find({ questionType: { $exists: true } })
      .sort({ timestamp: -1 })
      .limit(1000)
      .toArray();

    if (!metricas.length) {
      return res.json({
        success: true,
        stats: {
          totalIntelligentConversations: 0,
          averageRelevance: 0,
          averageEntitiesPerConversation: 0,
          questionTypes: {},
          sentiments: { positive: 0, neutral: 0, negative: 0 },
          urgencyLevels: { high: 0, medium: 0, low: 0, unknown: 0 },
          lastUpdated: null,
          message: 'Sem interacoes registradas',
          systemMetrics: metrics.getStats()
        }
      });
    }

    const questionTypes = {};
    let relevanceSum = 0;
    let relevanceCount = 0;
    let entityTotal = 0;
    const sentiments = { positive: 0, neutral: 0, negative: 0 };
    const urgencyLevels = { high: 0, medium: 0, low: 0, unknown: 0 };

    for (const item of metricas) {
      const typeKey = (item.questionType || 'desconhecido').toLowerCase();
      questionTypes[typeKey] = (questionTypes[typeKey] || 0) + 1;

      const relevanceCandidate = [
        item.questionConfidence,
        item.intelligenceMetrics?.relevanceScore,
        item.intelligenceMetrics?.relevance
      ].find((value) => typeof value === 'number' && Number.isFinite(value));
      if (typeof relevanceCandidate === 'number') {
        relevanceSum += relevanceCandidate;
        relevanceCount += 1;
      }

      const entityCount = Array.isArray(item.entitiesDetected)
        ? item.entitiesDetected.length
        : item.entitiesDetected && typeof item.entitiesDetected === 'object'
          ? Object.keys(item.entitiesDetected).length
          : 0;
      entityTotal += entityCount;

      const sentimentKey = (item.sentiment || 'neutral').toLowerCase();
      if (sentimentKey.includes('pos')) {
        sentiments.positive += 1;
      } else if (sentimentKey.includes('neg')) {
        sentiments.negative += 1;
      } else {
        sentiments.neutral += 1;
      }

      const urgencyKey = (item.urgency || 'unknown').toLowerCase();
      if (urgencyKey.includes('high') || urgencyKey.includes('alta')) {
        urgencyLevels.high += 1;
      } else if (urgencyKey.includes('medium') || urgencyKey.includes('media')) {
        urgencyLevels.medium += 1;
      } else if (urgencyKey.includes('low') || urgencyKey.includes('baixa')) {
        urgencyLevels.low += 1;
      } else {
        urgencyLevels.unknown += 1;
      }
    }

    const stats = {
      totalIntelligentConversations: metricas.length,
      averageRelevance: relevanceCount ? Number((relevanceSum / relevanceCount).toFixed(3)) : 0,
      averageEntitiesPerConversation: Number((entityTotal / metricas.length).toFixed(2)),
      questionTypes,
      sentiments,
      urgencyLevels,
      lastUpdated: metricas[0]?.timestamp ? new Date(metricas[0].timestamp).toISOString() : new Date().toISOString(),
      systemMetrics: metrics.getStats()
    };

    res.json({ success: true, stats });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as suggestionsRoutes };
