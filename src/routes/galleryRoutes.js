import express from "express";
import multer from "multer";
import { getDb, isConnected } from "../../db.js";

const router = express.Router();
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }
});

const getGalleryCollection = () => {
  const db = getDb?.();
  if (!db) return null;
  return db.collection("gallery");
};

// POST /api/gallery — Salvar envio do cliente
router.post("/gallery", upload.single("image"), async (req, res) => {
  try {
    const { name, contact, resin, printer, layerHeight, exposureNormal, exposureBase, baseLayers, notes } = req.body || {};

    if (!resin && !printer) {
      return res.status(400).json({ success: false, error: "Informe a resina e a impressora" });
    }

    let imageUrl = null;
    if (req.file) {
      const base64 = req.file.buffer.toString("base64");
      imageUrl = `data:${req.file.mimetype};base64,${base64}`;
    }

    const entry = {
      name: name || "Anônimo",
      contact: contact || "",
      resin: resin || "",
      printer: printer || "",
      settings: {
        layerHeight: layerHeight || "",
        exposureNormal: exposureNormal || "",
        exposureBase: exposureBase || "",
        baseLayers: baseLayers || ""
      },
      note: notes || "",
      imageUrl,
      images: imageUrl ? [imageUrl] : [],
      status: "pending",
      createdAt: new Date()
    };

    if (isConnected()) {
      const col = getGalleryCollection();
      if (col) {
        const result = await col.insertOne(entry);
        return res.status(201).json({ success: true, id: result.insertedId });
      }
    }

    res.status(201).json({ success: true, message: "Recebido! Será revisado em breve." });
  } catch (err) {
    console.error("[GALLERY] Erro ao salvar:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/gallery/all — Listar todas as fotos (admin)
router.get("/gallery/all", async (req, res) => {
  try {
    if (!isConnected()) {
      return res.status(503).json({ success: false, error: "MongoDB offline" });
    }
    const col = getGalleryCollection();
    if (!col) return res.status(503).json({ success: false, error: "Coleção indisponível" });

    const limit = parseInt(req.query.limit) || 100;
    const entries = await col.find({}).sort({ createdAt: -1 }).limit(limit).toArray();

    res.json({ success: true, images: entries, entries, total: entries.length });
  } catch (err) {
    console.error("[GALLERY] Erro ao listar:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/gallery — Listar fotos aprovadas (público)
router.get("/gallery", async (req, res) => {
  try {
    if (!isConnected()) return res.json({ success: true, images: [] });
    const col = getGalleryCollection();
    if (!col) return res.json({ success: true, images: [] });

    const entries = await col.find({ status: "approved" }).sort({ createdAt: -1 }).limit(50).toArray();
    res.json({ success: true, images: entries, total: entries.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/gallery/:id/approve — Aprovar foto
router.put("/gallery/:id/approve", async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ success: false });
    const { ObjectId } = await import("mongodb");
    const col = getGalleryCollection();
    await col.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { status: "approved", approvedAt: new Date() } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/gallery/:id — Deletar foto
router.delete("/gallery/:id", async (req, res) => {
  try {
    if (!isConnected()) return res.status(503).json({ success: false });
    const { ObjectId } = await import("mongodb");
    const col = getGalleryCollection();
    await col.deleteOne({ _id: new ObjectId(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export { router as galleryRoutes };
