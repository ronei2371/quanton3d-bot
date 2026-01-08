import express from 'express';
// Removendo importações quebradas do db.js antigo
import { PrintParameter } from '../models/schemas.js';

const router = express.Router();

// Rota de teste simples para garantir que o bot responde
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Chat route working' });
});

// Rota PRINCIPAL /ask (Simplificada para estabilizar o sistema)
router.post('/ask', async (req, res) => {
  try {
    const { message, sessionId } = req.body;

    console.log(`[CHAT] Mensagem recebida: ${message}`);

    if (!message) {
      return res.status(400).json({ error: 'Mensagem necessária' });
    }

    // Resposta de emergência para o sistema subir
    // Depois reativaremos a IA completa. Agora a prioridade é o servidor VERDE.
    const reply = "O sistema está reiniciando e voltará com a IA em breve. (Modo de Recuperação)";

    res.json({
      reply: reply,
      sessionId: sessionId || 'session-recuperacao',
      documentsUsed: 0
    });

  } catch (error) {
    console.error('Erro na rota /ask:', error);
    res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

export { router as chatRoutes };
