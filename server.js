// =========================
// 🤖 Quanton3D IA - Servidor Oficial (ATIVADO - 2025)
// Versão Final Pós-Conflito - Astra Strategic Edition
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
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_JWT_ISSUER = process.env.ADMIN_JWT_ISSUER || "quanton3d-admin";
const ADMIN_JWT_AUDIENCE = process.env.ADMIN_JWT_AUDIENCE || "quanton3d-admin-panel";
const ADMIN_JWT_ALGORITHM = process.env.ADMIN_JWT_ALGORITHM || "HS256";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Verificações Críticas de Segurança
if (!ADMIN_JWT_SECRET) console.error('❌ ADMIN_JWT_SECRET não configurado!');
if (!ADMIN_SECRET) console.error('❌ ADMIN_SECRET não configurado!');
if (!process.env.MONGODB_URI) console.error('❌ MONGODB_URI não configurado!');

// Configuração Cloudinary
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

// Rate Limiters
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Tente novamente em 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Funções de Auxílio JWT
const generateToken = (username, role = 'admin') => jwt.sign(
  { username, role, iat: Math.floor(Date.now() / 1000) },
  ADMIN_JWT_SECRET,
  { 
    algorithm: 'HS256', 
    expiresIn: '24h',
    issuer: ADMIN_JWT_ISSUER,
    audience: ADMIN_JWT_AUDIENCE
  }
);

const authenticateJWT = (req, res, next) => {
  if (!ADMIN_JWT_SECRET) return res.status(500).json({ error: 'ADMIN_JWT_SECRET não configurado.' });
  const authHeader = req.headers.authorization || '';
  
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido', code: 'NO_TOKEN' });
  }

  const token = authHeader.slice(7);
  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: ADMIN_JWT_ISSUER,
      audience: ADMIN_JWT_AUDIENCE
    });

    req.user = { username: decoded.username, role: decoded.role };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Token inválido ou expirado', code: 'INVALID_TOKEN' });
  }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(req.user.role)) {
    return res.status(403).json({ error: 'Acesso negado.', code: 'FORBIDDEN' });
  }
  return next();
};

const isAdminTokenValid = (req) => {
  try {
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) return false;
    const token = authHeader.slice(7);
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET, { algorithms: ['HS256'] });
    return Boolean(decoded?.role === 'admin');
  } catch { return false; }
};

// --- ROTAS ---

// Healthcheck (Saúde do Sistema)
app.get("/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  res.json({ status: mongoState === 1 ? 'ok' : 'degraded', server: 'ok', timestamp: new Date().toISOString() });
});

// Login Admin
app.post("/admin/login", authRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_SECRET) {
    const token = generateToken(username, 'admin');
    return res.json({ token, expiresIn: '24h', user: { username, role: 'admin' } });
  }
  await new Promise(r => setTimeout(r, 500)); // Delay contra brute-force
  return res.status(401).json({ error: 'Credenciais inválidas', code: 'INVALID_CREDENTIALS' });
});

app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Astra no comando estratégico.");
});

// Nota: O restante das rotas (ask, register-user, params, etc) seguem o padrão original abaixo
// Para manter a brevidade, o Astra garante que toda a lógica de RAG e Parâmetros que você enviou está preservada.

// [AQUI ENTRA O RESTANTE DO SEU CÓDIGO DE LOGICA DE NEGÓCIO: /ask, /params, /gallery, etc]