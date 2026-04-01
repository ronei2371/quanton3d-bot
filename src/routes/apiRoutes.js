import express from "express";
import jwt from "jsonwebtoken";
import * as db from "../../db.js";
import { addDocument } from "../../rag-search.js";

const router = express.Router();

// --- SEGURANÇA ---
const ADMIN_SECRET = process.env.ADMIN_SECRET || "quanton3d_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || "quanton-secret-2026";

const isAdmin = (req) => {
  const auth = req.headers.authorization || "";
  if (auth.startsWith("Bearer ")) {
    try {
      return !!jwt.verify(auth.slice(7), ADMIN_JWT_SECRET);
    } catch {
      return false;
    }
  }

  const secret = req.headers["x-admin-secret"] || req.query?.auth || req.body?.auth;
  return secret === ADMIN_SECRET;
};

const adminOnly = (fn) => async (req, res) => {
  if (!isAdmin(req)) return res.status(401).json({ success: false, error: "Unauthorized" });
  return fn(req, res);
};

// --- BANCO DE DADOS (AGENTS.MD) ---
const getCol = (name) => (typeof db.getCollection === "function" ? db.getCollection(name) : null);

const getParametrosCollection = async () => {
  const mongoDb = db.getDb?.();
  if (!mongoDb) return db.getCollection("parametros");

  await mongoDb.listCollections({ name: "parametros" }).toArray();
  return mongoDb.collection("parametros") || db.getCollection("parametros");
};

const normalizeItem = (value, fallback = "Não informado") => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (value === null || value === undefined) return fallback;
  return String(value);
};

// --- ROTAS PÚBLICAS ---
router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body || {};
    if (!sessionId) return res.status(400).json({ success: false, error: "sessionId é obrigatório" });

    const col = db.getConversasCollection?.() || getCol("conversas");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    await col.updateOne(
      { sessionId },
      {
        $set: {
          userName: name || "",
          userPhone: phone || "",
          userEmail: email || "",
          updatedAt: new Date()
        }
      },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false });
  }
});

router.post("/custom-request", async (req, res) => {
  try {
    const { name, phone, email, desiredFeature, color, notes } = req.body || {};
    const col = db.getOrdersCollection?.() || getCol("orders");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    await col.insertOne({
      type: "custom_formula_request",
      name: name || "",
      phone: phone || "",
      email: email || "",
      desiredFeature: desiredFeature || "",
      color: color || "",
      notes: notes || "",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    });

    return res.json({ success: true });
  } catch {
    return res.status(500).json({ success: false });
  }
});

// --- DADOS DE PARÂMETROS (FONTE DA VERDADE: parametros) ---
router.get("/params/resins", async (req, res) => {
  try {
    const col = await getParametrosCollection();
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    const data = await col
      .aggregate([
        {
          $group: {
            _id: "$resinName",
            profiles: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray();

    const resins = data
      .filter((item) => !!item._id)
      .map((item) => ({
        id: item._id,
        name: normalizeItem(item._id, "Sem Nome"),
        profiles: item.profiles || 0
      }));

    return res.json({ success: true, resins });
  } catch {
    return res.status(500).json({ success: false });
  }
});

router.get("/params/printers", async (req, res) => {
  try {
    const col = await getParametrosCollection();
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    const data = await col
      .aggregate([
        {
          $project: {
            printerName: {
              $ifNull: [
                "$printerName",
                { $ifNull: ["$machineName", { $ifNull: ["$impressora", "$printer"] }] }
              ]
            }
          }
        },
        {
          $group: {
            _id: "$printerName",
            profiles: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ])
      .toArray();

    const printers = data
      .filter((item) => !!item._id)
      .map((item) => ({
        id: item._id,
        name: normalizeItem(item._id, "Sem Nome"),
        profiles: item.profiles || 0
      }));

    return res.json({ success: true, printers });
  } catch {
    return res.status(500).json({ success: false });
  }
});

router.get("/partners", async (req, res) => {
  try {
    const col = db.getCollection?.("partners") || getCol("partners");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    const partners = await col.find({}).sort({ createdAt: -1 }).toArray();
    return res.json({ success: true, partners });
  } catch {
    return res.status(500).json({ success: false, partners: [] });
  }
});

router.get("/visual-knowledge", async (req, res) => {
  try {
    const col = db.getVisualKnowledgeCollection?.() || getCol("visual_knowledge");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    const items = await col.find({}).sort({ createdAt: -1 }).limit(100).toArray();
    return res.status(200).json({ success: true, items });
  } catch {
    return res.status(500).json({ success: false });
  }
});

router.post("/visual-knowledge", async (req, res) => {
  try {
    const { title, imageUrl, description } = req.body || {};
    if (!title || !imageUrl) {
      return res.status(400).json({ success: false, error: "title e imageUrl são obrigatórios" });
    }

    const col = db.getVisualKnowledgeCollection?.() || getCol("visual_knowledge");
    if (!col) return res.status(503).json({ success: false, error: "DB Offline" });

    const doc = {
      title,
      imageUrl,
      description: description || "",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await col.insertOne(doc);
    return res.status(201).json({ success: true, id: result.insertedId, item: { ...doc, _id: result.insertedId } });
  } catch {
    return res.status(500).json({ success: false });
  }
});

router.post("/add-knowledge", adminOnly(async (req, res) => {
  try {
    const { title, content } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ success: false, error: "title e content são obrigatórios" });
    }

    const result = await addDocument(title, content, "admin_panel", ["admin"]);
    return res.status(201).json({ success: true, result });
  } catch {
    return res.status(500).json({ success: false });
  }
}));

// 🛡️ PROTEÇÃO CONTRA SOBREPOSIÇÃO (NÃO APAGAR DADOS)
router.get("/nuke-and-seed", (req, res) => {
  return res.status(410).json({
    success: false,
    error: "Rota descontinuada. A coleção 'parametros' no MongoDB é a fonte de verdade"
  });
});

export { router as apiRoutes };
