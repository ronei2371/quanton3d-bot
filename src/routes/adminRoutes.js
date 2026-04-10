import express from "express";
import fs from "fs";
import fsPromises from "fs/promises";
import jwt from "jsonwebtoken";
import path from "path";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import { fileURLToPath } from "url";
import {
  addDocument,
  clearKnowledgeCollection
} from "../../rag-search.js";
import {
  getCollection,
  getDocumentsCollection,
  getPrintParametersCollection,
  getOrdersCollection,
  isConnected
} from "../../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");

const shouldInitMongo = () => Boolean(process.env.MONGODB_URI);
const shouldInitRAG = () => Boolean(process.env.OPENAI_API_KEY && process.env.MONGODB_URI);

const ensureMongoReady = async () => {
  try { return isConnected(); }
  catch (error) {
    console.error("❌ Erro ao verificar conexão MongoDB:", error);
    return false;
  }
};

const parseMongoId = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : id);
const getOrdersCollectionSafe = () => getOrdersCollection() || getCollection("pedidos") || getCollection("custom_requests") || getCollection("formulacoes");

function requireAdmin(adminSecret, adminJwtSecret) {
  return (req, res, next) => {
    if (!adminSecret || !adminJwtSecret) {
      return res.status(500).json({ success: false, error: "Admin authentication not configured" });
    }
    const authHeader = req.headers.authorization || "";
    if (authHeader.startsWith("Bearer ")) {
      try {
        jwt.verify(authHeader.slice(7), adminJwtSecret);
        return next();
      } catch (err) {
        return res.status(401).json({ success: false, error: "invalid_token" });
      }
    }
    const providedSecret = req.headers["x-admin-secret"] || req.headers["admin-secret"];
    if (providedSecret && providedSecret === adminSecret) return next();
    return res.status(401).json({ success: false, error: "unauthorized" });
  };
}

function buildAdminRoutes(adminConfig = {}) {
  const router = express.Router();
  const ADMIN_SECRET = adminConfig.adminSecret ?? process.env.ADMIN_SECRET;
  const ADMIN_JWT_SECRET = adminConfig.adminJwtSecret ?? process.env.ADMIN_JWT_SECRET;
  const adminGuard = requireAdmin(ADMIN_SECRET, ADMIN_JWT_SECRET);

  // ===== LOGIN =====
  router.post("/login", (req, res) => {
    const { user, password, secret } = req.body ?? {};
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASSWORD || "admin";
    const jwtSecret = process.env.ADMIN_JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({ success: false, error: "JWT secret ausente" });
    }

    // ✅ aceita: user+password, só password, ou secret
    const validUser =
      password === adminPass &&
      (!user || user === adminUser);
    const validSecret =
      (secret && secret === process.env.ADMIN_SECRET) ||
      (password && password === process.env.ADMIN_SECRET);

    if (validUser || validSecret) {
      const token = jwt.sign({ user: adminUser }, jwtSecret, { expiresIn: "24h" });
      return res.json({ success: true, token });
    }
    return res.status(401).json({ success: false, error: "Credenciais inválidas" });
  });

  // ===== KNOWLEDGE =====
  router.post("/knowledge/import", adminGuard, async (req, res) => {
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
        if (typeof req.body === "object") return Object.keys(req.body).length === 0;
        return false;
      };

      let docsPayload = Array.isArray(req.body?.documents)
        ? req.body.documents
        : Array.isArray(req.body) ? req.body : null;

      const normalizeEmbedding = (candidate) => {
        if (!Array.isArray(candidate)) return null;
        const numeric = candidate.map((v) => Number(v)).filter((v) => Number.isFinite(v));
        return numeric.length > 0 ? numeric : null;
      };

      let collectionCleared = false;
      const ensureCollectionCleared = async () => {
        if (collectionCleared) return null;
        const cleanupResult = await clearKnowledgeCollection();
        collectionCleared = true;
        console.log(`[IMPORT] Coleção limpa: ${cleanupResult.deleted} registros removidos.`);
        return cleanupResult;
      };

      if (bodyIsEmpty() || !Array.isArray(docsPayload) || docsPayload.length === 0) {
        const kbPath = path.join(rootDir, "kb_index.json");
        try {
          if (!fs.existsSync(kbPath)) {
            return res.status(400).json({ success: false, error: "kb_index.json não encontrado e body vazio" });
          }
          await ensureCollectionCleared();
          const fileContent = await fsPromises.readFile(kbPath, "utf-8");
          const parsed = JSON.parse(fileContent.replace(/\s+$/u, ""));
          const docsFromFile = Array.isArray(parsed) ? parsed
            : Array.isArray(parsed?.documents) ? parsed.documents
            : Array.isArray(parsed?.data) ? parsed.data
            : Object.values(parsed || {}).find(Array.isArray) || null;

          if (!Array.isArray(docsFromFile) || docsFromFile.length === 0) {
            return res.status(400).json({ success: false, error: "kb_index.json sem documentos válidos" });
          }
          docsPayload = docsFromFile;
        } catch (err) {
          return res.status(500).json({ success: false, error: "Falha ao carregar kb_index.json" });
        }
      }

      if (!Array.isArray(docsPayload) || docsPayload.length === 0) {
        return res.status(400).json({ success: false, error: "Payload deve ser array de documentos" });
      }

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
          errors.push({ index: i, title: title || "(sem título)", error: "Título e conteúdo obrigatórios" });
          continue;
        }
        try {
          const result = await addDocument(title, content, source, tags, {
            legacyId, upsert: Boolean(legacyId),
            ...(embedding ? { embedding } : {})
          });
          imported.push({ index: i, title, documentId: result.documentId.toString() });
        } catch (err) {
          errors.push({ index: i, title, error: err.message });
        }
      }

      res.json({ success: errors.length === 0, imported: imported.length, errors, documents: imported });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/knowledge/list", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const { tag, resin, printer, search } = req.query;
      const page = Math.max(parseInt(req.query.page) || 1, 1);
      const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 100);
      const skip = (page - 1) * limit;

      const filters = {};
      const tagFilter = tag || resin || printer;
      if (tagFilter) filters.tags = { $elemMatch: { $regex: tagFilter, $options: "i" } };
      if (search) filters.$or = [
        { title: { $regex: search, $options: "i" } },
        { content: { $regex: search, $options: "i" } }
      ];

      const collection = getDocumentsCollection();
      const total = await collection.countDocuments(filters);
      const documents = await collection
        .find(filters, { projection: { title: 1, tags: 1, source: 1, createdAt: 1 } })
        .sort({ createdAt: -1 }).skip(skip).limit(limit).toArray();

      res.json({ success: true, documents, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) || 1 } });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== PARÂMETROS — RESINAS =====

  router.get("/params/resins", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getPrintParametersCollection();
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const resins = await collection.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$resinId", { $ifNull: ["$resinName", { $ifNull: ["$resin", "$name"] }] }] },
            name: { $first: { $ifNull: ["$resinName", { $ifNull: ["$resin", "$name"] }] } },
            profiles: { $sum: 1 }
          }
        },
        { $match: { name: { $ne: null } } },
        { $sort: { name: 1 } }
      ]).toArray();

      res.json({
        success: true,
        resins: resins.map((item) => ({
          _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
          name: item.name || "Sem nome",
          description: `Perfis cadastrados: ${item.profiles ?? 0}`,
          profiles: item.profiles ?? 0,
          active: true
        })),
        total: resins.length,
        source: "mongo"
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/params/resins", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const { name, description } = req.body ?? {};
      if (!name) return res.status(400).json({ success: false, message: "Nome da resina é obrigatório" });

      const trimmedName = String(name).trim();
      if (!trimmedName) return res.status(400).json({ success: false, message: "Nome da resina é obrigatório" });

      const collection = getPrintParametersCollection();
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const duplicated = await collection.findOne({
        $or: [
          { resinName: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
          { resin: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } },
          { name: { $regex: `^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, $options: "i" } }
        ]
      });

      if (duplicated) {
        return res.status(409).json({ success: false, message: "Resina já cadastrada" });
      }

      const now = new Date();
      const payload = {
        resinName: trimmedName,
        resin: trimmedName,
        name: trimmedName,
        description: typeof description === "string" ? description.trim() : "",
        status: "active",
        source: "admin_manual",
        createdAt: now,
        updatedAt: now,
        params: {}
      };

      const result = await collection.insertOne(payload);
      res.status(201).json({
        success: true,
        message: "Resina adicionada",
        resin: {
          _id: result.insertedId?.toString?.() || trimmedName.toLowerCase().replace(/\s+/g, "-"),
          name: trimmedName,
          active: true
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete("/params/resins/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getPrintParametersCollection();
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const { id } = req.params;
      const byName = String(req.query.name || "").trim();
      const decodedId = decodeURIComponent(String(id || "").trim());
      const normalizedFromSlug = decodedId.replace(/-/g, " ").trim();
      const candidates = [decodedId, normalizedFromSlug, byName].filter(Boolean);

      if (!candidates.length) {
        return res.status(400).json({ success: false, error: "Identificador da resina não informado" });
      }

      const regexMatchers = candidates.map((value) => new RegExp(`^${value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"));

      const query = {
        $or: [
          { resinId: { $in: candidates } },
          { resinName: { $in: regexMatchers } },
          { resin: { $in: regexMatchers } },
          { name: { $in: regexMatchers } }
        ]
      };

      const result = await collection.deleteMany(query);
      if (!result.deletedCount) {
        return res.status(404).json({ success: false, error: "Resina não encontrada" });
      }

      res.json({ success: true, message: "Resina deletada", deletedProfiles: result.deletedCount });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ✅ NOVA ROTA: GET /params/printers — Lista impressoras cadastradas
  router.get("/params/printers", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getPrintParametersCollection();
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const printers = await collection.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$printerId", { $ifNull: ["$printerName", { $ifNull: ["$printer", "$model"] }] }] },
            name: { $first: { $ifNull: ["$printerName", { $ifNull: ["$printer", "$model"] }] } },
            profiles: { $sum: 1 }
          }
        },
        { $match: { name: { $ne: null } } },
        { $sort: { name: 1 } }
      ]).toArray();

      console.log(`✅ [ADMIN] Listando ${printers.length} impressoras do MongoDB`);

      res.json({
        success: true,
        printers: printers.map((item) => ({
          _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
          name: item.name || "Sem nome",
          profiles: item.profiles ?? 0,
          active: true
        })),
        total: printers.length,
        source: "mongo"
      });
    } catch (err) {
      console.error("❌ [ADMIN] Erro ao listar impressoras:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ✅ NOVA ROTA PÚBLICA: GET /params/printers sem adminGuard (para o site público)
  // (Esta rota é adicionada FORA do adminGuard — ver abaixo no return)

  // ===== PERFIS =====
  router.patch("/params/profiles/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const { id } = req.params;
      const { resinName, resinId, brand, model, status, params } = req.body ?? {};
      const updateFields = { updatedAt: new Date() };

      if (typeof resinName === "string" && resinName.trim()) {
        updateFields.resinName = resinName.trim();
        updateFields.resin = resinName.trim();
      }
      if (typeof resinId === "string" && resinId.trim()) updateFields.resinId = resinId.trim();
      if (typeof brand === "string") updateFields.brand = brand.trim();
      if (typeof model === "string") updateFields.model = model.trim();
      if (typeof status === "string" && status.trim()) updateFields.status = status.trim();
      if (params && typeof params === "object") { updateFields.params = params; updateFields.parametros = params; }

      const collection = getPrintParametersCollection();
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: new mongoose.Types.ObjectId(id) }
        : { _id: id };

      const result = await collection.updateOne(query, { $set: updateFields });
      if (!result.matchedCount) return res.status(404).json({ success: false, error: "Perfil não encontrado" });

      res.json({ success: true, message: "Perfil atualizado" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== MÉTRICAS =====
  router.get("/metrics/resins", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getPrintParametersCollection();
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const [categories, totalProfiles, totalResins, usersCount, conversasWithCadastro, lastClientRegistration] = await Promise.all([
        collection.aggregate([
        {
          $group: {
            _id: { $ifNull: ["$resinCategory", { $ifNull: ["$resinType", { $ifNull: ["$resinName", "$resin"] }] }] },
            name: { $first: { $ifNull: ["$resinCategory", { $ifNull: ["$resinType", { $ifNull: ["$resinName", "$resin"] }] }] } },
            count: { $sum: 1 }
          }
        },
        { $match: { name: { $ne: null } } },
        { $sort: { count: -1 } }
      ]).toArray(),
        collection.countDocuments({}),
        collection.distinct("resinName").then((names) => names.filter(Boolean).length),
        getCollection("users")?.countDocuments({}) ?? Promise.resolve(0),
        getCollection("conversas")?.countDocuments({
          $or: [
            { userName: { $exists: true, $ne: null, $ne: "" } },
            { userPhone: { $exists: true, $ne: null, $ne: "" } },
            { userEmail: { $exists: true, $ne: null, $ne: "" } }
          ]
        }) ?? Promise.resolve(0),
        getCollection("conversas")?.find({
          $or: [
            { userName: { $exists: true, $ne: null, $ne: "" } },
            { userPhone: { $exists: true, $ne: null, $ne: "" } },
            { userEmail: { $exists: true, $ne: null, $ne: "" } }
          ]
        })
          .sort({ updatedAt: -1, createdAt: -1 })
          .limit(1)
          .toArray() ?? Promise.resolve([])
      ]);

      res.json({
        success: true,
        categories: categories.map((item) => ({ name: item.name, count: item.count ?? 0 })),
        totals: {
          profiles: totalProfiles ?? 0,
          resins: totalResins ?? 0,
          clients: (usersCount ?? 0) + (conversasWithCadastro ?? 0),
          usersCollection: usersCount ?? 0,
          initialRegistration: conversasWithCadastro ?? 0
        },
        lastClientRegistrationAt: lastClientRegistration?.[0]?.updatedAt || lastClientRegistration?.[0]?.createdAt || null
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== CLIENTES =====
  router.get("/clients", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getCollection("users");
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const [usersClients, conversasClients] = await Promise.all([
        collection.find({}).sort({ createdAt: -1 }).limit(200).toArray(),
        (getCollection("conversas") || collection)
          .find({
            $or: [
              { userName: { $exists: true, $ne: null, $ne: "" } },
              { userPhone: { $exists: true, $ne: null, $ne: "" } },
              { userEmail: { $exists: true, $ne: null, $ne: "" } }
            ]
          })
          .sort({ updatedAt: -1, createdAt: -1 })
          .limit(200)
          .toArray()
      ]);

      const dedupe = new Map();
      const putClient = (client, source) => {
        const email = String(client.email || client.contactEmail || client.userEmail || "").trim().toLowerCase();
        const phone = String(client.phone || client.contactPhone || client.userPhone || "").trim();
        const name = String(client.name || client.fullName || client.companyName || client.userName || "").trim().toLowerCase();
        const key = email || phone || name || client._id?.toString?.();
        if (!key) return;
        if (!dedupe.has(key)) {
          dedupe.set(key, {
            id: client._id?.toString?.() || key,
            name: client.name || client.fullName || client.companyName || client.userName || "Cliente",
            email: client.email || client.contactEmail || client.userEmail || null,
            phone: client.phone || client.contactPhone || client.userPhone || null,
            createdAt: client.createdAt || client.created || client.updatedAt || null,
            source
          });
        }
      };

      usersClients.forEach((client) => putClient(client, "users"));
      conversasClients.forEach((client) => putClient(client, "conversas"));
      const clients = Array.from(dedupe.values()).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
      res.json({
        success: true,
        clients,
        total: clients.length,
        sources: {
          users: usersClients.length,
          conversas: conversasClients.length
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== CONVERSAS =====
  router.get("/conversations", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getCollection("conversas");
      if (!collection) return res.status(503).json({ success: false, error: "MongoDB indisponível" });

      const conversations = await collection.find({}).sort({ createdAt: -1 }).limit(50).toArray();
      res.json({
        success: true,
        conversations: conversations.map((item) => ({
          id: item._id?.toString?.(),
          user: item.userName || item.user || item.client || "Usuário",
          prompt: item.userMessage || item.question || item.prompt || "",
          response: item.botResponse || item.answer || item.response || "",
          createdAt: item.createdAt || item.timestamp || null
        }))
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== MENSAGENS =====
  router.get("/messages", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB off" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getCollection("contacts") || getCollection("messages");
      if (!collection) return res.json({ success: true, messages: [] });

      const messages = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
      res.json({
        success: true,
        messages: messages.map((msg) => ({
          _id: msg._id?.toString(),
          id: msg._id?.toString(),
          name: msg.name || msg.nome,
          email: msg.email,
          phone: msg.phone || msg.telefone,
          message: msg.message || msg.mensagem,
          resolved: Boolean(msg.resolved),
          status: msg.status || 'pending',
          origin: msg.origin || msg.howDidYouHear || msg.source || '',
          howDidYouHear: msg.howDidYouHear || msg.origin || msg.source || '',
          createdAt: msg.createdAt || msg.data || msg.updatedAt || null,
          updatedAt: msg.updatedAt || null
        }))
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/contact/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB off" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getCollection("contacts") || getCollection("messages");
      if (!collection) return res.status(404).json({ success: false, error: "Coleção de contatos indisponível" });

      const { id } = req.params;
      const resolved = Boolean(req.body?.resolved);
      const filter = ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : { $or: [{ _id: id }, { id }] };

      const result = await collection.findOneAndUpdate(
        filter,
        { $set: { resolved, status: resolved ? 'resolved' : 'pending', updatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      const updated = result?.value || result;
      if (!updated) return res.status(404).json({ success: false, error: 'Mensagem não encontrada' });

      res.json({ success: true, message: 'Status atualizado', contact: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== FORMULAÇÕES =====
  router.get("/formulations", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB off" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getCollection("custom_requests") || getCollection("formulacoes") || getOrdersCollectionSafe();
      if (!collection) return res.json({ success: true, formulations: [] });

      const requests = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
      res.json({
        success: true,
        formulations: requests.map((r) => ({
          _id: r._id?.toString(),
          id: r._id?.toString(),
          name: r.name || r.nome,
          email: r.email,
          phone: r.phone || r.telefone,
          desiredFeature: r.desiredFeature || r.caracteristica || r.description || r.message,
          details: r.details || r.description || '',
          status: r.status || 'pending',
          createdAt: r.createdAt || r.date || null
        }))
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== PEDIDOS (compatibilidade com painel atual) =====
  router.get("/orders", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB off" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getOrdersCollectionSafe();
      if (!collection) return res.json({ success: true, orders: [] });

      const orders = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
      res.json({
        success: true,
        orders: orders.map((order) => ({
          _id: order._id?.toString(),
          id: order._id?.toString(),
          customerName: order.customerName || order.name || order.nome || 'Cliente',
          name: order.name || order.nome || 'Cliente',
          email: order.email || '',
          phone: order.phone || order.telefone || '',
          notes: order.notes || order.details || order.description || order.caracteristica || '',
          items: Array.isArray(order.items) ? order.items : [],
          status: order.status || 'pending',
          createdAt: order.createdAt || order.date || null
        }))
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/orders/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB off" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getOrdersCollectionSafe();
      if (!collection) return res.status(404).json({ success: false, error: 'Coleção de pedidos indisponível' });

      const { id } = req.params;
      const status = String(req.body?.status || '').trim();
      if (!status) return res.status(400).json({ success: false, error: 'Status é obrigatório' });

      const filter = ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : { $or: [{ _id: id }, { id }] };

      const result = await collection.findOneAndUpdate(
        filter,
        { $set: { status, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      const updated = result?.value || result;
      if (!updated) return res.status(404).json({ success: false, error: 'Pedido não encontrado' });

      res.json({ success: true, order: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== DOCUMENTOS / CONHECIMENTO (compatibilidade com painel atual) =====
  router.get("/knowledge", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const collection = getDocumentsCollection();
      const documents = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
      res.json({ success: true, documents });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/knowledge", adminGuard, async (req, res) => {
    try {
      if (!shouldInitRAG()) return res.status(503).json({ success: false, error: "OPENAI_API_KEY ou MongoDB indisponível" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const title = String(req.body?.title || '').trim();
      const content = String(req.body?.content || '').trim();
      const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
      const source = String(req.body?.source || 'admin-panel').trim();

      if (!title || !content) return res.status(400).json({ success: false, error: 'Título e conteúdo são obrigatórios' });

      const result = await addDocument(title, content, source, tags);
      res.status(201).json({ success: true, documentId: result.documentId });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.put("/knowledge/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const { id } = req.params;
      const title = String(req.body?.title || '').trim();
      const content = String(req.body?.content || '').trim();
      const tags = Array.isArray(req.body?.tags) ? req.body.tags : [];
      const source = String(req.body?.source || 'admin-panel').trim();

      if (!title || !content) return res.status(400).json({ success: false, error: 'Título e conteúdo são obrigatórios' });

      const collection = getDocumentsCollection();
      const filter = ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : { $or: [{ _id: id }, { legacyId: id }, { id }] };

      const result = await collection.findOneAndUpdate(
        filter,
        { $set: { title, content, tags, source, updatedAt: new Date() } },
        { returnDocument: 'after' }
      );

      const updated = result?.value || result;
      if (!updated) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

      res.json({ success: true, document: updated, warning: 'Conteúdo atualizado. Se necessário, reindexe o RAG depois das edições maiores.' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete("/knowledge/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) return res.status(503).json({ success: false, error: "MongoDB não conectado" });

      const { id } = req.params;
      const collection = getDocumentsCollection();
      const filter = ObjectId.isValid(id)
        ? { _id: new ObjectId(id) }
        : { $or: [{ _id: id }, { legacyId: id }, { id }] };

      const result = await collection.deleteOne(filter);
      if (!result?.deletedCount) return res.status(404).json({ success: false, error: 'Documento não encontrado' });

      res.json({ success: true, message: 'Documento removido com sucesso' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });
  return router;
}

export { buildAdminRoutes };
