// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA 2025)
// UNIFICADO: Segurança Hardened + Todas as Funções de Resinas
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { initializeRAG, searchKnowledge, formatContext, addDocument, listDocuments, deleteDocument, updateDocument, addVisualKnowledge, searchVisualKnowledge, formatVisualResponse, listVisualKnowledge, deleteVisualKnowledge, generateEmbedding, clearKnowledgeCollection } from './rag-search.js';
import { connectToMongo, getMessagesCollection, getGalleryCollection, getVisualKnowledgeCollection, getPartnersCollection, getDocumentsCollection, Parametros, Sugestoes } from './db.js';
import { v2 as cloudinary } from 'cloudinary';
import {
  analyzeQuestionType,
  extractEntities,
  generateIntelligentContext,
  learnFromConversation,
  generateSmartSuggestions,
  analyzeSentiment,
  personalizeResponse,
  calculateIntelligenceMetrics
} from './ai-intelligence-system.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

// Configurações de Segurança Astra
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_JWT_ISSUER = "quanton3d-admin";
const ADMIN_JWT_AUDIENCE = "quanton3d-admin-panel";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Inicialização de APIs
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/public', express.static(publicDir));

// --- MIDDLEWARES DE SEGURANÇA ---
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' }
});

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Acesso negado.' });
  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET, { issuer: ADMIN_JWT_ISSUER });
    req.user = decoded;
    next();
  } catch { return res.status(403).json({ error: 'Token inválido.' }); }
};

// --- ROTAS PRINCIPAIS ---

app.get("/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  res.json({ status: mongoState === 1 ? 'ok' : 'degraded', server: 'ok' });
});

app.post("/admin/login", authRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_SECRET) {
    const token = jwt.sign({ username, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '24h', issuer: ADMIN_JWT_ISSUER });
    return res.json({ token, success: true });
  }
  return res.status(401).json({ error: 'Credenciais inválidas.' });
});

app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Astra no comando estratégico.");
});

// Banco de dados em memória para métricas
const conversationHistory = new Map();
const conversationMetrics = [];
const userRegistrations = [];

// Rota de comunicação com o robô (texto)
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    if (!conversationHistory.has(sessionId)) conversationHistory.set(sessionId, []);
    const history = conversationHistory.get(sessionId);

    // Inteligência Astra
    const questionType = analyzeQuestionType(message);
    const entities = extractEntities(message);
    const relevantKnowledge = await searchKnowledge(message, 5);
    const knowledgeContext = formatContext(relevantKnowledge);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Você é o suporte técnico da Quanton3D. Use este contexto: ${knowledgeContext}` },
        ...history,
        { role: "user", content: message }
      ],
      temperature: 0.1
    });

    const reply = completion.choices[0].message.content;
    history.push({ role: "user", content: message }, { role: "assistant", content: reply });

    res.json({ reply });
  } catch (err) {
    res.status(500).json({ error: "Falha na IA." });
  }
});

// --- INICIALIZAÇÃO DO MOTOR ---
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    console.log('🚀 Astra ligando os motores...');
    await connectToMongo();
    await initializeRAG();
    app.listen(PORT, () => {
      console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Falha crítica no lançamento:', err);
    process.exit(1);
  }
}

startServer();
