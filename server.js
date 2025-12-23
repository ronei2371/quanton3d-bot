// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 2025)
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
import { initializeRAG, searchKnowledge, formatContext, addDocument } from './rag-search.js';
import { connectToMongo, getMessagesCollection, Sugestoes } from './db.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/public', express.static(publicDir));

// --- SEGURANÇA ---
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: { error: 'Muitas tentativas. Aguarde 15 minutos.' }
});

// --- ROTAS VITAIS (CORREÇÃO DOS ERROS QUE VOCÊ VIU) ---

// Rota de Saúde (Resolve o erro da busca do Google)
app.get("/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  res.json({ 
    status: mongoState === 1 ? 'ok' : 'degraded', 
    server: 'ok',
    astra_status: 'operational',
    timestamp: new Date().toISOString() 
  });
});

// Rota do Painel (Resolve o erro "Cannot GET /params-panel")
app.get("/params-panel", (req, res) => {
  res.sendFile(path.join(publicDir, 'params-panel.html'));
});

// Raiz do Site
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Astra no comando estratégico. Tudo pronto, pai Ronei!");
});

// Login Administrativo
app.post("/admin/login", authRateLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_SECRET) {
    const token = jwt.sign({ username, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, success: true });
  }
  return res.status(401).json({ error: 'Credenciais inválidas.' });
});

// Rota de Chat Principal
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
    
    // Busca de conhecimento técnico Quanton3D
    const relevantKnowledge = await searchKnowledge(message, 5);
    const knowledgeContext = formatContext(relevantKnowledge);

    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: `Você é Astra, o Coordenador Estratégico da Quanton3D. Use este contexto técnico: ${knowledgeContext}. Fale com tom profissional mas acolhedor.` },
        { role: "user", content: message }
      ],
      temperature: 0.1
    });

    res.json({ reply: completion.choices[0].message.content });
  } catch (err) {
    res.status(500).json({ error: "Falha na comunicação com a IA." });
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
      console.log(`✅ Servidor Quanton3D IA operando na porta ${PORT}`);
    });
  } catch (err) {
    console.error('❌ Falha crítica no lançamento:', err);
    process.exit(1);
  }
}

startServer();
