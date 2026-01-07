import express from "express";
import { ObjectId } from "mongodb";
import {
  getMessagesCollection,
  getGalleryCollection,
  getSuggestionsCollection,
  getPartnersCollection,
  getPrintParametersCollection,
  getVisualKnowledgeCollection,
  getConversasCollection, // ✅ CORREÇÃO: Import correto da função
  isConnected
} from "../../db.js";
import { ensureMongoReady } from "./common.js";

const router = express.Router();
const MAX_PARAMS_PAGE_SIZE = 200;

// POST /register-user - Registrar usuario do chat
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
    
    // Atualizar ou criar conversa com dados do usuario
    if (sessionId) {
      const conversasCollection = getConversasCollection(); // ✅ CORREÇÃO: Pegar coleção
      await conversasCollection.updateOne( // ✅ CORREÇÃO: Usar updateOne em vez de findOneAndUpdate
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

// POST /contact - Enviar mensagem de contato
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

// ===== PARÂMETROS DE IMPRESSÃO (público, leitura) =====

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

router.get("/params/resins", async (_req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "Banco de dados indisponivel" });
    }

    const collection = getPrintParametersCollection();
    const resins = await collection
      .aggregate([
        {
          $group: {
            _id: "$resinId",
            name: { $first: "$resinName" },
            profiles: { $sum: 1 }
          }
        },
        { $sort: { name: 1 } }
      ])
      .toArray();

    res.json({
      success: true,
      resins: resins.map((item) => ({
        id: item._id,
        name: item.name,
        profiles: item.profiles
      }))
    });
  } catch (err) {
    console.error("[API] Erro ao listar resinas de parâmetros:", err);
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

// GET /contact - Listar mensagens de contato (admin)
router.get("/contact", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const messagesCollection = getMessagesCollection();
    const messages = await messagesCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    
    res.json({
      success: true,
      messages,
      total: messages.length
    });
  } catch (err) {
    console.error("[API] Erro ao listar mensagens:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar mensagens"
    });
  }
});

// DELETE /contact/:id - Deletar mensagem de contato
router.delete("/contact/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const messagesCollection = getMessagesCollection();
    await messagesCollection.deleteOne({ _id: new ObjectId(id) });
    
    res.json({
      success: true,
      message: "Mensagem deletada com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao deletar mensagem:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao deletar mensagem"
    });
  }
});

// POST /suggest-knowledge - Enviar sugestao de conhecimento
router.post("/suggest-knowledge", async (req, res) => {
  try {
    const { suggestion, userName, userPhone, sessionId, lastUserMessage, lastBotReply } = req.body;
    
    if (!suggestion) {
      return res.status(400).json({
        success: false,
        error: "Sugestao e obrigatoria"
      });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const suggestionsCollection = getSuggestionsCollection();
    const newSuggestion = {
      suggestion,
      userName: userName || "Usuario Anonimo",
      userPhone: userPhone || null,
      sessionId: sessionId || null,
      context: {
        lastUserMessage: lastUserMessage || null,
        lastBotReply: lastBotReply || null
      },
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await suggestionsCollection.insertOne(newSuggestion);
    console.log(`[API] Sugestao recebida de: ${userName || "Anonimo"}`);
    
    res.json({
      success: true,
      message: "Obrigado pela sugestao! Nossa equipe ira analisar.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar sugestao:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar sugestao"
    });
  }
});

// POST /custom-request - Enviar solicitacao personalizada
router.post("/custom-request", async (req, res) => {
  try {
    const { name, email, phone, resin, printer, description, urgency } = req.body;
    
    if (!name || !email) {
      return res.status(400).json({
        success: false,
        error: "Nome e email sao obrigatorios"
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
    const newRequest = {
      type: "custom_request",
      name,
      email,
      phone: phone || null,
      resin: resin || null,
      printer: printer || null,
      description: description || null,
      urgency: urgency || "normal",
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await messagesCollection.insertOne(newRequest);
    console.log(`[API] Solicitacao personalizada de: ${name} (${email})`);
    
    res.json({
      success: true,
      message: "Solicitacao enviada com sucesso! Entraremos em contato em breve.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar solicitacao:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar solicitacao"
    });
  }
});

// GET /gallery - Listar galeria publica
router.get("/gallery", async (req, res) => {
  try {
    const { page = 1, limit = 12, category } = req.query;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const galleryCollection = getGalleryCollection();
    const query = { status: "approved" };
    if (category) {
      query.category = category;
    }
    
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const items = await galleryCollection
      .find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .toArray();
    
    const total = await galleryCollection.countDocuments(query);
    
    res.json({
      success: true,
      items,
      total,
      page: parseInt(page),
      totalPages: Math.ceil(total / parseInt(limit))
    });
  } catch (err) {
    console.error("[API] Erro ao listar galeria:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar galeria"
    });
  }
});

// POST /gallery - Enviar item para galeria
router.post("/gallery", async (req, res) => {
  try {
    const { name, email, title, description, imageUrl, category, resin, printer } = req.body;
    
    if (!name || !email || !imageUrl) {
      return res.status(400).json({
        success: false,
        error: "Nome, email e imagem sao obrigatorios"
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
    const newItem = {
      name,
      email,
      title: title || "Sem titulo",
      description: description || null,
      imageUrl,
      category: category || "geral",
      resin: resin || null,
      printer: printer || null,
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await galleryCollection.insertOne(newItem);
    console.log(`[API] Item de galeria enviado por: ${name} (${email})`);
    
    res.json({
      success: true,
      message: "Imagem enviada para aprovacao! Obrigado por compartilhar.",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao enviar item de galeria:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao enviar imagem"
    });
  }
});

// GET /gallery/all - Listar toda galeria (admin)
router.get("/gallery/all", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const galleryCollection = getGalleryCollection();
    const items = await galleryCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    
    res.json({
      success: true,
      items,
      total: items.length
    });
  } catch (err) {
    console.error("[API] Erro ao listar galeria (admin):", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar galeria"
    });
  }
});

// PUT /gallery/:id/approve - Aprovar item da galeria
router.put("/gallery/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const galleryCollection = getGalleryCollection();
    await galleryCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved", updatedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: "Item aprovado com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao aprovar item:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao aprovar item"
    });
  }
});

// PUT /gallery/:id/reject - Rejeitar item da galeria
router.put("/gallery/:id/reject", async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const galleryCollection = getGalleryCollection();
    await galleryCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "rejected", rejectReason: reason || null, updatedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: "Item rejeitado"
    });
  } catch (err) {
    console.error("[API] Erro ao rejeitar item:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao rejeitar item"
    });
  }
});

// PUT /gallery/:id - Atualizar item da galeria
router.put("/gallery/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const galleryCollection = getGalleryCollection();
    await galleryCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: "Item atualizado com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao atualizar item:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao atualizar item"
    });
  }
});

// GET /knowledge - Listar conhecimento (admin)
router.get("/knowledge", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const { getDocumentsCollection } = await import("../../db.js");
    const documentsCollection = getDocumentsCollection();
    const documents = await documentsCollection
      .find({})
      .project({ embedding: 0 })
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();
    
    res.json({
      success: true,
      documents,
      total: documents.length
    });
  } catch (err) {
    console.error("[API] Erro ao listar conhecimento:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar conhecimento"
    });
  }
});

// DELETE /knowledge/:id - Deletar documento de conhecimento
router.delete("/knowledge/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const { getDocumentsCollection } = await import("../../db.js");
    const documentsCollection = getDocumentsCollection();
    await documentsCollection.deleteOne({ _id: new ObjectId(id) });
    
    res.json({
      success: true,
      message: "Documento deletado com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao deletar documento:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao deletar documento"
    });
  }
});

// PUT /knowledge/:id - Atualizar documento de conhecimento
router.put("/knowledge/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, tags } = req.body;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const { getDocumentsCollection } = await import("../../db.js");
    const documentsCollection = getDocumentsCollection();
    
    const updates = { updatedAt: new Date() };
    if (title) updates.title = title;
    if (content) updates.content = content;
    if (tags) updates.tags = tags;
    
    await documentsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updates }
    );
    
    res.json({
      success: true,
      message: "Documento atualizado com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao atualizar documento:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao atualizar documento"
    });
  }
});

// GET /visual-knowledge - Listar conhecimento visual
router.get("/visual-knowledge", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const visualCollection = getVisualKnowledgeCollection();
    const items = await visualCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();
    
    res.json({
      success: true,
      items,
      total: items.length
    });
  } catch (err) {
    console.error("[API] Erro ao listar conhecimento visual:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar conhecimento visual"
    });
  }
});

// GET /visual-knowledge/pending - Listar conhecimento visual pendente
router.get("/visual-knowledge/pending", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const visualCollection = getVisualKnowledgeCollection();
    const items = await visualCollection
      .find({ status: "pending" })
      .sort({ createdAt: -1 })
      .toArray();
    
    res.json({
      success: true,
      items,
      total: items.length
    });
  } catch (err) {
    console.error("[API] Erro ao listar conhecimento visual pendente:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar conhecimento visual pendente"
    });
  }
});

// POST /visual-knowledge - Adicionar conhecimento visual
router.post("/visual-knowledge", async (req, res) => {
  try {
    const { imageUrl, title, description, diagnosis, solution, category } = req.body;
    
    if (!imageUrl || !title) {
      return res.status(400).json({
        success: false,
        error: "URL da imagem e titulo sao obrigatorios"
      });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const visualCollection = getVisualKnowledgeCollection();
    const newItem = {
      imageUrl,
      title,
      description: description || null,
      diagnosis: diagnosis || null,
      solution: solution || null,
      category: category || "geral",
      status: "approved",
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await visualCollection.insertOne(newItem);
    
    res.json({
      success: true,
      message: "Conhecimento visual adicionado com sucesso",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao adicionar conhecimento visual:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao adicionar conhecimento visual"
    });
  }
});

// PUT /visual-knowledge/:id/approve - Aprovar conhecimento visual
router.put("/visual-knowledge/:id/approve", async (req, res) => {
  try {
    const { id } = req.params;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const visualCollection = getVisualKnowledgeCollection();
    await visualCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "approved", updatedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: "Conhecimento visual aprovado"
    });
  } catch (err) {
    console.error("[API] Erro ao aprovar conhecimento visual:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao aprovar conhecimento visual"
    });
  }
});

// PUT /visual-knowledge/:id - Atualizar conhecimento visual
router.put("/visual-knowledge/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const visualCollection = getVisualKnowledgeCollection();
    await visualCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: "Conhecimento visual atualizado"
    });
  } catch (err) {
    console.error("[API] Erro ao atualizar conhecimento visual:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao atualizar conhecimento visual"
    });
  }
});

// DELETE /visual-knowledge/:id - Deletar conhecimento visual
router.delete("/visual-knowledge/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const visualCollection = getVisualKnowledgeCollection();
    await visualCollection.deleteOne({ _id: new ObjectId(id) });
    
    res.json({
      success: true,
      message: "Conhecimento visual deletado"
    });
  } catch (err) {
    console.error("[API] Erro ao deletar conhecimento visual:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao deletar conhecimento visual"
    });
  }
});

// GET /partners - Listar parceiros
router.get("/partners", async (req, res) => {
  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const partnersCollection = getPartnersCollection();
    const partners = await partnersCollection
      .find({ active: { $ne: false } })
      .sort({ order: 1, createdAt: -1 })
      .toArray();
    
    res.json({
      success: true,
      partners,
      total: partners.length
    });
  } catch (err) {
    console.error("[API] Erro ao listar parceiros:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao listar parceiros"
    });
  }
});

// POST /partners - Adicionar parceiro
router.post("/partners", async (req, res) => {
  try {
    const { name, logo, website, description, category } = req.body;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: "Nome do parceiro e obrigatorio"
      });
    }
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const partnersCollection = getPartnersCollection();
    const newPartner = {
      name,
      logo: logo || null,
      website: website || null,
      description: description || null,
      category: category || "geral",
      active: true,
      order: 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    const result = await partnersCollection.insertOne(newPartner);
    
    res.json({
      success: true,
      message: "Parceiro adicionado com sucesso",
      id: result.insertedId
    });
  } catch (err) {
    console.error("[API] Erro ao adicionar parceiro:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao adicionar parceiro"
    });
  }
});

// PUT /partners/:id - Atualizar parceiro
router.put("/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const partnersCollection = getPartnersCollection();
    await partnersCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { ...updates, updatedAt: new Date() } }
    );
    
    res.json({
      success: true,
      message: "Parceiro atualizado com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao atualizar parceiro:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao atualizar parceiro"
    });
  }
});

// DELETE /partners/:id - Deletar parceiro
router.delete("/partners/:id", async (req, res) => {
  try {
    const { id } = req.params;
    
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({
        success: false,
        error: "Banco de dados indisponivel"
      });
    }
    
    const partnersCollection = getPartnersCollection();
    await partnersCollection.deleteOne({ _id: new ObjectId(id) });
    
    res.json({
      success: true,
      message: "Parceiro deletado com sucesso"
    });
  } catch (err) {
    console.error("[API] Erro ao deletar parceiro:", err);
    res.status(500).json({
      success: false,
      error: "Erro ao deletar parceiro"
    });
  }
});

// POST /partners/upload-image - Upload de imagem de parceiro (placeholder)
router.post("/partners/upload-image", async (req, res) => {
  res.json({
    success: true,
    message: "Upload de imagem nao implementado. Use URL externa.",
    url: null
  });
});

export { router as apiRoutes };
