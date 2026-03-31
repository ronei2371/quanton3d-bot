import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import * as db from "../../db.js";
import { addDocument } from "../../rag-search.js";

const router = express.Router();
const upload = multer();

// --- CONFIGURAÇÕES DE SEGURANÇA ---
const ADMIN_SECRET = process.env.ADMIN_SECRET || "quanton3d_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-secret-2026";

// --- HELPERS DE BANCO DE DADOS (FONTE DA VERDADE) ---
const getCol = (name) => (typeof db.getCollection === 'function' ? db.getCollection(name) : null);
const getConversasCol = () => db.getConversasCollection?.() || getCol('conversas');
const getOrdersCol = () => db.getOrdersCollection?.() || getCol('pedidos') || getCol('custom_requests');

const isAdmin = (req) => {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    try { return !!jwt.verify(auth.slice(7), ADMIN_JWT_SECRET); } catch { return false; }
  }
  const secret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  return secret === ADMIN_SECRET;
};

const adminOnly = (fn) => async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ success: false, error: "Unauthorized" });
  return fn(req, res);
};

// --- ROTAS PÚBLICAS ---

router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body || {};
    if (sessionId) {
      const col = getConversasCol();
      if (col) {
        await col.updateOne(
          { sessionId },
          { $set: { userName: name, userPhone: phone, userEmail: email, updatedAt: new Date() } },
          { upsert: true }
        );
      }
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.post("/custom-request", async (req, res) => {
  try {
    const { name, phone, email, desiredFeature, color } = req.body || {};
    const col = getOrdersCol();
    if (col) {
      await col.insertOne({
        type: "custom_request",
        name, phone, email, desiredFeature, color,
        status: "pending", createdAt: new Date()
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ROTAS ADMINISTRATIVAS ---

router.get("/params/resins", async (req, res) => {
  try {
    const col = getCol("parametros");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const data = await col.aggregate([
      { $group: { _id: "$resinName", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    res.json({ success: true, resins: data.map(d => ({ id: d._id, name: d._id || "Sem Nome", profiles: d.count })) });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.get("/orders", adminOnly(async (req, res) => {
  try {
    const col = getOrdersCol();
    const data = await col.find({}).sort({ createdAt: -1 }).toArray();
    res.json({ success: true, orders: data });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.post("/add-knowledge", adminOnly(async (req, res) => {
  try {
    const { title, content } = req.body;
    const result = await addDocument(title, content, "admin_panel", ["admin"]);
    res.status(201).json({ success: true, result });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.get("/partners", async (req, res) => {
  try {
    const col = getCol("partners");
    const data = await col.find({ active: true }).sort({ order: 1 }).toArray();
    res.json({ success: true, partners: data });
  } catch (err) { res.status(500).json({ success: false }); }
});

// 🛡️ TRAVA DE SEGURANÇA: NUNCA SOBRESCREVER DADOS
router.get("/nuke-and-seed", (req, res) => {
  res.status(410).json({ success: false, error: "Ação bloqueada: o MongoDB é a fonte da verdade e não deve ser resetado." });
});

export { router as apiRoutes };
