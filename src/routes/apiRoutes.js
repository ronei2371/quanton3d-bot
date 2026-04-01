import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import { ObjectId } from "mongodb";
import * as db from "../../db.js";
import { addDocument } from "../../rag-search.js";

const router = express.Router();
const upload = multer();

// --- SEGURANÇA ---
const ADMIN_SECRET = process.env.ADMIN_SECRET || "quanton3d_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-secret-2026";

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

// --- BANCO DE DADOS (REGRAS AGENTS.MD) ---
const getCol = (name) => (typeof db.getCollection === 'function' ? db.getCollection(name) : null);

// --- ROTAS PÚBLICAS ---
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body || {};
    if (sessionId) {
      const col = db.getConversasCollection?.() || getCol('conversas');
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
    const col = db.getOrdersCollection?.() || getCol('custom_requests');
    if (col) {
      await col.insertOne({
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
    const col = getCol("parametros"); // FONTE DA VERDADE (459 resinas)
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const data = await col.aggregate([
      { $group: { _id: "$resinName", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    res.json({ success: true, resins: data.map(d => ({ id: d._id, name: d._id || "Sem Nome", profiles: d.count })) });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.post("/add-knowledge", adminOnly(async (req, res) => {
  try {
    const { title, content } = req.body;
    const result = await addDocument(title, content, "admin_panel", ["admin"]);
    res.status(201).json({ success: true, result });
  } catch (err) { res.status(500).json({ success: false }); }
});

// 🛡️ PROTEÇÃO CONTRA SOBREPOSIÇÃO (NÃO APAGAR DADOS)
router.get("/nuke-and-seed", (req, res) => {
  res.status(410).json({ success: false, error: "Bloqueado: Use o MongoDB como fonte de verdade." });
});

export { router as apiRoutes };
