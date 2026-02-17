import express from "express";
import multer from "multer";
import { ObjectId } from "mongodb";
import {
  getSugestoesCollection,
  getVisualKnowledgeCollection,
  getConversasCollection,
  getCollection,
  getDb,
  isConnected
} from "../../db.js";
import { ensureMongoReady } from "./common.js";
import { legacyProfiles } from "../data/seedData.js";

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

// --- AJUDANTES GLOBAIS (CORRIGIDOS PARA ACEITAR ZERO) ---
const isNil = (value) => value === undefined || value === null;

const pickValue = (value, fallback = null) => (isNil(value) ? fallback : value);

const pickNested = (field) => {
  if (isNil(field)) return null;
  if (typeof field === "object") {
    // Tenta pegar value1 ou value2, se não der, retorna null
    return pickValue(field.value1 ?? field.value2 ?? null, null);
  }
  return pickValue(field, null);
};

const pickWithFallback = (base, root, key) => {
  // Procura primeiro no 'base' (parametros), depois no 'root' (legado)
  const primary = pickNested(base[key]);
  return pickValue(primary, pickNested(root[key]));
};
// -------------------------------------------------------

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const getQueryVariants = (value) => {
  const normalized = value.trim();
  if (!normalized) return [];

  const variants = new Set([normalized]);
  if (normalized.includes(" ")) {
    variants.add(normalized.replace(/ +/g, "+"));
  }
  if (normalized.includes("+")) {
    variants.add(normalized.replace(/\+/g, " "));
  }

  return Array.from(variants);
};

const buildCaseInsensitiveMatchers = (value) => {
  const variants = getQueryVariants(value);
  return variants.map((entry) => new RegExp(`^${escapeRegex(entry)}$`, "i"));
};

const buildResinFilter = (resinId) => {
  if (!resinId) return null;
  const matchers = buildCaseInsensitiveMatchers(resinId);
  if (matchers.length === 0) return null;
  return { $or: [{ resinId: { $in: matchers } }, { resin: { $in: matchers } }, { resinName: { $in: matchers } }] };
};

const buildPrinterFilter = (printerId) => {
  if (!printerId) return null;
  const matchers = buildCaseInsensitiveMatchers(printerId);
  if (matchers.length === 0) return null;
  return { $or: [{ printerId: { $in: matchers } }, { printer: { $in: matchers } }, { model: { $in: matchers } }] };
};

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
    
    const messagesCollection = getCollection("messages");
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
    const body = req.body ?? {};
    const {
      name,
      phone,
      email,
      details
    } = body;
    const desiredFeature = body.desiredFeature ?? body.caracteristica;
    const color = body.color ?? body.cor;

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

router.post("/gallery", upload.any(), async (req, res) => {
  try {
    const {
      name,
      resin,
      printer,
      settings,
      image,
      images,
      imageUrl,
      note
    } = req.body;
    const sanitizedResin = sanitizeResinName(resin);

    if (!sanitizedResin || !printer) {
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

    const imageUrlPayload = Array.isArray(imageUrl)
      ? imageUrl.filter(Boolean)
      : typeof imageUrl === "string" && imageUrl.trim()
        ? [imageUrl.trim()]
        : [];

    const multipartImages = Array.isArray(req.files)
      ? req.files
        .filter((file) => file?.buffer)
        .map((file) => {
          const mimeType = file.mimetype || "application/octet-stream";
          const base64 = file.buffer.toString("base64");
          return `data:${mimeType};base64,${base64}`;
        })
      : [];

    const finalImages = imageUrlPayload.length > 0 ? imageUrlPayload : payloadImages.length > 0 ? payloadImages : multipartImages;

    if (finalImages.length === 0) {
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

    const galleryCollection = getCollection("gallery");
    const newEntry = {
      name: name || null,
      resin: sanitizedResin,
      printer,
      settings: settings || {},
      images: finalImages,
      note: note || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await galleryCollection.insertOne(newEntry);
    console.log(`[API] Nova foto enviada para galeria: ${sanitizedResin} / ${printer}`);

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

const buildGalleryResponse = (doc) => ({
  id: doc._id?.toString?.(),
  name: doc.name ?? null,
  resin: doc.resin ?? null,
  printer: doc.printer ?? null,
  settings: doc.settings ?? {},
  images: Array.isArray(doc.images) ? doc.images : [],
  note: doc.note ?? null,
  status: doc.status ?? "pending",
  createdAt: doc.createdAt ?? null,
  updatedAt: doc.updatedAt ?? null
});

const normalizeGalleryPagination = (req) => {
  const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
  const limitRaw = parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0
    ? Math.min(limitRaw, MAX_GALLERY_PAGE_SIZE)
    : 20;
  return { page, limit, skip: (page - 1) * limit };
};

router.get("/gallery", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }

    const { page, limit, skip } = normalizeGalleryPagination(req);
    const galleryCollection = getCollection("gallery");
    const filter = { status: "approved" };
    const total = await galleryCollection.countDocuments(filter);
    const docs = await galleryCollection
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      total,
      page,
      limit,
      images: docs.map(buildGalleryResponse)
    });
  } catch (err) {
    console.error("[API] Erro ao listar galeria:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar galeria"
    });
  }
});

router.get("/gallery/all", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }

    const { page, limit, skip } = normalizeGalleryPagination(req);
    const galleryCollection = getCollection("gallery");
    const total = await galleryCollection.countDocuments({});
    const docs = await galleryCollection
      .find({})
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    res.json({
      success: true,
      total,
      page,
      limit,
      images: docs.map(buildGalleryResponse)
    });
  } catch (err) {
    console.error("[API] Erro ao listar galeria completa:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar galeria"
    });
  }
});

function normalizeParams(params = {}) {
  const root = params ?? {};
  const base = root.parametros ?? {};
  
  // AQUI ESTAVA O ERRO: REMOVEMOS AS DECLARAÇÕES DUPLICADAS.
  // AGORA USAMOS AS FUNÇÕES GLOBAIS DEFINIDAS NO TOPO DO ARQUIVO.

  // Helper local para simplificar a chamada usando as globais
  const getParam = (key) => pickWithFallback(base, root, key);
  const getBottomExposure = () => {
    const direct = getParam("bottomExposureS");
    if (!isNil(direct)) return direct;
    const baseExposure = getParam("baseExposureTimeS");
    if (!isNil(baseExposure)) return baseExposure;
    return getParam("bottomExposureTimeS");
  };

  return {
    layerHeightMm: getParam("layerHeightMm") ?? getParam("layerHeight"),
    exposureTimeS: getParam("exposureTimeS") ?? getParam("exposureTime") ?? getParam("normalExposureS"),
    bottomExposureS: getBottomExposure(),
    bottomLayers: getParam("bottomLayers") ?? getParam("baseLayers"),
    baseExposureTimeS: getBottomExposure(),
    baseLayers: getParam("bottomLayers") ?? getParam("baseLayers"),
    liftSpeedMmMin: getParam("liftSpeedMmMin") ?? getParam("liftSpeed") ?? getParam("liftSpeedMmM"),
    uvOffDelayS: getParam("uvOffDelayS"),
    uvOffDelayBaseS: getParam("uvOffDelayBaseS"),
    restBeforeLiftS: getParam("restBeforeLiftS"),
    restAfterLiftS: getParam("restAfterLiftS"),
    restAfterRetractS: getParam("restAfterRetractS"),
    uvPower: getParam("uvPower"),
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

  const collection = getCollection("parametros");
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

router.get("/docs/fispqs", (_req, res) => {
  res.json({
    success: true,
    updatedAt: new Date().toISOString(),
    documents: FISPQ_DOCUMENTS.map((doc) => ({
      ...doc,
      status: "available",
      requestEmail: "atendimento@quanton3d.com.br"
    }))
  });
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
      const resinFilter = buildResinFilter(resinId);
      if (resinFilter) {
        Object.assign(filter, resinFilter);
      }
    }
    const collection = getCollection("parametros");
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
      const resinFilter = buildResinFilter(resinId);
      if (resinFilter) {
        Object.assign(filter, resinFilter);
      }
    }
    if (printerId) {
      const printerFilter = buildPrinterFilter(printerId);
      if (printerFilter) {
        filter.$and = filter.$and || [];
        filter.$and.push(printerFilter);
      }
    }
    if (status) filter.status = status;

    const collection = getCollection("parametros");
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

    const collection = getCollection("parametros");
    const activeProfileFilter = {
      status: { $nin: ["deleted", "test"] },
      isTest: { $ne: true }
    };

    const [resinAgg, printerAgg, total] = await Promise.all([
      collection.distinct("resinId"),
      collection.distinct("printerId"),
      collection.countDocuments(activeProfileFilter)
    ]);

    const comingSoon = await collection.countDocuments({
      ...activeProfileFilter,
      status: "coming_soon"
    });

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



const buildVisualKnowledgeResponse = (doc) => ({
  id: doc._id?.toString?.() || doc.id || null,
  title: doc.title || doc.name || 'Sem título',
  description: doc.description || doc.summary || null,
  imageUrl: doc.imageUrl || doc.image || null,
  tags: Array.isArray(doc.tags) ? doc.tags : [],
  source: doc.source || 'manual',
  createdAt: doc.createdAt || null,
  updatedAt: doc.updatedAt || null
});

router.get('/visual-knowledge', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });
    }

    const { page, limit, skip } = normalizeGalleryPagination(req);
    const collection = getVisualKnowledgeCollection();
    const total = await collection.countDocuments({});
    const docs = await collection
      .find({})
      .sort({ updatedAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray();

    return res.json({
      success: true,
      total,
      page,
      limit,
      items: docs.map(buildVisualKnowledgeResponse)
    });
  } catch (err) {
    console.error('[API] Erro ao listar conhecimento visual:', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar conhecimento visual' });
  }
});

router.post('/visual-knowledge', async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });
    }

    const payload = req.body || {};
    const title = typeof payload.title === 'string' ? payload.title.trim() : '';
    const imageUrl = typeof payload.imageUrl === 'string' ? payload.imageUrl.trim() : '';

    if (!title || !imageUrl) {
      return res.status(400).json({ success: false, error: 'title e imageUrl são obrigatórios' });
    }

    const collection = getVisualKnowledgeCollection();
    const now = new Date();
    const doc = {
      title,
      description: typeof payload.description === 'string' ? payload.description.trim() : null,
      imageUrl,
      tags: Array.isArray(payload.tags) ? payload.tags.filter(Boolean) : [],
      source: typeof payload.source === 'string' && payload.source.trim() ? payload.source.trim() : 'manual',
      createdAt: now,
      updatedAt: now
    };

    const result = await collection.insertOne(doc);
    return res.status(201).json({ success: true, item: buildVisualKnowledgeResponse({ ...doc, _id: result.insertedId }) });
  } catch (err) {
    console.error('[API] Erro ao criar conhecimento visual:', err);
    return res.status(500).json({ success: false, error: 'Erro ao criar conhecimento visual' });
  }
});
const readAdminToken = (req) => (
  req.headers["x-admin-secret"] ||
  req.headers["admin-secret"] ||
  req.query?.auth ||
  req.body?.auth ||
  req.query?.token
);

const isValidAdminToken = (req) => {
  const token = readAdminToken(req);
  if (!token) return false;
  const accepted = [
    process.env.ADMIN_SECRET,
    process.env.VITE_ADMIN_API_TOKEN,
 codex/review-site-and-bot-changes-a9edeu
    process.env.ADMIN_API_TOKEN
    process.env.ADMIN_API_TOKEN,
    'quanton3d_admin_secret'
main
  ].filter(Boolean);
  return accepted.includes(token);
};

router.get('/partners', async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });
    }

    const collection = getPartnersCollection();
    if (!collection) {
      return res.json({ success: true, partners: [] });
    }

    const partners = await collection.find({}).sort({ order: 1, createdAt: -1 }).toArray();
    return res.json({ success: true, partners });
  } catch (err) {
    console.error('[API] Erro ao listar parceiros:', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar parceiros' });
  }
});

router.post('/partners', async (req, res) => {
  try {
    if (!isValidAdminToken(req)) {
      return res.status(401).json({ success: false, error: 'unauthorized' });
    }

    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });
    }

    const payload = req.body || {};
    const name = typeof payload.name === 'string' ? payload.name.trim() : '';
    if (!name) {
      return res.status(400).json({ success: false, error: 'Nome é obrigatório' });
    }

    const collection = getPartnersCollection();
    const now = new Date();
    const doc = {
      name,
      description: typeof payload.description === 'string' ? payload.description.trim() : '',
      imageUrl: payload.imageUrl || payload.image || '',
      link: payload.link || payload.url || '',
      specialty: payload.specialty || payload.category || '',
      active: payload.active !== false,
      order: Number.isFinite(Number(payload.order)) ? Number(payload.order) : 0,
      createdAt: now,
      updatedAt: now
    };

    const result = await collection.insertOne(doc);
    return res.status(201).json({ success: true, partner: { ...doc, _id: result.insertedId } });
  } catch (err) {
    console.error('[API] Erro ao criar parceiro:', err);
    return res.status(500).json({ success: false, error: 'Erro ao criar parceiro' });
  }
});

router.get('/knowledge', async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: 'Banco de dados indisponivel' });
    }

    const collection = getCollection('documents');
    if (!collection) {
      return res.json({ success: true, documents: [] });
    }

    const documents = await collection
      .find({}, { projection: { title: 1, tags: 1, source: 1, createdAt: 1 } })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    return res.json({ success: true, documents });
  } catch (err) {
    console.error('[API] Erro ao listar knowledge:', err);
    return res.status(500).json({ success: false, error: 'Erro ao listar knowledge' });
  }
});

router.get('/visual-knowledge/pending', async (_req, res) => {
  return res.json({ success: true, pending: [] });
});

router.get("/nuke-and-seed", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const collection = getCollection("parametros");
    await collection.deleteMany({});
    await collection.insertMany(legacyProfiles);

    return res.send("Database reset and seeded with CORRECT IDs");
  } catch (err) {
    console.error("[API] Erro ao resetar e semear parametros:", err);
    return res.status(500).json({ success: false, error: "Erro ao resetar banco de dados" });
  }
});
export { router as apiRoutes };
