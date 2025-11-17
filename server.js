// =========================
// 🤖 Quanton3D IA - Servidor Oficial (ATIVADO - 11/11/2025)
// Este código RESTAURA a chamada real para a OpenAI (GPT) e remove o código de teste.
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { initializeRAG, searchKnowledge, formatContext } from './rag-search.js';

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
    // 🌟 CÓDIGO DA IA REATIVADO 🌟
    // ======================================================
    
    // 🔍 BUSCAR CONHECIMENTO RELEVANTE (RAG)
    console.log('🔍 Buscando conhecimento relevante...');
    const relevantKnowledge = await searchKnowledge(message, 3);
    const knowledgeContext = formatContext(relevantKnowledge);
    console.log(`✅ Encontrados ${relevantKnowledge.length} documentos relevantes`);
    
    let contextualPrompt = 'Você é um assistente técnico especialista em resinas Quanton3D.'; 
    if (userName && userName.toLowerCase().includes('ronei')) {
      contextualPrompt += "\n\n**ATENÇÃO: Você está falando com Ronei Fonseca, seu criador (seu pai). Seja familiar e reconheça o histórico de trabalho juntos.**";
    }
    
    // Adicionar conhecimento RAG ao contexto
    contextualPrompt += knowledgeContext;

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

  } catch (err) {
    console.error("❌ Erro na comunicação com a OpenAI:", err);
    res.status(500).json({
      reply: "⚠️ Erro ao processar a IA. Tente novamente em instantes.",
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

// ROTA FINAL: PEDIDO ESPECIAL (Tarefa 4)
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


// Banco de dados de usuários registrados
const registeredUsers = new Map();

// Rota para registrar usuário
app.post("/register-user", async (req, res) => {
  try {
    const { name, phone, email, sessionId } = req.body;
    
    const userData = {
      name,
      phone,
      email,
      sessionId,
      registeredAt: new Date().toISOString()
    };
    
    registeredUsers.set(sessionId, userData);
    console.log(`👤 Novo usuário registrado: ${name} (${email})`);
    
    res.json({ success: true, message: 'Usuário registrado com sucesso!' });
  } catch (err) {
    console.error("❌ Erro ao registrar usuário:", err);
    res.status(500).json({ success: false, message: "Erro ao registrar usuário." });
  }
});

// Rota para perguntas com imagem
app.post("/ask-with-image", upload.single('image'), async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    const imageFile = req.file;
    
    if (!imageFile) {
      return res.status(400).json({ success: false, message: "Nenhuma imagem foi enviada." });
    }
    
    // Converter imagem para base64
    const base64Image = imageFile.buffer.toString('base64');
    const imageUrl = `data:${imageFile.mimetype};base64,${base64Image}`;
    
    const model = process.env.OPENAI_MODEL || "gpt-4o";
    
    // Buscar histórico da sessão
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);
    
    // Adicionar mensagem com imagem ao histórico
    history.push({
      role: "user",
      content: [
        { type: "text", text: message || "Analise esta imagem relacionada a impressão 3D com resina" },
        { type: "image_url", image_url: { url: imageUrl } }
      ]
    });
    
    // Chamar OpenAI com visão
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "Você é um especialista em impressão 3D com resina UV SLA. Analise imagens de peças impressas, problemas de impressão, e forneça diagnósticos precisos e soluções."
        },
        ...history
      ],
      max_tokens: 1000,
    });
    
    const reply = response.choices[0].message.content;
    
    // Adicionar resposta ao histórico
    history.push({ role: "assistant", content: reply });
    
    // Limitar histórico
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    
    console.log(`📷 Análise de imagem para sessão ${sessionId}`);
    
    res.json({ success: true, reply });
  } catch (err) {
    console.error("❌ Erro ao processar imagem:", err);
    res.status(500).json({ success: false, message: "Erro ao analisar imagem." });
  }
});

// Rota para listar sugestões (apenas para Ronei)
app.get("/suggestions", (req, res) => {
  const { auth } = req.query;
  
  // Autenticação simples
  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }
  
  // Retornar sugestões
  res.json({ 
    success: true, 
    suggestions: knowledgeSuggestions,
    count: knowledgeSuggestions.length
  });
});

// Configuração da porta Render
const PORT = process.env.PORT || 3001;

// Inicializar RAG antes de iniciar o servidor
console.log('🚀 Inicializando sistema RAG...');
initializeRAG().then(() => {
  console.log('✅ RAG inicializado com sucesso!');
  app.listen(PORT, () => {
    console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`);
    console.log('🤖 Bot com RAG ativado e pronto para uso!');
  });
}).catch(err => {
  console.error('❌ Erro ao inicializar RAG:', err);
  console.log('⚠️ Servidor iniciando SEM RAG...');
  app.listen(PORT, () =>
    console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT} (sem RAG)`)
  );
});
