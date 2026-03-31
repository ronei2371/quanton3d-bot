import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import * as db from "../../db.js";
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

// ====================== ADAPTER DB ======================
const getCollection = (name) => {
  if (typeof db.getCollection === "function") return db.getCollection(name);
  if (name === "gallery" && typeof db.getGalleryCollection === "function") return db.getGalleryCollection();
  if (name === "suggestions" && typeof db.getSuggestionsCollection === "function") return db.getSuggestionsCollection();
  if (name === "parametros" && typeof db.getParametrosCollection === "function") return db.getParametrosCollection();
  if (name === "contacts" && typeof db.getContactsCollection === "function") return db.getContactsCollection();
  if (name === "custom_requests" && typeof db.getCustomRequestsCollection === "function") return db.getCustomRequestsCollection();
codex/fix-syntaxerror-in-apiroutes.js-opmbrq
  if (name === "partners" && typeof db.getPartnersCollection === "function") return db.getPartnersCollection();

 main
  return null;
};

const getConversasCollection = () => {
  if (typeof db.getConversasCollection === "function") return db.getConversasCollection();
  if (db.Conversas?.collection) return db.Conversas.collection;
  return getCollection("conversas");
};

const getVisualKnowledgeCollection = () => {
  if (typeof db.getVisualKnowledgeCollection === "function") return db.getVisualKnowledgeCollection();
  return getCollection("gallery");
};

const getOrdersCollection = () => {
  if (typeof db.getOrdersCollection === "function") return db.getOrdersCollection();
  return getCollection("pedidos") || getCollection("custom_requests");
};

const isConnected = () => {
  if (typeof db.isConnected === "function") return db.isConnected();
  return Boolean(db?.default?.mongoose?.connection?.readyState === 1);
};

const ensureMongoReady = async () => {
  if (isConnected()) return true;
  if (process.env.MONGODB_URI && typeof db.connectToMongo === "function") {
    try {
      await db.connectToMongo(process.env.MONGODB_URI);
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

// ====================== SEGURANÇA ======================
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || null;
 codex/fix-syntaxerror-in-apiroutes.js-opmbrq
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || null;

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    if (!ADMIN_JWT_SECRET) return false;

 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || null;

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-secret-2026";
 main

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
    if (!ADMIN_JWT_SECRET) return false;

 main
    try {
      jwt.verify(authHeader.slice(7), ADMIN_JWT_SECRET);
      return true;
    } catch (_error) {
      return false;
    }
  }

  const legacySecret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  return Boolean(legacySecret && legacySecret === ADMIN_SECRET);
};

const adminGuard = (handler) => async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: "unauthorized" });
  return handler(req, res);
};

// ====================== HELPERS ======================
const normalizeString = (value, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
const sanitizeNumericValue = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, ".").match(/-?\d+(?:\.\d+)?/)?.[0]);
  return Number.isFinite(parsed) ? parsed : null;
};
const sanitizeResinName = (value) => normalizeString(value, null);

const normalizeStringArray = (...candidates) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.map((item) => normalizeString(item)).filter(Boolean);
 codex/fix-syntaxerror-in-apiroutes.js-opmbrq
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate
        .replace(/\r/g, "\n")
        .split("\n")
        .flatMap((part) => part.split(","))
        .map((item) => item.trim())
        .filter(Boolean);
    }

 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
    if (typeof candidate === "string" && candidate.trim()) return candidate.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean);

 codex/fix-syntaxerror-in-apiroutes.js-x106im
    if (typeof candidate === "string" && candidate.trim()) return candidate.split(/[\r\n,]+/).map((item) => item.trim()).filter(Boolean);

    if (typeof candidate === "string" && candidate.trim()) return candidate.split(/[\n,]/).map((item) => item.trim()).filter(Boolean);
 main
  }
  return [];
};

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const getQueryVariants = (value) => {
  const normalized = normalizeString(value);
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.includes(" ")) variants.add(normalized.replace(/ +/g, "+"));
  if (normalized.includes("+")) variants.add(normalized.replace(/\+/g, " "));
  return [...variants];
};
const buildCaseInsensitiveMatchers = (value) => getQueryVariants(value).map((entry) => new RegExp(`^${escapeRegex(entry)}$`, "i"));
const buildResinFilter = (resinId) => {
  const matchers = buildCaseInsensitiveMatchers(resinId);
  if (!matchers.length) return null;
  return { $or: [{ resinId: { $in: matchers } }, { resin: { $in: matchers } }, { resinName: { $in: matchers } }] };
};
const buildPrinterFilter = (printerId) => {
  const matchers = buildCaseInsensitiveMatchers(printerId);
  if (!matchers.length) return null;
  return { $or: [{ printerId: { $in: matchers } }, { printer: { $in: matchers } }, { model: { $in: matchers } }] };
};

const getPartnersCollection = () => getCollection("partners");
const getCustomRequestsCollection = () => getCollection("custom_requests");
const getOrdersCollectionSafe = () => getOrdersCollection() || getCollection("pedidos") || getCustomRequestsCollection();

const buildPartnerPayload = (payload = {}) => ({
  name: normalizeString(payload.name || payload.title),
  title: normalizeString(payload.title || payload.name),
  description: normalizeString(payload.description),
  link: normalizeString(payload.link || payload.url),
  imageUrl: normalizeString(payload.imageUrl || payload.image),
  tags: normalizeStringArray(payload.tags),
  order: sanitizeNumericValue(payload.order) ?? 999,
  active: payload.active !== false
});

const normalizePartnerResponse = (doc = {}) => ({
  id: doc._id?.toString?.() || doc.id || null,
  name: doc.name || doc.title || "Parceiro",
  title: doc.title || doc.name || "Parceiro",
  description: doc.description || null,
  link: doc.link || doc.url || null,
  imageUrl: doc.imageUrl || doc.image || null,
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  order: doc.order ?? 999,
  active: doc.active !== false,
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null
});

const buildVisualKnowledgeResponse = (doc = {}) => ({
  id: doc._id?.toString?.() || doc.id || null,
  title: doc.title || doc.name || "Sem título",
  description: doc.description || doc.summary || null,
  imageUrl: doc.imageUrl || doc.image || (Array.isArray(doc.images) ? doc.images[0] : null),
  images: Array.isArray(doc.images) ? doc.images : (doc.imageUrl || doc.image ? [doc.imageUrl || doc.image] : []),
  resin: doc.resin || null,
  printer: doc.printer || null,
  settings: doc.settings || {},
  note: doc.note || null,
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  source: doc.source || "manual",
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null
});

// ====================== ROTAS PÚBLICAS ======================
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, resin, problemType, sessionId } = req.body || {};
    if (!name || !phone || !email) return res.status(400).json({ success: false, error: "Nome, telefone e email são obrigatórios" });

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    if (sessionId) {
      await getConversasCollection()?.updateOne(
        { sessionId },
        { $set: { userName: name.trim(), userPhone: phone.trim(), userEmail: email.trim().toLowerCase(), resin, problemType, updatedAt: new Date() } },
        { upsert: true }
      );
    }

    return res.json({ success: true, message: "Usuário registrado com sucesso" });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message || "Erro ao registrar usuário" });
  }
});

router.post("/custom-request", async (req, res) => {
  try {
    const { name, phone, email, desiredFeature, color, details } = req.body || {};
    if (!name || !phone || !email || !desiredFeature) return res.status(400).json({ success: false, error: "Dados obrigatórios ausentes" });

    const col = getOrdersCollectionSafe();
    await col.insertOne({
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
    });

    return res.json({ success: true, message: "Pedido enviado" });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao enviar pedido" });
  }
});

router.post("/gallery", upload.any(), async (req, res) => {
  try {
    const { name, resin, printer, image, images, imageUrl, note, contact } = req.body || {};
    const sanitizedResin = sanitizeResinName(resin);
    if (!sanitizedResin || !printer) return res.status(400).json({ success: false, error: "Resina e impressora são obrigatórias" });

    const payloadImages = Array.isArray(images) ? images.filter(Boolean) : image ? [image] : [];
    const imageUrlPayload = Array.isArray(imageUrl) ? imageUrl.filter(Boolean) : typeof imageUrl === "string" && imageUrl.trim() ? [imageUrl.trim()] : [];
    const multipartImages = Array.isArray(req.files)
      ? req.files.filter((file) => file?.buffer).map((file) => `data:${file.mimetype || "application/octet-stream"};base64,${file.buffer.toString("base64")}`)
      : [];
    const finalImages = imageUrlPayload.length ? imageUrlPayload : payloadImages.length ? payloadImages : multipartImages;

    if (!finalImages.length) return res.status(400).json({ success: false, error: "Envie ao menos uma imagem" });

    const galleryCollection = getCollection("gallery");
    const result = await galleryCollection.insertOne({
      name: normalizeString(name, null),
      resin: sanitizedResin,
      printer: printer.trim(),
      images: finalImages,
      contact: normalizeString(contact, null),
      note: normalizeString(note, null),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return res.json({ success: true, id: result.insertedId.toString() });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao enviar fotos" });
  }
});

router.get("/visual-knowledge", async (_req, res) => {
  try {
    const collection = getVisualKnowledgeCollection() || getCollection("gallery");
codex/fix-syntaxerror-in-apiroutes.js-opmbrq
    const docs = await collection
      .find({ $or: [{ approved: true }, { status: "approved" }] })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();

    const docs = await collection.find({}).sort({ updatedAt: -1 }).limit(100).toArray();
 main
    return res.json({ success: true, items: docs.map(buildVisualKnowledgeResponse) });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao listar conhecimento visual" });
  }
});

router.get("/visual-knowledge/pending", async (_req, res) => {
  try {
    const pendingCollection = getCollection("gallery");
    const pendingDocs = await pendingCollection.find({ $or: [{ approved: false }, { status: "pending" }] }).sort({ createdAt: -1 }).limit(200).toArray();
    return res.json({ success: true, pending: pendingDocs.map(buildVisualKnowledgeResponse) });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao listar pendências visuais" });
  }
});

router.put("/visual-knowledge/:id/approve", adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const collection = getCollection("gallery");
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id };
    const result = await collection.findOneAndUpdate(filter, { $set: { ...req.body, status: "approved", approved: true, approvedAt: new Date(), updatedAt: new Date() } }, { returnDocument: "after" });
codex/fix-syntaxerror-in-apiroutes.js-opmbrq
    const updatedDoc = result?.value ?? result ?? null;
    if (!updatedDoc) return res.status(404).json({ success: false, error: "Item não encontrado" });
    return res.json({ success: true, item: buildVisualKnowledgeResponse(updatedDoc) });

 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
    const updatedDoc = result?.value ?? result ?? null;
    if (!updatedDoc) return res.status(404).json({ success: false, error: "Item não encontrado" });
    return res.json({ success: true, item: buildVisualKnowledgeResponse(updatedDoc) });

    if (!result.value) return res.status(404).json({ success: false, error: "Item não encontrado" });
    return res.json({ success: true, item: buildVisualKnowledgeResponse(result.value) });
 main
 main
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao aprovar item" });
  }
}));

// ====================== PARÂMETROS ======================
router.get("/params/resins", async (_req, res) => {
  try {
    const collection = getCollection("parametros");
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

    return res.json({
      success: true,
      resins: stats.map((item) => ({
        _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
        name: item.name || "Sem nome",
        description: `Perfis: ${item.profiles ?? 0}`,
        profiles: item.profiles ?? 0,
        active: true
      }))
    });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao listar resinas" });
  }
});

router.get("/params/printers", async (req, res) => {
  try {
    const filter = req.query.resinId ? buildResinFilter(req.query.resinId) || {} : {};
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
    return res.json({ success: true, printers });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
});

router.get("/params/profiles", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, MAX_PARAMS_PAGE_SIZE);
    const skip = (page - 1) * limit;

 codex/fix-syntaxerror-in-apiroutes.js-opmbrq

 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
 main
    const conditions = [];
    if (req.query.resinId) {
      const resinFilter = buildResinFilter(req.query.resinId);
      if (resinFilter) conditions.push(resinFilter);
    }
    if (req.query.printerId) {
      const printerFilter = buildPrinterFilter(req.query.printerId);
      if (printerFilter) conditions.push(printerFilter);
    }
    if (req.query.status) {
      conditions.push({ status: req.query.status });
    }
    const filter = conditions.length > 1 ? { $and: conditions } : (conditions[0] || {});

 codex/fix-syntaxerror-in-apiroutes.js-opmbrq

    const filter = {};
    if (req.query.resinId) Object.assign(filter, buildResinFilter(req.query.resinId) || {});
    if (req.query.printerId) Object.assign(filter, buildPrinterFilter(req.query.printerId) || {});
    if (req.query.status) filter.status = req.query.status;
 main

 main
    const collection = getCollection("parametros");
    const total = await collection.countDocuments(filter);
    const docs = await collection.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).toArray();

    return res.json({ success: true, total, page, limit, profiles: docs });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao listar perfis" });
  }
});

router.get("/params/stats", async (_req, res) => {
  try {
    const collection = getCollection("parametros");
    const activeProfileFilter = { status: { $nin: ["deleted", "test"] }, isTest: { $ne: true } };
    const [resinAgg, printerAgg, total, comingSoon] = await Promise.all([
      collection.distinct("resinId"),
      collection.distinct("printerId"),
      collection.countDocuments(activeProfileFilter),
      collection.countDocuments({ ...activeProfileFilter, status: "coming_soon" })
    ]);
    return res.json({ success: true, stats: { totalResins: resinAgg.length, totalPrinters: printerAgg.length, totalProfiles: total, comingSoonProfiles: comingSoon } });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao obter estatísticas" });
  }
});

// ====================== PARCEIROS ======================
router.get("/partners", async (_req, res) => {
  try {
 codex/fix-syntaxerror-in-apiroutes.js-opmbrq
    const collection = getPartnersCollection();
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de parceiros indisponível" });
    const partners = await collection.find({ active: true }).sort({ order: 1, createdAt: -1 }).toArray();

 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
    const collection = getPartnersCollection();
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de parceiros indisponível" });
    const partners = await collection.find({ active: true }).sort({ order: 1, createdAt: -1 }).toArray();

    const partners = await getPartnersCollection().find({ active: true }).sort({ order: 1, createdAt: -1 }).toArray();
 main
    return res.json({ success: true, partners: partners.map(normalizePartnerResponse) });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao listar parceiros" });
  }
});

router.post("/partners", adminGuard(async (req, res) => {
  try {
    const payload = req.body || {};
    const name = normalizeString(payload.name || payload.title);
    if (!name) return res.status(400).json({ success: false, error: "Nome é obrigatório" });
codex/fix-syntaxerror-in-apiroutes.js-opmbrq

 codex/fix-syntaxerror-in-apiroutes.js-scpaoa
 main
    const collection = getPartnersCollection();
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de parceiros indisponível" });

    const doc = { ...buildPartnerPayload(payload), createdAt: new Date(), updatedAt: new Date() };
    const result = await collection.insertOne(doc);
 codex/fix-syntaxerror-in-apiroutes.js-opmbrq



    const doc = { ...buildPartnerPayload(payload), createdAt: new Date(), updatedAt: new Date() };
    const result = await getPartnersCollection().insertOne(doc);
 main
 main
    return res.status(201).json({ success: true, partner: normalizePartnerResponse({ ...doc, _id: result.insertedId }) });
  } catch {
    return res.status(500).json({ success: false, error: "Erro ao criar parceiro" });
  }
}));

router.post("/add-knowledge", adminGuard(async (req, res) => {
  try {
    const { title, content } = req.body;
    const result = await addDocument(title, content, "admin_panel", ["admin"]);
    return res.status(201).json({ success: true, result });
  } catch {
    return res.status(500).json({ success: false });
  }
}));

router.get("/fispq", (_req, res) => {
  res.json({ success: true, documents: FISPQ_DOCUMENTS });
});

router.get("/nuke-and-seed", async (_req, res) => {
  return res.status(410).json({ success: false, error: "Rota descontinuada. A coleção 'parametros' no MongoDB é a fonte de verdade." });
});

export { router as apiRoutes };
