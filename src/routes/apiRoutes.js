import express from "express";
import multer from "multer";
import jwt from "jsonwebtoken";
import * as db from "../../db.js";
import { addDocument } from "../../rag-search.js";

const router = express.Router();
const upload = multer();

const ADMIN_SECRET = process.env.ADMIN_SECRET || "quanton3d_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-secret-2026";

const getCol = (name) => (typeof db.getCollection === "function" ? db.getCollection(name) : null);

const getParametrosCollection = async () => {
  const mongoDb = db.getDb?.();
  if (!mongoDb) return db.getCollection("parametros");
  return mongoDb.collection("parametros") || db.getCollection("parametros");
};

// ROTAS PÚBLICAS
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body || {};
    if (sessionId) {
      const col = db.getConversasCollection?.() || getCol("conversas");
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
    const col = db.getOrdersCollection?.() || getCol("custom_requests");
    if (col) {
      await col.insertOne({
        name, phone, email, desiredFeature, color,
        status: "pending", createdAt: new Date()
      });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ GET /params/resins
router.get("/params/resins", async (req, res) => {
  try {
    const col = await getParametrosCollection();
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const data = await col.aggregate([
      { $group: { _id: "$resinName", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    res.json({ success: true, resins: data.map(d => ({ id: d._id, name: d._id || "Sem Nome", profiles: d.count })) });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ GET /resins — alias público
router.get("/resins", async (req, res) => {
  try {
    const col = await getParametrosCollection();
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const data = await col.aggregate([
      { $group: { _id: "$resinName", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    res.json({ success: true, resins: data.map(d => ({ id: d._id, name: d._id || "Sem Nome", profiles: d.count })) });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ GET /params/printers
router.get("/params/printers", async (req, res) => {
  try {
    const col = await getParametrosCollection();
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const data = await col.aggregate([
      { $group: { _id: "$printerName", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    const printers = data.filter(d => d._id).map(d => ({ id: d._id, name: d._id, profiles: d.count }));
    res.json({ success: true, printers });
  } catch (err) {
    console.error("[API] Erro ao buscar impressoras:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ✅ GET /printers — alias público
router.get("/printers", async (req, res) => {
  try {
    const col = await getParametrosCollection();
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const data = await col.aggregate([
      { $group: { _id: "$printerName", count: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]).toArray();
    const printers = data.filter(d => d._id).map(d => ({ id: d._id, name: d._id, profiles: d.count }));
    res.json({ success: true, printers });
  } catch (err) {
    console.error("[API] Erro ao buscar impressoras:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/visual-knowledge", async (req, res) => {
  try {
    const col = db.getVisualKnowledgeCollection?.() || getCol("visual_knowledge");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const items = await col.find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return res.status(200).json({ success: true, items });
  } catch (err) { return res.status(500).json({ success: false }); }
});

router.post("/visual-knowledge", async (req, res) => {
  try {
    const { title, imageUrl, description } = req.body || {};
    if (!title || !imageUrl) {
      return res.status(400).json({ success: false, error: "title e imageUrl são obrigatórios" });
    }
    const col = db.getVisualKnowledgeCollection?.() || getCol("visual_knowledge");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });
    const doc = { title, imageUrl, description: description || "", createdAt: new Date(), updatedAt: new Date() };
    const result = await col.insertOne(doc);
    return res.status(201).json({ success: true, id: result.insertedId, item: { ...doc, _id: result.insertedId } });
  } catch (err) { return res.status(500).json({ success: false }); }
});

router.post("/add-knowledge", async (req, res) => {
  try {
    const { title, content } = req.body;
    const result = await addDocument(title, content, "admin_panel", ["admin"]);
    res.status(201).json({ success: true, result });
  } catch (err) { res.status(500).json({ success: false }); }
});

router.get("/nuke-and-seed", (req, res) => {
  res.status(410).json({ success: false, error: "Rota descontinuada." });
});

export { router as apiRoutes };