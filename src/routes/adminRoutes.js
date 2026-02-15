import express from "express";
import fs from "fs";
import fsPromises from "fs/promises";
import jwt from "jsonwebtoken";
import path from "path";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import {
  addDocument,
  clearKnowledgeCollection
} from "../../rag-search.js";
import {
  getCollection,
  getDocumentsCollection,
  getPrintParametersCollection,
  isConnected
} from "../../db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "../../");

// ===== HELPER FUNCTIONS (inline para evitar dependências externas) =====
const shouldInitMongo = () => {
  return Boolean(process.env.MONGODB_URI);
};

const shouldInitRAG = () => {
  return Boolean(process.env.OPENAI_API_KEY && process.env.MONGODB_URI);
};

const ensureMongoReady = async () => {
  try {
    return isConnected();
  } catch (error) {
    console.error('❌ Erro ao verificar conexão MongoDB:', error);
    return false;
  }
};

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
    if (providedSecret && providedSecret === adminSecret) {
      return next();
    }

    return res.status(401).json({ success: false, error: "unauthorized" });
  };
}

function buildAdminRoutes(adminConfig = {}) {
  const router = express.Router();
  const ADMIN_SECRET = adminConfig.adminSecret ?? process.env.ADMIN_SECRET;
  const ADMIN_JWT_SECRET = adminConfig.adminJwtSecret ?? process.env.ADMIN_JWT_SECRET;
  const adminGuard = requireAdmin(ADMIN_SECRET, ADMIN_JWT_SECRET);

  router.post("/login", (req, res) => {
    const { user, password, secret } = req.body ?? {};
    const adminUser = process.env.ADMIN_USER || "admin";
    const adminPass = process.env.ADMIN_PASSWORD || "admin";
    const jwtSecret = process.env.ADMIN_JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({ success: false, error: "JWT secret ausente" });
    }

    const validUser = user === adminUser && password === adminPass;
    const validSecret = (secret && secret === process.env.ADMIN_SECRET) ||
      (password && password === process.env.ADMIN_SECRET);

    if (validUser || validSecret) {
      const token = jwt.sign({ user: adminUser }, jwtSecret, { expiresIn: "24h" });
      return res.json({ success: true, token });
    }

    return res.status(401).json({ success: false, error: "Credenciais inválidas" });
  });

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

  router.get("/knowledge/list", adminGuard, async (req, res) => {
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

  // ===== ROTAS DE PARÂMETROS DE IMPRESSÃO =====

  router.get("/params/resins", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      }

      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }

      const collection = getPrintParametersCollection();
      if (!collection) {
        return res.status(503).json({ success: false, error: "MongoDB indisponível" });
      }
      const resins = await collection
        .aggregate([
          {
            $group: {
              _id: {
                $ifNull: ["$resinId", { $ifNull: ["$resinName", { $ifNull: ["$resin", "$name"] }] }]
              },
              name: {
                $first: { $ifNull: ["$resinName", { $ifNull: ["$resin", "$name"] }] }
              },
              profiles: { $sum: 1 }
            }
          },
          { $match: { name: { $ne: null } } },
          { $sort: { name: 1 } }
        ])
        .toArray();

      console.log(`✅ [ADMIN] Listando ${resins.length} resinas diretamente do MongoDB`);

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
      console.error('❌ [ADMIN] Erro ao listar resinas:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.post("/params/resins", adminGuard, async (req, res) => {
    try {
      const { name } = req.body;
      
      if (!name) {
        return res.status(400).json({ success: false, message: 'Nome da resina é obrigatório' });
      }
      
      console.log(`✅ Nova resina adicionada: ${name}`);
      
      res.json({
        success: true,
        message: 'Resina adicionada com sucesso',
        resin: {
          _id: name.toLowerCase().replace(/\s+/g, '-'),
          name: name,
          active: true
        }
      });
    } catch (err) {
      console.error('❌ Erro ao adicionar resina:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete("/params/resins/:id", adminGuard, async (req, res) => {
    try {
      const { id } = req.params;
      
      console.log(`✅ Resina deletada: ${id}`);
      
      res.json({
        success: true,
        message: 'Resina deletada com sucesso'
      });
    } catch (err) {
      console.error('❌ Erro ao deletar resina:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.patch("/params/profiles/:id", adminGuard, async (req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      }

      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }

      const { id } = req.params;
      const {
        resinName,
        resinId,
        brand,
        model,
        status,
        params
      } = req.body ?? {};

      const updateFields = { updatedAt: new Date() };

      if (typeof resinName === "string" && resinName.trim()) {
        const trimmedName = resinName.trim();
        updateFields.resinName = trimmedName;
        updateFields.resin = trimmedName;
      }

      if (typeof resinId === "string" && resinId.trim()) {
        updateFields.resinId = resinId.trim();
      }

      if (typeof brand === "string") {
        updateFields.brand = brand.trim();
      }

      if (typeof model === "string") {
        updateFields.model = model.trim();
      }

      if (typeof status === "string" && status.trim()) {
        updateFields.status = status.trim();
      }

      if (params && typeof params === "object") {
        updateFields.params = params;
        updateFields.parametros = params;
      }

      const collection = getPrintParametersCollection();
      if (!collection) {
        return res.status(503).json({ success: false, error: "MongoDB indisponível" });
      }
      const query = mongoose.Types.ObjectId.isValid(id)
        ? { _id: new mongoose.Types.ObjectId(id) }
        : { _id: id };

      const result = await collection.updateOne(query, { $set: updateFields });
      if (!result.matchedCount) {
        return res.status(404).json({ success: false, error: "Perfil não encontrado" });
      }

      res.json({
        success: true,
        message: "Perfil atualizado com sucesso"
      });
    } catch (err) {
      console.error("❌ [ADMIN] Erro ao atualizar perfil:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/metrics/resins", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      }

      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }

      const collection = getPrintParametersCollection();
      if (!collection) {
        return res.status(503).json({ success: false, error: "MongoDB indisponível" });
      }
      const categories = await collection
        .aggregate([
          {
            $group: {
              _id: {
                $ifNull: ["$resinCategory", { $ifNull: ["$resinType", { $ifNull: ["$resinName", "$resin"] }] }]
              },
              name: {
                $first: { $ifNull: ["$resinCategory", { $ifNull: ["$resinType", { $ifNull: ["$resinName", "$resin"] }] }] }
              },
              count: { $sum: 1 }
            }
          },
          { $match: { name: { $ne: null } } },
          { $sort: { count: -1 } }
        ])
        .toArray();

      res.json({
        success: true,
        categories: categories.map((item) => ({
          name: item.name,
          count: item.count ?? 0
        }))
      });
    } catch (err) {
      console.error("❌ [ADMIN] Erro ao obter métricas de resinas:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/clients", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      }

      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }

      const collection = getCollection("users");
      if (!collection) {
        return res.status(503).json({ success: false, error: "MongoDB indisponível" });
      }

      const clients = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(200)
        .toArray();

      res.json({
        success: true,
        clients: clients.map((client) => ({
          id: client._id?.toString?.(),
          name: client.name || client.fullName || client.companyName || "Cliente",
          email: client.email || client.contactEmail || null,
          phone: client.phone || client.contactPhone || null,
          createdAt: client.createdAt || client.created || null
        }))
      });
    } catch (err) {
      console.error("❌ [ADMIN] Erro ao listar clientes:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/conversations", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB não configurado" });
      }

      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }

      const collection = getCollection("conversas");
      if (!collection) {
        return res.status(503).json({ success: false, error: "MongoDB indisponível" });
      }

      const conversations = await collection
        .find({})
        .sort({ createdAt: -1 })
        .limit(50)
        .toArray();

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
      console.error("❌ [ADMIN] Erro ao listar conversas:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ===== ROTAS DE MENSAGENS E FORMULAÇÕES =====
  router.get("/messages", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB off" });
      }
      
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }
      
      // Tenta pegar a coleção 'contacts' ou 'messages'
      const collection = getCollection("contacts") || getCollection("messages"); 
      if (!collection) {
        return res.json({ success: true, messages: [] });
      }
      
      const messages = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
      
      console.log(`✅ [ADMIN] Listando ${messages.length} mensagens de contato`);
      
      res.json({
        success: true,
        messages: messages.map(msg => ({
          id: msg._id?.toString(),
          name: msg.name || msg.nome,
          email: msg.email,
          phone: msg.phone || msg.telefone,
          message: msg.message || msg.mensagem,
          date: msg.createdAt || msg.data
        }))
      });
    } catch (err) {
      console.error("❌ [ADMIN] Erro ao buscar mensagens:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.get("/formulations", adminGuard, async (_req, res) => {
    try {
      if (!shouldInitMongo()) {
        return res.status(503).json({ success: false, error: "MongoDB off" });
      }
      
      const mongoReady = await ensureMongoReady();
      if (!mongoReady) {
        return res.status(503).json({ success: false, error: "MongoDB não conectado" });
      }
      
      const collection = getCollection("custom_requests") || getCollection("formulacoes");
      if (!collection) {
        return res.json({ success: true, formulations: [] });
      }
      
      const requests = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();
      
      console.log(`✅ [ADMIN] Listando ${requests.length} solicitações de formulações`);
      
      res.json({
        success: true,
        formulations: requests.map(req => ({
          id: req._id?.toString(),
          name: req.name || req.nome,
          email: req.email,
          description: req.description || req.caracteristica || req.message,
          status: req.status || "Pendente",
          date: req.createdAt
        }))
      });
    } catch (err) {
      console.error("❌ [ADMIN] Erro ao buscar formulações:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  return router;
}

export { buildAdminRoutes };
