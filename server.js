// =========================
// 🤖 Quanton3D - SERVIDOR STANDALONE
// Versão: FINAL - Todas as rotas funcionando
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import OpenAI from "openai";
import { ObjectId } from "mongodb";

// Importações do sistema
import { 
  initializeRAG, 
  checkRAGIntegrity, 
  getRAGInfo,
  searchKnowledge,
  formatContext
} from "./rag-search.js";

import {
  connectToMongo,
  isConnected,
  getPrintParametersCollection,
  getMessagesCollection,
  getGalleryCollection,
  getSuggestionsCollection,
  Conversas
} from "./db.js";

import {
  analyzeQuestionType,
  analyzeSentiment,
  calculateIntelligenceMetrics,
  extractEntities,
  generateIntelligentContext,
  learnFromConversation,
  personalizeResponse
} from "./ai-intelligence-system.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");
const distDir = path.join(__dirname, "dist");

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 10000;

// =========================
// CONFIGURAÇÃO DE CORS
// =========================

const allowedOrigins = [
  'https://quanton3dia.onrender.com',
  'https://quanton3d-bot-v2.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:10000'
];

app.use(cors({
  origin: function(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS bloqueou: ${origin}`);
      callback(null, true); // Permitir por enquanto
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true
}));

app.options('*', cors());

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// =========================
// MIDDLEWARES
// =========================

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
}

// Log de requisições
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📨 [${timestamp}] ${req.method} ${req.path}`);
  next();
});

// =========================
// OPENAI CLIENT
// =========================

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE ?? 0.2);
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// =========================
// HEALTH CHECKS
// =========================

app.get("/health", async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({ 
      status: "ok", 
      database: dbStatus,
      openai: openaiClient ? "configured" : "missing",
      timestamp: new Date().toISOString(),
      cors: "enabled"
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: error.message });
  }
});

// =========================
// ROTA DE CHAT (/api/ask e /api/chat)
// =========================

const fallbackReplies = {
  ola: "Olá! Bem-vindo à Quanton3D!",
  default: "Desculpe, não entendi. Como posso ajudar?"
};

function buildFallbackReply(message) {
  const msgLower = message.toLowerCase();
  if (msgLower.includes('ola') || msgLower.includes('olá')) {
    return fallbackReplies.ola;
  }
  return fallbackReplies.default;
}

async function handleChatRequest(req, res) {
  console.log('📨 [CHAT] Requisição recebida');
  
  const { message, sessionId: reqSessionId } = req.body;
  
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      success: false,
      error: 'Mensagem inválida'
    });
  }
  
  const sessionId = reqSessionId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  
  console.log(`📨 [CHAT] Mensagem: "${message}" | Session: ${sessionId}`);
  
  // Fallback se não tiver OpenAI
  if (!openaiClient) {
    console.warn('⚠️ [CHAT] OpenAI não configurado');
    return res.json({
      success: true,
      reply: buildFallbackReply(message),
      fallback: true
    });
  }
  
  try {
    // Buscar conversa existente
    let conversation = null;
    if (isConnected()) {
      conversation = await Conversas.findOne({ sessionId }).sort({ createdAt: -1 });
    }
    
    const history = conversation?.messages || [];
    const limitedHistory = history.slice(-16);
    
    // Análise inteligente
    const questionType = analyzeQuestionType(message);
    const entities = extractEntities(message);
    const sentiment = analyzeSentiment(message);
    
    // Buscar conhecimento
    let relevantKnowledge = [];
    try {
      relevantKnowledge = await searchKnowledge(message, 5);
    } catch (err) {
      console.warn('⚠️ [CHAT] Falha ao buscar conhecimento:', err.message);
    }
    
    const knowledgeContext = formatContext(relevantKnowledge);
    
    // Chamar OpenAI
    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      messages: [
        { 
          role: "system", 
          content: `Você é o Elios, atendente da Quanton3D. Seja direto e técnico.${knowledgeContext}` 
        },
        ...limitedHistory.map(msg => ({ role: msg.role, content: msg.content })),
        { role: "user", content: message }
      ]
    });
    
    const reply = completion?.choices?.[0]?.message?.content || "Não consegui elaborar uma resposta.";
    
    console.log('✅ [CHAT] Resposta gerada');
    
    // Salvar conversa
    if (isConnected()) {
      const timestamp = new Date();
      const updatedMessages = [
        ...history,
        { role: "user", content: message, timestamp },
        { role: "assistant", content: reply, timestamp }
      ];
      
      if (conversation) {
        conversation.messages = updatedMessages;
        conversation.updatedAt = timestamp;
        await conversation.save();
      } else {
        await Conversas.create({
          sessionId,
          messages: updatedMessages,
          createdAt: timestamp,
          updatedAt: timestamp
        });
      }
    }
    
    res.json({
      success: true,
      reply,
      historyLength: history.length + 2,
      documentsUsed: relevantKnowledge.length
    });
    
  } catch (err) {
    console.error('❌ [CHAT] Erro:', err);
    res.json({
      success: true,
      reply: buildFallbackReply(message),
      fallback: true
    });
  }
}

app.post("/api/ask", handleChatRequest);
app.post("/api/chat", handleChatRequest);
app.post("/ask", handleChatRequest);
app.post("/chat", handleChatRequest);

// =========================
// ROTAS DE FORMULÁRIOS
// =========================

app.post("/api/register-user", async (req, res) => {
  try {
    const { name, phone, email, resin, problemType, sessionId } = req.body;
    
    console.log('📝 [REGISTER] Usuário:', name, email);
    
    if (!name || !phone || !email) {
      return res.status(400).json({
        success: false,
        error: "Nome, telefone e email são obrigatórios"
      });
    }
    
    if (isConnected() && sessionId) {
      await Conversas.findOneAndUpdate(
        { sessionId },
        {
          $set: {
            userName: name,
            userPhone: phone,
            userEmail: email,
            resin: resin || null,
            problemType: problemType || null,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
    
    res.json({
      success: true,
      message: "Usuário registrado com sucesso",
      user: { name, phone, email, resin, problemType }
    });
  } catch (err) {
    console.error('❌ [REGISTER] Erro:', err);
    res.status(500).json({
      success: false,
      error: "Erro ao registrar usuário"
    });
  }
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    console.log('📧 [CONTACT] Mensagem de:', name, email);
    
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Nome, email e mensagem são obrigatórios"
      });
    }
    
    if (isConnected()) {
      const messagesCollection = getMessagesCollection();
      await messagesCollection.insertOne({
        name,
        email,
        phone: phone || null,
        subject: subject || "Contato via Site",
        message,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    res.json({
      success: true,
      message: "Mensagem enviada com sucesso!"
    });
  } catch (err) {
    console.error('❌ [CONTACT] Erro:', err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar mensagem"
    });
  }
});

app.post("/api/custom-request", async (req, res) => {
  try {
    const { name, email, phone, resin, printer, description, urgency } = req.body;
    
    console.log('📝 [CUSTOM] Solicitação de:', name, email);
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "Nome e email são obrigatórios"
      });
    }
    
    if (isConnected()) {
      const messagesCollection = getMessagesCollection();
      await messagesCollection.insertOne({
        type: "custom_request",
        name,
        email,
        phone: phone || null,
        resin: resin || null,
        printer: printer || null,
        description: description || null,
        urgency: urgency || "normal",
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    res.json({
      success: true,
      message: "Solicitação enviada com sucesso!"
    });
  } catch (err) {
    console.error('❌ [CUSTOM] Erro:', err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar solicitação"
    });
  }
});

app.post("/api/suggest-knowledge", async (req, res) => {
  try {
    const { suggestion, userName, userPhone, sessionId, lastUserMessage, lastBotReply } = req.body;
    
    console.log('💡 [SUGGEST] Sugestão de:', userName);
    
    if (!suggestion) {
      return res.status(400).json({
        success: false,
        error: "Sugestão é obrigatória"
      });
    }
    
    if (isConnected()) {
      const suggestionsCollection = getSuggestionsCollection();
      await suggestionsCollection.insertOne({
        suggestion,
        userName: userName || "Usuário Anônimo",
        userPhone: userPhone || null,
        sessionId: sessionId || null,
        context: {
          lastUserMessage: lastUserMessage || null,
          lastBotReply: lastBotReply || null
        },
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date()
      });
    }
    
    res.json({
      success: true,
      message: "Obrigado pela sugestão! Nossa equipe irá analisar."
    });
  } catch (err) {
    console.error('❌ [SUGGEST] Erro:', err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar sugestão"
    });
  }
});

// =========================
// ROTAS DE PARÂMETROS
// =========================

app.get("/api/resins", async (_req, res) => {
  try {
    if (!isConnected()) {
      await connectToMongo();
    }

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
        _id: item._id,
        name: item.name,
        profiles: item.profiles
      })),
      total: resins.length
    });
  } catch (err) {
    console.error('❌ [RESINS] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/api/params/printers", async (req, res) => {
  try {
    if (!isConnected()) {
      await connectToMongo();
    }

    const { resinId } = req.query;
    const filter = resinId ? { resinId } : {};
    
    const collection = getPrintParametersCollection();
    const printers = await collection
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$printerId",
            brand: { $first: "$brand" },
            model: { $first: "$model" }
          }
        },
        { $sort: { brand: 1, model: 1 } }
      ])
      .toArray();

    res.json({
      success: true,
      printers: printers.map((item) => ({
        id: item._id,
        brand: item.brand,
        model: item.model
      }))
    });
  } catch (err) {
    console.error('❌ [PRINTERS] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================
// GALERIA
// =========================

app.get("/api/gallery", async (req, res) => {
  try {
    const { page = 1, limit = 12 } = req.query;
    
    if (!isConnected()) {
      await connectToMongo();
    }
    
    const galleryCollection = getGalleryCollection();
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const items = await galleryCollection
      .find({ status: "approved" })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const total = await galleryCollection.countDocuments({ status: "approved" });
    
    res.json({
      success: true,
      items,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error('❌ [GALLERY] Erro:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// =========================
// FALLBACK SPA
// =========================

app.get('*', (req, res) => {
  if (
    req.path.startsWith('/api') || 
    req.path.startsWith('/admin') || 
    req.path.startsWith('/auth') ||
    req.path.startsWith('/uploads') ||
    req.path.startsWith('/health')
  ) {
    return res.status(404).json({ 
      success: false, 
      message: 'Rota não encontrada',
      path: req.path
    });
  }
  
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).json({ 
      success: false, 
      message: 'Frontend não compilado'
    });
  }
});

// =========================
// INICIALIZAÇÃO
// =========================

async function bootstrap() {
  console.log('\n🚀 Iniciando Quanton3D Bot...\n');
  
  if (process.env.MONGODB_URI) {
    try {
      await connectToMongo();
      console.log('✅ MongoDB conectado');
    } catch (error) {
      console.error("❌ MongoDB falhou:", error.message);
    }
  }

  if (process.env.OPENAI_API_KEY && isConnected()) {
    try {
      await initializeRAG();
      console.log('✅ RAG inicializado');
    } catch (error) {
      console.error("❌ RAG falhou:", error.message);
    }
  }
  
  console.log('\n✨ Servidor pronto!\n');
}

bootstrap().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════');
    console.log('🤖 QUANTON3D BOT ONLINE!');
    console.log('═══════════════════════════════════════════════');
    console.log(`📡 Porta: ${PORT}`);
    console.log(`💚 Health: /health`);
    console.log(`🤖 Chat: /api/ask`);
    console.log('═══════════════════════════════════════════════\n');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Porta ${PORT} em uso!`);
    } else {
      console.error('❌ Erro no servidor:', error);
    }
    process.exit(1);
  });
});

export default app;
