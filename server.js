// =========================
// 🤖 Quanton3D IA - Servidor Oficial (ATIVADO - 11/11/2025)
// Este código RESTAURA a chamada real para a OpenAI (GPT) e remove o código de teste.
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

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_JWT_ISSUER = process.env.ADMIN_JWT_ISSUER || "quanton3d-admin";
const ADMIN_JWT_AUDIENCE = process.env.ADMIN_JWT_AUDIENCE || "quanton3d-admin-panel";
const ADMIN_JWT_ALGORITHM = process.env.ADMIN_JWT_ALGORITHM || "HS256";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const RAG_EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-large';

if (!ADMIN_JWT_SECRET) {
  console.error('❌ ADMIN_JWT_SECRET não configurado - configure no Render para autenticar o painel admin.');
} else if (ADMIN_JWT_SECRET.length < 32) {
  console.warn('⚠️  ADMIN_JWT_SECRET com menos de 32 caracteres - recomenda-se um segredo mais forte.');
}

if (!ADMIN_SECRET) {
  console.error('❌ ADMIN_SECRET não configurado - configure no Render para login administrativo.');
}

if (!process.env.MONGODB_URI) {
  console.error('❌ MONGODB_URI não configurado - configure no Render para habilitar persistência no MongoDB.');
}

if (!OPENAI_API_KEY) {
  console.warn('⚠️  OPENAI_API_KEY não configurada - chamadas de IA irão falhar até definir a variável.');
}

// ===== CONFIGURACAO DO CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  console.log('☁️ Cloudinary configurado:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.warn('⚠️ Cloudinary nao configurado - galeria de fotos desabilitada');
}

// ===== PERSISTENCIA APENAS VIA MONGODB =====
console.log('🔧 Sistema configurado para usar APENAS MongoDB para persistencia');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/public', express.static(publicDir));

// Garantir UTF-8 em todas as respostas
app.use((req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  next();
});

// Login administrativo com JWT e Segurança Reforçada
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Muitas tentativas. Aguarde 15 minutos.' }
});

app.post("/admin/login", adminLoginLimiter, (req, res) => {
  if (!ADMIN_SECRET || !ADMIN_JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'Configuração de admin não disponível.' });
  }

  const { password } = req.body || {};
  if (!password) {
    return res.status(400).json({ success: false, message: 'Senha obrigatória.' });
  }
  if (password !== ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: 'Credenciais inválidas.' });
  }

  const token = jwt.sign(
    { role: 'admin' },
    ADMIN_JWT_SECRET,
    {
      expiresIn: '24h',
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE,
      algorithm: 'HS256',
      jwtid: randomUUID()
    }
  );
  return res.json({ success: true, token, expiresIn: 86400 });
});

const buildDedupeKey = (...parts) => {
  const normalized = parts
    .filter(part => part !== undefined && part !== null)
    .map(part => (typeof part === 'string' ? part.trim() : JSON.stringify(part)));
  return crypto.createHash('sha256').update(normalized.join('|')).digest('hex');
};

// Healthcheck de servidor + MongoDB
app.get("/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const mongoConnected = mongoState === 1;
  let mongoPing = false;

  if (mongoConnected && mongoose.connection.db) {
    try {
      await mongoose.connection.db.admin().ping();
      mongoPing = true;
    } catch (err) {
      mongoPing = false;
    }
  }

  const healthy = mongoConnected && mongoPing;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    server: 'ok',
    mongo: {
      connected: mongoConnected,
      ping: mongoPing,
      state: mongoState
    },
    timestamp: new Date().toISOString()
  });
});

// Configuração do multer para upload de imagens
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Conexão com a OpenAI
const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
});

const authenticateJWT = (req, res, next) => {
  if (!ADMIN_JWT_SECRET) {
    return res.status(500).json({ success: false, message: 'ADMIN_JWT_SECRET não configurado.' });
  }
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) {
    return res.status(401).json({ success: false, message: 'Token Bearer não fornecido.' });
  }
  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ success: false, message: 'Token Bearer não fornecido.' });
  }
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET, {
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE,
      algorithms: ['HS256']
    });
    if (payload?.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Token sem privilégios de admin.' });
    }
    req.admin = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Token inválido ou expirado.' });
  }
};

const isAdminTokenValid = (req) => {
  if (!ADMIN_JWT_SECRET) return false;
  const authHeader = req.headers.authorization || '';
  if (!authHeader.toLowerCase().startsWith('bearer ')) return false;
  const token = authHeader.slice(7).trim();
  if (!token) return false;
  try {
    const payload = jwt.verify(token, ADMIN_JWT_SECRET, {
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE,
      algorithms: ['HS256']
    });
    return payload?.role === 'admin';
  } catch (err) {
    return false;
  }
};

// Histórico de conversas por sessão
const conversationHistory = new Map();
const customRequests = [];
const conversationMetrics = [];
const userRegistrations = [];

// Rota principal de teste
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Astra no comando estratégico.");
});

// O restante do código continua aqui... (conforme o arquivo original enviado)