import express from "express";
import OpenAI from "openai";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import {
  formatContext,
  searchKnowledge
} from "../../rag-search.js";
import {
  Conversas
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

// ✅ CORREÇÃO: Rate limiter com suporte IPv6
const askRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minuto
  max: 30, // 30 requisições por minuto por IP
  message: {
    success: false,
    error: 'Muitas requisições. Aguarde um momento e tente novamente.',
    retryAfter: 60
  },
  standardHeaders: true,
  legacyHeaders: false,
  // ✅ SOLUÇÃO: Usar helper ipKeyGenerator para IPv6
  keyGenerator: (req, res) => {
    // Importar helper do express-rate-limit
    const { ipKeyGenerator } = rateLimit;
    
    // Tentar obter IP do request
    const ip = req.ip || 
               req.headers['x-forwarded-for']?.split(',')[0].trim() ||
               req.connection?.remoteAddress ||
               'unknown';
    
    // Usar helper para normalizar IPv6
    return ipKeyGenerator(req, res) || ip;
  },
  // Permitir bypass para localhost em desenvolvimento
  skip: (req) => {
    const isDev = process.env.NODE_ENV === 'development';
    const isLocalhost = req.ip === '127.0.0.1' || req.ip === '::1';
    return isDev && isLocalhost;
  },
  // ✅ ADICIONAL: Handler de erro customizado
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
  message: z.string({
    required_error: "message é obrigatório",
    invalid_type_error: "message deve ser um texto"
  }).trim().min(1, "message é obrigatório"),
  sessionId: z.string({
    required_error: "sessionId é obrigatório",
    invalid_type_error: "sessionId deve ser um texto"
  }).trim().min(1, "sessionId é obrigatório"),
  userName: z.string({
    invalid_type_error: "userName deve ser um texto"
  }).trim().min(1, "userName não pode ser vazio").max(120, "userName deve ter até 120 caracteres").nullish(),
  userEmail: z.string({
    invalid_type_error: "userEmail deve ser um texto"
  }).trim().email("userEmail deve ser um e-mail válido").nullish(),
  userPhone: z.string({
    invalid_type_error: "userPhone deve ser um texto"
  }).trim().min(5, "userPhone deve ter ao menos 5 caracteres").max(32, "userPhone deve ter até 32 caracteres").nullish(),
  resin: z.string({
    invalid_type_error: "resin deve ser um texto"
  }).trim().min(1, "resin não pode ser vazio").max(160, "resin deve ter até 160 caracteres").nullish(),
  printer: z.string({
    invalid_type_error: "printer deve ser um texto"
  }).trim().min(1, "printer não pode ser vazio").max(160, "printer deve ter até 160 caracteres").nullish(),
  image: z.string({
    invalid_type_error: "image deve ser um texto"
  }).trim().min(1, "image não pode ser vazia").nullish(),
  imageUrl: z.string({
    invalid_type_error: "imageUrl deve ser um texto"
  }).trim().url("imageUrl deve ser uma URL válida").nullish()
}).strict().transform((body) => ({
  ...body,
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
  produtos: "Temos resinas para: Action Figures, Odontologia, Engenharia, Joalheria e Uso Geral. Qual te interessa?",
  preco: "Nossos preços variam de R$ 150 a R$ 900. Qual produto você gostaria de saber?",
  contato: "Entre em contato: (31) 3271-6935 ou WhatsApp (31) 3271-6935",
  endereco: "Av. Dom Pedro II, 5056 - Jardim Montanhês, Belo Horizonte - MG",
  horario: "Atendemos de segunda a sexta, das 9h às 18h.",
  entrega: "Fazemos entregas para todo o Brasil via Correios!",
  resina: "Trabalhamos com resinas UV de alta performance. Qual aplicação você precisa? Action figures, odontologia, engenharia ou joalheria?",
  action: "Para action figures temos: Alchemist, FlexForm, Iron, PyroBlast, Spark e Spin. Todas com ótimo acabamento!",
  odonto: "Para odontologia: Athom Dental, Alinhadores, Gengiva e Washable. Todas biocompatíveis!",
  engenharia: "Para engenharia: Iron (ultra resistente), FlexForm (flexível) e Vulcan Cast (fundição).",
  default: "Desculpe, não entendi. Posso ajudar com: produtos, preços, contato, endereço ou horário. Ou ligue: (31) 3271-6935"
};

function buildFallbackReply(message) {
  const msgLower = message.toLowerCase();
  for (const key of Object.keys(fallbackReplies)) {
    if (msgLower.includes(key)) {
      return fallbackReplies[key];
    }
  }
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

router.post("/ask", askRateLimiter, async (req, res) => {
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
    return res.json({
      success: true,
      reply: buildFallbackReply(message),
      historyLength: 1,
      documentsUsed: 0,
      fallback: true
    });
  }

  let existingConversation = null;

  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady || !openaiClient) {
      return res.json({
        success: true,
        reply: buildFallbackReply(message),
        historyLength: existingConversation?.messages?.length || 1,
        documentsUsed: 0,
        fallback: true
      });
    }

    existingConversation = await Conversas.findOne({ sessionId }).sort({ createdAt: -1 });
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
      console.warn("⚠️ [ASK] Falha ao buscar conhecimento no MongoDB:", err.message);
    }

    const personalization = personalizeResponse(userName, historyForModel, sentiment);
    const isImageAnalysis = Boolean(image || imageUrl);
    const systemPromptParts = [
      "Você é o Elios, atendente oficial da Quanton3D. Seja direto, técnico e conciso (poucas linhas).",
      "Baseie-se apenas nos 16 documentos da base de conhecimento Quanton3D; não invente dados fora desse escopo.",
      "Política de segurança: nunca invente parâmetros, valores comerciais ou prazos. Se não houver contexto suficiente, peça detalhes ou encaminhe para atendimento humano.",
      "Evite floreios. Priorize listas curtas ou frases objetivas focadas na solução técnica.",
      isImageAnalysis ? "Fluxo de visão: use a imagem apenas para diagnosticar defeitos técnicos conhecidos e referenciar soluções." : "",
      intelligentContext,
      personalization ? `Personalização: ${personalization}` : "",
      knowledgeContext
    ].filter(Boolean);

    const userContent = isImageAnalysis
      ? [
          { type: "text", text: message },
          {
            type: "image_url",
            image_url: {
              url: imageUrl || `data:image/jpeg;base64,${image}`
            }
          }
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

    const reply = completion?.choices?.[0]?.message?.content || "Desculpe, não consegui elaborar uma resposta agora.";
    const timestamp = new Date();
    const updatedMessages = [
      ...(existingConversation?.messages || []),
      { role: "user", content: message, timestamp },
      { role: "assistant", content: reply, timestamp }
    ];

    const intelligenceMetrics = calculateIntelligenceMetrics(
      message,
      reply,
      entities,
      questionType,
      relevantKnowledge
    );

    const metadata = {
      documentsFound: relevantKnowledge.length,
      questionType: questionType.type,
      sentiment: sentiment.sentiment,
      urgency: sentiment.urgency,
      intelligenceMetrics,
      isImageAnalysis,
      imageProvided: Boolean(image || imageUrl)
    };

    if (existingConversation) {
      existingConversation.messages = updatedMessages;
      existingConversation.userName = userName ?? existingConversation.userName;
      existingConversation.userEmail = userEmail ?? existingConversation.userEmail;
      existingConversation.userPhone = userPhone ?? existingConversation.userPhone;
      existingConversation.resin = resin ?? existingConversation.resin;
      existingConversation.printer = printer ?? existingConversation.printer;
      existingConversation.metadata = { ...(existingConversation.metadata || {}), ...metadata };
      existingConversation.updatedAt = timestamp;
      await existingConversation.save();
    } else {
      await Conversas.create({
        sessionId,
        userName,
        userEmail,
        userPhone,
        resin,
        printer,
        messages: updatedMessages,
        metadata,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    }

    try {
      await learnFromConversation(message, reply, entities, questionType);
    } catch (err) {
      console.warn("⚠️ [ASK] Falha ao registrar aprendizado contínuo:", err.message);
    }

    res.json({
      success: true,
      reply,
      historyLength: updatedMessages.length,
      documentsUsed: relevantKnowledge.length
    });
  } catch (err) {
    console.error("❌ [ASK] Erro ao processar conversa:", err);
    res.json({
      success: true,
      reply: buildFallbackReply(message),
      historyLength: (existingConversation?.messages?.length || 0) + 1,
      documentsUsed: 0,
      fallback: true
    });
  }
});

export { router as chatRoutes };
