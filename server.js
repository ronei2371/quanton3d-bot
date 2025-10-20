import express from "express";
import cors from "cors";
import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();
const app = express();
app.use(cors());
app.use(express.json());

// Porta padrão do Render (ou 3001 localmente)
const PORT = process.env.PORT || 3001;

// ===== ROTA PRINCIPAL =====
app.get("/", (req, res) => {
  res.send("🤖 Quanton3D Bot backend está rodando!");
});

// ===== ROTA DE PERGUNTAS =====
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    // se não houver chave da OpenAI ainda:
    if (!process.env.OPENAI_API_KEY) {
      return res.json({
        reply: "⚙️ O servidor está ativo, mas a IA ainda não foi conectada à OpenAI.",
      });
    }

    // chama a API da OpenAI
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: "Você é o QuantonBot3D, especialista em impressão 3D com resina. Responda de forma simpática e técnica.",
          },
          { role: "user", content: message },
        ],
      }),
    });

    const data = await r.json();
    const reply = data?.choices?.[0]?.message?.content || "Desculpe, não consegui entender.";

    res.json({ reply });
  } catch (err) {
    console.error("Erro ao processar /ask:", err);
    res.status(500).json({ reply: "⚠️ Ocorreu um erro interno." });
  }
});

// ===== INICIA O SERVIDOR =====
app.listen(PORT, () => console.log(`✅ Quanton3D Bot backend rodando na porta ${PORT}`));
