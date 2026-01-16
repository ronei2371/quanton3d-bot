import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { searchKnowledge, formatContext } from '../../rag-search.js';
import { getCollection, retryMongoWrite } from '../../db.js';
import { ensureMongoReady } from './common.js';

const router = express.Router();

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const DEFAULT_VISION_MODEL = process.env.OPENAI_VISION_MODEL || 'gpt-4o-mini';
const MAX_HISTORY_TOKENS = 3000;
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

function summarizeImagePayload(body = {}) {
  const normalized = resolveImagePayload(body);
  if (!normalized) return '';
  if (normalized.type === 'url') return `Imagem recebida via URL: ${normalized.value}`;
  return 'Imagem recebida em formato base64/anexo.';
}

function sanitizeChatText(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/<[^>]*>/g, '').trim();
}

function normalizeHistoryEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const role = entry.role || entry.sender || entry.from;
  if (!['user', 'assistant', 'system'].includes(role)) return null;
  const content = entry.content ?? entry.text ?? entry.message ?? '';
  if (!content) return null;
  return { role, content };
}

function getConversationHistory(body = {}) {
  const rawHistory =
    body.history ||
    body.conversationHistory ||
    body.messages ||
    body.conversation ||
    [];

  if (!Array.isArray(rawHistory)) return [];

  return rawHistory
    .map(normalizeHistoryEntry)
    .filter((entry) => entry && entry.role !== 'system');
}

function estimateTokensFromContent(content) {
  if (!content) return 0;
  if (typeof content === 'string') {
    return Math.ceil(content.length / 4);
  }
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part?.type === 'text') {
        return sum + Math.ceil((part.text || '').length / 4);
      }
      if (part?.type === 'image_url') {
        return sum + 200;
      }
      return sum;
    }, 0);
  }
  return Math.ceil(JSON.stringify(content).length / 4);
}

function estimateTokensFromMessages(messages = []) {
  return messages.reduce((sum, message) => sum + estimateTokensFromContent(message.content), 0);
}

function trimConversationHistory(history = [], systemPrompt, newUserMessage, maxTokens = MAX_HISTORY_TOKENS) {
  const trimmed = [...history];
  const buildMessages = () => [
    { role: 'system', content: systemPrompt },
    ...trimmed,
    newUserMessage
  ];

  let tokenCount = estimateTokensFromMessages(buildMessages());
  if (tokenCount <= maxTokens) return trimmed;

  const protectedTurns = 2;
  const protectedCount = Math.min(trimmed.length, protectedTurns * 2);

  while (tokenCount > maxTokens) {
    const protectedStart = Math.max(0, trimmed.length - protectedCount);
    const removableIndex = trimmed.findIndex(
      (message, index) => index < protectedStart && message.role === 'user'
    );

    if (removableIndex === -1) {
      break;
    }

    trimmed.splice(removableIndex, 1);

    if (trimmed[removableIndex]?.role === 'assistant' && removableIndex < trimmed.length - protectedCount) {
      trimmed.splice(removableIndex, 1);
    }

    tokenCount = estimateTokensFromMessages(buildMessages());
  }

  return trimmed;
}

function extractImageUrl(body = {}) {
  const normalized = resolveImagePayload(body);
  return normalized ? normalized.value : null;
}

async function logResinSearch({ message, sessionId, hasImage }) {
  const mongoReady = await ensureMongoReady();
  if (!mongoReady) {
    console.warn('[CHAT] MongoDB indisponível para log de buscas.');
    return;
  }

  const searchesCollection = getCollection('ResinSearches');
  if (!searchesCollection) {
    console.warn('[CHAT] Coleção ResinSearches indisponível.');
    return;
  }

  const payload = {
    query: message || null,
    timestamp: new Date(),
    sessionId: sessionId || null,
    hasImage: Boolean(hasImage),
    source: 'chat',
    createdAt: new Date()
  };

  try {
    await retryMongoWrite(
      () => searchesCollection.insertOne(payload),
      { label: 'registro de busca' }
    );
  } catch (error) {
    console.error('[CHAT] Falha ao registrar busca:', error);
  }
}

function attachMultipartImage(req, res, next) {
  const files = req.files || {};
  const file =
    files.image?.[0] ||
    files.file?.[0] ||
    files.attachment?.[0];

  if (file?.buffer) {
    req.body = req.body ?? {};
    req.body.imageFile = {
      base64: file.buffer.toString('base64'),
      mimeType: file.mimetype
    };
  }

  next();
}

async function generateResponse({ message, imageSummary, imageUrl, hasImage, conversationHistory }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const ragQuery = trimmedMessage || (hasImage ? 'diagnostico visual impressao 3d resina defeitos comuns' : '');
  const ragResults = ragQuery ? await searchKnowledge(ragQuery) : [];
  const ragContext = formatContext(ragResults);
  const hasRelevantContext = ragResults.length > 0;
  const adhesionIssueHint = /dificil|difícil|duro|presa|grudada|grudado/i.test(trimmedMessage)
    && /mesa|plate|plataforma|base/i.test(trimmedMessage)
    ? 'Nota de triagem: cliente relata peça muito presa na plataforma; evite sugerir AUMENTAR exposição base sem dados. Considere sobre-adesão e peça parâmetros antes de recomendar ajustes.'
    : null;

  // --- AQUI ESTÁ A CORREÇÃO DA PERSONALIDADE ---
  const visionPriority = hasImage
    ? '\n    11. Se IMAGEM=SIM, priorize a evidência visual. Não deixe histórico anterior de texto sobrepor o que está claramente visível na nova imagem.\n  '
    : '';

  const systemPrompt = `
    Você é a IA Oficial da Quanton3D, uma técnica sênior em impressão 3D de resina, com foco no mercado brasileiro.

    PERSONA TÉCNICA:
    - Responda como uma especialista prática de chão de fábrica, com linguagem objetiva e precisa.
    - Priorize referências e marcas populares no Brasil quando fizer sentido (Anycubic, Elegoo, Iron, Creality).

    REGRAS DE OURO:
    1. JAMAIS cite fontes explicitamente como "(Fonte: Documento 1)" ou "[Doc 1]". Use o conhecimento naturalmente no texto.
    2. Responda de forma objetiva (máximo de 6 a 8 linhas), com tópicos quando fizer sentido.
    3. Sempre forneça faixas numéricas específicas quando recomendar ajustes (ex: "Exposição normal: 2,5–3,0 s").
    4. Para resinas desconhecidas, use padrões conservadores (ex: "Comece com exposição normal de 3,0 s").
    5. Nunca sugira temperaturas acima de 35°C para resinas padrão.
    6. Só apresente causas prováveis quando houver CONTEXTO_RELEVANTE=SIM ou o cliente fornecer dados técnicos claros.
    7. Se CONTEXTO_RELEVANTE=NAO, NÃO diagnostique. Ative o "Modo Entrevista Guiada": faça apenas UMA pergunta por vez, seguindo esta ordem fixa: (1) modelo da impressora, (2) tipo de resina, (3) tempo de exposição/configurações. Só avance para a próxima etapa quando a anterior for respondida. Não liste todos os requisitos de uma vez. Se necessário, ofereça ajuda humana no WhatsApp (31) 98334-0053.
    8. Se IMAGEM=SIM, descreva rapidamente o que você observa sem afirmar a causa. Liste no máximo 2-3 hipóteses e peça dados antes de recomendar ajustes.
    9. Não invente parâmetros nem diagnósticos; peça dados específicos quando necessário.
    10. SEMPRE consulte a "TABELA_COMPLETA" ou "resins_db" antes de responder perguntas sobre parâmetros. Confie nesses valores acima de conhecimento geral.
    11. Se a pergunta for sobre tarefas, prazos internos ou qualquer assunto fora de impressão 3D/resinas, explique que você não tem acesso a sistemas internos e peça mais detalhes ou direcione ao suporte humano.
    ${visionPriority}
  `;

  const prompt = [
    `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}`,
    '---',
    `Sinalizadores: CONTEXTO_RELEVANTE=${hasRelevantContext ? 'SIM' : 'NAO'} | IMAGEM=${hasImage ? 'SIM' : 'NAO'}`,
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'Cliente enviou uma imagem.',
    adhesionIssueHint,
    imageSummary ? `Detalhes da imagem: ${imageSummary}` : null,
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
    documentsUsed: ragResults.length
  };
}

async function handleChatRequest(req, res) {
  try {
    const { message, sessionId } = req.body ?? {};
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const resolvedImage = resolveImagePayload(req.body);
    const hasImage = Boolean(resolvedImage);
    const imageUrl = resolvedImage ? resolvedImage.value : null;
    const conversationHistory = getConversationHistory(req.body);

    console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);

    if (!trimmedMessage && !hasImage) {
      // Se não tem msg nem imagem, pode ser um "ping" de início de sessão
      return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId: sessionId || 'new' });
    }

    const imageSummary = hasImage ? summarizeImagePayload(req.body) : '';
    void logResinSearch({ message: trimmedMessage, sessionId, hasImage });

    const response = await generateResponse({
      message: trimmedMessage,
      imageSummary,
      imageUrl,
      hasImage,
      conversationHistory
    });

    res.json({
      reply: sanitizeChatText(response.reply),
      sessionId: sessionId || 'session-auto',
      documentsUsed: response.documentsUsed
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
