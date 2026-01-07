import express from "express";
import OpenAI from "openai";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import {
  formatContext,
  searchKnowledge
} from "../../rag-search.js";
// ✅ CORREÇÃO: Importar a função correta do novo db.js
import {
  getConversasCollection
} from "../../db.js";
import {
  ensureMongoReady,
  shouldInitRAG
} from "./common.js";
import {
  analyzeQuestionType,
  analyzeSentiment,
  calculateIntelligenceMetrics,
  extractEntities,
  generateIntelligentContext,
  learnFromConversation,
  personalizeResponse
} from "../../ai-intelligence-system.js";

const router = express.Router();
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o";
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE ?? 0.2);
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

// Rate limiter com suporte IPv6
const askRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: {
    success: false,
    error: 'Muitas requisições. Aguarde um momento e tente novamente.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req, res) => {
    const { ipKeyGenerator } = rateLimit;
    const ip = req.ip || 
               req.headers['x-forwarded-for']?.split(',')[0].trim() ||
               req.connection?.remoteAddress ||
               'unknown';
    return ipKeyGenerator(req, res) || ip;
  },
  skip: (req) => {
    const isDev = process.env.NODE_ENV === 'development';
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1';
    return isDev && isLocalhost;
  },
  handler: (req, res) => {
    console.warn(`⚠️ [RATE-LIMIT] IP bloqueado temporariamente: ${req.ip}`);
    res.status(429).json({
      success: false,
      error: 'Muitas requisições. Aguarde 1 minuto e tente novamente.',
      retryAfter: 60
    });
  }
});

const askParamsSchema = z.object({}).strict();

const askBodySchema = z.object({
  message: z.string().trim().min(1, "message é obrigatório"),
  sessionId: z.string().trim().min(1).optional(),
  userName: z.string().trim().nullish(),
  userEmail: z.string().trim().email().nullish(),
  userPhone: z.string().trim().nullish(),
  resin: z.string().trim().nullish(),
  printer: z.string().trim().nullish(),
  image: z.string().trim().nullish(),
  imageUrl: z.string().trim().url().nullish()
}).strict().transform((body) => ({
  ...body,
  sessionId: body.sessionId || `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
  userName: body.userName ?? undefined,
  userEmail: body.userEmail ?? undefined,
  userPhone: body.userPhone ?? undefined,
  resin: body.resin ?? undefined,
  printer: body.printer ?? undefined,
  image: body.image ?? undefined,
  imageUrl: body.imageUrl ?? undefined
}));

const askRequestSchema = z.object({
  body: askBodySchema,
  params: askParamsSchema
}).strict();

const fallbackReplies = {
  ola: "Olá! Bem-vindo à Quanton3D! Como posso ajudar?",
  default: "Desculpe, não entendi. Posso ajudar com produtos, preços ou suporte técnico."
};

function buildFallbackReply(message) {
  return fallbackReplies.default;
}

function formatZodErrors(error) {
  return error.errors.map(({ path, message }) => ({
    field: path.join("."),
    message
  }));
}

function mapConversationHistory(messages = []) {
  return (messages || [])
    .filter((message) => message && message.role && message.content)
    .map(({ role, content }) => ({ role, content }));
}

function limitHistoryForModel(history, limit = 16) {
  if (!Array.isArray(history) || history.length <= limit) {
    return history || [];
  }
  return history.slice(history.length - limit);
}

const handleAsk = async (req, res) => {
  const askValidation = askRequestSchema.safeParse({ body: req.body, params: req.params });
  if (!askValidation.success) {
    return res.status(400).json({
      success: false,
      error: "Payload inválido",
      details: formatZodErrors(askValidation.error)
    });
  }

  const {
    message,
    sessionId,
    userName,
    userEmail,
    userPhone,
    resin,
    printer,
    image,
    imageUrl
  } = askValidation.data.body;

  if (!shouldInitRAG()) {
    return res.json({ success: true, reply: buildFallbackReply(message), fallback: true });
  }

  let existingConversation = null;

  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady || !openaiClient) {
      return res.json({ success: true, reply: buildFallbackReply(message), fallback: true });
    }

    // ✅ CORREÇÃO: Usar driver nativo em vez de Mongoose Model
    const conversasCol = getConversasCollection();
    existingConversation = await conversasCol.findOne({ sessionId }); // .sort() removido pois findOne retorna 1

    const historyForModel = limitHistoryForModel(
      mapConversationHistory(existingConversation?.messages || [])
    );

    const questionType = analyzeQuestionType(message);
    const entities = extractEntities(message);
    const sentiment = analyzeSentiment(message);
    const intelligentContext = await generateIntelligentContext(
      message,
      questionType,
      entities,
      historyForModel
    );

    const entitiesSummary = [
      ...(entities.resins || []),
      ...(entities.printers || []),
      ...(entities.problems || [])
    ].join(" | ");

    const searchQuery = entitiesSummary
      ? `${message}\n\nContexto adicional:\n${entitiesSummary}`
      : message;

    let relevantKnowledge = [];
    let knowledgeContext = "";
    try {
      relevantKnowledge = await searchKnowledge(searchQuery, 5);
      knowledgeContext = formatContext(relevantKnowledge);
    } catch (err) {
      console.warn("⚠️ [ASK] Falha ao buscar conhecimento:", err.message);
    }

    const personalization = personalizeResponse(userName, historyForModel, sentiment);
    const isImageAnalysis = Boolean(image || imageUrl);
    const systemPromptParts = [
      "Você é o Elios, atendente oficial da Quanton3D. Seja direto e técnico.",
      "Baseie-se apenas na base de conhecimento Quanton3D.",
      "Nunca invente parâmetros.",
      intelligentContext,
      personalization ? `Personalização: ${personalization}` : "",
      knowledgeContext
    ].filter(Boolean);

    const userContent = isImageAnalysis
      ? [
          { type: "text", text: message },
          { type: "image_url", image_url: { url: imageUrl || `data:image/jpeg;base64,${image}` } }
        ]
      : message;

    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      messages: [
        { role: "system", content: systemPromptParts.join("\n\n") },
        ...historyForModel,
        { role: "user", content: userContent }
      ]
    });

    const reply = completion?.choices?.[0]?.message?.content || "Desculpe, não consegui responder.";
    const timestamp = new Date();
    const updatedMessages = [
      ...(existingConversation?.messages || []),
      { role: "user", content: message, timestamp },
      { role: "assistant", content: reply, timestamp }
    ];

    const intelligenceMetrics = calculateIntelligenceMetrics(
      message, reply, entities, questionType, relevantKnowledge
    );

    const metadata = {
      documentsFound: relevantKnowledge.length,
      questionType: questionType.type,
      sentiment: sentiment.sentiment,
      urgency: sentiment.urgency,
      intelligenceMetrics,
      isImageAnalysis
    };

    // ✅ CORREÇÃO: Salvar usando updateOne ou insertOne (Driver Nativo)
    const updateData = {
      $set: {
        userName: userName ?? existingConversation?.userName,
        userEmail: userEmail ?? existingConversation?.userEmail,
        userPhone: userPhone ?? existingConversation?.userPhone,
        resin: resin ?? existingConversation?.resin,
        printer: printer ?? existingConversation?.printer,
        messages: updatedMessages,
        metadata: { ...(existingConversation?.metadata || {}), ...metadata },
        updatedAt: timestamp
      },
      $setOnInsert: {
        createdAt: timestamp,
        sessionId: sessionId // Garante que sessionId seja salvo na criação
      }
    };

    await conversasCol.updateOne(
      { sessionId: sessionId },
      updateData,
      { upsert: true } // Cria se não existir
    );

    try {
      await learnFromConversation(message, reply, entities, questionType);
    } catch (err) {
      console.warn("⚠️ Falha ao aprender:", err.message);
    }

    res.json({
      success: true,
      reply,
      historyLength: updatedMessages.length,
      documentsUsed: relevantKnowledge.length
    });
  } catch (err) {
    console.error("❌ [ASK] Erro ao processar:", err);
    res.json({ success: true, reply: buildFallbackReply(message), fallback: true });
  }
};

router.post("/ask", askRateLimiter, handleAsk);
router.post("/chat", askRateLimiter, handleAsk);

export { router as chatRoutes };
