// =========================
// 🤖 Quanton3D IA - Servidor Oficial (ATIVADO - 11/11/2025)
// Este código RESTAURA a chamada real para a OpenAI (GPT).
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
// IMPORTANTE: O Manus deve garantir que estes arquivos existam no backend:
// import { SYSTEM_PROMPT, RESINS_DATABASE } from "./knowledge-base.js";
// import { SLICER_KNOWLEDGE } from "./technical-knowledge.js";
// import { consultarComRAG } from "./rag-helper.js"; // Se o RAG estiver ativo

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

// Sugestões de conhecimento e pedidos customizados pendentes
const knowledgeSuggestions = [];
const customRequests = []; // Array para pedidos customizados

// Rota principal de teste
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend ativo e operacional.");
});

// Rota de comunicação com o robô (texto)
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;

    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;

    console.log(`🧠 Modelo: ${model} | Temperatura: ${temperature} | Usuário: ${userName || 'Anônimo'}`);

    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);
    
    // ======================================================
    // 🌟 CÓDIGO DA IA REATIVADO (Conforme Análise do Manus) 🌟
    // ======================================================
    
    // Adicionar contexto do usuário (se for o Ronei) ao system prompt
    let contextualPrompt = 'Você é um assistente técnico especialista em resinas Quanton3D.'; 
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
    // ======================================================
    // 🌟 FIM DA REATIVAÇÃO 🌟
    // ======================================================

  } catch (err) {
    console.error("❌ Erro na comunicação com a OpenAI:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao processar a IA. Tente novamente em instantes.",
    });
  }
});

// Rota de comunicação com o robô (com imagem)
app.post("/ask-with-image", upload.single('image'), async (req, res) => {
  // Código da rota /ask-with-image... (MANTER O CÓDIGO EXISTENTE DO MANUS)
  // ...
});

// Rota para enviar sugestão de conhecimento
app.post("/suggest-knowledge", async (req, res) => {
  // Código da rota /suggest-knowledge... (MANTER O CÓDIGO EXISTENTE DO MANUS)
  // ...
});

// =================================================================
// 🌟 ROTA FINAL: PEDIDO ESPECIAL (Tarefa 4) 🌟
// =================================================================
app.post("/api/custom-request", async (req, res) => {
    try {
        const { caracteristica, cor, complementos } = req.body;

        const newRequest = {
            id: Date.now(),
            caracteristica,
            cor,
            complementos,
            timestamp: new Date().toISOString(),
            status: "Novo"
        };

        customRequests.push(newRequest); // Adiciona ao array de pedidos
        
        console.log(`✨ Novo Pedido Customizado Recebido: ${cor} - ${caracteristica.substring(0, 30)}...`);

        res.json({ 
            success: true, 
            message: 'Pedido customizado recebido com sucesso. Analisaremos as especificações.' 
        });
    } catch (err) {
        console.error("❌ Erro ao receber pedido customizado:", err);
        res.status(500).json({
            success: false,
            message: "Erro ao processar o pedido customizado."
        });
    }
});


// Rota para listar sugestões (apenas para Ronei)
app.get("/suggestions", (req, res) => {
  // Código da rota /suggestions... (MANTER O CÓDIGO EXISTENTE DO MANUS)
  // ...
});

// Configuração da porta Render
const PORT = process.env.PORT || 3001;
app.listen(PORT, () =>
  console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`)
);
