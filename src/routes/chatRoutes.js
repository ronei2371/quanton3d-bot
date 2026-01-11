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
  return Boolean(body.imageUrl || body.image || body.imageBase64 || body.imageData || body.attachment);
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
    `Contexto Técnico (Use isso para basear sua resposta):\n${ragContext}`,
    '---',
    trimmedMessage ? `Cliente perguntou: ${trimmedMessage}` : 'Cliente enviou uma imagem.',
    imageSummary ? `Detalhes da imagem: ${imageSummary}` : null,
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
    documentsUsed: ragResults.length
  };
}

async function handleChatRequest(req, res) {
  try {
    const { message, sessionId } = req.body ?? {};
    const trimmedMessage = typeof message === 'string' ? message.trim() : '';
    const hasImage = hasImagePayload(req.body);

    console.log(`[CHAT] Msg: ${trimmedMessage.substring(0, 50)}...`);

    if (!trimmedMessage && !hasImage) {
      // Se não tem msg nem imagem, pode ser um "ping" de início de sessão
      return res.json({ reply: 'Olá! Sou a IA da Quanton3D. Como posso ajudar com suas impressões hoje?', sessionId: sessionId || 'new' });
    }

    const imageSummary = hasImage ? summarizeImagePayload(req.body) : '';
    const response = await generateResponse({ message: trimmedMessage, imageSummary });

    res.json({
      reply: response.reply,
      response: response.reply,
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

export default router;
