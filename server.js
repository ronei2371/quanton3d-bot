// =========================
// 🤖 Quanton3D IA - Servidor Oficial
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Conexão com a OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Rota principal de teste
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend ativo e operacional.");
});

// Rota de comunicação com o robô
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    // Modelos e configurações vindos das variáveis do Render
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;

    console.log(`🧠 Modelo: ${model} | Temperatura: ${temperature}`);

    const completion = await openai.chat.completions.create({
      model,
      temperature,
      messages: [
        {
          role: "system",
          content:
            "Você é o QuantonBot3D, um assistente técnico e comercial especializado em impressão 3D por resina (SLA/DLP). Responda de forma técnica, educada e clara, ajudando profissionais e clientes da Quanton3D.",
        },
        { role: "user", content: message },
      ],
    });

    const reply = completion.choices[0].message.content;
    res.json({ reply });
  } catch (err) {
    console.error("❌ Erro na comunicação com a OpenAI:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao processar a IA. Tente novamente em instantes.",
    });
  }
});

// Configuração da porta Render
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`)
);
