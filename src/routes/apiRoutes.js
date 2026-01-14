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
const getCustomRequestsCollection = () => getCollection('custom_requests');

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

router.post("/custom-request", async (req, res) => {
  try {
    const {
      name,
      phone,
      email,
      desiredFeature,
      color,
      details
    } = req.body;

    if (!name || !phone || !email || !desiredFeature) {
      return res.status(400).json({
        success: false,
        error: "Nome, telefone, email e caracteristica desejada sao obrigatorios"
      });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }

    const customRequestsCollection = getCustomRequestsCollection();
    const newRequest = {
      name,
      phone,
      email,
      desiredFeature,
      color: color || null,
      details: details || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await customRequestsCollection.insertOne(newRequest);
    console.log(`[API] Pedido de formulacao customizada: ${name} (${email})`);

    res.json({
      success: true,
      message: "Pedido enviado com sucesso! Entraremos em contato em breve.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar pedido customizado:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar pedido"
    });
  }
});

router.post("/gallery", async (req, res) => {
  try {
    const {
      name,
      resin,
      printer,
      settings,
      image,
      images,
      note
    } = req.body;

    if (!resin || !printer) {
      return res.status(400).json({
        success: false,
        error: "Resina e impressora sao obrigatorias"
      });
    }

    const payloadImages = Array.isArray(images)
      ? images.filter(Boolean)
      : image
        ? [image]
        : [];

    if (payloadImages.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Envie ao menos uma imagem"
      });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }

    const galleryCollection = getGalleryCollection();
    const newEntry = {
      name: name || null,
      resin,
      printer,
      settings: settings || {},
      images: payloadImages,
      note: note || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await galleryCollection.insertOne(newEntry);
    console.log(`[API] Nova foto enviada para galeria: ${resin} / ${printer}`);

    res.json({
      success: true,
      message: "Fotos enviadas com sucesso! Em breve aparecerão na galeria.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar fotos para galeria:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar fotos"
    });
  }
});

function normalizeParams(params = {}) {
  const root = params ?? {};
  const base = root.parametros ?? {};
  const pickValue = (value, fallback = null) => {
    if (value === undefined || value === null || value === "") {
      return fallback;
    }
    return value;
  };
  const pickNested = (field) => {
    if (!field) return null;
    if (typeof field === "object") {
      return pickValue(field.value1 ?? field.value2 ?? null, null);
    }
    return pickValue(field, null);
  };
  const pickWithFallback = (key) => {
    const primary = pickNested(base[key]);
    return pickValue(primary, pickNested(root[key]));
  };

  return {

    uvOffDelayBaseS: pickWithFallback("uvOffDelayBaseS"),
    restBeforeLiftS: pickWithFallback("restBeforeLiftS"),
    restAfterLiftS: pickWithFallback("restAfterLiftS"),
    restAfterRetractS: pickWithFallback("restAfterRetractS"),
    uvPower: pickWithFallback("uvPower"),
  };
}

function buildProfileResponse(doc) {
  const resinName = doc.resinName ?? doc.resin ?? doc.name ?? "Sem nome";
  const printerLabel = doc.model ?? doc.printer ?? "";
  return {
    id: doc.id ?? doc._id?.toString?.(),
    resinId: doc.resinId ?? resinName.toLowerCase().replace(/\s+/g, "-"),
    resinName,
    printerId: doc.printerId ?? printerLabel.toLowerCase().replace(/\s+/g, "-"),
    brand: doc.brand ?? "",
    model: doc.model ?? doc.printer ?? "",
    params: normalizeParams(doc.params || doc.parametros || doc.raw || {}),
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
            $ifNull: ["$resinId", { $ifNull: ["$resinName", { $ifNull: ["$resin", "$name"] }] }]
          },
          name: {
            $first: { $ifNull: ["$resinName", { $ifNull: ["$resin", "$name"] }] }
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
    const filter = {};
    if (resinId) {
      filter.$or = [{ resinId }, { resin: resinId }, { resinName: resinId }];
    }
    const collection = getPrintParametersCollection();
    const printers = await collection
      .aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $ifNull: ["$printerId", "$printer"] },
            brand: { $first: "$brand" },
            model: { $first: { $ifNull: ["$model", "$printer"] } },
            resinIds: { $addToSet: { $ifNull: ["$resinId", "$resin"] } }
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
    if (resinId) {
      filter.$or = [{ resinId }, { resin: resinId }, { resinName: resinId }];
    }
    if (printerId) {
      filter.$and = filter.$and || [];
      filter.$and.push({ $or: [{ printerId }, { printer: printerId }, { model: printerId }] });
    }
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
