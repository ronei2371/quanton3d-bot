import express from "express";
import OpenAI from "openai";
import { z } from "zod";
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
const OPENAI_TEMPERATURE = Number(process.env.OPENAI_TEMPERATURE ?? 0.1);
const openaiClient = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

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
  }).trim().min(1, "printer não pode ser vazio").max(160, "printer deve ter até 160 caracteres").nullish()
}).strict().transform((body) => ({
  ...body,
  userName: body.userName ?? undefined,
  userEmail: body.userEmail ?? undefined,
  userPhone: body.userPhone ?? undefined,
  resin: body.resin ?? undefined,
  printer: body.printer ?? undefined
}));

const askRequestSchema = z.object({
  body: askBodySchema,
  params: askParamsSchema
}).strict();

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

router.post("/ask", async (req, res) => {
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
    printer
  } = askValidation.data.body;

  if (!shouldInitRAG()) {
    return res.status(503).json({ success: false, error: "OPENAI_API_KEY ou MongoDB indisponível" });
  }

  try {
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) {
      return res.status(503).json({ success: false, error: "MongoDB não conectado" });
    }
    if (!openaiClient) {
      return res.status(503).json({ success: false, error: "OPENAI_API_KEY não configurada" });
    }

    const existingConversation = await Conversas.findOne({ sessionId }).sort({ createdAt: -1 });
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
    const systemPromptParts = [
      "Você é o Elios, atendente oficial da Quanton3D. Responda com cordialidade, acolhimento e precisão técnica.",
      "Politica de segurança: nunca invente parâmetros, valores comerciais ou prazos. Se o contexto não trouxer documentos, seja transparente e ofereça encaminhamento humano.",
      intelligentContext,
      personalization ? `Personalização: ${personalization}` : "",
      knowledgeContext
    ].filter(Boolean);

    const completion = await openaiClient.chat.completions.create({
      model: OPENAI_MODEL,
      temperature: OPENAI_TEMPERATURE,
      messages: [
        { role: "system", content: systemPromptParts.join("\n\n") },
        ...historyForModel,
        { role: "user", content: message }
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
      intelligenceMetrics
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
    res.status(500).json({ success: false, error: "Falha ao processar a conversa" });
  }
});

export { router as chatRoutes };
