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
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-secret-2026';

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      jwt.verify(token, ADMIN_JWT_SECRET);
      return true;
    } catch (_) {
      return false;
    }
  }

  const legacySecret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  if (legacySecret && legacySecret === ADMIN_SECRET) return true;

  return false;
};

const adminGuard = (handler) => async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  return handler(req, res);
};

// ====================== HELPERS GLOBAIS ======================
const isNil = (value) => value === undefined || value === null;

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

// ====================== FUNÇÕES DE RESPOSTA ======================
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
  updatedAt: doc.updatedAt || null
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
      return res.status(400).json({ success: false, error: "Nome, telefone e email são obrigatórios" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    if (sessionId) {
      const conversasCollection = getConversasCollection();
      await conversasCollection.updateOne(
        { sessionId },
        { $set: { userName: name.trim(), userPhone: phone.trim(), userEmail: email.trim().toLowerCase(), resin, problemType, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    console.log(`[API] Usuário registrado: ${name} (${email})`);

    res.json({
      success: true,
      message: "Usuário registrado com sucesso",
      user: { name: name.trim(), phone: phone.trim(), email: email.trim().toLowerCase(), resin, problemType }
    });
  } catch (err) {
    console.error("[API] Erro ao registrar usuário:", err);
    res.status(500).json({ success: false, error: "Erro ao registrar usuário" });
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: "Nome, email e mensagem são obrigatórios" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const messagesCollection = getCollection("messages");
    const newMessage = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone ? phone.trim() : null,
      subject: subject ? subject.trim() : "Contato via Site",
      message: message.trim(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await messagesCollection.insertOne(newMessage);

    console.log(`[API] Mensagem de contato recebida de: ${name} (${email})`);

    res.json({
      success: true,
      message: "Mensagem enviada com sucesso! Entraremos em contato em breve.",
      id: result.insertedId.toString()
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
      return res.status(400).json({ success: false, error: "Nome, telefone, email e característica desejada são obrigatórios" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const ordersCollection = getOrdersCollectionSafe();
    if (!ordersCollection) return res.status(503).json({ success: false, error: "Coleção de pedidos indisponível" });

    const newRequest = {
      type: "custom_request",
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim().toLowerCase(),
      desiredFeature: desiredFeature.trim(),
      color: color ? color.trim() : null,
      details: details ? details.trim() : null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await ordersCollection.insertOne(newRequest);

    console.log(`[API] Pedido customizado recebido de: ${name} (${email})`);

    res.json({
      success: true,
      message: "Pedido enviado com sucesso! Entraremos em contato em breve.",
      id: result.insertedId.toString()
    });
  } catch (err) {
    console.error("[API] Erro ao enviar pedido customizado:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar pedido" });
  }
});

// ====================== GALERIA ======================
router.post("/gallery", upload.any(), async (req, res) => {
  try {
    const { name, resin, printer, settings, image, images, imageUrl, note, contact } = req.body;
    const sanitizedResin = sanitizeResinName(resin);

    if (!sanitizedResin || !printer) {
      return res.status(400).json({ success: false, error: "Resina e impressora são obrigatórias" });
    }

    const payloadImages = Array.isArray(images) ? images.filter(Boolean) : image ? [image] : [];
    const imageUrlPayload = Array.isArray(imageUrl) ? imageUrl.filter(Boolean) : typeof imageUrl === "string" && imageUrl.trim() ? [imageUrl.trim()] : [];
    const multipartImages = Array.isArray(req.files) 
      ? req.files.filter(file => file?.buffer).map(file => {
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
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

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
      id: result.insertedId.toString()
    });
  } catch (err) {
    console.error("[API] Erro ao enviar fotos para galeria:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar fotos" });
  }
});

// ====================== VISUAL KNOWLEDGE ======================
router.get('/visual-knowledge', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getVisualKnowledgeCollection() || getCollection('gallery');
    const total = await collection.countDocuments({});
    const docs = await collection.find({}).sort({ updatedAt: -1 }).limit(100).toArray();

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
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

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
    console.error('[API] Erro ao listar pendentes visuais:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar pendências visuais' });
  }
});

router.put('/visual-knowledge/:id/approve', adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const { defectType, diagnosis, solution } = req.body;

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id };

    const update = {
      status: 'approved',
      approved: true,
      approvedAt: new Date(),
      defectType,
      diagnosis,
      solution,
      updatedAt: new Date()
    };

    const result = await collection.findOneAndUpdate(filter, { $set: update }, { returnDocument: 'after' });

    if (!result.value) return res.status(404).json({ success: false, error: 'Item não encontrado' });

    res.json({ success: true, item: buildVisualKnowledgeResponse(result.value) });
  } catch (err) {
    console.error('[API] Erro ao aprovar visual knowledge:', err);
    res.status(500).json({ success: false, error: 'Erro ao aprovar item' });
  }
});

// ====================== PARÂMETROS OTIMIZADOS ======================
router.get("/params/resins", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("parametros");
    if (!collection) return res.json({ success: true, resins: [] });

    const stats = await collection.aggregate([
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
      resins: stats.map(item => ({
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

const listPrinters = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const { resinId } = req.query;
    const filter = resinId ? buildResinFilter(resinId) || {} : {};

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

    res.json({
      success: true,
      printers: printers.map(item => ({
        id: item._id,
        brand: item.brand,
        model: item.model,
        resinIds: item.resinIds
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar impressoras:", err);
    res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
};

const listProfiles = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const { resinId, printerId, status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_PARAMS_PAGE_SIZE);
    const skip = (page - 1) * limit;

    const filter = {};
    if (resinId) Object.assign(filter, buildResinFilter(resinId) || {});
    if (printerId) Object.assign(filter, buildPrinterFilter(printerId) || {});
    if (status) filter.status = status;

    const collection = getCollection("parametros");
    const total = await collection.countDocuments(filter);
    const docs = await collection.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).toArray();

    res.json({
      success: true,
      total,
      page,
      limit,
      profiles: docs.map(doc => ({
        id: doc._id?.toString(),
        resinId: doc.resinId,
        resinName: doc.resinName || doc.resin,
        printerId: doc.printerId,
        brand: doc.brand,
        model: doc.model,
        params: doc.params || doc.parametros || {},
        status: doc.status || "ok",
        updatedAt: doc.updatedAt
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar perfis:", err);
    res.status(500).json({ success: false, error: "Erro ao listar perfis" });
  }
};

router.get("/params/printers", listPrinters);
router.get("/params/profiles", listProfiles);
router.get("/params/stats", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("parametros");
    const activeProfileFilter = { status: { $nin: ["deleted", "test"] }, isTest: { $ne: true } };

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
    console.error("[API] Erro ao obter estatísticas:", err);
    res.status(500).json({ success: false, error: "Erro ao obter estatísticas" });
  }
});

// ====================== PARCEIROS ======================
router.get('/partners', async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getPartnersCollection();
    if (!collection) return res.json({ success: true, partners: [] });

    const partners = await collection.find({ active: true }).sort({ order: 1, createdAt: -1 }).toArray();

    res.json({ success: true, partners: partners.map(normalizePartnerResponse) });
  } catch (err) {
    console.error('[API] Erro ao listar parceiros:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar parceiros' });
  }
});

router.post('/partners', adminGuard(async (req, res) => {
  try {
    const payload = req.body || {};
    const name = normalizeString(payload.name || payload.title);
    if (!name) return res.status(400).json({ success: false, error: 'Nome é obrigatório' });

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getPartnersCollection();
    const now = new Date();

    const doc = {
      ...buildPartnerPayload(payload),
      createdAt: now,
      updatedAt: now
    };

    const result = await collection.insertOne(doc);

    res.status(201).json({
      success: true,
      partner: normalizePartnerResponse({ ...doc, _id: result.insertedId })
    });
  } catch (err) {
    console.error('[API] Erro ao criar parceiro:', err);
    res.status(500).json({ success: false, error: 'Erro ao criar parceiro' });
  }
});

// ====================== OUTRAS ROTAS ======================
router.get("/nuke-and-seed", async (_req, res) => {
  return res.status(410).json({
    success: false,
    error: "Rota descontinuada. A coleção 'parametros' no MongoDB é a fonte de verdade."
  });
});

export { router as apiRoutes };
