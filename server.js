import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { searchKnowledge, formatContext, searchVisualKnowledge } from '../rag-search.js';
import { ensureMongoReady } from './common.js';
import { getConversasCollection, getVisualKnowledgeCollection } from '../db.js';
import { metrics } from '../utils/metrics.js';

const router = express.Router();

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const IMAGE_MODEL = process.env.OPENAI_MODEL || 'gpt-4o';

let openaiClient = null;
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype?.startsWith('image/')) return cb(null, true);
    const error = new Error('Apenas imagens são permitidas.');
    error.status = 400;
    error.code = 'LIMIT_FILE_TYPE';
    return cb(error);
  }
});

function getOpenAIClient() {
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY não configurada');
  if (!openaiClient) openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

router.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Chat route working' });
});

function hasImagePayload(body = {}) {
  return Boolean(body.imageUrl || body.image || body.imageBase64 || body.imageData || body.attachment || body.selectedImage || body.imageFile);
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

// ====================================================================
// BUG 1 CORRIGIDO — formatContext recebia resultado não-array do RAG
// ====================================================================
async function buildRagContext({ message, hasImage, visualDescription = null }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const ragQuery = visualDescription || trimmedMessage || (hasImage ? 'diagnostico visual impressao 3d resina defeitos comuns' : '');

  let ragResults = [];
  if (ragQuery) {
    try {
      const results = await searchKnowledge(ragQuery);
      // CORREÇÃO: garante que ragResults sempre é array
      ragResults = Array.isArray(results) ? results : [];
    } catch (error) {
      console.warn('[CHAT] RAG indisponível (seguindo sem contexto):', error.message);
      ragResults = [];
    }
  }

  const ragContext = formatContext(ragResults);
  const hasRelevantContext = ragResults.length > 0;
  const adhesionIssueHint = /dificil|difícil|duro|presa|grudada|grudado/i.test(trimmedMessage) && /mesa|plate|plataforma|base/i.test(trimmedMessage)
    ? 'Nota de triagem: cliente relata peça muito presa na plataforma; evite sugerir AUMENTAR exposição base sem dados.'
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
  cleaned = cleaned.replace(/can(?:not|'t) identify people[^.]*\.\s*/i, '');
  const trimmed = cleaned.trim();
  return trimmed.length ? trimmed : text.trim();
}

function normalizeForMatch(text = '') {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function fetchVisualKnowledgeHints({ message = '', customerContext = {}, hasImage = false, limit = 3, visualDescription = null }) {
  try {
    if (!hasImage && (!message || message.length < 10)) return [];
    const mongoReady = await ensureMongoReady();
    if (!mongoReady) return [];
    const results = await searchVisualKnowledge(null, visualDescription || message);
    return (Array.isArray(results) ? results : []).slice(0, limit).map(r => ({
      defectType: r.problema,
      diagnosis: r.descricao,
      solution: r.acoes,
      causes: r.causas
    }));
  } catch (error) {
    console.warn('[CHAT] Falha ao obter conhecimento visual:', error.message);
    return [];
  }
}

function sanitizeSnippet(value, limit = 420) {
  if (!value || typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (!cleaned) return null;
  return cleaned.length > limit ? `${cleaned.slice(0, limit).trim()}…` : cleaned;
}

function buildVisualContextSection(entries = []) {
  if (!Array.isArray(entries) || !entries.length) return '';
  const lines = ['GALERIA QUANTON3D (casos visuais reais aprovados):'];
  entries.forEach((entry, index) => {
    const defect = sanitizeSnippet(entry?.defectType || entry?.title);
    const diagnosis = sanitizeSnippet(entry?.diagnosis || entry?.description);
    const solution = sanitizeSnippet(entry?.solution || entry?.solucao);
    const causes = sanitizeSnippet(entry?.causes);
    const block = [`Caso ${index + 1}:`, defect ? `Defeito: ${defect}` : null, diagnosis ? `Diagnóstico: ${diagnosis}` : null, causes ? `Causas: ${causes}` : null, solution ? `Solução aplicada: ${solution}` : null].filter(Boolean).join('\n');
    if (block) lines.push(block);
  });
  lines.push('Use esses casos aprovados como referência prática quando fizer diagnósticos.');
  return lines.join('\n\n');
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
  return /(racha|fissura|trinca|quebra)/i.test(message) && /(depois|ap[oó]s|dias|passados|alguns dias)/i.test(message);
}
function mentionsBaseAdhesion(message = '') {
  if (!message) return false;
  return /(presa|grudada|colada|dif[íi]cil de tirar|n[ãa]o solta|dura de tirar|muito preso)/i.test(message) && /(base|plataforma|mesa|plate)/i.test(message);
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
    '1. **Parâmetros de impressão**: reduza a exposição normal em 5‑10% e ative "rest before lift" de 0,5‑1 s.',
    '2. **Estrutura de suportes**: use suportes light/medium, diâmetro 0,25‑0,30 mm e inclua drenagem.',
    '3. **Pós-cura**: ciclos curtos de 3 s de UV + 30 s de descanso, repetindo 3‑4 vezes.',
    '4. **Estocagem**: deixe as peças descansarem 12‑24 h em local ventilado antes de exposição ao sol/calor.'
  ].join('\n\n');
}

function buildAdhesionReply({ resinName, printerName }) {
  const resinInfo = resinName ? ` com a resina ${resinName}` : '';
  const printerInfo = printerName ? ` na ${printerName}` : '';
  return [
    `Sua peça ficou soldada à plataforma${resinInfo}${printerInfo}. Ajuste o processo:`,
    '1. **Nivelamento e superfície**: refaça o nivelamento com folha nova e base levemente fosca (lixa 400).',
    '2. **Exposição das camadas base**: reduza 10‑15% do tempo atual, mantenha 4‑6 camadas base.',
    '3. **Lift e peel**: aumente lift height para 8‑10 mm e use rest before lift de 0,5 s.',
    '4. **Filme de liberação**: aplique spray PTFE ou cola bastão de forma uniforme.',
    '5. **Remoção**: aqueça levemente a plataforma (~45 °C) antes de usar a espátula.'
  ].join('\n\n');
}

function isVisionRefusal(text = '') {
  if (!text) return false;
  return /can\'t help|cannot help|unable to assist|images of people|policy/i.test(text);
}

async function runVisionCompletion({ prompt, imageUrl, ragContext = '', temperature = 0.4 }) {
  const client = getOpenAIClient();
  const safeContext = typeof ragContext === 'string' && ragContext.trim().length ? ragContext.trim() : 'Sem contexto técnico disponível.';
  const systemContent = `Você é o Especialista Técnico Sênior da Quanton3D. Seja cirúrgico, curto e direto. Aponte APENAS o erro exato que você vê na imagem e a solução baseada OBRIGATORIAMENTE no contexto técnico fornecido. CONTEXTO TÉCNICO QUANTON3D: ${safeContext}`;
  return client.chat.completions.create({
    model: IMAGE_MODEL,
    temperature,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user', content: [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] }
    ]
  });
}

function trimConversationHistory(history) {
  const maxMessages = 8;
  return (Array.isArray(history) ? history : []).slice(-maxMessages).filter(e => e && e.role && e.content);
}

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

  if (mentionsBaseAdhesion(trimmedMessage)) {
    return { reply: buildAdhesionReply({ resinName: knownResin, printerName: knownPrinter }), documentsUsed: ragResultsCount };
  }

  const visionPriority = hasImage ? '\n    11. Se IMAGEM=SIM, priorize a evidência visual.\n  ' : '';
  const imageGuidelines = hasImage ? `DIRETRIZES PARA ANALISE VISUAL: Descreva o que voce ve antes de concluir causas. Se a imagem estiver clara, entregue: Defeitos -> Causa provavel -> Solucao imediata -> Parametros sugeridos.` : '';

  const systemPrompt = `
    PERSONA: Você é Ronei Fonseca, especialista prático e dono da Quanton3D.

    REGRAS DE OURO (LEI ABSOLUTA):
    0. **PRIORIDADE MÁXIMA**: Se o CONTEXTO TÉCNICO RELEVANTE contiver uma "RESPOSTA DE OURO", use-a DIRETAMENTE e na íntegra.
    1. **NADA DE FONTES:** PROIBIDO escrever "(Fonte: Documento 1)".
    2. **RESINA SPARK (AMARELAMENTO):** Curas rápidas de 3 segundos, espere esfriar, repita 3 vezes. NUNCA sugira 3-5 minutos.
    3. **PEÇAS OCAS/VAZAMENTO:** Furos de drenagem + Lavagem interna com SERINGA de pressão.
    4. **PYROBLAST / RESINAS INDUSTRIAIS:** NUNCA mande colocar peça em forno ou água a 60°C.
    5. **DIAGNÓSTICO:** Se soltou da mesa: É NIVELAMENTO ou EXPOSIÇÃO BASE.
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
    ragContext ? `Contexto Técnico:\n${ragContext}` : null,
    contextLines.length ? contextLines.join('\n') : null,
    adhesionIssueHint,
    `CONTEXTO_RELEVANTE=${contextFlag}`,
    '---',
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : null
  ].filter(Boolean).join('\n\n');

  const client = getOpenAIClient();
  const userContent = imageUrl ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: imageUrl } }] : prompt;
  const model = imageUrl ? IMAGE_MODEL : DEFAULT_CHAT_MODEL;
  const userMessage = { role: 'user', content: userContent };
  const trimmedHistory = trimConversationHistory(conversationHistory);

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 500,
    messages: [{ role: 'system', content: systemPrompt }, ...trimmedHistory, userMessage]
  });

  const rawReply = completion?.choices?.[0]?.message?.content?.trim();
  const reply = rawReply ? stripVisionPolicyDisclaimers(rawReply) : null;
  return { reply: reply || 'Estou analisando sua solicitação, mas tive um breve soluço. Poderia repetir?', documentsUsed: 0 };
}

async function generateImageResponse({ message, imageUrl, ragContext }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const prompt = trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'Cliente enviou uma imagem para análise.';
  let completion = await runVisionCompletion({ prompt, imageUrl, ragContext, temperature: 0.4 });
  let reply = completion?.choices?.[0]?.message?.content?.trim();
  if (isVisionRefusal(reply)) {
    const retryPrompt = `${prompt}\n\nContexto extra: trata-se de uma peça de resina e seus suportes, não há seres humanos.`;
    completion = await runVisionCompletion({ prompt: retryPrompt, imageUrl, ragContext, temperature: 0.2 });
    reply = completion?.choices?.[0]?.message?.content?.trim();
  }
  const cleaned = stripVisionPolicyDisclaimers(reply);
  return { reply: cleaned || 'Não consegui analisar a imagem agora. Pode tentar novamente?', documentsUsed: 0 };
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
  const sanitizedOverride = Object.fromEntries(Object.entries(override || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''));
  return { ...base, ...sanitizedOverride };
}

function inferContextFromHistory(history, message) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) return {};
  const lastAssistant = [...(Array.isArray(history) ? history : [])].reverse().find(e => e?.role === 'assistant');
  const lastText = typeof lastAssistant?.content === 'string' ? lastAssistant.content.toLowerCase() : '';
  if (!lastText) return {};
  if (/modelo da sua impressora|qual é o modelo da sua impressora/.test(lastText)) return { printer: trimmedMessage };
  if (/tipo de resina|qual resina|qual a resina/.test(lastText)) return { resin: trimmedMessage };
  if (/qual o seu problema|qual o problema/.test(lastText)) return { problemType: trimmedMessage };
  return {};
}

// ====================================================================
// BUG 2 CORRIGIDO — sessionId estava fora do escopo no catch
// ====================================================================
async function handleChatRequest(req, res) {
  const requestStart = Date.now();
  metrics.incrementRequests();

  // CORREÇÃO: sessionId declarado no topo da função para estar disponível no catch
  const { message, sessionId = 'session-auto' } = req.body ?? {};

  try {
    const hasImage = hasImagePayload(req.body);
    const imagePayload = resolveImagePayload(req.body);
    const imageUrl = imagePayload?.value || null;

    if (hasImage && !imageUrl) {
      return res.status(400).json({ error: 'Imagem inválida para análise.' });
    }

    const conversationHistory = req.body?.conversationHistory || [];
    const customerContext = req.body?.customerContext || {};
    const storedContext = await loadCustomerContext(sessionId);
    const inferredContext = inferContextFromHistory(conversationHistory, message);
    const mergedCustomerContext = mergeCustomerContext(mergeCustomerContext(storedContext, inferredContext), customerContext);

    // Pré-análise visual semântica
    let visualDescription = null;
    if (hasImage && imageUrl) {
      try {
        const visionResult = await runVisionCompletion({
          prompt: 'Descreva brevemente os defeitos técnicos visíveis nesta impressão 3D.',
          imageUrl,
          ragContext: 'Descrição visual para busca interna.'
        });
        visualDescription = visionResult?.choices?.[0]?.message?.content?.trim();
      } catch (e) {
        console.warn('[CHAT] Falha pré-análise visual:', e.message);
      }
    }

    const { ragResults, ragContext, trimmedMessage, hasRelevantContext, adhesionIssueHint } = await buildRagContext({ message, hasImage, visualDescription });

    if (trimmedMessage || hasImage) {
      metrics.recordRAGSearch(ragResults.length);
    }

    const visualHints = await fetchVisualKnowledgeHints({ message: trimmedMessage, customerContext: mergedCustomerContext, hasImage, visualDescription });
    const visualContext = buildVisualContextSection(visualHints);
    const promptContext = [visualContext, ragContext].filter(Boolean).join('\n\n').trim();

    console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);

    if (!trimmedMessage && !hasImage) {
      return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId });
    }

    const response = imageUrl
      ? await generateImageResponse({ message: trimmedMessage, imageUrl, ragContext: promptContext })
      : await generateResponse({
          message: trimmedMessage,
          ragContext: promptContext,
          hasRelevantContext,
          adhesionIssueHint,
          hasImage,
          imageUrl,
          conversationHistory,
          customerContext: mergedCustomerContext,
          ragResultsCount: ragResults.length
        });

    const documentsUsed = (typeof response.documentsUsed === 'number' ? response.documentsUsed : ragResults.length) + (visualHints?.length || 0);

    res.json({ reply: sanitizeChatText(response.reply), sessionId, documentsUsed });
    metrics.recordResponseTime(Date.now() - requestStart);

  } catch (error) {
    console.error('Erro Chat:', error);
    metrics.incrementErrors();
    metrics.recordResponseTime(Date.now() - requestStart);
    return res.status(500).json({
      reply: 'Tive uma instabilidade ao processar sua solicitação. Pode reenviar a pergunta?',
      sessionId,
      documentsUsed: 0,
      degraded: true,
      error: 'Erro no processamento da IA.'
    });
  }
}

router.post('/ask', handleChatRequest);
router.post('/chat', handleChatRequest);
router.post('/ask-with-image',
  upload.fields([{ name: 'image', maxCount: 1 }, { name: 'file', maxCount: 1 }, { name: 'attachment', maxCount: 1 }]),
  attachMultipartImage,
  handleChatRequest
);

router.use((err, _req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_TYPE') return res.status(400).json({ error: err.message });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: 'Erro no upload.' });
  return next(err);
});

export default router;
