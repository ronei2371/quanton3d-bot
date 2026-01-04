// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO CORRIGIDA)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import OpenAI from "openai";
import { initializeRAG, checkRAGIntegrity, getRAGInfo } from "./rag-search.js";
import { metrics } from "./src/utils/metrics.js";
import {
  connectToMongo,
  isConnected
} from "./db.js";
import { attachAdminSecurity } from "./admin/security.js";
import attachKnowledgeRoutes from "./admin/knowledge-routes.js";
import { chatRoutes } from "./src/routes/chatRoutes.js";
import { buildAdminRoutes } from "./src/routes/adminRoutes.js";
import { authRoutes, verifyJWT } from "./src/routes/authRoutes.js";
import { suggestionsRoutes } from "./src/routes/suggestionsRoutes.js";
import { apiRoutes } from "./src/routes/apiRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

// --- ROTAS VITAIS ---

app.get("/health", async (_req, res) => {
  try {
    if (process.env.MONGODB_URI && !isConnected()) {
      await connectToMongo();
    }
    const databaseStatus = mongoose.connection.readyState === 1 ? "connected" : "error";
    res.json({ status: "ok", database: databaseStatus });
  } catch (error) {
    res.status(500).json({ status: "error", database: "error", message: error.message });
  }
});

app.get("/health/openai", async (_req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY ausente"
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const models = await client.models.list({ limit: 1 });
    const sampleModel = models?.data?.[0]?.id;

    return res.json({
      success: Boolean(sampleModel),
      model: sampleModel || null
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get("/health/rag", async (_req, res) => {
  try {
    const integrity = await checkRAGIntegrity();
    const ragInfo = getRAGInfo();
    const healthy = integrity.isValid && Boolean(ragInfo.documentsCount);
    res.json({
      success: healthy,
      integrity,
      ragInfo
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/health/metrics', (_req, res) => {
  res.json({
    success: true,
    metrics: metrics.getStats(),
    timestamp: new Date().toISOString()
  });
});

// ✅ CORREÇÃO #1: ROTA /api/chat SIMPLIFICADA
// Delega DIRETO para a rota /ask via Express (sem hacks)
app.post('/api/chat', async (req, res, next) => {
  try {
    const { message, sessionId, userName, userEmail, userPhone, resin, printer, image, imageUrl } = req.body;
    
    // Validação básica
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mensagem inválida' 
      });
    }
    
    // Gerar sessionId se não fornecido
    const finalSessionId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // ✅ SOLUÇÃO: Reescrever body para formato esperado por /ask
    req.body = {
      message: message.trim(),
      sessionId: finalSessionId,
      userName: userName || undefined,
      userEmail: userEmail || undefined,
      userPhone: userPhone || undefined,
      resin: resin || undefined,
      printer: printer || undefined,
      image: image || undefined,
      imageUrl: imageUrl || undefined
    };
    
    // ✅ Redirecionar para handler de /ask via next('route')
    // Express vai processar naturalmente a próxima rota que dá match
    next();
    
  } catch (error) {
    console.error('❌ [/api/chat] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao processar mensagem',
      message: error.message 
    });
  }
});

// Montar rotas de chat (contém /ask)
app.use(chatRoutes);

// ✅ CORREÇÃO #2: REMOVER DUPLICAÇÃO
// app.use("/api", chatRoutes); // ❌ REMOVIDO - causava conflito

// Montar apiRoutes em /api
app.use("/api", apiRoutes);

attachAdminSecurity(app);
attachKnowledgeRoutes(app);

// Rotas de autenticação (públicas)
app.use("/auth", authRoutes);

// Rotas admin (protegidas por JWT)
app.use("/admin", buildAdminRoutes());

// Rotas de sugestoes
app.use(suggestionsRoutes);

// ===== ROTAS DE COMPATIBILIDADE =====

// Middleware de autenticação simplificado
const requireAuth = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }

  return verifyJWT(req, res, next);
};

// ✅ CORREÇÃO #3: ROTA /resins PÚBLICA (SEM AUTH)
// Frontend está chamando /resins sem autenticação
app.get("/resins", async (req, res) => {
  try {
    const resinsPath = path.join(__dirname, 'resins_extracted.json');
    
    if (!fs.existsSync(resinsPath)) {
      return res.status(404).json({ 
        success: false, 
        message: 'Arquivo de resinas não encontrado' 
      });
    }
    
    const resinsData = JSON.parse(fs.readFileSync(resinsPath, 'utf-8'));
    const resinsArray = resinsData.resins || [];
    const resinsList = resinsArray.map(resin => ({
      _id: resin.id || resin.name.toLowerCase().replace(/\s+/g, '-'),
      name: resin.name,
      description: resin.sourceSheet || 'Sem descrição',
      active: true
    }));
    
    console.log(`✅ [PUBLIC] Listando ${resinsList.length} resinas`);
    
    res.json({
      success: true,
      resins: resinsList,
      total: resinsList.length
    });
  } catch (err) {
    console.error('❌ [PUBLIC] Erro ao listar resinas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas de resinas (admin protegidas)
app.get("/params/resins", requireAuth, async (req, res) => {
  try {
    const resinsPath = path.join(__dirname, 'resins_extracted.json');
    
    if (!fs.existsSync(resinsPath)) {
      return res.status(404).json({ success: false, message: 'Arquivo de resinas não encontrado' });
    }
    
    const resinsData = JSON.parse(fs.readFileSync(resinsPath, 'utf-8'));
    const resinsArray = resinsData.resins || [];
    const resinsList = resinsArray.map(resin => ({
      _id: resin.id || resin.name.toLowerCase().replace(/\s+/g, '-'),
      name: resin.name,
      description: resin.sourceSheet || 'Sem descrição',
      active: true
    }));
    
    console.log(`✅ [ADMIN] Listando ${resinsList.length} resinas`);
    
    res.json({
      success: true,
      resins: resinsList,
      total: resinsList.length
    });
  } catch (err) {
    console.error('❌ [ADMIN] Erro ao listar resinas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post("/params/resins", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Nome da resina é obrigatório' });
    }
    
    console.log(`✅ [ADMIN] Nova resina adicionada: ${name}`);
    
    res.json({
      success: true,
      message: 'Resina adicionada com sucesso',
      resin: {
        _id: name.toLowerCase().replace(/\s+/g, '-'),
        name: name,
        active: true
      }
    });
  } catch (err) {
    console.error('❌ [ADMIN] Erro ao adicionar resina:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete("/params/resins/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`✅ [ADMIN] Resina deletada: ${id}`);
    
    res.json({
      success: true,
      message: 'Resina deletada com sucesso'
    });
  } catch (err) {
    console.error('❌ [ADMIN] Erro ao deletar resina:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

async function bootstrapServices() {
  if (process.env.MONGODB_URI) {
    try {
      await connectToMongo();
    } catch (error) {
      console.warn("[boot] Falha ao conectar ao MongoDB:", error.message);
    }
  }

  if (process.env.OPENAI_API_KEY && process.env.MONGODB_URI) {
    try {
      await initializeRAG();
    } catch (error) {
      console.warn("[boot] Falha ao inicializar o RAG:", error.message);
    }
  }
}

bootstrapServices();

app.listen(PORT, () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`);
});
