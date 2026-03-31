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
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.VITE_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || "quanton3d_admin_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || 'quanton-secret-2026';

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    try {
      jwt.verify(token, ADMIN_JWT_SECRET);
      return true;
    } catch { return false; }
  }
  const legacySecret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  return legacySecret === ADMIN_SECRET;
};

const adminGuard = (handler) => async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: "unauthorized" });
  return handler(req, res);
};

// ====================== HELPERS ======================
const isNil = (value) => value === undefined || value === null;
const normalizeString = (v, fallback = '') => (typeof v === 'string' ? v.trim() : fallback);
const sanitizeNumericValue = (v) => {
  if (isNil(v)) return null;
  const n = typeof v === "string" ? parseFloat(v.replace(",", ".")) : v;
  return Number.isFinite(n) ? n : null;
};
const buildResinFilter = (id) => id ? { $or: [{ resinId: new RegExp(`^${id}$`, "i") }, { resin: new RegExp(`^${id}$`, "i") }] } : null;
const buildPrinterFilter = (id) => id ? { $or: [{ printerId: new RegExp(`^${id}$`, "i") }, { model: new RegExp(`^${id}$`, "i") }] } : null;
const getOrdersCollectionSafe = () => getOrdersCollection() || getCollection('pedidos') || getCollection('custom_requests');

const buildVisualKnowledgeResponse = (doc) => ({
  id: doc._id?.toString() || doc.id || null,
  title: doc.title || doc.name || 'Sem título',
  imageUrl: doc.imageUrl || (Array.isArray(doc.images) ? doc.images[0] : null),
  createdAt: doc.createdAt || null,
  status: doc.status || "pending"
});

// ====================== ROTAS PÚBLICAS ======================
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body;
    await ensureMongoReady();
    if (sessionId) {
      await getConversasCollection().updateOne({ sessionId }, { $set: { userName: name, userPhone: phone, userEmail: email, updatedAt: new Date() } }, { upsert: true });
    }
    res.json({ success: true, message: "Registrado" });
  } catch { res.status(500).json({ success: false }); }
});

router.post("/custom-request", async (req, res) => {
  try {
    const { name, phone, email, desiredFeature, color } = req.body;
    const col = getOrdersCollectionSafe();
    await col.insertOne({ type: "custom_request", name, phone, email, desiredFeature, color, status: "pending", createdAt: new Date() });
    res.json({ success: true, message: "Pedido enviado" });
  } catch { res.status(500).json({ success: false }); }
});

// ====================== ROTAS ADMIN ======================
router.get('/orders', adminGuard(async (req, res) => {
  try {
    const docs = await getOrdersCollectionSafe().find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders: docs });
  } catch { res.status(500).json({ success: false }); }
});

router.get('/visual-knowledge/pending', async (_req, res) => {
  try {
    const col = getCollection('gallery');
    const docs = await col.find({ $or: [{ approved: false }, { status: 'pending' }] }).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, pending: docs.map(buildVisualKnowledgeResponse) });
  } catch { res.status(500).json({ success: false }); }
});

router.get("/params/resins", async (_req, res) => {
  try {
    const col = getCollection("parametros");
    const resins = await col.aggregate([{ $group: { _id: "$resinName", profiles: { $sum: 1 } } }]).toArray();
    res.json({ success: true, resins: resins.map(r => ({ id: r._id, name: r._id, profiles: r.profiles })) });
  } catch { res.status(500).json({ success: false }); }
});

router.get('/partners', async (_req, res) => {
  try {
    const docs = await getCollection('partners').find({}).toArray();
    res.json({ success: true, partners: docs });
  } catch { res.status(500).json({ success: false }); }
});

router.post('/add-knowledge', adminGuard(async (req, res) => {
  try {
    const { title, content } = req.body;
    const result = await addDocument(title, content, 'admin_panel', ['admin']);
    res.status(201).json({ success: true, result });
  } catch { res.status(500).json({ success: false }); }
});

router.get("/nuke-and-seed", async (_req, res) => {
  return res.status(410).json({ success: false, error: "Rota descontinuada." });
});

export { router as apiRoutes };
