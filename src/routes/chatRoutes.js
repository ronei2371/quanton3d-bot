import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { searchKnowledge, formatContext } from '../../rag-search.js';
import { ensureMongoReady } from './common.js';
import { getConversasCollection } from '../../db.js';
import { metrics } from '../utils/metrics.js';

const router = express.Router();

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const IMAGE_ANALYSIS_MODEL = 'gpt-4o';

let openaiClient = null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) {
      return cb(null, true);
    }
    const error = new Error('Apenas imagens são permitidas.');
    error.status = 400;
    error.code = 'LIMIT_FILE_TYPE';
    return cb(error);
  }
});

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY não configurada');
  }
  if (!openaiClient) {
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
}

// Rota de teste
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Chat route working' });
});

function hasImagePayload(body = {}) {
  return Boolean(
    body.imageUrl || body.image || body.imageBase64 || body.imageData ||
    body.attachment || body.selectedImage || body.imageFile
  );
}

function resolveImagePayload(body = {}) {
  if (body.imageUrl) {
    if (typeof body.imageUrl === 'string' && body.imageUrl.startsWith('blob:')) return null;
    return { type: 'url', value: body.imageUrl };
  }
  const raw = body.image || body.imageBase64 || body.imageData || body.attachment || body.selectedImage || body.imageFile;
  if (!raw) return null;

  if (typeof raw === 'string') {
    return raw.startsWith('data:') ? { type: 'data', value: raw } : { type: 'data', value: `data:image/jpeg;base64,${raw}` };
  }
  if (typeof raw === 'object') {
    if (typeof raw.dataUrl === 'string' && raw.dataUrl.startsWith('data:')) return { type: 'data', value: raw.dataUrl };
    const url = raw.url || raw.imageUrl || raw.preview || raw.src;
    if (typeof url === 'string' && url.length > 0 && !url.startsWith('blob:')) return { type: 'url', value: url };
    const base64 = raw.base64 || raw.data || raw.imageBase64 || raw.dataUrl;
    if (typeof base64 === 'string' && base64.length > 0) {
      const mimeType = raw.mimeType || raw.type || raw.contentType || 'image/jpeg';
      return { type: 'data', value: `data:${mimeType};base64,${base64}` };
    }
  }
  return null;
}

async function buildRagContext({ message, hasImage }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const ragQuery = trimmedMessage || (hasImage ? 'diagnostico visual impressao 3d resina defeitos comuns' : '');
  let ragResults = [];
  if (ragQuery) {
    try {
      ragResults = await searchKnowledge(ragQuery);
    } catch (error) {
      console.warn('[CHAT] RAG indisponível (seguindo sem contexto):', error.message);
    }
  }
  const ragContext = formatContext(ragResults);
  const hasRelevantContext = ragResults.length > 0;
  const adhesionIssueHint = /dificil|difícil|duro|presa|grudada|grudado/i.test(trimmedMessage) && /mesa|plate|plataforma|base/i.test(trimmedMessage)
    ? 'Nota de triagem: cliente relata peça muito presa na plataforma; evite sugerir AUMENTAR exposição base sem dados. Considere sobre-adesão e peça parâmetros antes de recomendar ajustes.'
    : null;
  return { ragResults, ragContext, trimmedMessage, hasRelevantContext, adhesionIssueHint };
}

function sanitizeChatText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\u0000/g, '').trim();
}

function stripVisionPolicyDisclaimers(text = '') {
  if (!text) return '';
  let cleaned = text;
  cleaned = cleaned.replace(/n[ãa]o posso identificar pessoas[^.]*\.\s*/i, '');
  cleaned = cleaned.replace(/can(?:not|\'t) identify people[^.]*\.\s*/i, '');
  const trimmed = cleaned.trim();
  return trimmed.length ? trimmed : text.trim();
}

function normalizeForMatch(text = '') {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

function extractResinFromMessage(message = '') {
  const resinMatch = message.match(/resina\s+([^\n,.;]+)/i);
  if (resinMatch?.[1]) return resinMatch[1].replace(/\b(na|no|para|com)\b.*$/i, '').trim();
  const configMatch = message.match(/(?:configura|parametr)[^.\n]*\b(?:da|do|de)\s+(.+?)\s+\b(?:para|na|no)\b/i);
  if (configMatch?.[1]) return configMatch[1].trim();
  return null;
}

function extractPrinterFromMessage(message = '') {
  const safeMessage = typeof message === 'string' ? message : '';
  const match = safeMessage.match(/(?:impressora|printer)\s+([^\n,.;]+)/i);
  if (match?.[1]) return match[1].replace(/\b(com|na|no|para)\b.*$/i, '').trim();
  return null;
}

function isParameterQuestion(message = '') {
  return /configura|parametro|exposi[cç][aã]o|tempo de exposi|camada base|base layer|altura de camada/i.test(message);
}
function isDiagnosticQuestion(message = '') {
  return /descolamento|delamina|warping|falha|erro|problema|nao cura|não cura|peeling|suporte/i.test(message);
}
function hasExposureInfo(message = '') {
  return /exposi[cç][aã]o|\b\d+([.,]\d+)?\s*s\b|\bsegundos?\b/i.test(message);
}
function mentionsRigidSupports(message = '') {
  if (!message) return false;
  return /suporte[s]?/i.test(message) && /(duro|rigid|quebradi[cç]o|muito firme|dif[ií]cil de remover)/i.test(message);
}
function mentionsDelayedCracking(message = '') {
  if (!message) return false;
  return /(racha|fissura|trinca|quebra)/i.test(message) && /(depois|ap[oó]s|dias|passados)/i.test(message);
}

function buildParameterBlockReply({ resinName, printerName }) {
  const resinLabel = resinName ? `resina ${resinName}` : 'resina';
  const printerLabel = printerName ? `impressora ${printerName}` : 'impressora';
  return `Não encontrei parâmetros confirmados para ${resinLabel} na ${printerLabel}. Por favor, confirme o modelo exato da impressora e a resina para eu verificar a tabela oficial ou acione o suporte técnico.`;
}

function buildSupportBrittleReply({ resinName, printerName }) {
  const resinInfo = resinName ? `na ${resinName}` : 'na sua resina atual';
  const printerInfo = printerName ? `na ${printerName}` : 'na sua impressora';
  return [
    `Suportes extremamente rígidos e peças rachando após alguns dias indicam excesso de energia e pós-cura agressiva ${resinInfo} ${printerInfo}.`,
    '1. **Parâmetros de impressão**: reduza a exposição normal em 5‑10% e ative “rest before lift” de 0,5‑1 s. Nas camadas base mantenha 6‑8 camadas com 18‑22 s em vez de exposições longas que cristalizam a resina.',
    '2. **Estrutura de suportes**: use suportes light/medium e distribua os topos. Ajuste o diâmetro para 0,25‑0,30 mm e inclua drenagem para aliviar tensões.',
    '3. **Pós-cura**: lave, seque e faça ciclos curtos de 3 s de UV + 30 s de descanso, repetindo 3‑4 vezes. Pós-curas contínuas longas deixam a peça vítrea e quebradiça.',
    '4. **Estocagem**: deixe as peças descansarem 12‑24 h em local ventilado antes de exposição ao sol/calor para liberar solventes e evitar fissuras tardias.'
  ].join('\n\n');
}

function isVisionRefusal(text = '') {
  if (!text) return false;
  return /can\'t help|cannot help|unable to assist|images of people|policy/i.test(text);
}

async function runVisionCompletion({ systemPrompt, prompt, imageUrl, temperature = 0.4 }) {
  const client = getOpenAIClient();
  return client.chat.completions.create({
    model: IMAGE_ANALYSIS_MODEL,
    temperature,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] }
    ]
  });
}

function trimConversationHistory(history, systemPrompt, userMessage) {
  const maxMessages = 8;
  const safeHistory = Array.isArray(history) ? history : [];
  return safeHistory.slice(-maxMessages).filter((entry) => entry && entry.role && entry.content);
}

function attachMultipartImage(req, _res, next) {
  const files = req.files || {};
  const imageFile = files.image?.[0] || files.file?.[0] || files.attachment?.[0];
  if (!imageFile || !imageFile.buffer) return next();
  req.body = req.body || {};
  const base64 = imageFile.buffer.toString('base64');
  const mimeType = imageFile.mimetype || 'image/jpeg';
  req.body.imageData = `data:${mimeType};base64,${base64}`;
  return next();
}

async function loadCustomerContext(sessionId) {
  if (!sessionId) return {};
  const mongoReady = await ensureMongoReady();
  if (!mongoReady) return {};
  const collection = getConversasCollection();
  if (!collection) return {};
  const record = await collection.findOne({ sessionId });
  if (!record) return {};
  return {
    userName: record.userName ?? record.name ?? null,
    resin: record.resin ?? record.resinUsed ?? null,
    printer: record.printer ?? record.printerModel ?? null,
    problemType: record.problemType ?? record.problem ?? null
  };
}

function mergeCustomerContext(base, override) {
  const sanitizedOverride = Object.fromEntries(Object.entries(override || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''));
  return { ...base, ...sanitizedOverride };
}

function inferContextFromHistory(history, message) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) return {};
  const safeHistory = Array.isArray(history) ? history : [];
  const lastAssistant = [...safeHistory].reverse().find((entry) => entry?.role === 'assistant');
  const lastAssistantText = typeof lastAssistant?.content === 'string' ? lastAssistant.content.toLowerCase() : '';
  if (!lastAssistantText) return {};
  if (/modelo da sua impressora|qual é o modelo da sua impressora|modelo da impressora/.test(lastAssistantText)) return { printer: trimmedMessage };
  if (/tipo de resina|qual resina|qual a resina|qual resina você/.test(lastAssistantText)) return { resin: trimmedMessage };
  if (/qual o seu problema|qual o problema|que problema/.test(lastAssistantText)) return { problemType: trimmedMessage };
  return {};
}

// =================================================================================
// CÉREBRO TEXTUAL (REGRAS DO RONEI AQUI)
// =================================================================================
async function generateResponse({ message, ragContext, hasRelevantContext, adhesionIssueHint, hasImage, imageUrl, conversationHistory, customerContext, ragResultsCount = 0 }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const resinFromMessage = extractResinFromMessage(trimmedMessage);
  const printerFromMessage = extractPrinterFromMessage(trimmedMessage);
  const knownResin = customerContext?.resin || resinFromMessage;
  const knownPrinter = customerContext?.printer || printerFromMessage;

  if (isParameterQuestion(trimmedMessage)) {
    const normalizedContext = normalizeForMatch(ragContext || '');
    const resinOk = knownResin ? normalizedContext.includes(normalizeForMatch(knownResin)) : false;
    const printerOk = knownPrinter ? normalizedContext.includes(normalizeForMatch(knownPrinter)) : false;
    if (!hasRelevantContext || (knownResin && !resinOk) || (knownPrinter && !printerOk)) {
      return { reply: buildParameterBlockReply({ resinName: knownResin, printerName: knownPrinter }), documentsUsed: 0 };
    }
  }

  if (isDiagnosticQuestion(trimmedMessage)) {
    if (!knownPrinter) return { reply: 'Qual é o modelo exato da sua impressora?', documentsUsed: 0 };
    if (!knownResin) return { reply: 'Qual é a resina que você está usando?', documentsUsed: 0 };
    if (!hasExposureInfo(trimmedMessage) && !hasExposureInfo((ragContext || '').toString())) return { reply: 'Qual é o tempo de exposição normal e de base que você está usando?', documentsUsed: 0 };
  }

  if (mentionsRigidSupports(trimmedMessage) || mentionsDelayedCracking(trimmedMessage)) {
    return { reply: buildSupportBrittleReply({ resinName: knownResin, printerName: knownPrinter }), documentsUsed: ragResultsCount };
  }

  const visionPriority = hasImage ? '\n    11. Se IMAGEM=SIM, priorize a evidência visual. Não deixe histórico anterior de texto sobrepor o que está claramente visível na nova imagem.\n  ' : '';
  const imageGuidelines = hasImage ? `
    DIRETRIZES PARA ANALISE VISUAL:
    - Descreva o que voce ve antes de concluir causas.
    - Se a imagem estiver clara e houver sinais evidentes, entregue: Defeitos -> Causa provavel -> Solucao imediata -> Parametros sugeridos.
  ` : '';

  const systemPrompt = `
    PERSONA: Você é Ronei Fonseca, especialista prático e dono da Quanton3D.

    REGRAS DE OURO (LEI ABSOLUTA):
    1. **NADA DE FONTES:** O cliente quer um especialista. É PROIBIDO escrever "(Fonte: Documento 1)".
    2. **RESINA SPARK (AMARELAMENTO):** - JAMAIS sugira curas longas.
       - REGRA: Curas rápidas de 3 segundos, espere esfriar, repita 3 vezes.
       - DICA MASTER: Colocar na água gera refração e evita UV direto. NUNCA sugira 3-5 minutos.
    3. **PEÇAS OCAS/VAZAMENTO:** - O vazamento é resina presa dentro.
       - SOLUÇÃO: Furos de drenagem + Lavagem interna com SERINGA de pressão.
       - PROIBIDO: "Escova macia" (não limpa dentro) e "Cura de 20 min" (quebra a peça). Cura máx 5-7 min.
    4. **PYROBLAST / RESINAS INDUSTRIAIS:**
       - NUNCA mande colocar peça em forno ou água a 60°C. O padrão é cura UV.
    5. **DIAGNÓSTICO:**
       - Se soltou da mesa: É NIVELAMENTO ou EXPOSIÇÃO BASE. Não fale de suportes se a falha for na base.
       - **TOM DE VOZ:** Direto, técnico e seguro.

    ${visionPriority}
    ${imageGuidelines}
  `;

  const contextLines = [];
  if (customerContext?.userName) contextLines.push(`Nome do cliente: ${customerContext.userName}`);
  if (customerContext?.resin) contextLines.push(`Resina: ${customerContext.resin}`);
  if (customerContext?.printer) contextLines.push(`Impressora: ${customerContext.printer}`);
  if (customerContext?.problemType) contextLines.push(`Problema relatado: ${customerContext.problemType}`);
  const contextFlag = hasRelevantContext || contextLines.length ? 'SIM' : 'NAO';

  const prompt = [
    ragContext ? `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}` : null,
    contextLines.length ? contextLines.join('\n') : null,
    adhesionIssueHint,
    `CONTEXTO_RELEVANTE=${contextFlag}`,
    '---',
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : null
  ].filter(Boolean).join('\n\n');

  const client = getOpenAIClient();
  const userContent = imageUrl ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] : prompt;
  const model = imageUrl ? IMAGE_ANALYSIS_MODEL : DEFAULT_CHAT_MODEL;
  const userMessage = { role: 'user', content: userContent };
  const trimmedHistory = trimConversationHistory(Array.isArray(conversationHistory) ? conversationHistory : [], systemPrompt, userMessage);

  const completion = await client.chat.completions.create({
    model, temperature: 0.3, max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...trimmedHistory, userMessage]
  });

  const rawReply = completion?.choices?.[0]?.message?.content?.trim();
  const reply = rawReply ? stripVisionPolicyDisclaimers(rawReply) : null;
  return { reply: reply || 'Estou analisando sua solicitação, mas tive um breve soluço. Poderia repetir?', documentsUsed: 0 };
}

// =================================================================================
// CÉREBRO VISUAL (REGRAS DO RONEI + BIBLIOTECA DE IMAGENS)
// =================================================================================
async function generateImageResponse({ message, imageUrl }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const client = getOpenAIClient();
  const userText = trimmedMessage
    ? `Analise esta imagem de impressão 3D e me diga qual é a falha e como corrigir. Mensagem do cliente: ${trimmedMessage}`
    : 'Analise esta imagem de impressão 3D e me diga qual é a falha e como corrigir.';

  const response = await client.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'Você é um especialista sênior em resinas SLA da Quanton3D e análise de falhas de impressão 3D.'
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: userText },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ]
  });

  const reply = response?.choices?.[0]?.message?.content?.trim();
  return { reply: reply || 'Não consegui analisar a imagem agora. Pode tentar novamente?', documentsUsed: 0 };
}

async function handleChatRequest(req, res) {
  const requestStart = Date.now();
  metrics.incrementRequests();
  try {
    const { message, sessionId } = req.body ?? {};
    const hasImage = hasImagePayload(req.body);
    const imagePayload = resolveImagePayload(req.body);
    const imageUrl = imagePayload?.value || null;

    if (hasImage && !imageUrl) {
      return res.status(400).json({
        error: 'Imagem inválida para análise. Envie data URL/base64, URL pública ou multipart em /api/ask-with-image.'
      });
    }
    const conversationHistory = req.body?.conversationHistory || [];
    const customerContext = req.body?.customerContext || {};
    const storedContext = await loadCustomerContext(sessionId);
    const inferredContext = inferContextFromHistory(conversationHistory, message);
    const mergedCustomerContext = mergeCustomerContext(mergeCustomerContext(storedContext, inferredContext), customerContext);

    const { ragResults, ragContext, trimmedMessage, hasRelevantContext, adhesionIssueHint } = await buildRagContext({ message, hasImage });
    const ragSearchPerformed = Boolean((trimmedMessage && trimmedMessage.length) || hasImage);
    if (ragSearchPerformed) {
      metrics.recordRAGSearch(ragResults.length);
    }

    console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);

    if (!trimmedMessage && !hasImage) return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId: sessionId || 'new' });

    const response = imageUrl
      ? await generateImageResponse({ message: trimmedMessage, imageUrl, ragContext })
      : await generateResponse({
          message: trimmedMessage,
          ragContext,
          hasRelevantContext,
          adhesionIssueHint,
          hasImage,
          imageUrl,
          conversationHistory,
          customerContext: mergedCustomerContext,
          ragResultsCount: ragResults.length
        });

    res.json({ reply: sanitizeChatText(response.reply), sessionId: sessionId || 'session-auto', documentsUsed: ragResults.length || response.documentsUsed });
    metrics.recordResponseTime(Date.now() - requestStart);
  } catch (error) {
    console.error('Erro Chat:', error);
    metrics.incrementErrors();
    metrics.recordResponseTime(Date.now() - requestStart);
    res.status(500).json({ error: 'Erro no processamento da IA.' });
  }
}

router.post('/ask', handleChatRequest);
router.post('/chat', handleChatRequest);
router.post('/ask-with-image', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]), attachMultipartImage, handleChatRequest);
router.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_TYPE') return res.status(400).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Erro no upload.' });
  return next(err);
});

export default router;
