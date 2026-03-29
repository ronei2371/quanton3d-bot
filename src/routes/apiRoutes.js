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

const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET;
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_API_TOKEN;

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    if (!ADMIN_JWT_SECRET) return false;
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

const getQueryVariants = (value) => {
  const normalized = value.trim();
  if (!normalized) return [];
  const variants = new Set([normalized]);
  if (normalized.includes(" ")) variants.add(normalized.replace(/ +/g, "+"));
  if (normalized.includes("+")) variants.add(normalized.replace(/\+/g, " "));
  return Array.from(variants);
};

const buildCaseInsensitiveMatchers = (value) => getQueryVariants(value).map((entry) => new RegExp(`^${escapeRegex(entry)}$`, "i"));

const buildResinFilter = (resinId) => {
  if (!resinId) return null;
  const matchers = buildCaseInsensitiveMatchers(resinId);
  if (!matchers.length) return null;
  return { $or: [{ resinId: { $in: matchers } }, { resin: { $in: matchers } }, { resinName: { $in: matchers } }] };
};

const buildPrinterFilter = (printerId) => {
  if (!printerId) return null;
  const matchers = buildCaseInsensitiveMatchers(printerId);
  if (!matchers.length) return null;
  return { $or: [{ printerId: { $in: matchers } }, { printer: { $in: matchers } }, { model: { $in: matchers } }] };
};

const getPartnersCollection = () => getCollection("partners");
const getCustomRequestsCollection = () => getCollection("custom_requests");
const getOrdersCollectionSafe = () => getOrdersCollection() || getCollection("pedidos") || getCustomRequestsCollection();

const RESIN_ALIASES = {
  spin: "Spin+",
  "spin+": "Spin+",
  spim: "Spin+",
  iron7030: "Iron 7030",
  "iron 7030": "Iron 7030",
  iron: "Iron 7030",
  spark: "Spark",
  pyroblast: "Pyroblast+",
  "pyroblast+": "Pyroblast+",
  poseidon: "Poseidon",
  lowsmell: "LowSmell",
  "low smell": "LowSmell"
};

const sanitizeResinName = (raw) => {
  if (!raw) return "";
  const trimmed = String(raw).trim();
  if (!trimmed) return "";
  const normalized = trimmed.toLowerCase();
  if (RESIN_ALIASES[normalized]) return RESIN_ALIASES[normalized];
  const normalizedNoSpaces = normalized.replace(/\s+/g, "");
  if (RESIN_ALIASES[normalizedNoSpaces]) return RESIN_ALIASES[normalizedNoSpaces];
  return trimmed;
};

const normalizeString = (value, fallback = "") => (typeof value === "string" ? value.trim() : fallback);
const normalizeStringArray = (...candidates) => {
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean);
    }
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    }
  }
  return [];
};

const normalizePartnerResponse = (doc = {}) => {
  const imageCandidates = normalizeStringArray(doc.images, doc.gallery, doc.photos);
  const imageUrl = normalizeString(doc.imageUrl || doc.image || imageCandidates[0] || "", "");
  const website = normalizeString(doc.websiteUrl || doc.website_url || doc.link || doc.url || "", "");
  const phone = normalizeString(doc.phone || doc.contactPhone || doc.contact?.phone || "", "");
  const email = normalizeString(doc.email || doc.contactEmail || doc.contact?.email || "", "");
  const whatsapp = normalizeString(doc.whatsapp || doc.contactWhatsapp || doc.contact?.whatsapp || phone, "");
  const highlights = normalizeStringArray(doc.highlights, doc.specialties, doc.specialty);

  return {
    ...doc,
    id: doc._id?.toString?.() || doc.id || null,
    _id: doc._id?.toString?.() || doc.id || doc._id || null,
    name: normalizeString(doc.name || doc.title || ""),
    description: normalizeString(doc.description || doc.summary || ""),
    imageUrl,
    image: imageUrl,
    images: imageUrl ? Array.from(new Set([imageUrl, ...imageCandidates])) : imageCandidates,
    link: website,
    url: website,
    websiteUrl: website,
    website_url: website,
    specialty: normalizeString(doc.specialty || doc.category || highlights[0] || ""),
    category: normalizeString(doc.category || doc.specialty || ""),
    highlights,
    phone,
    email,
    whatsapp,
    contact: {
      phone: phone || null,
      email: email || null,
      whatsapp: whatsapp || null
    },
    active: doc.active !== false,
    order: Number.isFinite(Number(doc.order)) ? Number(doc.order) : 0,
    createdAt: doc.createdAt || null,
    updatedAt: doc.updatedAt || null
  };
};

const buildPartnerPayload = (payload = {}, { partial = false } = {}) => {
  const name = normalizeString(payload.name || payload.title || "");
  const description = normalizeString(payload.description || payload.summary || "");
  const imageUrl = normalizeString(payload.imageUrl || payload.image || "", "");
  const website = normalizeString(payload.websiteUrl || payload.website_url || payload.link || payload.url || "", "");
  const specialty = normalizeString(payload.specialty || payload.category || "", "");
  const phone = normalizeString(payload.phone || payload.contactPhone || payload.contact?.phone || "", "");
  const email = normalizeString(payload.email || payload.contactEmail || payload.contact?.email || "", "");
  const whatsapp = normalizeString(payload.whatsapp || payload.contactWhatsapp || payload.contact?.whatsapp || phone, "");
  const images = normalizeStringArray(payload.images, payload.gallery, payload.photos, imageUrl);
  const highlights = normalizeStringArray(payload.highlights, payload.specialties, payload.specialty);

  const fields = {
    ...(partial || name ? { name } : {}),
    ...(partial || description ? { description } : {}),
    ...(partial || imageUrl ? { imageUrl } : {}),
    ...(partial || website ? { link: website } : {}),
    ...(partial || specialty ? { specialty } : {}),
    ...(partial || phone ? { phone } : {}),
    ...(partial || email ? { email } : {}),
    ...(partial || whatsapp ? { whatsapp } : {}),
    ...(partial || images.length ? { images } : {}),
    ...(partial || highlights.length ? { highlights } : {}),
    ...(payload.active !== undefined ? { active: Boolean(payload.active) } : {}),
    ...(Number.isFinite(Number(payload.order)) ? { order: Number(payload.order) } : {})
  };

  if (partial) return fields;
  return { ...fields, active: fields.active ?? true, order: fields.order ?? 0 };
};

const parseGallerySettings = (rawSettings) => {
  if (!rawSettings) return {};
  if (typeof rawSettings === "object") return rawSettings;
  if (typeof rawSettings === "string") {
    try {
      const parsed = JSON.parse(rawSettings);
      if (parsed && typeof parsed === "object") return parsed;
      return rawSettings ? { summary: rawSettings } : {};
    } catch {
      return { summary: rawSettings };
    }
  }
  return {};
};

const extractSettingsFromBody = (body = {}) => {
  const fields = {
    layerHeightMm: body.layerHeightMm ?? body.layerHeight,
    exposureTimeS: body.exposureTimeS ?? body.normalExposure ?? body.normalExposureS,
    baseExposureTimeS: body.baseExposureTimeS ?? body.baseExposure ?? body.baseExposureS,
    baseLayers: body.baseLayers ?? body.bottomLayers,
    liftSpeedMmMin: body.liftSpeedMmMin ?? body.liftSpeed,
    uvOffDelayS: body.uvOffDelayS ?? body.uvDelay ?? body.uvOffDelay
  };

  return Object.fromEntries(
    Object.entries(fields)
      .filter(([, value]) => !isNil(value) && String(value).trim() !== "")
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  );
};

router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, resin, problemType, sessionId, origin, source } = req.body;
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
            origin: origin || source || "Direto",
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
    }
    res.json({ success: true, message: "Usuario registrado com sucesso", user: { name, phone, email, resin, problemType } });
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
      resolved: false,
      approved: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    const result = await messagesCollection.insertOne(newMessage);
    res.json({ success: true, message: "Mensagem enviada com sucesso! Entraremos em contato em breve.", id: result.insertedId });
  } catch (err) {
    console.error("[API] Erro ao enviar mensagem de contato:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar mensagem" });
  }
});

router.get("/contacts", adminGuard(async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const conversasCollection = getConversasCollection();
    const docs = await conversasCollection
      .find({
        $or: [
          { userName: { $exists: true, $ne: null } },
          { userEmail: { $exists: true, $ne: null } },
          { userPhone: { $exists: true, $ne: null } },
          { origin: { $exists: true, $ne: null } }
        ]
      })
      .sort({ updatedAt: -1, createdAt: -1 })
      .limit(1000)
      .toArray();

    const contacts = docs.map((doc) => ({
      _id: doc._id?.toString?.() || doc.id || doc.sessionId || null,
      id: doc._id?.toString?.() || doc.id || doc.sessionId || null,
      name: doc.userName || doc.name || "Cliente",
      phone: doc.userPhone || doc.phone || null,
      email: doc.userEmail || doc.email || null,
      origin: doc.origin || doc.source || doc.origem || "Direto",
      resin: doc.resin || null,
      problemType: doc.problemType || null,
      sessionId: doc.sessionId || null,
      createdAt: doc.createdAt || doc.updatedAt || null,
      updatedAt: doc.updatedAt || doc.createdAt || null
    }));

    return res.json({ success: true, contacts });
  } catch (err) {
    console.error("[API] Erro ao listar contatos:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar contatos" });
  }
}));

router.get("/messages", adminGuard(async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const messagesCollection = getCollection("messages");
    const docs = await messagesCollection.find({}).sort({ createdAt: -1 }).limit(500).toArray();
    const messages = docs.map((doc) => ({
      _id: doc._id?.toString?.() || doc.id || null,
      id: doc._id?.toString?.() || doc.id || null,
      name: doc.name || "Cliente",
      email: doc.email || null,
      phone: doc.phone || null,
      subject: doc.subject || null,
      message: doc.message || doc.text || "",
      resolved: Boolean(doc.resolved || doc.status === "resolved" || doc.status === "done"),
      status: doc.status || "pending",
      createdAt: doc.createdAt || null,
      updatedAt: doc.updatedAt || null
    }));

    return res.json({ success: true, messages });
  } catch (err) {
    console.error("[API] Erro ao listar mensagens:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar mensagens" });
  }
}));

router.put("/contact/:id", adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const hasResolved = typeof body.resolved === "boolean";
    const resolved = hasResolved ? body.resolved : undefined;
    const status = hasResolved
      ? (resolved ? "resolved" : "pending")
      : normalizeString(body.status || body.situation || "");

    if (!status) {
      return res.status(400).json({ success: false, error: "Status é obrigatório" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const collections = [getCollection("contacts"), getCollection("messages"), getOrdersCollectionSafe()].filter(Boolean);
    if (!collections.length) {
      return res.status(503).json({ success: false, error: "Coleções de contato indisponíveis" });
    }

    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { $or: [{ id }, { legacyId: id }] };
    let updatedCount = 0;
    let latestUpdated = null;

    for (const collection of collections) {
      const result = await collection.findOneAndUpdate(
        filter,
        { $set: { status, resolved: hasResolved ? resolved : status === "resolved", updatedAt: new Date() } },
        { returnDocument: "after" }
      );
      const updated = result?.value || result;
      if (updated && (updated._id || updated.id || updated.legacyId)) {
        updatedCount += 1;
        latestUpdated = updated;
      }
    }

    if (!updatedCount || !latestUpdated) {
      return res.status(404).json({ success: false, error: "Contato não encontrado" });
    }

    return res.json({
      success: true,
      updatedCount,
      contact: {
        id: latestUpdated._id?.toString?.() || latestUpdated.id || latestUpdated.legacyId || id,
        status: latestUpdated.status || status,
        resolved: Boolean(latestUpdated.resolved ?? status === "resolved"),
        updatedAt: latestUpdated.updatedAt || null
      }
    });
  } catch (err) {
    console.error("[API] Erro ao atualizar contato:", err);
    return res.status(500).json({ success: false, error: "Erro ao atualizar contato" });
  }
}));

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
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const ordersCollection = getOrdersCollectionSafe();
    if (!ordersCollection) {
      return res.status(503).json({ success: false, error: "Coleção de pedidos indisponível" });
    }

    const newRequest = {
      type: "custom_request",
      name,
      phone,
      email,
      desiredFeature,
      color: color || null,
      details: details || null,
      status: "pending",
      approved: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await ordersCollection.insertOne(newRequest);
    res.json({ success: true, message: "Pedido enviado com sucesso! Entraremos em contato em breve.", id: result.insertedId });
  } catch (err) {
    console.error("[API] Erro ao enviar pedido customizado:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar pedido" });
  }
});

const buildOrderResponse = (doc = {}) => ({
  id: doc._id?.toString?.() || doc.id || doc.legacyId || null,
  _id: doc._id?.toString?.() || doc.id || doc.legacyId || null,
  customerName: doc.name || doc.customerName || doc.userName || "Cliente",
  name: doc.name || doc.customerName || doc.userName || "Cliente",
  phone: doc.phone || doc.userPhone || null,
  email: doc.email || doc.userEmail || null,
  desiredFeature: doc.desiredFeature || doc.caracteristica || null,
  caracteristica: doc.desiredFeature || doc.caracteristica || null,
  color: doc.color || doc.cor || null,
  cor: doc.color || doc.cor || null,
  details: doc.details || doc.complementos || doc.notes || null,
  complementos: doc.details || doc.complementos || doc.notes || null,
  status: doc.status || "pending",
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null,
  items: Array.isArray(doc.items) ? doc.items : [],
  notes: doc.notes || doc.details || null,
  type: doc.type || null
});

router.get("/orders", adminGuard(async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const collection = getOrdersCollectionSafe();
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de pedidos indisponível" });
    const docs = await collection.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders: docs.map(buildOrderResponse) });
  } catch (err) {
    console.error("[API] Erro ao listar pedidos:", err);
    res.status(500).json({ success: false, error: "Erro ao listar pedidos" });
  }
}));

router.get("/formulations", adminGuard(async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const collection = getOrdersCollectionSafe();
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de pedidos indisponível" });

    const docs = await collection.find({
      $or: [{ type: "custom_request" }, { desiredFeature: { $exists: true } }, { caracteristica: { $exists: true } }]
    }).sort({ createdAt: -1 }).toArray();

    const requests = docs.map(buildOrderResponse);
    return res.json({ success: true, formulations: requests, requests });
  } catch (err) {
    console.error("[API] Erro ao listar formulações:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar formulações" });
  }
}));

router.put("/orders/:id", adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body || {};
    if (!status) return res.status(400).json({ success: false, error: "Status é obrigatório" });
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const collection = getOrdersCollectionSafe();
    if (!collection) return res.status(503).json({ success: false, error: "Coleção de pedidos indisponível" });
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { $or: [{ legacyId: id }, { id }] };
    const updateResult = await collection.updateOne(filter, { $set: { status, updatedAt: new Date() } });
    if (!updateResult.matchedCount) return res.status(404).json({ success: false, error: "Pedido não encontrado" });
    res.json({ success: true });
  } catch (err) {
    console.error("[API] Erro ao atualizar pedido:", err);
    res.status(500).json({ success: false, error: "Erro ao atualizar pedido" });
  }
}));

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
      ? req.files.filter((file) => file?.buffer).map((file) => `data:${file.mimetype || "application/octet-stream"};base64,${file.buffer.toString("base64")}`)
      : [];
    const finalImages = imageUrlPayload.length > 0 ? imageUrlPayload : payloadImages.length > 0 ? payloadImages : multipartImages;
    if (!finalImages.length) {
      return res.status(400).json({ success: false, error: "Envie ao menos uma imagem" });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });

    const galleryCollection = getCollection("gallery");
    const newEntry = {
      name: name?.trim() || null,
      resin: sanitizedResin,
      printer: printer.trim(),
      settings: { ...extractSettingsFromBody(req.body), ...parseGallerySettings(settings) },
      contact: contact?.trim() || null,
      images: finalImages,
      note: note?.trim() || null,
      status: "pending",
      approved: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await galleryCollection.insertOne(newEntry);
    res.json({ success: true, message: "Fotos enviadas com sucesso! Em breve aparecerão na galeria.", id: result.insertedId });
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

    const { suggestion, userName, userPhone, sessionId, lastUserMessage, lastBotReply, attachment, attachments: attachmentList, imageUrl } = req.body || {};
    const attachments = [];
    if (Array.isArray(attachmentList)) attachments.push(...attachmentList.filter(Boolean));
    if (attachment) attachments.push(attachment);
    if (imageUrl) attachments.push(imageUrl);

    if (!suggestion || typeof suggestion !== "string" || !suggestion.trim()) {
      return res.status(400).json({ success: false, error: "Sugestao é obrigatória" });
    }

    const doc = {
      suggestion: suggestion.trim(),
      userName: (userName || "").trim() || "Usuário do site",
      userPhone: userPhone || null,
      sessionId: sessionId || null,
      lastUserMessage: lastUserMessage || null,
      lastBotReply: lastBotReply || null,
      attachments,
      status: "pending",
      createdAt: new Date()
    };

    const result = await collection.insertOne(doc);
    res.json({ success: true, message: "Sugestão enviada com sucesso!", suggestionId: result.insertedId.toString() });
  } catch (err) {
    console.error("[API] Erro ao registrar sugestão:", err);
    res.status(500).json({ success: false, error: "Erro ao registrar sugestão" });
  }
});

const buildGalleryResponse = (doc) => {
  const normalizedImages = Array.isArray(doc.images) ? doc.images : [];
  const primaryImage = doc.imageUrl || doc.image || normalizedImages[0] || null;
  return {
    id: doc._id?.toString?.() || doc.id || doc.legacyId || null,
    _id: doc._id?.toString?.() || doc.id || doc.legacyId || null,
    legacyId: doc.legacyId || null,
    name: doc.name ?? doc.userName ?? null,
    userName: doc.userName ?? doc.name ?? null,
    resin: doc.resin ?? null,
    printer: doc.printer ?? null,
    settings: doc.settings ?? {},
    images: normalizedImages,
    imageUrl: primaryImage,
    image: primaryImage,
    note: doc.note ?? null,
    contact: doc.contact ?? null,
    approved: doc.approved ?? doc.status === "approved",
    status: doc.status ?? "pending",
    createdAt: doc.createdAt ?? null,
    updatedAt: doc.updatedAt ?? null
  };
};

const normalizeGalleryPagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_GALLERY_PAGE_SIZE) : 20;
  return { page, limit, skip: (page - 1) * limit };
};

router.get("/gallery", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { page, limit, skip } = normalizeGalleryPagination(req);
    const galleryCollection = getCollection("gallery");
    const filter = { status: "approved" };
    const [docs, total] = await Promise.all([
      galleryCollection.find(filter, { sort: { createdAt: -1 }, skip, limit }).toArray(),
      galleryCollection.countDocuments(filter)
    ]);
    res.json({ success: true, total, page, limit, images: docs.map(buildGalleryResponse) });
  } catch (err) {
    console.error("[API] Erro ao listar galeria:", err);
    res.status(500).json({ success: false, error: "Erro ao listar galeria" });
  }
});

router.get("/gallery/all", adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { page, limit, skip } = normalizeGalleryPagination(req);
    const galleryCollection = getCollection("gallery");
    const filter = { status: { $ne: "deleted" } };
    const [docs, total] = await Promise.all([
      galleryCollection.find(filter, { sort: { createdAt: -1 }, skip, limit }).toArray(),
      galleryCollection.countDocuments(filter)
    ]);
    res.json({ success: true, total, page, limit, images: docs.map(buildGalleryResponse) });
  } catch (err) {
    console.error("[API] Erro ao listar galeria completa:", err);
    res.status(500).json({ success: false, error: "Erro ao listar galeria" });
  }
}));

const buildGalleryLookupQueries = (rawId) => {
  const queries = [];
  const seen = new Set();
  const push = (query) => {
    const key = JSON.stringify(query, (_, value) => (value && value._bsontype === "ObjectId" ? value.toString() : value));
    if (!seen.has(key)) {
      seen.add(key);
      queries.push(query);
    }
  };

  if (rawId) {
    push({ _id: rawId });
    push({ id: rawId });
    push({ legacyId: rawId });
  }
  if (rawId && ObjectId.isValid(rawId)) {
    const objectId = new ObjectId(rawId);
    push({ _id: objectId });
    push({ id: objectId.toString() });
    push({ legacyId: objectId.toString() });
  }
  return queries;
};

const getGalleryCollections = () => {
  const candidates = [
    getCollection("gallery"),
    getCollection("visual_knowledge"),
    getCollection("gallery_pending"),
    getCollection("visual_knowledge_pending"),
    typeof getVisualKnowledgeCollection === "function" ? getVisualKnowledgeCollection() : null
  ].filter(Boolean);
  return Array.from(new Set(candidates));
};

const findGalleryAcrossCollections = async (rawId) => {
  for (const collection of getGalleryCollections()) {
    for (const query of buildGalleryLookupQueries(rawId)) {
      const doc = await collection.findOne(query);
      if (doc && (doc._id || doc.id || doc.legacyId)) {
        return { collection, doc };
      }
    }
  }
  return null;
};

const updateGalleryAcrossCollections = async (rawId, update) => {
  const found = await findGalleryAcrossCollections(rawId);
  if (!found) return null;
  await found.collection.updateOne({ _id: found.doc._id }, update);
  return found.collection.findOne({ _id: found.doc._id });
};

const deleteGalleryAcrossCollections = async (rawId) => {
  const found = await findGalleryAcrossCollections(rawId);
  if (!found) return null;

  const deleteResult = await found.collection.deleteOne({ _id: found.doc._id });
  if (deleteResult?.deletedCount) {
    return { mode: "deleted", doc: found.doc };
  }

  // Se encontrou o documento mas não conseguiu deletar, tratamos como erro (não fazemos soft delete)
  throw new Error("Falha ao remover documento da galeria");
};

const approveGalleryHandler = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const updated = await updateGalleryAcrossCollections(req.params.id, { $set: { status: "approved", approved: true, updatedAt: new Date() } });
    if (!updated) return res.status(404).json({ success: false, error: "Item nao encontrado" });
    return res.json({ success: true, item: buildGalleryResponse(updated) });
  } catch (err) {
    console.error("[API] Erro ao aprovar galeria:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

const deleteGalleryHandler = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const deleted = await deleteGalleryAcrossCollections(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, error: "Item nao encontrado" });
    return res.json({
      success: true,
      mode: deleted.mode,
      deletedId: deleted.doc?._id?.toString?.() || deleted.doc?.id || deleted.doc?.legacyId || req.params.id
    });
  } catch (err) {
    console.error("[API] Erro ao deletar galeria:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
};

router.put("/gallery/:id/approve", adminGuard(approveGalleryHandler));
router.post("/gallery/:id/approve", adminGuard(approveGalleryHandler));
router.delete("/gallery/:id", adminGuard(deleteGalleryHandler));
router.post("/gallery/:id/delete", adminGuard(deleteGalleryHandler));

function normalizeParams(params = {}) {
  const root = params ?? {};
  const base = root.parametros ?? {};
  const getParam = (key) => pickWithFallback(base, root, key);
  const getBottomExposure = () => {
    const direct = getParam("bottomExposureS");
    if (!isNil(direct)) return direct;
    const baseExposure = getParam("baseExposureTimeS");
    if (!isNil(baseExposure)) return baseExposure;
    return getParam("bottomExposureTimeS");
  };

  return {
    layerHeightMm: sanitizeNumericValue(getParam("layerHeightMm") ?? getParam("layerHeight")),
    exposureTimeS: sanitizeNumericValue(getParam("exposureTimeS") ?? getParam("exposureTime") ?? getParam("normalExposureS")),
    bottomExposureS: sanitizeNumericValue(getBottomExposure()),
    bottomLayers: sanitizeNumericValue(getParam("bottomLayers") ?? getParam("baseLayers")),
    baseExposureTimeS: sanitizeNumericValue(getBottomExposure()),
    baseLayers: sanitizeNumericValue(getParam("bottomLayers") ?? getParam("baseLayers")),
    liftSpeedMmMin: sanitizeNumericValue(getParam("liftSpeedMmMin") ?? getParam("liftSpeed") ?? getParam("liftSpeedMmM")),
    uvOffDelayS: sanitizeNumericValue(getParam("uvOffDelayS")),
    uvOffDelayBaseS: sanitizeNumericValue(getParam("uvOffDelayBaseS")),
    restBeforeLiftS: sanitizeNumericValue(getParam("restBeforeLiftS")),
    restAfterLiftS: sanitizeNumericValue(getParam("restAfterLiftS")),
    restAfterRetractS: sanitizeNumericValue(getParam("restAfterRetractS")),
    uvPower: sanitizeNumericValue(getParam("uvPower"))
  };
}

function buildProfileResponse(doc) {
  const resinName = doc.resinName ?? doc.resin ?? doc.name ?? "Sem nome";
  const printerLabel = doc.model ?? doc.printer ?? "";
  return {
    id: doc.id ?? doc._id?.toString?.(),
    resinId: doc.resinId ?? resinName.toLowerCase().replace(/\s+/g, "-"),
    resinName,
    printerId: doc.printerId ?? printerLabel.toLowerCase().replace(/\s+/g, "-"),
    brand: doc.brand ?? "",
    model: doc.model ?? doc.printer ?? "",
    params: normalizeParams(doc.params || doc.parametros || doc.raw || {}),
    status: doc.status || "ok",
    updatedAt: doc.updatedAt || doc.createdAt || null
  };
}

async function listParamResins() {
  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    return { error: { status: 503, body: { success: false, error: "Banco de dados indisponivel" } } };
  }

  const db = getDb();
  const collections = await db.listCollections({ name: "parametros" }).toArray();
  if (collections.length === 0) return { resins: [] };

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

  return { resins };
}

router.get("/params/resins", async (_req, res) => {
  try {
    const result = await listParamResins();
    if (result.error) return res.status(result.error.status).json(result.error.body);
    const resins = (result.resins || []).map((item) => ({
      _id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
      id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
      name: item.name || "Sem nome",
      profiles: item.profiles ?? 0
    }));
    res.json({ success: true, resins });
  } catch (err) {
    console.error("[API] Erro ao listar resinas de parâmetros:", err);
    res.status(500).json({ success: false, error: "Erro ao listar resinas" });
  }
});

router.get("/resins", async (_req, res) => {
  try {
    const result = await listParamResins();
    if (result.error) return res.status(result.error.status).json(result.error.body);
    const resins = result.resins || [];
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

router.get("/docs/fispqs", (_req, res) => {
  res.json({
    success: true,
    updatedAt: new Date().toISOString(),
    documents: FISPQ_DOCUMENTS.map((doc) => ({ ...doc, status: "available", requestEmail: "atendimento@quanton3d.com.br" }))
  });
});

const listPrinters = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { resinId } = req.query;
    const filter = { status: { $ne: "deleted" } };
    if (resinId) {
      const resinFilter = buildResinFilter(resinId);
      if (resinFilter) Object.assign(filter, resinFilter);
    }
    const collection = getCollection("parametros");
    const printers = await collection.aggregate([
      { $match: filter },
      { $group: { _id: { $ifNull: ["$printerId", "$printer"] }, brand: { $first: "$brand" }, model: { $first: { $ifNull: ["$model", "$printer"] } }, resinIds: { $addToSet: { $ifNull: ["$resinId", "$resin"] } } } },
      { $sort: { brand: 1, model: 1 } }
    ]).toArray();

    const mapped = printers.map((item) => ({ id: item._id, brand: item.brand, model: item.model, resinIds: item.resinIds }));
    return res.json({ success: true, printers: mapped, matchingPrinters: resinId ? mapped : undefined });
  } catch (err) {
    console.error("[API] Erro ao listar impressoras:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
};

router.get("/params/printers", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { resinId } = req.query;
    const filter = { status: { $ne: "deleted" } };
    if (resinId) {
      const resinFilter = buildResinFilter(resinId);
      if (resinFilter) Object.assign(filter, resinFilter);
    }
    const collection = getCollection("parametros");
    const distinctPrinters = await collection.distinct("model", filter);
    const printers = distinctPrinters.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()).sort((a, b) => a.localeCompare(b, "pt-BR", { sensitivity: "base" })).map((name) => ({ _id: name, name }));
    return res.json({ success: true, printers });
  } catch (err) {
    console.error("[API] Erro ao listar impressoras:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
});
router.get("/printers", listPrinters);
router.post("/params/printers", async (req, res) => { req.query = { ...(req.query || {}), ...(req.body || {}) }; return listPrinters(req, res); });
router.post("/printers", async (req, res) => { req.query = { ...(req.query || {}), ...(req.body || {}) }; return listPrinters(req, res); });

const listProfiles = async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { resinId, printerId, status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_PARAMS_PAGE_SIZE) : null;
    const skip = limit ? (page - 1) * limit : 0;

    const filter = { status: { $ne: "deleted" } };
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

    return res.json({ success: true, total, page: limit ? page : 1, limit: limit || null, profiles: docs.map(buildProfileResponse) });
  } catch (err) {
    console.error("[API] Erro ao listar perfis de impressão:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar perfis" });
  }
};

router.get("/params/profiles", listProfiles);
router.get("/profiles", listProfiles);
router.post("/params/profiles", async (req, res) => { req.query = { ...(req.query || {}), ...(req.body || {}) }; return listProfiles(req, res); });
router.post("/profiles", async (req, res) => { req.query = { ...(req.query || {}), ...(req.body || {}) }; return listProfiles(req, res); });

router.get("/params/stats", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const collection = getCollection("parametros");
    const activeProfileFilter = { status: { $nin: ["deleted", "test"] }, isTest: { $ne: true } };
    const [resinAgg, printerAgg, total] = await Promise.all([
      collection.distinct("resinId"),
      collection.distinct("printerId"),
      collection.countDocuments(activeProfileFilter)
    ]);
    const comingSoon = await collection.countDocuments({ ...activeProfileFilter, status: "coming_soon" });
    res.json({ success: true, stats: { totalResins: resinAgg.length, totalPrinters: printerAgg.length, totalProfiles: total, comingSoonProfiles: comingSoon } });
  } catch (err) {
    console.error("[API] Erro ao obter estatísticas de parâmetros:", err);
    res.status(500).json({ success: false, error: "Erro ao obter estatísticas" });
  }
});

const buildVisualKnowledgeResponse = (doc) => ({
  id: doc._id?.toString?.() || doc.id || null,
  title: doc.title || doc.name || "Sem título",
  description: doc.description || doc.summary || null,
  imageUrl: doc.imageUrl || doc.image || (Array.isArray(doc.images) ? doc.images[0] : null),
  images: Array.isArray(doc.images) ? doc.images : doc.imageUrl || doc.image ? [doc.imageUrl || doc.image] : [],
  resin: doc.resin || null,
  printer: doc.printer || null,
  settings: doc.settings || {},
  note: doc.note || null,
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  source: doc.source || "manual",
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null
});

router.get("/visual-knowledge", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { page, limit, skip } = normalizeGalleryPagination(req);
    const collection = getVisualKnowledgeCollection() || getCollection("gallery");
    const total = await collection.countDocuments({});
    const docs = await collection.find({}).sort({ updatedAt: -1, createdAt: -1 }).skip(skip).limit(limit).toArray();
    const mapped = docs.map(buildVisualKnowledgeResponse);
    return res.json({ success: true, total, page, limit, items: mapped, documents: mapped });
  } catch (err) {
    console.error("[API] Erro ao listar conhecimento visual:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar conhecimento visual" });
  }
});

router.post("/visual-knowledge", upload.any(), async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const payload = req.body || {};
    const title = typeof payload.title === "string" && payload.title.trim() ? payload.title.trim() : typeof payload.defectType === "string" && payload.defectType.trim() ? payload.defectType.trim() : "Treinamento visual";
    let imageUrl = typeof payload.imageUrl === "string" && payload.imageUrl.trim() ? payload.imageUrl.trim() : typeof payload.image === "string" ? payload.image.trim() : "";

    if (!imageUrl && Array.isArray(req.files) && req.files.length > 0) {
      const file = req.files[0];
      if (file?.buffer?.length) imageUrl = `data:${file.mimetype || "image/jpeg"};base64,${file.buffer.toString("base64")}`;
    }
    if (!imageUrl) return res.status(400).json({ success: false, error: "imageUrl é obrigatório" });

    const collection = getVisualKnowledgeCollection();
    const now = new Date();
    const doc = {
      title,
      description: typeof payload.description === "string" ? payload.description.trim() : typeof payload.solution === "string" ? payload.solution.trim() : null,
      imageUrl,
      tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [payload.defectType, payload.category].filter(Boolean),
      source: typeof payload.source === "string" && payload.source.trim() ? payload.source.trim() : "manual",
      createdAt: now,
      updatedAt: now
    };
    const result = await collection.insertOne(doc);
    return res.status(201).json({ success: true, item: buildVisualKnowledgeResponse({ ...doc, _id: result.insertedId }) });
  } catch (err) {
    console.error("[API] Erro ao criar conhecimento visual:", err);
    return res.status(500).json({ success: false, error: "Erro ao criar conhecimento visual" });
  }
});

const readAdminToken = (req) => req.headers["x-admin-secret"] || req.headers["admin-secret"] || req.query?.auth || req.body?.auth || req.query?.token;
const isValidAdminToken = (req) => {
  const token = readAdminToken(req);
  if (!token) return false;
  const accepted = [process.env.ADMIN_SECRET, process.env.VITE_ADMIN_API_TOKEN, process.env.ADMIN_API_TOKEN, "quanton3d_admin_secret"].filter(Boolean);
  return accepted.includes(token);
};

router.get("/partners", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const collection = getPartnersCollection();
    if (!collection) return res.json({ success: true, partners: [] });
    const partners = await collection.find({}).sort({ order: 1, createdAt: -1 }).toArray();
    return res.json({ success: true, partners: partners.map(normalizePartnerResponse) });
  } catch (err) {
    console.error("[API] Erro ao listar parceiros:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar parceiros" });
  }
});

router.post("/partners", async (req, res) => {
  try {
    if (!isValidAdminToken(req)) return res.status(401).json({ success: false, error: "unauthorized" });
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const payload = req.body || {};
    const name = typeof payload.name === "string" ? payload.name.trim() : "";
    if (!name) return res.status(400).json({ success: false, error: "Nome é obrigatório" });
    const collection = getPartnersCollection();
    const now = new Date();
    const doc = { ...buildPartnerPayload(payload), createdAt: now, updatedAt: now };
    const result = await collection.insertOne(doc);
    return res.status(201).json({ success: true, partner: normalizePartnerResponse({ ...doc, _id: result.insertedId }) });
  } catch (err) {
    console.error("[API] Erro ao criar parceiro:", err);
    return res.status(500).json({ success: false, error: "Erro ao criar parceiro" });
  }
});

router.post("/partners/upload-image", upload.any(), async (req, res) => {
  try {
    if (!isValidAdminToken(req)) return res.status(401).json({ success: false, error: "unauthorized" });
    const payload = req.body || {};
    let imageUrl = typeof payload.imageUrl === "string" && payload.imageUrl.trim() ? payload.imageUrl.trim() : typeof payload.image === "string" ? payload.image.trim() : "";
    if (!imageUrl && Array.isArray(req.files) && req.files.length > 0) {
      const file = req.files[0];
      if (file?.buffer?.length) imageUrl = `data:${file.mimetype || "image/jpeg"};base64,${file.buffer.toString("base64")}`;
    }
    if (!imageUrl) return res.status(400).json({ success: false, error: "image obrigatório" });
    return res.json({ success: true, imageUrl, url: imageUrl });
  } catch (err) {
    console.error("[API] Erro no upload de imagem de parceiro:", err);
    return res.status(500).json({ success: false, error: "Erro no upload da imagem" });
  }
});

router.put("/partners/:id", async (req, res) => {
  try {
    if (!isValidAdminToken(req)) return res.status(401).json({ success: false, error: "unauthorized" });
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, error: "ID inválido" });
    const collection = getPartnersCollection();
    const payload = req.body || {};
    const updates = { ...buildPartnerPayload(payload, { partial: true }), updatedAt: new Date() };
    const result = await collection.findOneAndUpdate({ _id: new ObjectId(id) }, { $set: updates }, { returnDocument: "after" });
    const updatedPartner = result?.value || result;
    if (!updatedPartner || !updatedPartner._id) return res.status(404).json({ success: false, error: "Parceiro não encontrado" });
    return res.json({ success: true, partner: normalizePartnerResponse(updatedPartner) });
  } catch (err) {
    console.error("[API] Erro ao atualizar parceiro:", err);
    return res.status(500).json({ success: false, error: "Erro ao atualizar parceiro" });
  }
});

router.delete("/partners/:id", async (req, res) => {
  try {
    if (!isValidAdminToken(req)) return res.status(401).json({ success: false, error: "unauthorized" });
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const { id } = req.params;
    if (!ObjectId.isValid(id)) return res.status(400).json({ success: false, error: "ID inválido" });
    const collection = getPartnersCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return res.status(404).json({ success: false, error: "Parceiro não encontrado" });
    return res.json({ success: true });
  } catch (err) {
    console.error("[API] Erro ao remover parceiro:", err);
    return res.status(500).json({ success: false, error: "Erro ao remover parceiro" });
  }
});

router.post("/add-knowledge", async (req, res) => {
  try {
    if (!isValidAdminToken(req)) return res.status(401).json({ success: false, error: "unauthorized" });
    const payload = req.body || {};
    const title = typeof payload.title === "string" ? payload.title.trim() : "";
    const content = typeof payload.content === "string" ? payload.content.trim() : "";
    const source = typeof payload.source === "string" && payload.source.trim() ? payload.source.trim() : "admin_panel";
    const tags = Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : ["admin"];
    if (!title || !content) return res.status(400).json({ success: false, error: "title e content são obrigatórios" });
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const result = await addDocument(title, content, source, tags);
    return res.status(201).json({ success: true, result });
  } catch (err) {
    console.error("[API] Erro ao adicionar knowledge:", err);
    return res.status(500).json({ success: false, error: "Erro ao adicionar knowledge" });
  }
});

router.get("/knowledge", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const collection = getCollection("documents");
    if (!collection) return res.json({ success: true, documents: [] });
    const documents = await collection.find({}, { projection: { title: 1, tags: 1, source: 1, createdAt: 1 } }).sort({ createdAt: -1 }).limit(200).toArray();
    return res.json({ success: true, documents });
  } catch (err) {
    console.error("[API] Erro ao listar knowledge:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar knowledge" });
  }
});

router.get("/visual-knowledge/pending", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    const pendingCollection = getCollection("gallery");
    if (!pendingCollection) return res.json({ success: true, pending: [] });
    const pendingDocs = await pendingCollection.find({ $or: [{ approved: false }, { status: "pending" }] }).sort({ createdAt: -1 }).limit(200).toArray();
    return res.json({
      success: true,
      pending: pendingDocs.map((item) => ({
        _id: item._id?.toString?.() || item.id || null,
        imageUrl: item.imageUrl || item.image || (Array.isArray(item.images) ? item.images[0] : null),
        userName: item.userName || item.user || item.name || null,
        defectType: item.defectType || item.title || null,
        createdAt: item.createdAt || null,
        status: item.status || (item.approved ? "approved" : "pending")
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar conhecimento visual pendente:", err);
    return res.status(500).json({ success: false, error: "Erro ao listar pendências visuais" });
  }
});

router.get("/nuke-and-seed", async (_req, res) => {
  return res.status(410).json({
    success: false,
    error: "Rota descontinuada. A coleção 'parametros' no MongoDB é a fonte de verdade e não deve mais ser repovoada por seed local."
  });
});

export { router as apiRoutes };
