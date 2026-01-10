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
    body.attachment
  );
}

function summarizeImagePayload(body = {}) {
  if (body.imageUrl) return `Imagem recebida via URL: ${body.imageUrl}`;
  if (body.image) return 'Imagem recebida (campo image).';
  if (body.imageBase64 || body.imageData || body.attachment) return 'Imagem recebida em formato base64/anexo.';
  return '';
}

async function generateResponse({ message, imageSummary }) {
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';
  const ragResults = trimmedMessage ? await searchKnowledge(trimmedMessage) : [];
  const ragContext = formatContext(ragResults);

  // --- AQUI ESTÁ A MÁGICA DA PERSONALIDADE ---
  const systemPrompt = `
    Você é a IA da Quanton3D, especialista em resinas para impressão 3D.
    
    Diretrizes de Resposta:
    1. Seja direto, amigável e técnico na medida certa.
    2. Use formatação com tópicos (bullet points) ou negrito para facilitar a leitura.
    3. Use o contexto fornecido abaixo para responder, mas JAMAIS escreva "(Fonte: Documento 1)" ou citações parecidas. Integre a informação naturalmente.
    4. Se a resposta não estiver no contexto, sugira entrar em contato com o suporte humano (WhatsApp/Email).
    5. Se o usuário mandar uma imagem ou descrever um defeito, aja como um especialista em troubleshooting, dando dicas de cura, lavagem e parâmetros.
  `;

  const prompt = [
    `Contexto Técnico Interno (Use isso para responder):\n${ragContext}`,
    '---',
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'O cliente enviou uma imagem.',
    imageSummary ? `Contexto da imagem: ${imageSummary}` : null,
  ].filter(Boolean).join('\n\n');

  const client = getOpenAIClient();
  const completion = await client.chat.completions.create({
    model: DEFAULT_CHAT_MODEL,
    temperature: 0.4, // Um pouco mais criativo para não ser robótico
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt }
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
    const response = await generateResponse({ message: trimmedMessage, imageSummary });

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

router.post('/ask', handleChatRequest);
router.post('/chat', handleChatRequest);
router.post('/ask-with-image', handleChatRequest);

export default router;
