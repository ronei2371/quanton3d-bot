import express from 'express';
import OpenAI from 'openai';
import { searchKnowledge, formatContext } from '../../rag-search.js';

const router = express.Router();

const DEFAULT_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || 'gpt-4o-mini';
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

// Rota de teste simples para garantir que o bot responde
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Chat route working' });
});

function hasImagePayload(body = {}) {
  return Boolean(
    body.imageUrl ||
    body.image ||
    body.imageBase64 ||
    body.imageData ||
    body.attachment
  );
}

function summarizeImagePayload(body = {}) {
  if (body.imageUrl) {
    return `Imagem recebida via URL: ${body.imageUrl}`;
  }

  if (body.image) {
    return 'Imagem recebida (campo image).';
  }

  if (body.imageBase64 || body.imageData || body.attachment) {
    return 'Imagem recebida em formato base64/anexo.';
  }

  return '';
}

async function generateResponse({ message, imageSummary }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const ragResults = trimmedMessage ? await searchKnowledge(trimmedMessage) : [];
  const ragContext = formatContext(ragResults);

  const prompt = [
    ragContext,
    trimmedMessage
      ? `Pergunta do cliente: ${trimmedMessage}`
      : 'O cliente enviou uma imagem sem texto explicativo.',
    imageSummary ? `Contexto da imagem: ${imageSummary}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: DEFAULT_CHAT_MODEL,
    temperature: 0.3,
    messages: [
      {
        role: 'system',
        content: 'Você é o assistente técnico oficial da Quanton3D. Responda em português e siga o contexto fornecido.'
      },
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const reply = completion?.choices?.[0]?.message?.content?.trim();

  return {
    reply: reply || 'Não consegui gerar uma resposta agora. Tente novamente em instantes.',
    documentsUsed: ragResults.length
  };
}

async function handleChatRequest(req, res) {
  try {
    const { message, sessionId } = req.body ?? {};
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const hasMessage = trimmedMessage.length > 0;
    const hasImage = hasImagePayload(req.body);

    console.log(`[CHAT] Mensagem recebida: ${trimmedMessage || '(sem texto)'}`);

    if (!hasMessage && !hasImage) {
      return res.status(400).json({ error: 'Mensagem ou imagem necessária' });
    }

    const imageSummary = hasImage ? summarizeImagePayload(req.body) : '';
    const response = await generateResponse({
      message: trimmedMessage,
      imageSummary
    });

    res.json({
      reply: response.reply,
      sessionId: sessionId || 'session-auto',
      documentsUsed: response.documentsUsed
    });
  } catch (error) {
    console.error('Erro na rota de chat:', error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
}

// Rota PRINCIPAL /ask
router.post('/ask', handleChatRequest);

// Compatibilidade: /chat (frontend antigo)
router.post('/chat', handleChatRequest);

// Compatibilidade: /ask-with-image (frontend com imagem)
router.post('/ask-with-image', handleChatRequest);

export { router as chatRoutes };
