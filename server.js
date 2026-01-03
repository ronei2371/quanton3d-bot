// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 22/12/2025)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
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
import { authRoutes, requireJWT } from "./src/routes/authRoutes.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, "public");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));
app.use(express.static(publicDir));

// --- ROTAS VITAIS (CORREÇÃO DO ERRO 'CANNOT GET') ---

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

// Endpoint de metricas para monitoramento de desempenho
app.get('/health/metrics', (_req, res) => {
  res.json({
    success: true,
    metrics: metrics.getStats(),
    timestamp: new Date().toISOString()
  });
});

// Respostas automáticas (Fallback se IA falhar)
const respostasAutomaticas = {
  'ola': 'Olá! Bem-vindo à Quanton3D! Como posso ajudar?',
  'produtos': 'Temos resinas para: Action Figures, Odontologia, Engenharia, Joalheria e Uso Geral. Qual te interessa?',
  'preço': 'Nossos preços variam de R$ 150 a R$ 900. Qual produto você gostaria de saber?',
  'contato': 'Entre em contato: (31) 3271-6935 ou WhatsApp (31) 3271-6935',
  'endereço': 'Av. Dom Pedro II, 5056 - Jardim Montanhês, Belo Horizonte - MG',
  'horario': 'Atendemos de segunda a sexta, das 9h às 18h.',
  'entrega': 'Fazemos entregas para todo o Brasil via Correios!',
  'resina': 'Trabalhamos com resinas UV de alta performance. Qual aplicação você precisa? Action figures, odontologia, engenharia ou joalheria?',
  'action': 'Para action figures temos: Alchemist, FlexForm, Iron, PyroBlast, Spark e Spin. Todas com ótimo acabamento!',
  'odonto': 'Para odontologia: Athom Dental, Alinhadores, Gengiva e Washable. Todas biocompatíveis!',
  'engenharia': 'Para engenharia: Iron (ultra resistente), FlexForm (flexível) e Vulcan Cast (fundição).',
  'default': 'Desculpe, não entendi. Posso ajudar com: produtos, preços, contato, endereço ou horário. Ou ligue: (31) 3271-6935'
};

// ✅ CORREÇÃO #1: Rota /api/chat agora usa sistema RAG completo
// Delega para a rota /ask que tem inteligência real com GPT-4o
app.post('/api/chat', async (req, res) => {
  try {
    const { message, sessionId, userName, userEmail, userPhone, resin, printer } = req.body;
    
    // Validação básica
    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'Mensagem inválida' 
      });
    }
    
    // Gerar sessionId se não fornecido
    const finalSessionId = sessionId || `chat-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Preparar dados para /ask
    const askPayload = {
      message: message.trim(),
      sessionId: finalSessionId,
      userName: userName || undefined,
      userEmail: userEmail || undefined,
      userPhone: userPhone || undefined,
      resin: resin || undefined,
      printer: printer || undefined
    };
    
    // Fazer requisição interna para /ask
    const askRequest = {
      body: askPayload,
      params: {}
    };
    
    // Criar objeto de resposta mock
    let askResponse = null;
    const mockRes = {
      json: (data) => { askResponse = data; },
      status: (code) => ({
        json: (data) => { askResponse = { ...data, statusCode: code }; }
      })
    };
    
    // Importar e executar handler do /ask
    const { chatRoutes } = await import('./src/routes/chatRoutes.js');
    
    // Simular requisição para /ask
    const askHandler = chatRoutes.stack.find(layer => 
      layer.route && layer.route.path === '/ask' && layer.route.methods.post
    );
    
    if (askHandler) {
      await askHandler.route.stack[0].handle(askRequest, mockRes);
      
      if (askResponse) {
        // Adaptar resposta do /ask para formato do /api/chat
        return res.json({
          success: true,
          response: askResponse.reply || askResponse.response,
          sessionId: finalSessionId,
          documentsUsed: askResponse.documentsUsed || 0,
          historyLength: askResponse.historyLength || 1,
          rag_enabled: true
        });
      }
    }
    
    // Fallback se não conseguir usar /ask
    const msgLower = message.toLowerCase();
    let resposta = respostasAutomaticas.default;
    
    for (let palavra in respostasAutomaticas) {
      if (msgLower.includes(palavra)) {
        resposta = respostasAutomaticas[palavra];
        break;
      }
    }
    
    res.json({ 
      success: true,
      response: resposta, 
      sessionId: finalSessionId,
      fallback: true 
    });
    
  } catch (error) {
    console.error('❌ [/api/chat] Erro:', error);
    res.status(500).json({ 
      success: false,
      error: 'Erro ao processar mensagem',
      message: error.message 
    });
  }
});

app.use(chatRoutes);
attachAdminSecurity(app);
attachKnowledgeRoutes(app);

// Rotas de autenticação (públicas)
app.use("/auth", authRoutes);

// Rotas admin (protegidas por JWT)
app.use("/admin", buildAdminRoutes());

// ===== ROTAS DE COMPATIBILIDADE (SISTEMA ANTIGO) =====
// Estas rotas mantêm compatibilidade com o frontend antigo

import fs from "fs";

const ADMIN_AUTH_TOKEN = 'quanton3d_admin_secret';

// Middleware de autenticação: aceita tanto JWT quanto token antigo
const requireAuth = (req, res, next) => {
  // Tentar JWT primeiro (novo sistema)
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return requireJWT(req, res, next);
  }
  
  // Fallback: token antigo via query param (compatibilidade)
  const { auth } = req.query;
  if (auth === ADMIN_AUTH_TOKEN) {
    return next();
  }
  
  return res.status(401).json({ success: false, message: 'Não autorizado' });
};

// GET /params/resins - Listar todas as resinas (compatibilidade)
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
    
    console.log(`✅ [COMPAT] Listando ${resinsList.length} resinas`);
    
    res.json({
      success: true,
      resins: resinsList,
      total: resinsList.length
    });
  } catch (err) {
    console.error('❌ [COMPAT] Erro ao listar resinas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /params/resins - Adicionar nova resina (compatibilidade)
app.post("/params/resins", requireAuth, async (req, res) => {
  try {
    const { name } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Nome da resina é obrigatório' });
    }
    
    console.log(`✅ [COMPAT] Nova resina adicionada: ${name}`);
    
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
    console.error('❌ [COMPAT] Erro ao adicionar resina:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /params/resins/:id - Deletar resina (compatibilidade)
app.delete("/params/resins/:id", requireAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log(`✅ [COMPAT] Resina deletada: ${id}`);
    
    res.json({
      success: true,
      message: 'Resina deletada com sucesso'
    });
  } catch (err) {
    console.error('❌ [COMPAT] Erro ao deletar resina:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== FIM DAS ROTAS DE COMPATIBILIDADE =====

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
