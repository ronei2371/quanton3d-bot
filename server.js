// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 22/12/2025)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import path from 'path';
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import { initializeRAG, searchKnowledge, formatContext } from './rag-search.js';
import { connectToMongo } from './db.js';

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
app.use('/public', express.static(publicDir));

// --- ROTAS VITAIS (CORREÇÃO DO ERRO 'CANNOT GET') ---

app.get("/health", (req, res) => {
  res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "error" });
});

app.get("/params-panel", (req, res) => {
  res.sendFile(path.join(publicDir, 'params-panel.html'));
});

app.get("/", (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.post("/admin/login", async (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_SECRET) {
    const token = jwt.sign({ username, role: 'admin' }, ADMIN_JWT_SECRET, { expiresIn: '24h' });
    return res.json({ token, success: true });
  }
  return res.status(401).json({ error: 'Credenciais inválidas.' });
});

// --- INICIALIZAÇÃO ---
const PORT = process.env.PORT || 3001;

async function startServer() {
  try {
    console.log('🚀 Astra ligando os motores...');
    await connectToMongo();
    await initializeRAG();
    app.listen(PORT, () => {
      console.log(`✅ Servidor Quanton3D rodando na porta ${PORT}`);
    });
  } catch (err) {
    process.exit(1);
  }
}

startServer();
