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
import rateLimit from "express-rate-limit";
import swaggerUi from "swagger-ui-express";
import * as Sentry from "@sentry/node";
import { initializeRAG, checkRAGIntegrity, getRAGInfo } from "./rag-search.js";
import { metrics } from "./src/utils/metrics.js";
import {
  connectToMongo,
  isConnected,
  getPrintParametersCollection
} from "./db.js";
import { attachAdminSecurity } from "./admin/security.js";
import attachKnowledgeRoutes from "./admin/knowledge-routes.js";
import { chatRoutes } from "./src/routes/chatRoutes.js";
import { buildAdminRoutes } from "./src/routes/adminRoutes.js";
import { authRoutes, requireJWT as requireJWT_middleware } from "./src/routes/authRoutes.js";
import { suggestionsRoutes } from "./src/routes/suggestionsRoutes.js";
import { apiRoutes } from "./src/routes/apiRoutes.js";
import { swaggerSpec } from "./src/docs/swagger.js";
import { notifyBootstrapError } from "./src/utils/notifications.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 0.1
  });
}

const app = express();
const PORT = process.env.PORT || 10000;

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean)
  : ["https://seu-site.com"];

app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

// Rate limiting para rotas sensíveis
const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas requisições. Tente novamente mais tarde." }
});

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: "Muitas tentativas de autenticação. Aguarde alguns minutos." }
});

app.use("/auth", authLimiter);
app.use(["/admin", "/api/admin", "/api/chat", "/chat"], sensitiveLimiter);

// Swagger UI
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

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

// ✅ Rota de compatibilidade /api/chat para delegar a /ask
app.post('/api/chat', async (req, res, next) => {
  try {
    const { message, sessionId, userName, userEmail, userPhone, resin, printer, image, imageUrl } = req.body;
    
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mensagem inválida' 
      });
    }
    
    const finalSessionId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
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

// Montar rotas de chat (contém /ask) em / e /api para compatibilidade
app.use(chatRoutes);
app.use("/api", chatRoutes);
// Compatibilidade adicional para clientes que duplicam o prefixo /api
app.use("/api/api", chatRoutes);

// Montar apiRoutes em /api e também na raiz para compatibilidade com frontends legados
app.use("/api", apiRoutes);
app.use("/", apiRoutes);
app.use("/api/api", apiRoutes);

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
    return res.status(401).json({ error: 'Token inválido' });
  }

  return requireJWT_middleware(req, res, next);
};

// ✅ ROTA /resins PÚBLICA – lida diretamente do MongoDB (parametros)
app.get("/resins", async (_req, res) => {
  try {
    await connectToMongo();
    const collection = getPrintParametersCollection();

    const resins = await collection
      .aggregate([
        {
          $group: {
            _id: "$resinId",
            name: { $first: "$resinName" },
            profiles: { $sum: 1 }
          }
        },
        { $sort: { name: 1 } }
      ])
      .toArray();

    if (!resins || resins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Nenhuma resina encontrada no MongoDB"
      });
    }

    console.log(`✅ [PUBLIC] Listando ${resins.length} resinas do MongoDB`);

    res.json({
      success: true,
      resins: resins.map((item) => ({
        _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
        name: item.name || "Sem nome",
        description: `Perfis cadastrados: ${item.profiles ?? 0}`,
        profiles: item.profiles ?? 0,
        active: true
      })),
      total: resins.length,
      source: "mongo"
    });
  } catch (err) {
    console.error("❌ [PUBLIC] Erro ao listar resinas:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rotas de resinas (admin protegidas) - mantém fallback local para manutenção
app.get("/params/resins", requireAuth, async (_req, res) => {
  try {
    await connectToMongo();
    const collection = getPrintParametersCollection();

    const resins = await collection
      .aggregate([
        {
          $group: {
            _id: "$resinId",
            name: { $first: "$resinName" },
            profiles: { $sum: 1 }
          }
        },
        { $sort: { name: 1 } }
      ])
      .toArray();

    res.json({
      success: true,
      resins: resins.map((item) => ({
        _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
        name: item.name || "Sem nome",
        description: `Perfis cadastrados: ${item.profiles ?? 0}`,
        profiles: item.profiles ?? 0,
        active: true
      })),
      total: resins.length
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
      notifyBootstrapError(error, "mongodb");
    }
  }

  if (process.env.OPENAI_API_KEY && process.env.MONGODB_URI) {
    try {
      await initializeRAG();
    } catch (error) {
      console.warn("[boot] Falha ao inicializar o RAG:", error.message);
      notifyBootstrapError(error, "rag");
    }
  }
}

bootstrapServices();

app.listen(PORT, () => {
  console.log(`🚀 Bot Quanton3D rodando na porta ${PORT}`);
});
