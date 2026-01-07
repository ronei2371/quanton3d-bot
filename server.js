// =========================
// 🤖 Quanton3D IA - Servidor Unificado DEFINITIVO
// Versão: 2.0 - CORRIGIDA E TESTADA
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
// MIDDLEWARES GLOBAIS
// =========================

// CORS - DEVE ser o PRIMEIRO middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

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
  console.warn('⚠️ Pasta dist/ não encontrada. Execute "npm run build" primeiro.');
}

// Middleware de log
app.use((req, res, next) => {
  console.log(`📨 ${req.method} ${req.path}`);
  next();
});

// =========================
// ROTAS DE SAÚDE (Health Checks)
// =========================

app.get("/health", async (_req, res) => {
  try {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    const openaiStatus = process.env.OPENAI_API_KEY ? "configured" : "missing";
    
    res.json({ 
      status: "ok", 
      database: dbStatus,
      openai: openaiStatus,
      timestamp: new Date().toISOString(),
      port: PORT
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

// =========================
// MONTAGEM DAS ROTAS (ORDEM CRÍTICA!)
// =========================

// 1. ROTAS DE CHAT - DEVEM VIR PRIMEIRO!
console.log('📡 Montando rotas de chat...');
app.use("/api", chatRoutes);  // /api/ask e /api/chat
app.use(chatRoutes);           // /ask e /chat (sem prefixo)

// 2. ROTAS DE API PÚBLICAS
console.log('📡 Montando rotas de API...');
app.use("/api", apiRoutes);
app.use(apiRoutes); // Fallback sem /api

// 3. ROTAS DE AUTENTICAÇÃO
console.log('📡 Montando rotas de autenticação...');
app.use("/auth", authRoutes);

// 4. ROTAS DE ADMIN (protegidas)
console.log('📡 Montando rotas de admin...');
app.use("/admin", buildAdminRoutes());

// 5. ROTAS DE SUGESTÕES
console.log('📡 Montando rotas de sugestões...');
app.use(suggestionsRoutes);

// 6. SEGURANÇA E CONHECIMENTO (admin)
console.log('📡 Configurando segurança admin...');
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

    console.log(`✅ Listando ${resins.length} resinas`);

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
// FALLBACK PARA SPA (React Router)
// =========================

app.get('*', (req, res) => {
  // Ignorar rotas de API
  if (
    req.path.startsWith('/api') || 
    req.path.startsWith('/admin') || 
    req.path.startsWith('/auth') ||
    req.path.startsWith('/uploads')
  ) {
    return res.status(404).json({ 
      success: false, 
      message: 'Rota não encontrada',
      path: req.path
    });
  }
  
  // Servir index.html para rotas do React
  const indexPath = path.join(distDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(503).json({ 
      success: false, 
      message: 'Frontend não foi compilado. Execute: npm run build'
    });
  }
});

// =========================
// INICIALIZAÇÃO DOS SERVIÇOS
// =========================

async function bootstrapServices() {
  console.log('\n🚀 Iniciando serviços do Quanton3D Bot...\n');
  
  // 1. Conectar MongoDB
  if (process.env.MONGODB_URI) {
    try {
      await connectToMongo();
      console.log('✅ MongoDB conectado com sucesso');
    } catch (error) {
      console.error("❌ Falha ao conectar MongoDB:", error.message);
      console.warn("⚠️ O bot funcionará em modo fallback (sem banco de dados)");
    }
  } else {
    console.warn('⚠️ MONGODB_URI não configurado - banco de dados desabilitado');
  }

  // 2. Verificar OpenAI
  if (!process.env.OPENAI_API_KEY) {
    console.warn('⚠️ OPENAI_API_KEY não configurado - IA desabilitada');
  } else {
    console.log('✅ OpenAI API configurada');
  }

  // 3. Inicializar RAG
  if (process.env.OPENAI_API_KEY && isConnected()) {
    try {
      await initializeRAG();
      console.log('✅ RAG inicializado com sucesso');
    } catch (error) {
      console.error("❌ Falha ao inicializar RAG:", error.message);
      console.warn("⚠️ O bot funcionará sem busca vetorial");
    }
  } else {
    console.warn('⚠️ RAG não inicializado (faltam requisitos)');
  }
  
  console.log('\n✨ Todos os serviços inicializados!\n');
}

// =========================
// INICIAR SERVIDOR
// =========================

bootstrapServices().then(() => {
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('═══════════════════════════════════════════════');
    console.log('🤖 QUANTON3D BOT ONLINE!');
    console.log('═══════════════════════════════════════════════');
    console.log(`📡 Servidor: http://localhost:${PORT}`);
    console.log(`💚 Health: http://localhost:${PORT}/health`);
    console.log(`🤖 Chat: http://localhost:${PORT}/api/ask`);
    console.log(`📚 Resinas: http://localhost:${PORT}/resins`);
    console.log('═══════════════════════════════════════════════\n');
  });

  // Tratamento de erros do servidor
  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Porta ${PORT} já está em uso!`);
      console.log('💡 Tente: killall node && npm start');
    } else {
      console.error('❌ Erro no servidor:', error);
    }
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    console.log('⚠️ Recebido SIGTERM, encerrando servidor...');
    server.close(() => {
      console.log('✅ Servidor encerrado');
      mongoose.connection.close(false, () => {
        console.log('✅ MongoDB desconectado');
        process.exit(0);
      });
    });
  });

  // Exportar para testes
  if (process.env.NODE_ENV === 'test') {
    export default server;
  }
});
