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

async function startServer() {
  try {
    console.log('🚀 Astra ligando os motores...');
    await connectToMongo();
    await initializeRAG();
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`✅ Servidor Quanton3D rodando na porta ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Falha ao iniciar servidor:", err);
    process.exit(1);
  }
}

startServer();
