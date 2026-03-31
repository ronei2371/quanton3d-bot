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
  return null;
};

const getConversasCollection = () => db.getConversasCollection?.() || getCollection("conversas");
const getOrdersCollectionSafe = () => db.getOrdersCollection?.() || getCollection("pedidos") || getCollection("custom_requests");

// ====================== SEGURANÇA ======================
const ADMIN_SECRET = process.env.ADMIN_SECRET || process.env.ADMIN_API_TOKEN || "quanton3d_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-secret-2026";

const isAdminRequest = (req) => {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    try {
      jwt.verify(authHeader.slice(7), ADMIN_JWT_SECRET);
      return true;
    } catch { return false; }
  }
  const secret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  return secret === ADMIN_SECRET;
};

const adminGuard = (handler) => async (req, res) => {
  if (!isAdminRequest(req)) return res.status(401).json({ success: false, error: "unauthorized" });
  return handler(req, res);
};

// ====================== HELPERS ======================
const normalizeString = (value, fallback = "") => (typeof value === "string" ? value.trim() : fallback);

// ====================== ROTAS PÚBLICAS ======================
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body || {};
    if (sessionId) {
      const col = getConversasCollection();
      await col.updateOne({ sessionId }, { $set: { userName: name, userPhone: phone, userEmail: email, updatedAt: new Date() } }, { upsert: true });
    }
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

router.post("/custom-request", async (req, res) => {
  try {
    const { name, phone, email, desiredFeature, color } = req.body || {};
    const col = getOrdersCollectionSafe();
    await col.insertOne({ name, phone, email, desiredFeature, color, status: "pending", createdAt: new Date() });
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

// ====================== ROTAS ADMIN ======================
router.get("/params/resins", async (_req, res) => {
  try {
    const col = getCollection("parametros");
    const stats = await col.aggregate([{ $group: { _id: "$resinName", profiles: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
    res.json({ success: true, resins: stats.map(s => ({ id: s._id, name: s._id, profiles: s.profiles })) });
  } catch { res.status(500).json({ success: false }); }
});

router.post("/add-knowledge", adminGuard(async (req, res) => {
  try {
    const { title, content } = req.body;
    const result = await addDocument(title, content, "admin_panel", ["admin"]);
    res.status(201).json({ success: true, result });
  } catch { res.status(500).json({ success: false }); }
});

// PROTEÇÃO CONTRA SOBREPOSIÇÃO DE DADOS
router.get("/nuke-and-seed", async (_req, res) => {
  return res.status(410).json({ 
    success: false, 
    error: "Rota descontinuada. A coleção 'parametros' no MongoDB é a fonte de verdade e não deve ser atualizada automaticamente." 
  });
});

export { router as apiRoutes };
