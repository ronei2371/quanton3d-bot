import express from 'express';
import OpenAI from 'openai';
import { searchKnowledge, formatContext } from '../../rag-search.js';

const router = express.Router();

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
const DEFAULT_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-4o';
let openaiClient = null;

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
  return Boolean(body.imageUrl || body.image || body.imageBase64 || body.imageData || body.attachment);
}

function resolveImagePayload(body = {}) {
  const possiblePayloads = [
    body.imageUrl,
    body.image,
    body.imageBase64,
    body.imageData,
    body.attachment
  ];

  let payload = possiblePayloads.find(Boolean);
  if (!payload) return null;

  let mimeType =
    body.imageMimeType ||
    body.mimeType ||
    'image/jpeg';

  if (typeof payload === 'object') {
    if (payload.url) {
      return payload.url;
    }
    if (payload.data) {
      mimeType = payload.mimeType || payload.type || mimeType;
      payload = payload.data;
    } else if (payload.base64) {
      mimeType = payload.mimeType || payload.type || mimeType;
      payload = payload.base64;
    }
  }

  if (typeof payload !== 'string') {
    return null;
  }

  const trimmed = payload.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('data:') || trimmed.startsWith('http')) {
    return trimmed;
  }

  return `data:${mimeType};base64,${trimmed}`;
}

async function getRagContext(message) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const ragResults = trimmedMessage ? await searchKnowledge(trimmedMessage) : [];
  const ragContext = formatContext(ragResults);

  return { ragResults, ragContext, trimmedMessage };
}

async function generateResponse({ message, ragContext }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  // --- AQUI ESTÁ A CORREÇÃO DA PERSONALIDADE ---
  const systemPrompt = `
    Você é a IA Oficial da Quanton3D, especialista técnica em resinas e impressão 3D.
    
    SUAS REGRAS DE OURO:
    1. JAMAIS cite fontes explicitamente como "(Fonte: Documento 1)" ou "[Doc 1]". Use o conhecimento naturalmente no texto.
    2. Seja cordial, direto e profissional. Aja como um consultor técnico experiente.
    3. Use formatação (negrito, tópicos) para deixar a leitura fácil.
    4. Se o usuário relatar falhas (como "peça sem definição"), aja como suporte técnico: analise as causas prováveis (cura, limpeza, parâmetros) baseando-se no contexto.
    5. Se a resposta não estiver no contexto, sugira contato humano pelo WhatsApp (31) 98334-0053.
  `;

  const prompt = [
    ragContext ? `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}` : null,
    '---',
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'Cliente enviou uma imagem.'
  ].filter(Boolean).join('\n\n');

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: DEFAULT_CHAT_MODEL,
    temperature: 0.5, // Aumentei um pouco para ficar mais natural
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
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
  const systemPrompt = `
    Você é a IA Oficial da Quanton3D, especialista técnica em resinas e impressão 3D.
    
    SUAS REGRAS DE OURO:
    1. JAMAIS cite fontes explicitamente como "(Fonte: Documento 1)" ou "[Doc 1]". Use o conhecimento naturalmente no texto.
    2. Seja cordial, direto e profissional. Aja como um consultor técnico experiente.
    3. Use formatação (negrito, tópicos) para deixar a leitura fácil.
    4. Se o usuário relatar falhas (como "peça sem definição"), aja como suporte técnico: analise as causas prováveis (cura, limpeza, parâmetros) baseando-se no contexto.
    5. Se a resposta não estiver no contexto, sugira contato humano pelo WhatsApp (31) 98334-0053.
  `;

  const prompt = [
    ragContext ? `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}` : null,
    '---',
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'Cliente enviou uma imagem para análise.'
  ].filter(Boolean).join('\n\n');

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: DEFAULT_IMAGE_MODEL,
    temperature: 0.4,
    max_tokens: 1000,
    messages: [
      { role: 'system', content: systemPrompt },
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
    const { ragResults, ragContext, trimmedMessage } = await getRagContext(message);

    console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);

    if (!trimmedMessage && !hasImage) {
      // Se não tem msg nem imagem, pode ser um "ping" de início de sessão
      return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId: sessionId || 'new' });
    }

    let response = null;
    if (hasImage) {
      const imageUrl = resolveImagePayload(req.body);
      if (!imageUrl) {
        return res.status(400).json({ error: 'Imagem inválida ou não suportada.' });
      }
      response = await generateImageResponse({
        message: trimmedMessage,
        imageUrl,
        ragContext
      });
    } else {
      response = await generateResponse({ message: trimmedMessage, ragContext });
    }

    res.json({
      reply: response.reply,
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
router.post('/ask-with-image', handleChatRequest);

export default router;
