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
router.post("/gallery", upload.any(), async (req, res) => {
  try {
    const { name, resin, printer, image, images, imageUrl, note, contact } = req.body;
    const sanitizedResin = resin ? resin.trim() : null;

    if (!sanitizedResin || !printer) {
      return res.status(400).json({ success: false, error: "Resina e impressora são obrigatórias" });
    }

    const finalImages = [];
    if (Array.isArray(images)) finalImages.push(...images.filter(Boolean));
    if (image) finalImages.push(image);
    if (Array.isArray(imageUrl)) finalImages.push(...imageUrl.filter(Boolean));
    else if (imageUrl) finalImages.push(imageUrl);

    if (finalImages.length === 0 && Array.isArray(req.files) && req.files.length > 0) {
      req.files.forEach(file => {
        if (file?.buffer) {
          const mimeType = file.mimetype || "image/jpeg";
          const base64 = file.buffer.toString("base64");
          finalImages.push(`data:${mimeType};base64,${base64}`);
        }
      });
    }

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
      images: finalImages,
      note: note?.trim() || null,
      contact: contact?.trim() || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await galleryCollection.insertOne(newEntry);

    res.json({
      success: true,
      message: "Fotos enviadas com sucesso!",
      id: result.insertedId.toString()
    });
  } catch (err) {
    console.error("[API] Erro ao enviar fotos:", err);
    res.status(500).json({ success: false, error: "Erro ao enviar fotos" });
  }
});

router.get('/gallery', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("gallery");
    if (!collection) return res.json({ success: true, gallery: [] });

    const items = await collection.find({}).sort({ createdAt: -1 }).limit(100).toArray();

    res.json({
      success: true,
      gallery: items.map(item => ({
        id: item._id?.toString(),
        name: item.name,
        resin: item.resin,
        printer: item.printer,
        images: item.images || [],
        note: item.note,
        status: item.status || "pending",
        createdAt: item.createdAt
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar galeria:", err);
    res.status(500).json({ success: false, error: "Erro ao listar galeria" });
  }
});

router.get('/gallery/all', adminGuard(async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return res.status(503).json({ success: false, error: "Banco de dados indisponível" });

    const collection = getCollection("gallery");
    if (!collection) return res.json({ success: true, images: [], entries: [] });

    const limit = parseInt(req.query.limit) || 100;
    const entries = await collection.find({}).sort({ createdAt: -1 }).limit(limit).toArray();

    res.json({ success: true, images: entries, entries, total: entries.length });
  } catch (err) {
    console.error("[API] Erro ao listar galeria completa:", err);
    res.status(500).json({ success: false, error: "Erro ao listar galeria" });
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

// ====================== EXPORT ======================
export { router as apiRoutes };