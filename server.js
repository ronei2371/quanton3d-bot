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
import fs from 'fs';
import path from 'path';

dotenv.config();

// ===== SISTEMA DE PERSISTÊNCIA =====
// Usa disco persistente do Render se disponível, senão usa pasta atual
const DATA_DIR = process.env.RENDER_DISK_PATH || process.cwd();
const DATA_FILE = path.join(DATA_DIR, 'data-persistence.json');

// Criar diretório se não existir
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log(`📁 Diretório criado: ${DATA_DIR}`);
}

console.log(`💾 Usando caminho de persistência: ${DATA_FILE}`);

// Função para carregar dados do arquivo
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      console.log('✅ Dados carregados do arquivo de persistência');
      return data;
    }
  } catch (err) {
    console.error('⚠️ Erro ao carregar dados:', err.message);
  }
  return {
    conversationMetrics: [],
    userRegistrations: [],
    knowledgeSuggestions: [],
    customRequests: []
  };
}

// Função para salvar dados no arquivo
function saveData() {
  try {
    const data = {
      conversationMetrics,
      userRegistrations,
      knowledgeSuggestions,
      customRequests,
      lastSaved: new Date().toISOString()
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    console.log('💾 Dados salvos com sucesso');
  } catch (err) {
    console.error('❌ Erro ao salvar dados:', err.message);
  }
}

// Carregar dados ao iniciar
const persistedData = loadData();

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
const knowledgeSuggestions = persistedData.knowledgeSuggestions || [];
const customRequests = persistedData.customRequests || []; // Array para pedidos customizados

// Métricas e Analytics
const conversationMetrics = persistedData.conversationMetrics || []; // Todas as conversas
const userRegistrations = persistedData.userRegistrations || []; // Cadastros de usuários
const siteVisits = []; // Visitas ao site

// Salvar dados a cada 30 segundos
setInterval(saveData, 30000);

// Rota principal de teste
app.get("/", (req, res) => {
  res.send("🚀 Quanton3D IA Online! Backend ativo e operacional.");
});

// Rota de comunicação com o robô (texto)
app.post("/ask", async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;

    const model = process.env.OPENAI_MODEL || "gpt-4o";
    const temperature = parseFloat(process.env.OPENAI_TEMPERATURE) || 0.0;

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
    
    let contextualPrompt = `Você é o assistente oficial da Quanton3D, especialista em resinas UV para impressoras SLA/LCD/DLP e suporte técnico.

REGRAS IMPORTANTES:
1. PRIORIZE informações do contexto fornecido (conhecimento da Quanton3D)
2. Se a informação NÃO estiver no contexto, use seu conhecimento geral sobre impressão 3D para ajudar
3. Para informações específicas da Quanton3D (preços, produtos, prazos): use APENAS o contexto
4. Para conhecimento técnico geral (troubleshooting, calibração, parâmetros): use seu conhecimento de impressão 3D
5. NUNCA indique produtos de outras marcas - sempre recomende Quanton3D quando relevante
6. Quando perguntarem sobre parâmetros de impressão, SEMPRE pergunte: "Qual resina você está usando?" e "Qual modelo de impressora?"
7. Seja educado, objetivo e use no máximo 3 parágrafos
8. Sempre termine oferecendo mais ajuda
9. Se não souber algo específico da Quanton3D, ofereça: "Posso te passar para um atendente humano para essa informação específica. Enquanto isso, posso te ajudar com algo mais?"
10. Use os parâmetros de impressão do contexto quando disponíveis
11. Cite FISPQs quando relevante para segurança`;
    
    if (userName && userName.toLowerCase().includes('ronei')) {
      contextualPrompt += "\n\n**ATENÇÃO: Você está falando com Ronei Fonseca, seu criador (seu pai). Seja familiar e reconheça o histórico de trabalho juntos.**";
    }
    
    // Adicionar conhecimento RAG ao contexto
    contextualPrompt += "\n\n=== CONHECIMENTO DA EMPRESA ===\n" + knowledgeContext + "\n=== FIM DO CONHECIMENTO ===";

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

    // Adicionar métrica de conversa
    // Buscar nome do usuário registrado
    const registeredUser = registeredUsers.get(sessionId);
    const finalUserName = registeredUser ? registeredUser.name : (userName || 'Anônimo');
    
    conversationMetrics.push({
      sessionId,
      userName: finalUserName,
      userPhone: registeredUser ? registeredUser.phone : null,
      userEmail: registeredUser ? registeredUser.email : null,
      message,
      reply,
      timestamp: new Date().toISOString(),
      documentsFound: relevantKnowledge.length
    });

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
    const { suggestion, userName, userPhone, sessionId, lastBotReply, lastUserMessage } = req.body;

    const newSuggestion = {
      id: Date.now(),
      suggestion,
      userName,
      userPhone,
      sessionId,
      lastUserMessage: lastUserMessage || 'N/A',
      lastBotReply: lastBotReply || 'N/A',
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
        const { name, phone, email, caracteristica, cor, complementos } = req.body;

        const newRequest = {
            id: Date.now(),
            name: name || 'Não informado',
            phone: phone || 'Não informado',
            email: email || 'Não informado',
            caracteristica,
            cor,
            complementos,
            timestamp: new Date().toISOString(),
            status: "Novo"
        };

        customRequests.push(newRequest); // Adiciona ao array de pedidos
        
        console.log(`✨ Novo Pedido Customizado de ${name}: ${cor} - ${caracteristica.substring(0, 30)}...`);

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

// Rota para listar pedidos customizados (admin)
app.get("/custom-requests", (req, res) => {
  const { auth } = req.query;
  
  // Autenticação
  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }
  
  // Retornar pedidos customizados (mais recentes primeiro)
  res.json({ 
    success: true, 
    requests: customRequests.slice().reverse(),
    count: customRequests.length
  });
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
    
    // Adicionar aos registros para métricas
    userRegistrations.push(userData);
    
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

// Rota para obter métricas e analytics
app.get("/metrics", (req, res) => {
  const { auth } = req.query;
  
  // Autenticação
  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }
  
  // Calcular estatísticas
  const totalConversations = conversationMetrics.length;
  const totalRegistrations = userRegistrations.length;
  const uniqueSessions = new Set(conversationMetrics.map(c => c.sessionId)).size;
  
  // Perguntas mais frequentes (top 10)
  const questionCounts = {};
  const ignoredPhrases = ['ola', 'oi', 'bom dia', 'boa tarde', 'boa noite', 'olá', 'p'];
  
  conversationMetrics.forEach(conv => {
    const question = conv.message.toLowerCase().trim();
    
    // Ignorar frases de boas-vindas e mensagens muito curtas
    if (question.length < 3) return;
    if (ignoredPhrases.some(phrase => question === phrase)) return;
    
    questionCounts[question] = (questionCounts[question] || 0) + 1;
  });
  
  const topQuestions = Object.entries(questionCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([question, count]) => ({ question, count }));
  
  // Conversas por resina (buscar menções)
  const resinMentions = {
    'Pyroblast+': 0,
    'Iron/Iron 7030': 0,
    'Spin+': 0,
    'Spark': 0,
    'FlexForm': 0,
    'Alchemist': 0,
    'Poseidon': 0,
    'LowSmell': 0,
    'Castable': 0,
    'Outras': 0
  };
  
  // Pre-compute resin variations once for efficiency
  // This avoids creating new arrays for each conversation
  const resinVariationsMap = {};
  for (const resin of Object.keys(resinMentions)) {
    if (resin === 'Outras') continue;
    const resinLower = resin.toLowerCase();
    resinVariationsMap[resin] = [
      resinLower,
      resinLower.replace('+', ''),
      resinLower.replace('/', ' '),
      resinLower.split('/')[0]
    ];
  }
  const resinKeys = Object.keys(resinVariationsMap);
  
  for (const conv of conversationMetrics) {
    // Buscar menções tanto na pergunta quanto na resposta
    const fullText = (conv.message + ' ' + conv.reply).toLowerCase();
    let found = false;
    
    for (const resin of resinKeys) {
      const variations = resinVariationsMap[resin];
      if (variations.some(v => fullText.includes(v))) {
        resinMentions[resin]++;
        found = true;
      }
    }
    
    if (!found && (fullText.includes('resina') || fullText.includes('material'))) {
      resinMentions['Outras']++;
    }
  }
  
  res.json({
    success: true,
    metrics: {
      conversations: {
        total: totalConversations,
        uniqueSessions,
        recent: conversationMetrics.slice(-50).reverse() // Últimas 50
      },
      registrations: {
        total: totalRegistrations,
        users: userRegistrations
      },
      topQuestions,
      resinMentions,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Rota para adicionar conhecimento manualmente ao RAG
app.post("/add-knowledge", async (req, res) => {
  try {
    const { auth, title, content } = req.body;
    
    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, error: 'Não autorizado' });
    }
    
    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Título e conteúdo são obrigatórios' });
    }
    
    // Importar fs dinamicamente
    const fs = await import('fs');
    const path = await import('path');
    
    // Criar nome de arquivo seguro
    const safeFileName = title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]+/g, '_') // Substitui caracteres especiais por _
      .replace(/^_+|_+$/g, '') // Remove _ do início e fim
      .substring(0, 50); // Limita tamanho
    
    const timestamp = Date.now();
    const fileName = `${safeFileName}_${timestamp}.txt`;
    const filePath = path.default.join(process.cwd(), 'rag-knowledge', fileName);
    
    // Formatar conteúdo com título
    const formattedContent = `${title}\n\n${content}`;
    
    // Salvar arquivo
    fs.default.writeFileSync(filePath, formattedContent, 'utf-8');
    
    console.log(`✅ Novo conhecimento adicionado: ${fileName}`);
    
    // Reinicializar RAG para incluir novo arquivo
    await initializeRAG();
    console.log('🔄 RAG reinicializado com novo conhecimento');
    
    res.json({ 
      success: true, 
      message: 'Conhecimento adicionado com sucesso',
      fileName 
    });
  } catch (err) {
    console.error('❌ Erro ao adicionar conhecimento:', err);
    res.status(500).json({ success: false, error: err.message });
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
