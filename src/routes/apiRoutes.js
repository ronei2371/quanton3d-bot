import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";

import {
  getSugestoesCollection,
  getVisualKnowledgeCollection,
  getConversasCollection,
  getCollection,
  getOrdersCollection
} from "../../db.js";

import { ensureMongoReady } from "./common.js";
import { addDocument } from "../../rag-search.js";

const router = express.Router();
const upload = multer();

const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_API_TOKEN || null;
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-secret-2026';

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.slice(7), ADMIN_JWT_SECRET);
      return true;
    } catch (_) {
      return false;
    }
  }
  const legacy = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  return legacy && legacy === ADMIN_SECRET;
};

const adminGuard = (handler) => async (req, res) => {
  if (!isAdminRequest(req)) {
    return res.status(401).json({ success: false, error: "unauthorized" });
  }
  return handler(req, res);
};

const normalizeString = (value, fallback = '') => (typeof value === 'string' ? value.trim() : fallback);

const buildResinFilter = (resinId) => {
  if (!resinId) return null;
  return { $or: [{ resinId: resinId }, { resin: resinId }, { resinName: resinId }] };
};

const buildPrinterFilter = (printerId) => {
  if (!printerId) return null;
  return { $or: [{ printerId: printerId }, { printer: printerId }, { model: printerId }] };
};

const getPartnersCollection = () => getCollection('partners');
const getOrdersCollectionSafe = () => getOrdersCollection() || getCollection('pedidos') || getCollection('custom_requests');

// ====================== MÉTRICAS ======================
router.get('/metrics', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const parametros = getCollection("parametros");
    const messages = getCollection("messages");
    const conversas = getConversasCollection();
    const gallery = getCollection("gallery");

    const [resins, printers, totalMessages, totalConversas, totalGallery] = await Promise.all([
      parametros ? parametros.distinct("resinName") : Promise.resolve([]),
      parametros ? parametros.distinct("printer") : Promise.resolve([]),
      messages ? messages.countDocuments() : Promise.resolve(0),
      conversas ? conversas.countDocuments() : Promise.resolve(0),
      gallery ? gallery.countDocuments({ status: "approved" }) : Promise.resolve(0)
    ]);

    res.json({
      success: true,
      metrics: {
        totalResins: resins.length,
        totalPrinters: printers.length,
        totalMessages,
        totalConversas,
        totalGalleryApproved: totalGallery,
        totalAtendimentos: totalMessages + totalConversas
      }
    });
  } catch (err) {
    console.error("[API] Erro ao gerar métricas:", err);
    res.status(500).json({ success: false, error: "Erro ao gerar métricas" });
  }
}));



// ====================== CONTATO PÚBLICO ======================
router.post('/contact', async (req, res) => {
  try {
    const { name, phone, email, message } = req.body || {};
    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Nome, e-mail e mensagem são obrigatórios' });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('messages') || getCollection('contacts');
    if (!collection) return res.status(503).json({ success: false, error: 'Coleção de mensagens indisponível' });

    const doc = {
      name: normalizeString(name),
      phone: normalizeString(phone),
      email: normalizeString(email).toLowerCase(),
      message: normalizeString(message),
      status: 'pending',
      source: 'site-contact',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await collection.insertOne(doc);
    res.status(201).json({ success: true, id: result.insertedId.toString() });
  } catch (err) {
    console.error('[API] Erro ao salvar contato público:', err);
    res.status(500).json({ success: false, error: 'Erro ao salvar contato' });
  }
});

// ====================== FORMULAÇÃO CUSTOMIZADA PÚBLICA ======================
router.post('/custom-request', async (req, res) => {
  try {
    const { name, phone, email, caracteristica, cor, complementos } = req.body || {};
    if (!name || !phone || !email || !caracteristica || !cor) {
      return res.status(400).json({ success: false, error: 'Preencha todos os campos obrigatórios' });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('custom_requests') || getOrdersCollectionSafe();
    if (!collection) return res.status(503).json({ success: false, error: 'Coleção de formulações indisponível' });

    const doc = {
      name: normalizeString(name),
      phone: normalizeString(phone),
      email: normalizeString(email).toLowerCase(),
      desiredFeature: normalizeString(caracteristica),
      caracteristica: normalizeString(caracteristica),
      color: normalizeString(cor),
      cor: normalizeString(cor),
      details: normalizeString(complementos),
      complementos: normalizeString(complementos),
      status: 'pending',
      source: 'site-custom-request',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await collection.insertOne(doc);
    res.status(201).json({ success: true, id: result.insertedId.toString() });
  } catch (err) {
    console.error('[API] Erro ao salvar formulação customizada:', err);
    res.status(500).json({ success: false, error: 'Erro ao salvar formulação customizada' });
  }
});

// ====================== MENSAGENS ======================
router.get('/contact', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("messages") || getCollection("contacts");
    if (!collection) return res.json({ success: true, messages: [] });

    const messages = await collection.find({}).sort({ createdAt: -1 }).limit(200).toArray();

    res.json({
      success: true,
      messages: messages.map(m => ({
        id: m._id?.toString(),
        name: m.name,
        email: m.email,
        phone: m.phone,
        subject: m.subject,
        message: m.message,
        status: m.status || "pending",
        createdAt: m.createdAt
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar mensagens:", err);
    res.status(500).json({ success: false, error: "Erro ao listar mensagens" });
  }
}));

// ====================== FORMULAÇÕES ======================
router.get('/formulations', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("custom_requests") || getOrdersCollectionSafe();
    if (!collection) return res.json({ success: true, formulations: [] });

    const formulations = await collection.find({}).sort({ createdAt: -1 }).limit(150).toArray();

    res.json({
      success: true,
      formulations: formulations.map(f => ({
        id: f._id?.toString(),
        name: f.name,
        phone: f.phone,
        email: f.email,
        desiredFeature: f.desiredFeature || f.caracteristica,
        color: f.color,
        details: f.details,
        status: f.status || "pending",
        createdAt: f.createdAt
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar formulações:", err);
    res.status(500).json({ success: false, error: "Erro ao listar formulações" });
  }
}));

// ====================== CONVERSAS ======================
router.get('/conversas', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getConversasCollection();
    if (!collection) return res.json({ success: true, conversas: [] });

    const conversas = await collection.find({}).sort({ updatedAt: -1 }).limit(100).toArray();

    res.json({
      success: true,
      conversas: conversas.map(c => ({
        id: c._id?.toString() || c.sessionId,
        sessionId: c.sessionId,
        userName: c.userName,
        userPhone: c.userPhone,
        userEmail: c.userEmail,
        resin: c.resin,
        problemType: c.problemType,
        lastMessage: c.lastMessage,
        updatedAt: c.updatedAt
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar conversas:", err);
    res.status(500).json({ success: false, error: "Erro ao listar conversas" });
  }
}));

// ====================== GALERIA ======================
const parseBooleanField = (value, fallback = true) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'sim', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'nao', 'não', 'no', 'off'].includes(normalized)) return false;
  }
  return fallback;
};

const mapGalleryEntry = (item = {}) => ({
  id: item._id?.toString?.() || item.id || null,
  name: item.name || 'Cliente',
  contact: item.contact || null,
  resin: item.resin || null,
  printer: item.printer || null,
  note: item.note || item.notes || null,
  status: item.status || 'pending',
  allowPublic: item.allowPublic !== false,
  approvedAt: item.approvedAt || null,
  createdAt: item.createdAt || null,
  updatedAt: item.updatedAt || null,
  imageUrl: item.imageUrl || (Array.isArray(item.images) ? item.images[0] : null) || null,
  settings: {
    layerHeight: item.settings?.layerHeight || item.layerHeight || null,
    exposureNormal: item.settings?.exposureNormal || item.exposureNormal || null,
    exposureBase: item.settings?.exposureBase || item.baseExposure || null,
    baseLayers: item.settings?.baseLayers || item.baseLayers || null,
  }
});

router.post('/gallery', upload.any(), async (req, res) => {
  try {
    const { name, resin, printer, image, images, imageUrl, note, notes, contact, layerHeight, exposureNormal, exposureBase, baseLayers, allowPublic } = req.body || {};
    const sanitizedResin = resin ? String(resin).trim() : '';
    const sanitizedPrinter = printer ? String(printer).trim() : '';

    if (!sanitizedResin && !sanitizedPrinter) {
      return res.status(400).json({ success: false, error: 'Resina e/ou impressora são obrigatórias' });
    }

    const finalImages = [];
    if (Array.isArray(images)) finalImages.push(...images.filter(Boolean));
    if (image) finalImages.push(image);
    if (Array.isArray(imageUrl)) finalImages.push(...imageUrl.filter(Boolean));
    else if (imageUrl) finalImages.push(imageUrl);

    if (finalImages.length === 0 && Array.isArray(req.files) && req.files.length > 0) {
      req.files.forEach((file) => {
        if (file?.buffer) {
          const mimeType = file.mimetype || 'image/jpeg';
          const base64 = file.buffer.toString('base64');
          finalImages.push(`data:${mimeType};base64,${base64}`);
        }
      });
    }

    if (finalImages.length === 0) {
      return res.status(400).json({ success: false, error: 'Envie ao menos uma imagem' });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const galleryCollection = getCollection('gallery');
    if (!galleryCollection) return res.status(503).json({ success: false, error: 'Coleção gallery indisponível' });

    const now = new Date();
    const newEntry = {
      name: name?.trim() || 'Cliente',
      contact: contact?.trim() || '',
      resin: sanitizedResin,
      printer: sanitizedPrinter,
      imageUrl: finalImages[0],
      images: finalImages,
      note: note?.trim() || notes?.trim() || '',
      settings: {
        layerHeight: layerHeight?.trim?.() || layerHeight || '',
        exposureNormal: exposureNormal?.trim?.() || exposureNormal || '',
        exposureBase: exposureBase?.trim?.() || exposureBase || '',
        baseLayers: baseLayers?.trim?.() || baseLayers || ''
      },
      allowPublic: parseBooleanField(allowPublic, true),
      status: 'pending',
      createdAt: now,
      updatedAt: now
    };

    const result = await galleryCollection.insertOne(newEntry);

    res.json({
      success: true,
      message: 'Fotos enviadas com sucesso!',
      id: result.insertedId.toString(),
      entry: mapGalleryEntry({ ...newEntry, _id: result.insertedId })
    });
  } catch (err) {
    console.error('[API] Erro ao enviar fotos:', err);
    res.status(500).json({ success: false, error: 'Erro ao enviar fotos' });
  }
});

router.get('/gallery', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    if (!collection) return res.json({ success: true, gallery: [], images: [] });

    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 100);
    const query = { status: 'approved', allowPublic: { $ne: false } };
    const items = await collection.find(query).sort({ approvedAt: -1, createdAt: -1 }).limit(limit).toArray();
    const entries = items.map(mapGalleryEntry);

    res.json({ success: true, gallery: entries, images: entries, total: entries.length });
  } catch (err) {
    console.error('[API] Erro ao listar galeria pública:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar galeria pública' });
  }
});

router.get('/gallery/all', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    if (!collection) return res.json({ success: true, images: [], entries: [] });

    const limit = Math.min(parseInt(req.query.limit, 10) || 60, 100);
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : '';
    const query = status ? { status } : {};
    const entries = await collection.find(query).sort({ status: 1, createdAt: -1 }).limit(limit).toArray();
    const mapped = entries.map(mapGalleryEntry);

    res.json({ success: true, images: mapped, entries: mapped, total: mapped.length });
  } catch (err) {
    console.error('[API] Erro ao listar galeria completa:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar galeria completa' });
  }
}));

router.put('/gallery/:id/approve', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    const { id } = req.params;
    const safeId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const updates = {
      status: 'approved',
      approvedAt: new Date(),
      updatedAt: new Date()
    };
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'allowPublic')) {
      updates.allowPublic = parseBooleanField(req.body.allowPublic, true);
    }

    const result = await collection.findOneAndUpdate(
      { _id: safeId },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result.value) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    res.json({ success: true, entry: mapGalleryEntry(result.value) });
  } catch (err) {
    console.error('[API] Erro ao aprovar item da galeria:', err);
    res.status(500).json({ success: false, error: 'Erro ao aprovar item da galeria' });
  }
}));

router.delete('/gallery/:id', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    const { id } = req.params;
    const safeId = ObjectId.isValid(id) ? new ObjectId(id) : id;
    const result = await collection.deleteOne({ _id: safeId });
    if (result.deletedCount === 0) return res.status(404).json({ success: false, error: 'Registro não encontrado' });
    res.json({ success: true, deletedId: id });
  } catch (err) {
    console.error('[API] Erro ao deletar item da galeria:', err);
    res.status(500).json({ success: false, error: 'Erro ao deletar item da galeria' });
  }
}));

// ====================== VISUAL KNOWLEDGE ======================
router.get('/visual-knowledge', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getVisualKnowledgeCollection() || getCollection('gallery');
    if (!collection) return res.json({ success: true, items: [] });

    const items = await collection.find({}).sort({ updatedAt: -1 }).limit(100).toArray();

    res.json({
      success: true,
      items: items.map(item => ({
        id: item._id?.toString(),
        title: item.title || item.name,
        imageUrl: item.imageUrl || (item.images ? item.images[0] : null),
        resin: item.resin,
        printer: item.printer,
        note: item.note,
        status: item.status || "pending"
      }))
    });
  } catch (err) {
    console.error('[API] Erro ao listar visual knowledge:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar visual knowledge' });
  }
});

router.get('/visual-knowledge/pending', async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    if (!collection) return res.json({ success: true, pending: [] });

    const pending = await collection
      .find({ $or: [{ approved: false }, { status: 'pending' }] })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json({
      success: true,
      pending: pending.map(item => ({
        _id: item._id?.toString(),
        imageUrl: item.imageUrl || (item.images ? item.images[0] : null),
        userName: item.name || item.userName,
        defectType: item.defectType,
        createdAt: item.createdAt,
        status: item.status || "pending"
      }))
    });
  } catch (err) {
    console.error('[API] Erro ao listar pendentes:', err);
    res.status(500).json({ success: false, error: 'Erro ao listar pendentes' });
  }
});

// ✅ CORRIGIDO: fechamento correto com ))
router.put('/visual-knowledge/:id/approve', adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const { defectType, diagnosis, solution } = req.body;

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getCollection('gallery');
    const filter = ObjectId.isValid(id) ? { _id: new ObjectId(id) } : { id };

    const result = await collection.findOneAndUpdate(
      filter,
      { $set: { status: 'approved', approved: true, defectType, diagnosis, solution, approvedAt: new Date(), updatedAt: new Date() } },
      { returnDocument: 'after' }
    );

    if (!result || !result.value) return res.status(404).json({ success: false, error: 'Item não encontrado' });

    res.json({ success: true, item: result.value });
  } catch (err) {
    console.error('[API] Erro ao aprovar item:', err);
    res.status(500).json({ success: false, error: 'Erro ao aprovar item' });
  }
}));

// ====================== PARÂMETROS ======================
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

router.get("/resins", async (_req, res) => {
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
        id: item._id || item.name?.toLowerCase().replace(/\s+/g, "-"),
        name: item.name || "Sem nome",
        profiles: item.profiles ?? 0
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erro ao listar resinas" });
  }
});

router.get("/params/printers", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const { resinId } = req.query;
    const filter = resinId ? buildResinFilter(resinId) : {};

    const collection = getCollection("parametros");
    if (!collection) return res.json({ success: true, printers: [] });

    const printers = await collection.aggregate([
      { $match: filter || {} },
      {
        $group: {
          _id: { $ifNull: ["$printerId", { $ifNull: ["$printerName", { $ifNull: ["$printer", "$model"] }] }] },
          name: { $first: { $ifNull: ["$printerName", { $ifNull: ["$printer", "$model"] }] } },
          brand: { $first: "$brand" },
          model: { $first: { $ifNull: ["$model", "$printer"] } },
          profiles: { $sum: 1 }
        }
      },
      { $match: { name: { $ne: null } } },
      { $sort: { name: 1 } }
    ]).toArray();

    res.json({
      success: true,
      printers: printers.map(item => ({
        id: item._id,
        name: item.name || item.model,
        brand: item.brand,
        model: item.model,
        profiles: item.profiles ?? 0
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar impressoras:", err);
    res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
});

router.get("/printers", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("parametros");
    if (!collection) return res.json({ success: true, printers: [] });

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

    res.json({
      success: true,
      printers: printers.map(item => ({
        id: item._id,
        name: item.name,
        profiles: item.profiles ?? 0
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
});

router.get("/params/profiles", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const { resinId, printerId } = req.query;
    const filter = {};
    if (resinId) Object.assign(filter, buildResinFilter(resinId));
    if (printerId) Object.assign(filter, buildPrinterFilter(printerId));

    const collection = getCollection("parametros");
    if (!collection) return res.json({ success: true, profiles: [] });

    const profiles = await collection.find(filter).sort({ updatedAt: -1 }).limit(100).toArray();

    res.json({
      success: true,
      profiles: profiles.map(doc => ({
        id: doc._id?.toString(),
        resinName: doc.resinName || doc.resin,
        printer: doc.printer || doc.printerName,
        params: doc.params || doc.parametros || {},
        status: doc.status || "ok"
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar perfis:", err);
    res.status(500).json({ success: false, error: "Erro ao listar perfis" });
  }
});

router.get("/params/stats", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("parametros");
    if (!collection) return res.json({ success: true, totalResins: 0, totalPrinters: 0, activeProfiles: 0 });

    const [resinsData, printersData, total] = await Promise.all([
      collection.aggregate([{ $group: { _id: { $ifNull: ["$resinName", "$resin"] } } }]).toArray(),
      collection.aggregate([{ $group: { _id: { $ifNull: ["$printerName", "$printer"] } } }]).toArray(),
      collection.countDocuments()
    ]);

    res.json({
      success: true,
      totalResins: resinsData.length,
      totalPrinters: printersData.length,
      activeProfiles: total
    });
  } catch (err) {
    console.error("[API] Erro ao buscar stats:", err);
    res.status(500).json({ success: false, error: "Erro ao buscar stats" });
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
    res.json({ success: true, partners });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao listar parceiros' });
  }
});

router.post('/partners', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getPartnersCollection();
    const doc = { ...req.body, createdAt: new Date(), updatedAt: new Date() };
    const result = await collection.insertOne(doc);
    res.status(201).json({ success: true, partner: { ...doc, _id: result.insertedId } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao criar parceiro' });
  }
}));

router.put('/partners/:id', adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getPartnersCollection();
    const result = await collection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: { ...req.body, updatedAt: new Date() } },
      { returnDocument: 'after' }
    );
    if (!result.value) return res.status(404).json({ success: false, error: 'Parceiro não encontrado' });
    res.json({ success: true, partner: result.value });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao atualizar parceiro' });
  }
}));

router.delete('/partners/:id', adminGuard(async (req, res) => {
  try {
    const { id } = req.params;
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: 'Banco de dados indisponível' });

    const collection = getPartnersCollection();
    const result = await collection.deleteOne({ _id: new ObjectId(id) });
    if (result.deletedCount === 0) return res.status(404).json({ success: false, error: 'Parceiro não encontrado' });
    res.json({ success: true, message: 'Parceiro removido' });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Erro ao remover parceiro' });
  }
}));

// ====================== REGISTRO DE USUÁRIO ======================
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, howDidYouHear, sessionId } = req.body || {};

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const col = getConversasCollection() || getCollection("conversas");
    if (col && sessionId) {
      await col.updateOne(
        { sessionId },
        {
          $set: {
            userName: name || "",
            userPhone: phone || "",
            userEmail: email || "",
            howDidYouHear: howDidYouHear || "",
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }

    // Salva também na coleção de usuários
    const usersCol = getCollection("users");
    if (usersCol) {
      await usersCol.updateOne(
        { $or: [{ phone: phone }, { email: email }].filter(Boolean) },
        {
          $set: {
            name: name || "",
            phone: phone || "",
            email: email || "",
            howDidYouHear: howDidYouHear || "",
            updatedAt: new Date()
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );
    }

    res.json({ success: true, message: "Usuário registrado com sucesso!" });
  } catch (err) {
    console.error("[API] Erro ao registrar usuário:", err);
    res.status(500).json({ success: false, error: "Erro ao registrar usuário" });
  }
});

// ====================== EXPORT ======================
export { router as apiRoutes };