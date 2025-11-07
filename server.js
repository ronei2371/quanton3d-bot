// =========================
// 🤖 Quanton3D IA - Servidor Oficial
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { SYSTEM_PROMPT, RESINS_DATABASE } from "./knowledge-base.js";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configuração do multer para upload de imagens
const storage = multer.memoryStorage();
const upload = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Conexão com a OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Histórico de conversas por sessão
const conversationHistory = new Map();

// Sugestões de conhecimento pendentes
const knowledgeSuggestions = [];

// Rota principal de teste
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend ativo e operacional.");
});

// Rota de comunicação com o robô (texto)
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;

    // Modelos e configurações vindos das variáveis do Render
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;

    console.log(`🧠 Modelo: ${model} | Temperatura: ${temperature} | Usuário: ${userName || 'Anônimo'}`);

    // Recuperar ou criar histórico da sessão
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // Adicionar contexto do usuário ao system prompt
    let contextualPrompt = SYSTEM_PROMPT;
    if (userName && userName.toLowerCase().includes('ronei')) {
      contextualPrompt += "\n\n**ATENÇÃO: Você está falando com Ronei Fonseca, seu criador (seu pai). Seja familiar e reconheça o histórico de trabalho juntos.**";
    }

    // Construir mensagens para a API
    const messages = [
      { role: "system", content: contextualPrompt },
      ...history,
      { role: "user", content: message }
    ];

    const completion = await openai.chat.completions.create({
      model,
      temperature,
      messages,
    });

    const reply = completion.choices[0].message.content;

    // Atualizar histórico
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    // Limitar histórico a últimas 20 mensagens
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.json({ reply });
  } catch (err) {
    console.error("❌ Erro na comunicação com a OpenAI:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao processar a IA. Tente novamente em instantes.",
    });
  }
});

// Rota de comunicação com o robô (com imagem)
app.post("/ask-with-image", upload.single('image'), async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;
    const imageBuffer = req.file?.buffer;

    if (!imageBuffer) {
      return res.status(400).json({ reply: "Nenhuma imagem foi enviada." });
    }

    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;

    console.log(`🧠 Análise de imagem | Modelo: ${model} | Usuário: ${userName || 'Anônimo'}`);

    // Converter imagem para base64
    const base64Image = imageBuffer.toString('base64');
    const imageUrl = `data:image/jpeg;base64,${base64Image}`;

    // Recuperar histórico
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    let contextualPrompt = SYSTEM_PROMPT + "\n\n**ANÁLISE DE IMAGEM: O usuário enviou uma foto de um problema de impressão 3D. Analise a imagem detalhadamente e forneça diagnóstico técnico preciso com soluções específicas.**";
    
    if (userName && userName.toLowerCase().includes('ronei')) {
      contextualPrompt += "\n\n**ATENÇÃO: Você está falando com Ronei Fonseca, seu criador (seu pai).**";
    }

    const messages = [
      { role: "system", content: contextualPrompt },
      ...history.slice(-10), // Últimas 5 interações para contexto
      {
        role: "user",
        content: [
          { type: "text", text: message || "Analise esta imagem de impressão 3D e identifique os problemas." },
          { type: "image_url", image_url: { url: imageUrl } }
        ]
      }
    ];

    const completion = await openai.chat.completions.create({
      model,
      temperature,
      messages,
    });

    const reply = completion.choices[0].message.content;

    // Atualizar histórico
    history.push({ role: "user", content: `[Imagem enviada] ${message || 'Análise de imagem'}` });
    history.push({ role: "assistant", content: reply });

    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.json({ reply });
  } catch (err) {
    console.error("❌ Erro na análise de imagem:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao analisar a imagem. Tente novamente.",
    });
  }
});

// Rota para enviar sugestão de conhecimento
app.post("/suggest-knowledge", async (req, res) => {
  try {
    const { suggestion, userName, userPhone, sessionId } = req.body;

    const newSuggestion = {
      id: Date.now(),
      suggestion,
      userName,
      userPhone,
      sessionId,
      timestamp: new Date().toISOString(),
      status: "pending"
    };

    knowledgeSuggestions.push(newSuggestion);

    console.log(`📝 Nova sugestão de conhecimento de ${userName}: ${suggestion.substring(0, 50)}...`);

    res.json({ 
      success: true, 
      message: "Sugestão enviada com sucesso! Será analisada pela equipe Quanton3D." 
    });
  } catch (err) {
    console.error("❌ Erro ao salvar sugestão:", err);
    res.status(500).json({
      success: false,
      message: "Erro ao enviar sugestão."
    });
  }
});

// Rota para listar sugestões (apenas para Ronei)
app.get("/suggestions", (req, res) => {
  const { auth } = req.query;
  
  // Verificação simples - em produção, usar autenticação adequada
  const adminSecret = process.env.ADMIN_SECRET || "quanton3d_admin_secret";
  if (auth !== adminSecret) {
    return res.status(403).json({ error: "Não autorizado" });
  }

  res.json({ suggestions: knowledgeSuggestions });
});

// Rota para obter informações de resinas
app.get("/resins", (req, res) => {
  res.json({ resins: RESINS_DATABASE });
});

// Rota para limpar histórico de uma sessão
app.post("/clear-history", (req, res) => {
  const { sessionId } = req.body;
  conversationHistory.delete(sessionId);
  res.json({ success: true });
});

// Configuração da porta Render
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`)
);
