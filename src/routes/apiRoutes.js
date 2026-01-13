import express from "express";
import { ObjectId } from "mongodb";
import {
  getSugestoesCollection,
  getPrintParametersCollection,
  getVisualKnowledgeCollection,
  getConversasCollection,
  getCollection,
  getDb,
  isConnected
} from "../../db.js";
import { ensureMongoReady } from "./common.js";

const router = express.Router();
const MAX_PARAMS_PAGE_SIZE = 200;

const getMessagesCollection = () => getCollection('messages');
const getGalleryCollection = () => getCollection('gallery');
const getPartnersCollection = () => getCollection('partners');

router.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, resin, problemType, sessionId } = req.body;
    
    if (!name || !phone || !email) {
      return res.status(400).json({
        success: false,
        error: "Nome, telefone e email sao obrigatorios"
      });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
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
            updatedAt: new Date()
          }
        },
        { upsert: true }
      );
    }
    
    console.log(`[API] Usuario registrado: ${name} (${email})`);
    
    res.json({
      success: true,
      message: "Usuario registrado com sucesso",
      user: { name, phone, email, resin, problemType }
    });
  } catch (err) {
    console.error("[API] Erro ao registrar usuario:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao registrar usuario"
    });
  }
});

router.post("/contact", async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;
    
    if (!name || !email || !message) {
      return res.status(400).json({
        success: false,
        error: "Nome, email e mensagem sao obrigatorios"
      });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const messagesCollection = getMessagesCollection();
    const newMessage = {
      name,
      email,
      phone: phone || null,
      subject: subject || "Contato via Site",
      message,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await messagesCollection.insertOne(newMessage);
    console.log(`[API] Mensagem de contato recebida de: ${name} (${email})`);
    
    res.json({
      success: true,
      message: "Mensagem enviada com sucesso! Entraremos em contato em breve.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar mensagem de contato:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar mensagem"
    });
  }
});

function normalizeParams(params = {}) {
  return {
    layerHeightMm: params.layerHeightMm ?? null,
    exposureTimeS: params.exposureTimeS ?? null,
    baseExposureTimeS: params.baseExposureTimeS ?? null,
    baseLayers: params.baseLayers ?? null,
    uvOffDelayS: params.uvOffDelayS ?? null,
    uvOffDelayBaseS: params.uvOffDelayBaseS ?? null,
    restBeforeLiftS: params.restBeforeLiftS ?? null,
    restAfterLiftS: params.restAfterLiftS ?? null,
    restAfterRetractS: params.restAfterRetractS ?? null,
    uvPower: params.uvPower ?? null,
    liftDistanceMm: params.liftDistanceMm ?? null,
    retractSpeedMmS: params.retractSpeedMmS ?? null
  };
}

function buildProfileResponse(doc) {
  return {
    id: doc.id,
    resinId: doc.resinId,
    resinName: doc.resinName,
    printerId: doc.printerId,
    brand: doc.brand,
    model: doc.model,
    params: normalizeParams(doc.params || doc.raw || {}),
    status: doc.status || "ok",
    updatedAt: doc.updatedAt || doc.createdAt || null
  };
}

async function listParamResins() {
  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    return {
      error: { status: 503, body: { success: false, error: "Banco de dados indisponivel" } }
    };
  }

  const db = getDb();
  const collections = await db
    .listCollections({ name: "parametros" })
    .toArray();
  if (collections.length === 0) {
    return { resins: [] };
  }

  const collection = getPrintParametersCollection();
  const resins = await collection
    .aggregate([
      {
        $group: {
          _id: {
            $ifNull: ["$resinId", { $ifNull: ["$resinName", "$name"] }]
          },
          name: {
            $first: { $ifNull: ["$resinName", "$name"] }
          },
          profiles: { $sum: 1 }
        }
      },
      { $match: { name: { $ne: null } } },
      { $sort: { name: 1 } }
    ])
    .toArray();

  return { resins };
}

router.get("/params/resins", async (_req, res) => {
  try {
    const result = await listParamResins();
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }

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
    console.error("[API] Erro ao listar resinas de parâmetros:", err);
    res.status(500).json({ success: false, error: "Erro ao listar resinas" });
  }
});

router.get("/resins", async (_req, res) => {
  try {
    const result = await listParamResins();
    if (result.error) {
      return res.status(result.error.status).json(result.error.body);
    }

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

router.get("/params/printers", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const { resinId } = req.query;
    const filter = resinId ? { resinId } : {};
    const collection = getPrintParametersCollection();
    const printers = await collection
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: "$printerId",
            brand: { $first: "$brand" },
            model: { $first: "$model" },
            resinIds: { $addToSet: "$resinId" }
          }
        },
        { $sort: { brand: 1, model: 1 } }
      ])
      .toArray();

    res.json({
      success: true,
      printers: printers.map((item) => ({
        id: item._id,
        brand: item.brand,
        model: item.model,
        resinIds: item.resinIds
      })),
      matchingPrinters: resinId
        ? printers.map((item) => ({
            id: item._id,
            brand: item.brand,
            model: item.model,
            resinIds: item.resinIds
          }))
        : undefined
    });
  } catch (err) {
    console.error("[API] Erro ao listar impressoras:", err);
    res.status(500).json({ success: false, error: "Erro ao listar impressoras" });
  }
});

router.get("/params/profiles", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const { resinId, printerId, status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, MAX_PARAMS_PAGE_SIZE) : null;
    const skip = limit ? (page - 1) * limit : 0;

    const filter = {};
    if (resinId) filter.resinId = resinId;
    if (printerId) filter.printerId = printerId;
    if (status) filter.status = status;

    const collection = getPrintParametersCollection();
    const total = await collection.countDocuments(filter);
    const cursor = collection.find(filter).sort({ updatedAt: -1, createdAt: -1 });
    if (limit) cursor.skip(skip).limit(limit);
    const docs = await cursor.toArray();

    res.json({
      success: true,
      total,
      page: limit ? page : 1,
      limit: limit || null,
      profiles: docs.map(buildProfileResponse)
    });
  } catch (err) {
    console.error("[API] Erro ao listar perfis de impressão:", err);
    res.status(500).json({ success: false, error: "Erro ao listar perfis" });
  }
});

router.get("/params/stats", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const collection = getPrintParametersCollection();
    const [resinAgg, printerAgg, total] = await Promise.all([
      collection.distinct("resinId"),
      collection.distinct("printerId"),
      collection.countDocuments()
    ]);

    const comingSoon = await collection.countDocuments({ status: "coming_soon" });

    res.json({
      success: true,
      stats: {
        totalResins: resinAgg.length,
        totalPrinters: printerAgg.length,
        totalProfiles: total,
        comingSoonProfiles: comingSoon
      }
    });
  } catch (err) {
    console.error("[API] Erro ao obter estatísticas de parâmetros:", err);
    res.status(500).json({ success: false, error: "Erro ao obter estatísticas" });
  }
});
export { router as apiRoutes };
