// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 22/12/2025)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from 'path';
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { initializeRAG } from './rag-search.js';
import { connectToMongo } from './db.js';
import { attachAdminSecurity } from "./admin/security.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const rootDir = __dirname;

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(publicDir));
app.use('/public', express.static(publicDir));

attachAdminSecurity(app);

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

app.get("/admin-panel", (req, res) => {
  res.sendFile(path.join(rootDir, 'admin-panel-test.html'));
});

// --- INICIALIZAÇÃO ---
const PORT = process.env.PORT || 3001;

function shouldInitMongo() {
  return Boolean(process.env.MONGODB_URI);
}

function shouldInitRAG() {
  return Boolean(process.env.OPENAI_API_KEY) && shouldInitMongo();
}

async function initializeServices() {
  if (shouldInitMongo()) {
    try {
      await connectToMongo();
    } catch (err) {
      console.warn("⚠️ MongoDB não conectado. Servidor continua online:", err.message);
    }
  } else {
    console.warn("⚠️ MONGODB_URI ausente. Rotas estáticas permanecem ativas.");
  }

  if (shouldInitRAG()) {
    try {
      await initializeRAG();
    } catch (err) {
      console.warn("⚠️ RAG indisponível. Servidor continua online:", err.message);
    }
  } else {
    console.warn("⚠️ OPENAI_API_KEY ausente ou MongoDB indisponível. RAG não inicializado.");
  }
}

function startServer() {
  console.log('🚀 Astra ligando os motores...');
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`✅ Servidor Quanton3D rodando na porta ${PORT}`);
  });
  initializeServices();
}

startServer();
