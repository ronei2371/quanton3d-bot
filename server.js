// =========================
// 🤖 Quanton3D IA - Servidor Oficial (Atualizado: 11/11/2025)
// Este código inclui o novo endpoint /api/custom-request para o formulário.
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
const customRequests = []; // Novo array para pedidos customizados

// Rota principal de teste
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend ativo e operacional.");
});

// Rota de comunicação com o robô (texto)
app.post("/ask", async (req, res) => {
  // Código da rota /ask... (MANTER O CÓDIGO EXISTENTE DO MANUS)
  try {
    const { message, sessionId, userName } = req.body;

    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.3;

    console.log(`🧠 Modelo: ${model} | Temperatura: ${temperature} | Usuário: ${userName || 'Anônimo'}`);

    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // Substitua a lógica do SYSTEM_PROMPT e da chamada à OpenAI aqui
    // ... (O Manus deve garantir que o código que ele já escreveu está aqui) ...

    // --- Versão Simples (Se o Manus não tiver o código da IA ainda):
    const reply = `Olá, ${userName || 'Usuário'}! Seu backend está funcionando, mas a IA está desativada para testes. Sua mensagem foi: "${message}"`;

    // Atualizar histórico
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    res.json({ reply });
    // --- Fim Versão Simples ---

  } catch (err) {
    console.error("❌ Erro na comunicação com a OpenAI:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao processar a IA. Tente novamente em instantes.",
    });
  }
});

// Rota para enviar sugestão de conhecimento
app.post("/suggest-knowledge", async (req, res) => {
  // Código da rota /suggest-knowledge... (MANTER O CÓDIGO EXISTENTE DO MANUS)
  // ... (O Manus deve manter o código que ele já escreveu aqui) ...
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

// =================================================================
// 🌟 CORREÇÃO #1: NOVO ENDPOINT DE PEDIDO ESPECIAL (Tarefa 4) 🌟
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
        
        // (Futuramente, o Manus pode adicionar lógica para salvar em um arquivo JSON aqui)

        console.log(`✨ Novo Pedido Customizado Recebido: ${cor} - ${caracteristica.substring(0, 30)}...`);

        res.json({ 
            success: true, 
            message: "Pedido customizado recebido com sucesso. Analisaremos as especificações." 
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
