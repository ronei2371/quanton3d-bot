import express from 'express';
import OpenAI from 'openai';
import multer from 'multer';
import { searchKnowledge, formatContext } from '../../rag-search.js';

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

async function generateResponse({ message, ragContext, hasImage, imageUrl, conversationHistory, customerContext }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

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
    8. Se IMAGEM=SIM, descreva rapidamente o que você observa sem afirmar a causa. Liste no máximo 2-3 hipóteses e peça dados antes de recomendar ajustes, a menos que os sinais sejam evidentes e haja contexto suficiente.
    9. Não invente parâmetros nem diagnósticos; peça dados específicos quando necessário.
    10. SEMPRE consulte a "TABELA_COMPLETA" ou "resins_db" antes de responder perguntas sobre parâmetros. Confie nesses valores acima de conhecimento geral.
    11. Se a pergunta for sobre tarefas, prazos internos ou qualquer assunto fora de impressão 3D/resinas, explique que você não tem acesso a sistemas internos e peça mais detalhes ou direcione ao suporte humano.
    ${visionPriority}
    ${imageGuidelines}
  `;

  const contextLines = [];
  if (customerContext?.userName) contextLines.push(`Nome do cliente: ${customerContext.userName}`);
  if (customerContext?.resin) contextLines.push(`Resina: ${customerContext.resin}`);
  if (customerContext?.printer) contextLines.push(`Impressora: ${customerContext.printer}`);
  if (customerContext?.problemType) contextLines.push(`Problema relatado: ${customerContext.problemType}`);

  const prompt = [
    ragContext ? `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}` : null,
    contextLines.length ? contextLines.join('\n') : null,
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
VOCÊ É UM ENGENHEIRO SÊNIOR DE APLICAÇÃO DA QUANTON3D (ESPECIALISTA EM RESINAS UV).
Sua missão é olhar a foto da falha e dar um diagnóstico CIRÚRGICO.
Use SOMENTE a imagem e a mensagem do cliente. Nomes de arquivo não são visíveis nem confiáveis.
Se o cliente descrever a falha no texto (ex: "esta imagem é delaminação"), trate como pista secundária e confirme com o visual.

📚 BIBLIOTECA DE DIAGNÓSTICO VISUAL (Use isso para classificar):

1. **DESCOLAMENTO DA MESA (Adhesion Failure):**
   - O que vê: A peça caiu no tanque, ou soltou apenas um lado da base, ou a base está torta.
   - Solução: Aumentar Exposição Base (+10s) ou Aumentar Camadas Base. Lixar a plataforma.

2. **DELAMINAÇÃO (Layer Separation):**
   - O que vê: A peça abriu no meio, parecendo um "livro folheado". As camadas se separaram.
   - Solução: Aumentar Exposição Normal (+0.3s) ou Reduzir Velocidade de Levante (Lift Speed).

3. **SUBCURA (Undercuring):**
   - O que vê: Detalhes derretidos, peça mole, suportes falharam e não seguraram a peça.
   - Solução: Aumentar Tempo de Exposição Normal.

4. **SOBRECURA (Overcuring):**
   - O que vê: Peça "inchada", perda de detalhes finos, dimensões maiores que o original.
   - Solução: Reduzir Tempo de Exposição.

5. **BLOOMING/RESÍDUO:**
   - O que vê: Aspecto de "escorrido" ou gosma na peça.
   - Solução: Aumentar tempo de descanso (Light-off delay) para 1s ou 2s.

---

📋 **SEU FORMATO DE RESPOSTA OBRIGATÓRIO:**

👀 **O QUE EU VEJO:** (Descreva o erro visualmente, ex: "Vejo delaminação nas camadas centrais")
🚫 **DIAGNÓSTICO:** (Nome técnico do erro)
🔧 **SOLUÇÃO TÉCNICA:** (Ação direta: "Aumente a exposição normal para X segundos")
⚠️ **DICA EXTRA:** (Uma dica sobre limpeza, temperatura ou FEP)

Se a imagem não for clara, peça outra. Se for clara, SEJA TÉCNICO E DIRETO. Não use enrolação corporativa.
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

    const {
      ragResults,
      ragContext,
      trimmedMessage
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
          hasImage,
          imageUrl,
          conversationHistory,
          customerContext
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
