import express from 'express';

const router = express.Router();

// Rota de teste simples para garantir que o bot responde
router.get('/ping', (req, res) => {
  res.json({ status: 'ok', message: 'Chat route working' });
});

const RECOVERY_REPLY = "O sistema está reiniciando e voltará com a IA em breve. (Modo de Recuperação)";

function hasImagePayload(body = {}) {
  return Boolean(
    body.imageUrl ||
    body.image ||
    body.imageBase64 ||
    body.imageData ||
    body.attachment
  );
}

async function handleChatRequest(req, res) {
  try {
    const { message, sessionId } = req.body ?? {};
    const trimmedMessage = typeof message === "string" ? message.trim() : "";
    const hasMessage = trimmedMessage.length > 0;
    const hasImage = hasImagePayload(req.body);

    console.log(`[CHAT] Mensagem recebida: ${trimmedMessage || "(sem texto)"}`);

    if (!hasMessage && !hasImage) {
      return res.status(400).json({ error: "Mensagem ou imagem necessária" });
    }

    res.json({
      reply: RECOVERY_REPLY,
      sessionId: sessionId || "session-recuperacao",
      documentsUsed: 0
    });

  } catch (error) {
    console.error("Erro na rota de chat:", error);
    res.status(500).json({ error: "Erro interno no servidor." });
  }
}

// Rota PRINCIPAL /ask (Simplificada para estabilizar o sistema)
router.post("/ask", handleChatRequest);

// Compatibilidade: /chat (frontend antigo)
router.post("/chat", handleChatRequest);

// Compatibilidade: /ask-with-image (frontend com imagem)
router.post("/ask-with-image", handleChatRequest);

export { router as chatRoutes };
