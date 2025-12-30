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
import {
  connectToMongo,
  isConnected
} from "./db.js";
import { attachAdminSecurity } from "./admin/security.js";
import attachKnowledgeRoutes from "./admin/knowledge-routes.js";
import { chatRoutes } from "./src/routes/chatRoutes.js";
import { buildAdminRoutes } from "./src/routes/adminRoutes.js";

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

app.post('/api/chat', (req, res) => {
  try {
    const { message } = req.body;
    const msgLower = message.toLowerCase();
    
    // Procura palavra-chave na mensagem
    let resposta = respostasAutomaticas.default;
    
    for (let palavra in respostasAutomaticas) {
      if (msgLower.includes(palavra)) {
        resposta = respostasAutomaticas[palavra];
        break;
      }
    }
    
    res.json({ response: resposta });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao processar mensagem' });
  }
});

app.use(chatRoutes);
attachAdminSecurity(app);
attachKnowledgeRoutes(app);
app.use("/admin", buildAdminRoutes());

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
