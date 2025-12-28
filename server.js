// =========================
// 🤖 Quanton3D IA - Servidor Oficial (VERSÃO ASTRA TOTAL - 22/12/2025)
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import fsPromises from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import { attachAdminSecurity } from "./admin/security.js";
import {
  connectToMongo,
  getPartnersCollection,
  getPrintParametersCollection
} from "./db.js";
import { chatRoutes } from "./src/routes/chatRoutes.js";
import { buildAdminRoutes } from "./src/routes/adminRoutes.js";
import {
  ensureMongoReady,
  shouldInitMongo,
  shouldInitRAG
} from "./src/routes/common.js";
import { initializeRAG } from "./rag-search.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const buildDir = path.join(__dirname, 'dist');
const publicDir = fs.existsSync(buildDir) ? buildDir : path.join(__dirname, 'public');
const rootDir = __dirname;

const app = express();
app.set('trust proxy', 1);
const allowedOrigins = [
  "https://quanton3dia.onrender.com",
  "https://axtonronei.online"
];

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    return callback(new Error("Not allowed by CORS"));
  }
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.static(publicDir));
app.use('/public', express.static(publicDir));

const adminSecurityOptions = {
  adminSecret: process.env.ADMIN_SECRET,
  adminJwtSecret: process.env.ADMIN_JWT_SECRET,
  adminUsername: process.env.ADMIN_USERNAME,
  allowedOrigins: process.env.CORS_ORIGIN
};

attachAdminSecurity(app, adminSecurityOptions);

app.use(chatRoutes);
app.use("/admin", buildAdminRoutes(adminSecurityOptions));

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

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api") || req.path.startsWith("/admin")) {
    return next();
  }
  res.sendFile(path.join(publicDir, "index.html"));
});

// --- INICIALIZAÇÃO ---
const PORT = process.env.PORT || 3001;

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
