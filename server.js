// =========================
// 🤖 Quanton3D IA - Servidor com CORS baseado em ENV
// Versão: 4.0 - PRODUÇÃO PRONTA
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import OpenAI from "openai";

// Importações dos módulos do sistema
import { initializeRAG, checkRAGIntegrity, getRAGInfo } from "./rag-search.js";
import { connectToMongo, isConnected, getPrintParametersCollection } from "./db.js";

// Importações das rotas
import { chatRoutes } from "./src/routes/chatRoutes.js";
import { apiRoutes } from "./src/routes/apiRoutes.js";
import { authRoutes, verifyJWT } from "./src/routes/authRoutes.js";
import { buildAdminRoutes } from "./src/routes/adminRoutes.js";
import { suggestionsRoutes } from "./src/routes/suggestionsRoutes.js";

// Importações admin
import { attachAdminSecurity } from "./admin/security.js";
import attachKnowledgeRoutes from "./admin/knowledge-routes.js";

// Configuração de ambiente
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Diretórios
const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(__dirname, "uploads");
const distDir = path.join(__dirname, "dist");

// Criar pasta de uploads se não existir
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log('📁 Pasta uploads/ criada');
}

// Inicializar Express
const app = express();
const PORT = process.env.PORT || 10000;

// =========================
// CONFIGURAÇÃO DE CORS BASEADA EM ENV
// =========================

// ✅ LER ORIGENS PERMITIDAS DAS VARIÁVEIS DE AMBIENTE
const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || '';
const allowedOriginsList = allowedOriginsEnv
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

// Lista padrão de origens permitidas
const defaultAllowedOrigins = [
  'https://quanton3dia.onrender.com',
  'https://quanton3d-bot-v2.onrender.com',
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:10000'
];

// Combinar origens do ENV com as padrões
const allowedOrigins = [...new Set([...allowedOriginsList, ...defaultAllowedOrigins])];

console.log('🔒 CORS - Origens permitidas:', allowedOrigins);

// =========================
// MIDDLEWARES GLOBAIS
// =========================

// CORS - CONFIGURAÇÃO BASEADA EM ENV
app.use(cors({
  origin: function(origin, callback) {
    // Permitir requisições sem origin (Postman, curl, mobile apps)
    if (!origin) {
      return callback(null, true);
    }
    
    // Verificar se a origem está na lista permitida
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.warn(`⚠️ CORS - Origem bloqueada: ${origin}`);
      
      // ✅ EM DESENVOLVIMENTO: Permitir todas as origens
      if (process.env.NODE_ENV !== 'production') {
        console.log('🔓 Modo desenvolvimento: permitindo origem');
        callback(null, true);
      } else {
        // ❌ EM PRODUÇÃO: Bloquear origens não autorizadas
        callback(new Error(`Origem não permitida: ${origin}`));
      }
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200
}));

// Tratar preflight requests (OPTIONS)
app.options('*', cors());

// Headers adicionais de CORS
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (!origin || process.env.NODE_ENV !== 'production') {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Body parsers
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Servir arquivos estáticos
app.use(express.static(publicDir));
app.use("/uploads", express.static(uploadsDir));

// Servir build do React (se existir)
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  console.log('✅ Servindo build do React da pasta dist/');
} else {
  console.warn('⚠️ Pasta dist/ não encontrada');
}

// Middleware de log
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📨 [${timestamp}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'none'}`);
  next();
});

// =========================
// ROTAS DE SAÚDE (Health Checks)
// =========================

app.get("/health", async (req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    const openaiStatus = process.env.OPENAI_API_KEY ? "configured" : "missing";
    
    res.json({ 
      status: "ok", 
      database: dbStatus,
      openai: openaiStatus,
      timestamp: new Date().toISOString(),
      port: PORT,
      cors: {
        enabled: true,
        allowedOrigins,
        requestOrigin: req.headers.origin || 'none'
      },
      env: process.env.NODE_ENV || 'development'
    });
  } catch (error) {
    res.status(500).json({ 
      status: "error", 
      message: error.message 
    });
  }
});

app.get("/health/openai", async (_req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: "OPENAI_API_KEY não configurada"
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const models = await client.models.list({ limit: 1 });
    
    res.json({
      success: true,
      model: models?.data?.[0]?.id || null
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

app.get("/health/rag", async (_req, res) => {
  try {
    const integrity = await checkRAGIntegrity();
    const ragInfo = getRAGInfo();
    
    res.json({
      success: integrity.isValid,
      integrity,
      ragInfo
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

app.get("/health/cors", (req, res) => {
  res.json({
    success: true,
    message: "CORS está funcionando!",
    origin: req.headers.origin || 'none',
    allowedOrigins,
    env: process.env.NODE_ENV || 'development'
  });
});

// =========================
// MONTAGEM DAS ROTAS
// =========================

console.log('📡 Montando rotas...');

// 1. ROTAS DE CHAT
app.use("/api", chatRoutes);
app.use(chatRoutes);

// 2. ROTAS DE API PÚBLICAS
app.use("/api", apiRoutes);
app.use(apiRoutes);

// 3. ROTAS DE AUTENTICAÇÃO
app.use("/auth", authRoutes);

// 4. ROTAS DE ADMIN
app.use("/admin", buildAdminRoutes());

// 5. ROTAS DE SUGESTÕES
app.use(suggestionsRoutes);

// 6. SEGURANÇA E CONHECIMENTO
attachAdminSecurity(app);
attachKnowledgeRoutes(app);

// =========================
// ROTA PÚBLICA: /resins
// =========================

app.get("/resins", async (_req, res) => {
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

    if (!resins || resins.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Nenhuma resina encontrada"
      });
    }

    res.json({
      success: true,
      resins: resins.map((item) => ({
        _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
        name: item.name || "Sem nome",
        description: `Perfis: ${item.profiles ?? 0}`,
        profiles: item.profiles ?? 0,
        active: true
      })),
      total: resins.length
    });
  } catch (err) {
    console.error("❌ Erro ao listar resinas:", err);
    res.status(500).json({ 
      success: false, 
      error: err.message 
    });
  }
});

// =========================
// FALLBACK PARA SPA
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
// TRATAMENTO DE ERROS
// =========================

app.use((err, req, res, next) => {
  console.error('❌ Erro não tratado:', err);
  
  // Erro de CORS
  if (err.message && err.message.includes('Origem não permitida')) {
    return res.status(403).json({
      success: false,
      error: 'CORS Error',
      message: 'Origem não autorizada',
      origin: req.headers.origin
    });
  }
  
  res.status(500).json({
    success: false,
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// =========================
// INICIALIZAÇÃO
// =========================

async function bootstrapServices() {
  console.log('\n🚀 Iniciando Quanton3D Bot...\n');
  
  // MongoDB
  if (process.env.MONGODB_URI) {
    try {
      await connectToMongo();
      console.log('✅ MongoDB conectado');
    } catch (error) {
      console.error("❌ MongoDB falhou:", error.message);
    }
  } else {
    console.warn('⚠️ MONGODB_URI não configurado');
  }

  // OpenAI
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY não configurado');
  } else {
    console.log('✅ OpenAI API configurada');
  }

  // RAG
  if (process.env.OPENAI_API_KEY && isConnected()) {
    try {
      await initializeRAG();
      console.log('✅ RAG inicializado');
    } catch (error) {
      console.error("❌ RAG falhou:", error.message);
    }
  }
  
  console.log('\n✨ Serviços inicializados!\n');
}

// =========================
// INICIAR SERVIDOR
// =========================

bootstrapServices().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════');
    console.log('🤖 QUANTON3D BOT ONLINE!');
    console.log('═══════════════════════════════════════════════');
    console.log(`📡 Porta: ${PORT}`);
    console.log(`🌍 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🔒 CORS: ${allowedOrigins.length} origens permitidas`);
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

  process.on('SIGTERM', () => {
    console.log('⚠️ SIGTERM recebido');
    server.close(() => {
      console.log('✅ Servidor encerrado');
      mongoose.connection.close(false, () => {
        console.log('✅ MongoDB desconectado');
        process.exit(0);
      });
    });
  });
});

export default app;
