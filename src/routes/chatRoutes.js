import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { searchKnowledge, formatContext } from '../../rag-search.js';
import { ensureMongoReady } from './common.js';
import { getConversasCollection } from '../../db.js';

const router = express.Router();

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const DEFAULT_VISION_MODEL = process.env.OPENAI_VISION_MODEL || DEFAULT_CHAT_MODEL;
const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || DEFAULT_VISION_MODEL;

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
    body.imageUrl ||
    body.image ||
    body.imageBase64 ||
    body.imageData ||
    body.attachment ||
    body.selectedImage ||
    body.imageFile
  );
}

function resolveImagePayload(body = {}) {
  if (body.imageUrl) {
    if (typeof body.imageUrl === 'string' && body.imageUrl.startsWith('blob:')) {
      return null;
    }
    return { type: 'url', value: body.imageUrl };
  }

  const raw =
    body.image ||
    body.imageBase64 ||
    body.imageData ||
    body.attachment ||
    body.selectedImage ||
    body.imageFile;
  if (!raw) return null;

  if (typeof raw === 'string') {
    if (raw.startsWith('data:')) {
      return { type: 'data', value: raw };
    }
    return { type: 'data', value: `data:image/jpeg;base64,${raw}` };
  }

  if (typeof raw === 'object') {
    if (typeof raw.dataUrl === 'string' && raw.dataUrl.startsWith('data:')) {
      return { type: 'data', value: raw.dataUrl };
    }
    const url = raw.url || raw.imageUrl || raw.preview || raw.src;
    if (typeof url === 'string' && url.startsWith('blob:')) {
      return null;
    }
    if (typeof url === 'string' && url.length > 0) {
      return { type: 'url', value: url };
    }
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
  const ragResults = ragQuery ? await searchKnowledge(ragQuery) : [];
  const ragContext = formatContext(ragResults);
  const hasRelevantContext = ragResults.length > 0;
  const adhesionIssueHint = /dificil|difícil|duro|presa|grudada|grudado/i.test(trimmedMessage)
    && /mesa|plate|plataforma|base/i.test(trimmedMessage)
    ? 'Nota de triagem: cliente relata peça muito presa na plataforma; evite sugerir AUMENTAR exposição base sem dados. Considere sobre-adesão e peça parâmetros antes de recomendar ajustes.'
    : null;

  return { ragResults, ragContext, trimmedMessage, hasRelevantContext, adhesionIssueHint };
}

function sanitizeChatText(text) {
  if (typeof text !== 'string') return '';
  return text.replace(/\u0000/g, '').trim();
}

function normalizeForMatch(text = '') {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractResinFromMessage(message = '') {
  const resinMatch = message.match(/resina\s+([^\n,.;]+)/i);
  if (resinMatch?.[1]) {
    return resinMatch[1].replace(/\b(na|no|para|com)\b.*$/i, '').trim();
  }

  const configMatch = message.match(/(?:configura|parametr)[^.\n]*\b(?:da|do|de)\s+(.+?)\s+\b(?:para|na|no)\b/i);
  if (configMatch?.[1]) {
    return configMatch[1].trim();
  }

  return null;
}

function extractPrinterFromMessage(message = '') {
  const safeMessage = typeof message === 'string' ? message : '';
  // Não usar fallback por marca aqui para evitar confundir nome de resina com impressora.
  const match = safeMessage.match(/(?:impressora|printer)\s+([^\n,.;]+)/i);
  if (match?.[1]) {
    return match[1].replace(/\b(com|na|no|para)\b.*$/i, '').trim();
  }
  return null;
}

function getGuidedNextQuestion({
  trimmedMessage,
  conversationHistory,
  knownPrinter,
  knownResin,
  ragContext
}) {
  const safeHistory = Array.isArray(conversationHistory) ? conversationHistory : [];
  const lastAssistant = [...safeHistory].reverse().find((entry) => entry?.role === 'assistant');
  const lastAssistantText = typeof lastAssistant?.content === 'string' ? lastAssistant.content.toLowerCase() : '';
  const messageIsAnswer =
    trimmedMessage
    && !isParameterQuestion(trimmedMessage)
    && !isDiagnosticQuestion(trimmedMessage)
    && !/\?/.test(trimmedMessage);
  if (!messageIsAnswer) return null;

  const hasExposure = hasExposureInfo(trimmedMessage) || hasExposureInfo((ragContext || '').toString());

  if (/modelo da sua impressora|qual é o modelo da sua impressora|modelo da impressora/.test(lastAssistantText)) {
    if (!knownResin) return 'Qual é a resina que você está usando?';
    if (!hasExposure) return 'Qual é o tempo de exposição normal e de base que você está usando?';
  }

  if (/tipo de resina|qual resina|qual a resina|qual resina você/.test(lastAssistantText)) {
    if (!hasExposure) return 'Qual é o tempo de exposição normal e de base que você está usando?';
  }

  if (/tempo de exposi[cç][aã]o|tempo de base|exposi[cç][aã]o normal/.test(lastAssistantText)) {
    if (!hasExposure) return 'Pode informar o tempo de exposição normal e de base que está usando?';
  }

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

function buildParameterBlockReply({ resinName, printerName }) {
  const resinLabel = resinName ? `resina ${resinName}` : 'resina';
  const printerLabel = printerName ? `impressora ${printerName}` : 'impressora';
  return `Não encontrei parâmetros confirmados para ${resinLabel} na ${printerLabel}. Por favor, confirme o modelo exato da impressora e a resina para eu verificar a tabela oficial ou acione o suporte técnico.`;
}

function trimConversationHistory(history, systemPrompt, userMessage) {
  const maxMessages = 8;
  const safeHistory = Array.isArray(history) ? history : [];
  const trimmed = safeHistory.slice(-maxMessages).filter((entry) => entry && entry.role && entry.content);
  return trimmed;
}

function attachMultipartImage(req, _res, next) {
  const files = req.files || {};
  const imageFile = files.image?.[0] || files.file?.[0] || files.attachment?.[0];
  if (!imageFile || !imageFile.buffer) {
    return next();
  }

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
  const sanitizedOverride = Object.fromEntries(
    Object.entries(override || {}).filter(([, value]) => value !== null && value !== undefined && value !== '')
  );
  return { ...base, ...sanitizedOverride };
}

function inferContextFromHistory(history, message) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  if (!trimmedMessage) return {};

  const safeHistory = Array.isArray(history) ? history : [];
  const lastAssistant = [...safeHistory].reverse().find((entry) => entry?.role === 'assistant');
  const lastAssistantText = typeof lastAssistant?.content === 'string' ? lastAssistant.content.toLowerCase() : '';

  if (!lastAssistantText) return {};

  if (/modelo da sua impressora|qual é o modelo da sua impressora|modelo da impressora/.test(lastAssistantText)) {
    return { printer: trimmedMessage };
  }

  if (/tipo de resina|qual resina|qual a resina|qual resina você/.test(lastAssistantText)) {
    return { resin: trimmedMessage };
  }

  if (/qual o seu problema|qual o problema|que problema/.test(lastAssistantText)) {
    return { problemType: trimmedMessage };
  }

  return {};
}

async function generateResponse({
  message,
  ragContext,
  hasRelevantContext,
  adhesionIssueHint,
  hasImage,
  imageUrl,
  conversationHistory,
  customerContext
}) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const resinFromMessage = extractResinFromMessage(trimmedMessage);
  const printerFromMessage = extractPrinterFromMessage(trimmedMessage);
  const knownResin = customerContext?.resin || resinFromMessage;
  const knownPrinter = customerContext?.printer || printerFromMessage;

  const guidedNextQuestion = getGuidedNextQuestion({
    trimmedMessage,
    conversationHistory,
    knownPrinter,
    knownResin,
    ragContext
  });
  if (guidedNextQuestion) {
    return { reply: guidedNextQuestion, documentsUsed: 0 };
  }

  if (isParameterQuestion(trimmedMessage)) {
    const normalizedContext = normalizeForMatch(ragContext || '');
    const resinOk = knownResin ? normalizedContext.includes(normalizeForMatch(knownResin)) : false;
    const printerOk = knownPrinter ? normalizedContext.includes(normalizeForMatch(knownPrinter)) : false;
    if (!hasRelevantContext || (knownResin && !resinOk) || (knownPrinter && !printerOk)) {
      return {
        reply: buildParameterBlockReply({ resinName: knownResin, printerName: knownPrinter }),
        documentsUsed: 0
      };
    }
  }

  if (isDiagnosticQuestion(trimmedMessage)) {
    if (!knownPrinter) {
      return { reply: 'Qual é o modelo exato da sua impressora?', documentsUsed: 0 };
    }
    if (!knownResin) {
      return { reply: 'Qual é a resina que você está usando?', documentsUsed: 0 };
    }
    if (!hasExposureInfo(trimmedMessage) && !hasExposureInfo((ragContext || '').toString())) {
      return { reply: 'Qual é o tempo de exposição normal e de base que você está usando?', documentsUsed: 0 };
    }
  }

  // --- AQUI ESTÁ A CORREÇÃO DA PERSONALIDADE ---
  const visionPriority = hasImage
    ? '\n    11. Se IMAGEM=SIM, priorize a evidência visual. Não deixe histórico anterior de texto sobrepor o que está claramente visível na nova imagem.\n  '
    : '';

  const imageGuidelines = hasImage
    ? `
    DIRETRIZES PARA ANALISE VISUAL:
    - Descreva o que voce ve antes de concluir causas.
    - Se houver dados (resina, impressora, problema), use-os para ajustar o diagnostico.
    - Se a imagem estiver clara e houver sinais evidentes, entregue: Defeitos -> Causa provavel -> Solucao imediata -> Parametros sugeridos (faixas).
    - Se faltarem dados criticos, faca UMA pergunta objetiva por vez antes de recomendar ajustes.
  `
    : '';

  const systemPrompt = `
    PERSONA: Você é Ronei Fonseca, especialista prático.
    REGRAS DE OURO (LEI ABSOLUTA):
    1. SOBRE RESINA SPARK (AMARELAMENTO): JAMAIS sugira curas longas. A regra é: Curas rápidas de 3 segundos, espere esfriar, repita 3 vezes. Dica: Colocar na água para evitar UV direto. NUNCA sugira 3-5 minutos.
    2. SOBRE PEÇAS OCAS/VAZAMENTO: O vazamento é resina presa. Solução: Furos de drenagem + Lavagem interna com SERINGA. PROIBIDO sugerir "escova macia" (risca e não limpa dentro) ou cura de 20 minutos (quebra a peça). Cura máx 5-7 min.
    3. SOBRE DESCOLAMENTO: Se soltou da mesa, é NIVELAMENTO ou EXPOSIÇÃO BASE. Não fale de suportes se a falha for na base.
    4. SOBRE LIXAR MESA: Só em último caso. Em Saturn 5/Ultra, foque no nivelamento automático e Z-offset.
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
  const userContent = imageUrl
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: imageUrl } }
      ]
    : prompt;

  const model = imageUrl ? DEFAULT_VISION_MODEL : DEFAULT_CHAT_MODEL;

  const userMessage = { role: 'user', content: userContent };
  const trimmedHistory = trimConversationHistory(
    Array.isArray(conversationHistory) ? conversationHistory : [],
    systemPrompt,
    userMessage
  );

  const completion = await client.chat.completions.create({
    model,
    temperature: 0.3,
    max_tokens: 500,
    messages: [
      { role: 'system', content: systemPrompt },
      ...trimmedHistory,
      userMessage
    ]
  });

  const reply = completion?.choices?.[0]?.message?.content?.trim();

  return {
    reply: reply || 'Estou analisando sua solicitação, mas tive um breve soluço. Poderia repetir?',
    documentsUsed: 0
  };
}

async function generateImageResponse({ message, imageUrl, ragContext }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const visualContext = ragContext
    ? `\n\n📎 CONTEXTO INTERNO (BASE VISUAL QUANTON3D):\n${ragContext}\n\nUse este contexto apenas como referência técnica.`
    : '';
  const VISUAL_SYSTEM_PROMPT = `
PERSONA: Você é Ronei Fonseca, especialista prático.
REGRAS DE OURO (LEI ABSOLUTA):
1. SOBRE RESINA SPARK (AMARELAMENTO): JAMAIS sugira curas longas. A regra é: Curas rápidas de 3 segundos, espere esfriar, repita 3 vezes. Dica: Colocar na água para evitar UV direto. NUNCA sugira 3-5 minutos.
2. SOBRE PEÇAS OCAS/VAZAMENTO: O vazamento é resina presa. Solução: Furos de drenagem + Lavagem interna com SERINGA. PROIBIDO sugerir "escova macia" (risca e não limpa dentro) ou cura de 20 minutos (quebra a peça). Cura máx 5-7 min.
3. SOBRE DESCOLAMENTO: Se soltou da mesa, é NIVELAMENTO ou EXPOSIÇÃO BASE. Não fale de suportes se a falha for na base.
4. SOBRE LIXAR MESA: Só em último caso. Em Saturn 5/Ultra, foque no nivelamento automático e Z-offset.

VOCÊ É UM ENGENHEIRO SÊNIOR DE APLICAÇÃO DA QUANTON3D (ESPECIALISTA EM RESINAS UV).
Sua missão é olhar a foto da falha e dar um diagnóstico CIRÚRGICO, técnico e direto.
Use SOMENTE a imagem e a mensagem do cliente. Nomes de arquivo não são visíveis nem confiáveis.
Se o cliente descrever a falha no texto (ex: "esta imagem é delaminação"), trate como pista secundária e confirme com o visual.
Se não houver evidência clara, NÃO invente: peça uma confirmação objetiva ou uma nova foto.

📚 BIBLIOTECA DE DIAGNÓSTICO VISUAL (Use isso para classificar):

1. **DESCOLAMENTO DA MESA (Adhesion Failure):**
   - O que vê: A peça caiu no tanque, ou soltou apenas um lado da base, ou a base está torta.
   - Se a falha está na base (primeiras camadas) ou a peça ficou pendurada no suporte, PRIORIZE este diagnóstico antes de delaminação.
   - Solução: Verificar nivelamento da plataforma e aumentar Exposição Base (+2s a +3s) ou Camadas Base (máx. 5-6).

2. **DELAMINAÇÃO (Layer Separation):**
   - O que vê: A peça abriu no meio, parecendo um "livro folheado". As camadas se separaram.
   - Só use este diagnóstico quando a separação no meio estiver claramente visível. Se a base não aparece ou a falha não está nítida, peça confirmação sobre onde ocorreu a quebra.
   - Solução: Aumentar Exposição Normal (+0.3s) ou reduzir velocidade de levante se houver essa opção no slicer.

3. **SUBCURA (Undercuring):**
   - O que vê: Detalhes derretidos, peça mole, suportes falharam e não seguraram a peça.
   - Solução: Aumentar Tempo de Exposição Normal.

4. **SOBRECURA (Overcuring):**
   - O que vê: Peça "inchada", perda de detalhes finos, dimensões maiores que o original.
   - Solução: Reduzir Tempo de Exposição.

5. **BLOOMING/RESÍDUO:**
   - O que vê: Aspecto de "escorrido" ou gosma na peça.
   - Solução: Aumentar tempo de descanso (Light-off delay) para 1s ou 2s.

6. **VAZAMENTO DE RESINA / FEP FURADO:**
   - O que vê: Poça de resina na tela/LCD, manchas grandes fora da área de impressão ou resina sob o FEP.
   - Solução: Parar a impressão, remover e limpar com cuidado, substituir o FEP, inspecionar a tela e testar vazamentos antes de imprimir novamente.

7. **LCD COM LINHAS/MANCHAS (Falha no LCD):**
   - O que vê: Linhas verticais/horizontais, manchas fixas ou áreas que não curam.
   - Solução: Se a falha estiver visível na foto, indique substituição do LCD. Se houver dúvida, rodar teste de exposição; se a mancha/linha aparecer no teste, o LCD está defeituoso e deve ser substituído. Não sugerir limpeza como solução.
   - Se não tiver certeza da orientação das linhas, descreva apenas "linhas na tela" sem dizer vertical/horizontal.

---

📋 **SEU FORMATO DE RESPOSTA OBRIGATÓRIO:**

👀 **O QUE EU VEJO:** (Descreva o erro visualmente, ex: "Vejo delaminação nas camadas centrais")
🚫 **DIAGNÓSTICO:** (Nome técnico do erro)
🔧 **SOLUÇÃO TÉCNICA:** (Ação direta: "Aumente a exposição normal para X segundos")
⚠️ **DICA EXTRA:** Se quiser, me diga resina, impressora e exposição para uma dica mais certeira. Verifique a configuração de suporte/penetração e o ângulo de impressão.

Se a imagem não for clara, peça outra. Se for clara, SEJA TÉCNICO E DIRETO. Não use enrolação corporativa.
Se houver dúvida entre descolamento de base e delaminação, pergunte: "A falha aconteceu nas primeiras camadas (base) ou no meio da peça?" antes de fechar o diagnóstico.
Se o cliente não enviou texto, finalize com: "Se quiser contextualizar, envie uma frase curta (ex: 'esta imagem é delaminação'). O nome do arquivo não é lido."
Se a falha parecer de LCD (linhas/manchas), responda diretamente isso, recomende substituição e não peça parâmetros de resina.
Se a peça ainda estiver presa na plataforma ou dentro da impressora, não cite pós-cura ou lavagem.
${visualContext}
`;

  const prompt = trimmedMessage
    ? `Cliente perguntou: ${trimmedMessage}`
    : 'Cliente enviou uma imagem para análise.';

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: DEFAULT_IMAGE_MODEL,
    temperature: 0.4,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: VISUAL_SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageUrl } }
        ]
      }
    ]
  });

  const reply = completion?.choices?.[0]?.message?.content?.trim();

  return {
    reply: reply || 'Não consegui analisar a imagem agora. Pode tentar novamente?',
    documentsUsed: 0
  };
}

async function handleChatRequest(req, res) {
  try {
    const { message, sessionId } = req.body ?? {};
    const hasImage = hasImagePayload(req.body);
    const imagePayload = resolveImagePayload(req.body);
    const imageUrl = imagePayload?.value || null;
    const conversationHistory = req.body?.conversationHistory || [];
    const customerContext = req.body?.customerContext || {};
    const storedContext = await loadCustomerContext(sessionId);
    const inferredContext = inferContextFromHistory(conversationHistory, message);
    const mergedCustomerContext = mergeCustomerContext(
      mergeCustomerContext(storedContext, inferredContext),
      customerContext
    );

    const {
      ragResults,
      ragContext,
      trimmedMessage,
      hasRelevantContext,
      adhesionIssueHint
    } = await buildRagContext({ message, hasImage });

    console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);

    if (!trimmedMessage && !hasImage) {
      // Se não tem msg nem imagem, pode ser um "ping" de início de sessão
      return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId: sessionId || 'new' });
    }

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
          customerContext: mergedCustomerContext
        });

    res.json({
      reply: sanitizeChatText(response.reply),
      sessionId: sessionId || 'session-auto',
      documentsUsed: ragResults.length || response.documentsUsed
    });
  } catch (error) {
    console.error('Erro Chat:', error);
    res.status(500).json({ error: 'Erro no processamento da IA.' });
  }
}

router.post('/ask', handleChatRequest);
router.post('/chat', handleChatRequest);
router.post(
  '/ask-with-image',
  upload.fields([
    { name: 'image', maxCount: 1 },
    { name: 'file', maxCount: 1 },
    { name: 'attachment', maxCount: 1 }
  ]),
  attachMultipartImage,
  handleChatRequest
);

router.use((err, _req, res, next) => {
  if (!err) {
    return next();
  }

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Arquivo excede o limite de 4MB.' });
    }
    return res.status(400).json({ error: 'Falha no upload do arquivo.' });
  }

  if (err.code === 'LIMIT_FILE_TYPE' || err.status === 400) {
    return res.status(400).json({ error: err.message || 'Upload inválido.' });
  }

  return next(err);
});

export default router;
