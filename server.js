// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 22/12/2025)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import fsPromises from "fs/promises";
import path from 'path';
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { addDocument, clearKnowledgeCollection, initializeRAG } from './rag-search.js';
import { connectToMongo, getDocumentsCollection, getPartnersCollection, getPrintParametersCollection, isConnected } from './db.js';
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

const adminSecurityOptions = {
  adminSecret: process.env.ADMIN_SECRET,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET,
  adminUsername: process.env.ADMIN_USERNAME,
  allowedOrigins: process.env.CORS_ORIGIN
};

const ADMIN_SECRET = adminSecurityOptions.adminSecret;
const ADMIN_JWT_SECRET = adminSecurityOptions.adminJwtSecret;

attachAdminSecurity(app, adminSecurityOptions);

function requireAdmin(req, res, next) {
  if (!ADMIN_SECRET || !ADMIN_JWT_SECRET) {
    return res.status(500).json({ success: false, error: "Admin authentication not configured" });
  }

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.slice(7), ADMIN_JWT_SECRET);
      return next();
    } catch (err) {
      return res.status(401).json({ success: false, error: "invalid_token" });
    }
  }

  const providedSecret = req.headers["x-admin-secret"] || req.headers["admin-secret"];
  if (providedSecret && providedSecret === ADMIN_SECRET) {
    return next();
  }

  return res.status(401).json({ success: false, error: "unauthorized" });
}

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

let localResinsCache = null;

async function getLocalResins() {
  if (localResinsCache) {
    return localResinsCache;
  }
  try {
    const dataPath = path.join(rootDir, "data", "resins_extracted.json");
    const raw = await fsPromises.readFile(dataPath, "utf-8");
    const data = JSON.parse(raw);
    const resins = (data.resins || [])
      .map((resin) => ({
        id: resin.id,
        name: resin.name,
        totalProfiles: resin.totalProfiles || 0
      }))
      .filter((resin) => resin.id && resin.name);
    localResinsCache = resins;
    return resins;
  } catch (error) {
    console.warn("⚠️ Falha ao carregar resins_extracted.json:", error.message);
    localResinsCache = [];
    return localResinsCache;
  }
}

async function ensureMongoReady() {
  if (!shouldInitMongo()) {
    return false;
  }
  if (!isConnected()) {
    try {
      await connectToMongo();
    } catch (err) {
      console.warn("⚠️ MongoDB indisponível para rota pública:", err.message);
      return false;
    }
  }
  return true;
}

async function getResinsFromMongo(query, limit) {
  const collection = getPrintParametersCollection();
  const matchStage = query
    ? {
      resinName: {
        $regex: query,
        $options: "i"
      }
    }
    : {};

  const pipeline = [
    { $match: matchStage },
    {
      $group: {
        _id: {
          resinId: "$resinId",
          resinName: "$resinName"
        },
        totalProfiles: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        id: "$_id.resinId",
        name: "$_id.resinName",
        totalProfiles: 1
      }
    },
    { $sort: { name: 1 } },
    { $limit: limit }
  ];

  return collection.aggregate(pipeline).toArray();
}

app.get("/api/resins/search", async (req, res) => {
  const query = String(req.query.query || req.query.q || "").trim();
  const limit = Math.min(Number(req.query.limit) || 12, 50);
  let source = "local";
  let resins = [];

  try {
    const mongoReady = await ensureMongoReady();
    if (mongoReady) {
      resins = await getResinsFromMongo(query, limit);
      source = "mongo";
    }
  } catch (error) {
    console.warn("⚠️ Falha ao consultar resinas no MongoDB:", error.message);
  }

  if (resins.length === 0) {
    const localResins = await getLocalResins();
    resins = localResins
      .filter((resin) => (query ? resin.name.toLowerCase().includes(query.toLowerCase()) : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, limit);
  }

  res.json({
    success: true,
    source,
    resins
  });
});

app.get("/api/partners", async (req, res) => {
  let partners = [];
  let source = "static";
  try {
    const mongoReady = await ensureMongoReady();
    if (mongoReady) {
      const collection = getPartnersCollection();
      partners = await collection.find({}).sort({ name: 1 }).limit(12).toArray();
      source = "mongo";
    }
  } catch (error) {
    console.warn("⚠️ Falha ao carregar parceiros:", error.message);
  }

  if (partners.length === 0) {
    partners = [
      {
        name: "Laboratório Astra",
        focus: "Assistência técnica especializada",
        location: "Belo Horizonte • MG"
      },
      {
        name: "Studio Órbita",
        focus: "Modelagem e prototipagem avançada",
        location: "São Paulo • SP"
      },
      {
        name: "Clínica Nova Forma",
        focus: "Resinas odontológicas e precisão",
        location: "Curitiba • PR"
      }
    ];
  }

  res.json({
    success: true,
    source,
    partners
  });
});

app.post("/admin/knowledge/import", requireAdmin, async (req, res) => {
  try {
    if (!shouldInitRAG()) {
      return res.status(503).json({ success: false, error: "OPENAI_API_KEY ou MongoDB indisponível" });
    }
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "MongoDB não conectado" });
    }

    const bodyIsEmpty = () => {
      if (!req.body) return true;
      if (typeof req.body === "string") return req.body.trim().length === 0;
      if (Buffer.isBuffer(req.body)) return req.body.length === 0;
      if (typeof req.body === "object") {
        return Object.keys(req.body).length === 0;
      }
      return false;
    };

    let docsPayload = Array.isArray(req.body?.documents)
      ? req.body.documents
      : Array.isArray(req.body)
        ? req.body
        : null;

    const normalizeEmbedding = (candidate) => {
      if (!Array.isArray(candidate)) return null;
      const numeric = candidate.map((value) => Number(value)).filter((value) => Number.isFinite(value));
      return numeric.length > 0 ? numeric : null;
    };

    let collectionCleared = false;
    const ensureCollectionCleared = async () => {
      if (collectionCleared) return null;
      const cleanupResult = await clearKnowledgeCollection();
      collectionCleared = true;
      console.log(`[IMPORT-KNOWLEDGE] Coleção limpa antes do import: ${cleanupResult.deleted} registros removidos.`);
      return cleanupResult;
    };

    if (bodyIsEmpty() || !Array.isArray(docsPayload) || docsPayload.length === 0) {
      const kbPath = path.join(rootDir, "kb_index.json");

      try {
        if (!fs.existsSync(kbPath)) {
          return res.status(400).json({
            success: false,
            error: "Arquivo kb_index.json não encontrado e o corpo da requisição está vazio"
          });
        }

        await ensureCollectionCleared();

        const fileContent = await fsPromises.readFile(kbPath, "utf-8");
        const sanitizedContent = fileContent.replace(/\s+$/u, "");
        const parsed = JSON.parse(sanitizedContent);
        const docsFromFile = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.documents)
            ? parsed.documents
            : Array.isArray(parsed?.data)
              ? parsed.data
              : Object.values(parsed || {}).find(Array.isArray) || null;

        if (!Array.isArray(docsFromFile) || docsFromFile.length === 0) {
          return res.status(400).json({
            success: false,
            error: "Arquivo kb_index.json não contém um array de documentos válido"
          });
        }

        docsPayload = docsFromFile;
        console.log(`[IMPORT-KNOWLEDGE] Corpo vazio; usando kb_index.json com ${docsPayload.length} documentos.`);
      } catch (err) {
        console.error("[IMPORT-KNOWLEDGE] Falha ao carregar kb_index.json:", err);
        return res.status(500).json({
          success: false,
          error: "Falha ao carregar kb_index.json ou arquivo inexistente"
        });
      }
    }

    if (!Array.isArray(docsPayload) || docsPayload.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Payload deve ser um array de documentos com title, content, tags e source opcional"
      });
    }

    console.log(`[IMPORT-KNOWLEDGE] Recebidos ${docsPayload.length} documentos para importação`);

    await ensureCollectionCleared();

    const imported = [];
    const errors = [];

    for (let i = 0; i < docsPayload.length; i++) {
      const item = docsPayload[i] || {};
      const title = String(item.title || "").trim();
      const content = String(item.content || "").trim();
      const tags = Array.isArray(item.tags) ? item.tags : [];
      const source = item.source || "admin_import";
      const legacyId = item.id || item.legacyId || null;
      const embedding = normalizeEmbedding(item.embedding);

      if (!title || !content) {
        const error = "Título e conteúdo são obrigatórios";
        errors.push({ index: i, title: title || "(sem título)", error });
        console.warn(`[IMPORT-KNOWLEDGE] Documento ${i + 1} ignorado: ${error}`);
        continue;
      }

      try {
        console.log(`[IMPORT-KNOWLEDGE] (${i + 1}/${docsPayload.length}) Importando: ${title}`);
        if (Array.isArray(item.embedding) && !embedding) {
          console.warn(`[IMPORT-KNOWLEDGE] Embedding inválido no documento ${i + 1}; será gerado automaticamente.`);
        }

        const result = await addDocument(
          title,
          content,
          source,
          tags,
          {
            legacyId,
            upsert: Boolean(legacyId),
            ...(embedding ? { embedding } : {})
          }
        );
        imported.push({ index: i, title, documentId: result.documentId.toString() });
      } catch (err) {
        console.error(`[IMPORT-KNOWLEDGE] Falha ao importar "${title}": ${err.message}`);
        errors.push({ index: i, title, error: err.message });
      }
    }

    console.log(`[IMPORT-KNOWLEDGE] Finalizado. Sucesso: ${imported.length}, Erros: ${errors.length}`);

    res.json({
      success: errors.length === 0,
      imported: imported.length,
      errors,
      documents: imported
    });
  } catch (err) {
    console.error("[IMPORT-KNOWLEDGE] Erro geral na importação:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get("/admin/knowledge/list", requireAdmin, async (req, res) => {
  try {
    if (!shouldInitMongo()) {
      return res.status(503).json({ success: false, error: "MongoDB não configurado" });
    }
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "MongoDB não conectado" });
    }

    const { tag, resin, printer, search } = req.query;
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const filters = {};
    const tagFilter = tag || resin || printer;
    if (tagFilter) {
      filters.tags = { $elemMatch: { $regex: tagFilter, $options: "i" } };
    }
    if (search) {
      filters.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } }
      ];
    }

    const collection = getDocumentsCollection();
    const total = await collection.countDocuments(filters);
    const documents = await collection.find(
      filters,
      { projection: { title: 1, tags: 1, source: 1, createdAt: 1 } }
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    console.log(`📚 [LIST-KNOWLEDGE] Filtros: tag=${tagFilter || "---"} | search=${search || "---"} | total=${total}`);

    res.json({
      success: true,
      documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1
      }
    });
  } catch (err) {
    console.error("❌ [LIST-KNOWLEDGE] Erro ao listar conhecimento:", err);
    res.status(500).json({ success: false, error: err.message });
  }
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
