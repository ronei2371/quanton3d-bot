import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import {
  getSugestoesCollection,
  getVisualKnowledgeCollection,
  getConversasCollection,
  getCollection,
  getDb,
  isConnected,
  getOrdersCollection
} from "../../db.js";

import { ensureMongoReady } from "./common.js";
import { addDocument } from "../../rag-search.js";

const router = express.Router();

const MAX_PARAMS_PAGE_SIZE = 200;
const MAX_GALLERY_PAGE_SIZE = 100;
const upload = multer();

const FISPQ_DOCUMENTS = [
  { resin: "Iron 7030", slug: "iron-7030" },
  { resin: "Spin+", slug: "spin-plus" },
  { resin: "Iron Skin", slug: "iron-skin" },
  { resin: "LowSmell", slug: "lowsmell" },
  { resin: "Poseidon", slug: "poseidon" },
  { resin: "Pyroblast+", slug: "pyroblast-plus" },
  { resin: "Spark", slug: "spark" }
];

// ====================== SEGURANÇA ======================
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || null;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-secret';

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      jwt.verify(token, ADMIN_JWT_SECRET);
      return true;
    } catch (_err) {
      return false;
    }
  }

  const legacySecret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  if (legacySecret && legacySecret === ADMIN_SECRET) {
    return true;
  }

  return false;
};

const adminGuard = (handler) => async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  return handler(req, res);
};

// ====================== HELPERS GLOBAIS (ÚNICOS) ======================
const isNil = (value) => value === undefined || value === null;

const pickValue = (value, fallback = null) => (isNil(value) ? fallback : value);

const pickNested = (field) => {
  if (isNil(field)) return null;
  if (typeof field === "object") {
    return pickValue(field.value1 ?? field.value2 ?? null, null);
  }
  return pickValue(field, null);
};

const pickWithFallback = (base, root, key) => {
  const primary = pickNested(base[key]);
  return pickValue(primary, pickNested(root[key]));
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getQueryVariants = (value) => {
  const normalized = value.trim();
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.includes(" ")) variants.add(normalized.replace(/ +/g, "+"));
  if (normalized.includes("+")) variants.add(normalized.replace(/\+/g, " "));
  return Array.from(variants);
};

const buildCaseInsensitiveMatchers = (value) => {
  const variants = getQueryVariants(value);
  return variants.map((entry) => new RegExp(`^${escapeRegex(entry)}$`, "i"));
};

const buildResinFilter = (resinId) => {
  if (!resinId) return null;
  const matchers = buildCaseInsensitiveMatchers(resinId);
  if (matchers.length === 0) return null;
  return { $or: [{ resinId: { $in: matchers } }, { resin: { $in: matchers } }, { resinName: { $in: matchers } }] };
};

const buildPrinterFilter = (printerId) => {
  if (!printerId) return null;
  const matchers = buildCaseInsensitiveMatchers(printerId);
  if (matchers.length === 0) return null;
  return { $or: [{ printerId: { $in: matchers } }, { printer: { $in: matchers } }, { model: { $in: matchers } }] };
};

const getPartnersCollection = () => getCollection('partners');
const getCustomRequestsCollection = () => getCollection('custom_requests');
const getOrdersCollectionSafe = () => getOrdersCollection() || getCollection('pedidos') || getCustomRequestsCollection();

const RESIN_ALIASES = {
  spin: 'Spin+',
  'spin+': 'Spin+',
  spim: 'Spin+',
  'iron7030': 'Iron 7030',
  'iron 7030': 'Iron 7030',
  iron: 'Iron 7030',
  spark: 'Spark',
  pyroblast: 'Pyroblast+',
  'pyroblast+': 'Pyroblast+',
  poseidon: 'Poseidon',
  lowsmell: 'LowSmell',
  'low smell': 'LowSmell'
};

const sanitizeResinName = (raw) => {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const normalized = trimmed.toLowerCase();
  if (RESIN_ALIASES[normalized]) return RESIN_ALIASES[normalized];
  const normalizedNoSpaces = normalized.replace(/\s+/g, '');
  if (RESIN_ALIASES[normalizedNoSpaces]) return RESIN_ALIASES[normalizedNoSpaces];
  return trimmed;
};

const normalizeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);

const normalizeStringArray = (...candidates) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map(item => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
    }
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.split(/[,\n]/).map(item => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const sanitizeNumericValue = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const normalized = value.replace(/,/g, ".").trim();
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const parsed = Number(match[0]);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

// ====================== FUNÇÕES QUE FALTAVAM ======================
const buildOrderResponse = (doc = {}) => ({
  id: doc._id?.toString?.(),
  customerName: doc.name || doc.customerName || doc.userName || 'Cliente',
  phone: doc.phone || doc.userPhone || null,
  email: doc.email || doc.userEmail || null,
  desiredFeature: doc.desiredFeature || null,
  color: doc.color || null,
  details: doc.details || doc.complementos || doc.notes || null,
  status: doc.status || 'pending',
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
  items: Array.isArray(doc.items) ? doc.items : [],
  notes: doc.notes || doc.details || null
});

const buildGalleryResponse = (doc) => ({
  id: doc._id?.toString?.(),
  name: doc.name ?? null,
  resin: doc.resin ?? null,
  printer: doc.printer ?? null,
  settings: doc.settings ?? {},
  images: Array.isArray(doc.images) ? doc.images : [],
  note: doc.note ?? null,
  status: doc.status ?? "pending",
  createdAt: doc.createdAt ?? null,
  updatedAt: doc.updatedAt ?? null
});

const buildVisualKnowledgeResponse = (doc) => ({
  id: doc._id?.toString?.() || doc.id || null,
  title: doc.title || doc.name || 'Sem título',
  description: doc.description || doc.summary || null,
  imageUrl: doc.imageUrl || doc.image || (Array.isArray(doc.images) ? doc.images[0] : null),
  images: Array.isArray(doc.images) ? doc.images : (doc.imageUrl || doc.image ? [doc.imageUrl || doc.image] : []),
  resin: doc.resin || null,
  printer: doc.printer || null,
  settings: doc.settings || {},
  note: doc.note || null,
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  source: doc.source || 'manual',
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null
});

const normalizeGalleryPagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_GALLERY_PAGE_SIZE) : 20;
  return { page, limit, skip: (page - 1) * limit };
};

// ====================== ROTAS PÚBLICAS ======================
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, resin, problemType, sessionId } = req.body;
    
    if (!name || !phone || !email) {
      return res.status(400).json({ success: false, error: "Nome, telefone e email sao obrigatorios" });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }
    
    if (sessionId) {
      const conversasCollection = getConversasCollection(); 
      await conversasCollection.updateOne(
        { sessionId },
        {
          $set: {
            userName: name,
            userPhone: phone,
            userEmail: email,
            resin: resin || null,
            problemType: problemType || null,
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
    
    console.log(`[API] Usuario registrado: ${name} (${email})`);
    
    res.json({
      success: true,
      message: "Usuario registrado com sucesso",
      user: { name, phone, email, resin, problemType }
    });
  } catch (err) {
    console.error("[API] Erro ao registrar usuario:", err);
    res.status(500).json({ success: false, error: "Erro ao registrar usuario" });
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: "Nome, email e mensagem sao obrigatorios" });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }
    
    const messagesCollection = getCollection("messages");
    const newMessage = {
      name,
      email,
      phone: phone || null,
      subject: subject || "Contato via Site",
      message,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await messagesCollection.insertOne(newMessage);
    console.log(`[API] Mensagem de contato recebida de: ${name} (${email})`);
    
    res.json({
      success: true,
      message: "Mensagem enviada com sucesso! Entraremos em contato em breve.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar mensagem de contato:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar mensagem" });
  }
});

router.post("/custom-request", async (req, res) => {
  try {
    const body = req.body ?? {};
    const { name, phone, email, details } = body;
    const desiredFeature = body.desiredFeature ?? body.caracteristica;
    const color = body.color ?? body.cor;

    if (!name || !phone || !email || !desiredFeature) {
      return res.status(400).json({ success: false, error: "Nome, telefone, email e caracteristica desejada sao obrigatorios" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const ordersCollection = getOrdersCollectionSafe();
    if (!ordersCollection) return res.status(503).json({ success: false, error: "Coleção de pedidos indisponível" });

    const newRequest = {
      type: "custom_request",
      name,
      phone,
      email,
      desiredFeature,
      color: color || null,
      details: details || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await ordersCollection.insertOne(newRequest);
    console.log(`[API] Pedido de formulacao customizada: ${name} (${email})`);

    res.json({
      success: true,
      message: "Pedido enviado com sucesso! Entraremos em contato em breve.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar pedido customizado:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar pedido" });
  }
});

router.post("/gallery", upload.any(), async (req, res) => {
  try {
    const { name, resin, printer, settings, image, images, imageUrl, note, contact } = req.body;
    const sanitizedResin = sanitizeResinName(resin);

    if (!sanitizedResin || !printer) {
      return res.status(400).json({ success: false, error: "Resina e impressora sao obrigatorias" });
    }

    const payloadImages = Array.isArray(images) ? images.filter(Boolean) : image ? [image] : [];
    const imageUrlPayload = Array.isArray(imageUrl) ? imageUrl.filter(Boolean) : typeof imageUrl === "string" && imageUrl.trim() ? [imageUrl.trim()] : [];
    const multipartImages = Array.isArray(req.files) 
      ? req.files.filter((file) => file?.buffer).map((file) => {
          const mimeType = file.mimetype || "application/octet-stream";
          const base64 = file.buffer.toString("base64");
          return `data:${mimeType};base64,${base64}`;
        })
      : [];

    const finalImages = imageUrlPayload.length > 0 ? imageUrlPayload : payloadImages.length > 0 ? payloadImages : multipartImages;

    if (finalImages.length === 0) {
      return res.status(400).json({ success: false, error: "Envie ao menos uma imagem" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const galleryCollection = getCollection("gallery");

    const newEntry = {
      name: name?.trim() || null,
      resin: sanitizedResin,
      printer: printer.trim(),
      settings: {},
      contact: contact?.trim() || null,
      images: finalImages,
      note: note?.trim() || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await galleryCollection.insertOne(newEntry);
    console.log(`[API] Nova foto enviada para galeria: ${sanitizedResin} / ${printer}`);

    res.json({
      success: true,
      message: "Fotos enviadas com sucesso! Em breve aparecerão na galeria.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar fotos para galeria:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar fotos" });
  }
});

router.post("/suggest-knowledge", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const collection = getCollection("sugestoes") || getCollection("suggestions");
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de sugestões indisponível" });

    const {
      suggestion,
      userName,
      userPhone,
      sessionId,
      lastUserMessage,
      lastBotReply,
      attachment,
      attachments: attachmentList,
      imageUrl
    } = req.body || {};

    const attachments = [];
    if (Array.isArray(attachmentList)) attachments.push(...attachmentList.filter(Boolean));
    if (attachment) attachments.push(attachment);
    if (imageUrl) attachments.push(imageUrl);

    if (!suggestion || typeof suggestion !== "string" || !suggestion.trim()) {
      return res.status(400).json({ success: false, error: "Sugestao é obrigatória" });
    }

    const doc = {
      suggestion: suggestion.trim(),
      userName: (userName || '').trim() || 'Usuário do site',
      userPhone: userPhone || null,
      sessionId: sessionId || null,
      lastUserMessage: lastUserMessage || null,
      lastBotReply: lastBotReply || null,
      attachments,
      status: 'pending',
      createdAt: new Date()
    };

    const result = await collection.insertOne(doc);
    console.log(`[API] Sugestão registrada: ${doc.userName}`);

    res.json({ success: true, message: 'Sugestão enviada com sucesso!', suggestionId: result.insertedId.toString() });
  } catch (err) {
    console.error('[API] Erro ao registrar sugestão:', err);
    res.status(500).json({ success: false, error: 'Erro ao registrar sugestão' });
  }
});

// ====================== ROTAS PROTEGIDAS ======================
router.get('/orders', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });

    const collection = getOrdersCollectionSafe();
    if (!collection) return res.status(503).json({ success: false, error: 'Coleção de pedidos indisponível' });

    const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders: docs.map(buildOrderResponse) });
  } catch (err) {
    console.error('[API] Erro ao listar pedidos:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar pedidos' });
  }
}));

router.put('/orders/:id', adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};

    if (!status) return res.status(400).json({ success: false, error: 'Status é obrigatório' });

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });

    const collection = getOrdersCollectionSafe();
    if (!collection) return res.status(503).json({ success: false, error: 'Coleção de pedidos indisponível' });

    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { legacyId: id };
    const updateResult = await collection.updateOne(filter, { $set: { status, updatedAt: new Date() } });

    if (!updateResult.matchedCount) return res.status(404).json({ success: false, error: 'Pedido não encontrado' });

    res.json({ success: true });
  } catch (err) {
    console.error('[API] Erro ao atualizar pedido:', err);
    res.status(500).json({ success: false, error: 'Erro ao atualizar pedido' });
  }
});

// ====================== GALERIA E VISUAL KNOWLEDGE ======================
router.get("/gallery", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const { page, limit, skip } = normalizeGalleryPagination(req);
    const galleryCollection = getCollection("gallery");
    const filter = { status: "approved" };

    const cursor = galleryCollection.find(filter, { sort: { createdAt: -1 }, skip, limit });
    const [docs, total] = await Promise.all([cursor.toArray(), galleryCollection.countDocuments(filter)]);

    res.json({
      success: true,
      total,
      page,
      limit,
      images: docs.map(buildGalleryResponse)
    });
  } catch (err) {
    console.error("[API] Erro ao listar galeria:", err);
    res.status(500).json({ success: false, error: "Erro ao listar galeria" });
  }
});

router.get('/visual-knowledge', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });

    const collection = getVisualKnowledgeCollection() || getCollection('gallery');
    const total = await collection.countDocuments({});
    const docs = await collection.find({}).sort({ updatedAt: -1, createdAt: -1 }).limit(100).toArray();

    res.json({
      success: true,
      total,
      items: docs.map(buildVisualKnowledgeResponse),
      documents: docs.map(buildVisualKnowledgeResponse)
    });
  } catch (err) {
    console.error('[API] Erro ao listar conhecimento visual:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar conhecimento visual' });
  }
});

router.get('/visual-knowledge/pending', async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });

    const pendingCollection = getCollection('gallery');
    if (!pendingCollection) return res.json({ success: true, pending: [] });

    const pendingDocs = await pendingCollection
      .find({ $or: [{ approved: false }, { status: 'pending' }] })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json({
      success: true,
      pending: pendingDocs.map((item) => ({
        _id: item._id?.toString?.() || item.id || null,
        imageUrl: item.imageUrl || item.image || (Array.isArray(item.images) ? item.images[0] : null),
        userName: item.userName || item.user || item.name || null,
        defectType: item.defectType || item.title || null,
        createdAt: item.createdAt || null,
        status: item.status || (item.approved ? 'approved' : 'pending')
      }))
    });
  } catch (err) {
    console.error('[API] Erro ao listar conhecimento visual pendente:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar pendências visuais' });
  }
});

// ====================== PARÂMETROS ======================
const listPrinters = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const { resinId } = req.query;
    const filter = {};
    if (resinId) {
      const resinFilter = buildResinFilter(resinId);
      if (resinFilter) Object.assign(filter, resinFilter);
    }

    const collection = getCollection("parametros");
    const printers = await collection.aggregate([
      { $match: filter },
      {
        $group: {
          _id: { $ifNull: ["$printerId", "$printer"] },
          brand: { $first: "$brand" },
          model: { $first: { $ifNull: ["$model", "$printer"] } },
          resinIds: { $addToSet: { $ifNull: ["$resinId", "$resin"] } }
        }
      },
      { $sort: { brand: 1, model: 1 } }
    ]).toArray();

    const mapped = printers.map((item) => ({
      id: item._id,
      brand: item.brand,
      model: item.model,
      resinIds: item.resinIds
    }));

    return res.json({
      success: true,
      printers: mapped,
      matchingPrinters: resinId ? mapped : undefined
    });
  } catch (err) {
    console.error("[API] Erro ao listar impressoras:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
};

const listProfiles = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const { resinId, printerId, status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_PARAMS_PAGE_SIZE) : null;
    const skip = limit ? (page - 1) * limit : 0;

    const filter = {};
    if (resinId) {
      const resinFilter = buildResinFilter(resinId);
      if (resinFilter) Object.assign(filter, resinFilter);
    }
    if (printerId) {
      const printerFilter = buildPrinterFilter(printerId);
      if (printerFilter) {
        filter.$and = filter.$and || [];
        filter.$and.push(printerFilter);
      }
    }
    if (status) filter.status = status;

    const collection = getCollection("parametros");
    const total = await collection.countDocuments(filter);
    const cursor = collection.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    if (limit) cursor.skip(skip).limit(limit);
    const docs = await cursor.toArray();

    return res.json({
      success: true,
      total,
      page: limit ? page : 1,
      limit: limit || null,
      profiles: docs.map((doc) => ({
        id: doc.id ?? doc._id?.toString?.(),
        resinId: doc.resinId ?? (doc.resinName || doc.resin || "Sem nome").toLowerCase().replace(/\s+/g, "-"),
        resinName: doc.resinName ?? doc.resin ?? doc.name ?? "Sem nome",
        printerId: doc.printerId ?? (doc.model ?? doc.printer ?? "").toLowerCase().replace(/\s+/g, "-"),
        brand: doc.brand ?? "",
        model: doc.model ?? doc.printer ?? "",
        params: {}, // normalizeParams pode ser adicionado aqui se necessário
        status: doc.status || "ok",
        updatedAt: doc.updatedAt || doc.createdAt || null
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar perfis de impressão:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar perfis" });
  }
};

router.get("/params/resins", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const collection = getCollection("parametros");
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
        description: `Perfis: ${item.profiles ?? 0}`,
        profiles: item.profiles ?? 0,
        active: true
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar resinas:", err);
    res.status(500).json({ success: false, error: "Erro ao listar resinas" });
  }
});

router.get("/params/printers", listPrinters);
router.get("/params/profiles", listProfiles);
router.get("/params/stats", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const collection = getCollection("parametros");
    const activeProfileFilter = {
      status: { $nin: ["deleted", "test"] },
      isTest: { $ne: true }
    };

    const [resinAgg, printerAgg, total, comingSoon] = await Promise.all([
      collection.distinct("resinId"),
      collection.distinct("printerId"),
      collection.countDocuments(activeProfileFilter),
      collection.countDocuments({ ...activeProfileFilter, status: "coming_soon" })
    ]);

    res.json({
      success: true,
      stats: {
        totalResins: resinAgg.length,
        totalPrinters: printerAgg.length,
        totalProfiles: total,
        comingSoonProfiles: comingSoon
      }
    });
  } catch (err) {
    console.error("[API] Erro ao obter estatísticas de parâmetros:", err);
    res.status(500).json({ success: false, error: "Erro ao obter estatísticas" });
  }
});

// ====================== OUTRAS ROTAS ======================
router.get('/partners', async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });

    const collection = getPartnersCollection();
    if (!collection) return res.json({ success: true, partners: [] });

    const partners = await collection.find({}).sort({ order: 1, createdAt: -1 }).toArray();
    return res.json({ success: true, partners: partners.map((doc) => ({ ...doc })) });
  } catch (err) {
    console.error('[API] Erro ao listar parceiros:', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar parceiros' });
  }
});

// Rotas adicionais de conhecimento e partners podem ser expandidas conforme necessário

router.get("/nuke-and-seed", async (_req, res) => {
  return res.status(410).json({
    success: false,
    error: "Rota descontinuada. A coleção 'parametros' no MongoDB é a fonte de verdade."
  });
});

export { router as apiRoutes };
