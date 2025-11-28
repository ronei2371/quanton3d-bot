// =========================
// 🤖 Quanton3D IA - Servidor Oficial (ATIVADO - 11/11/2025)
// Este código RESTAURA a chamada real para a OpenAI (GPT) e remove o código de teste.
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { initializeRAG, searchKnowledge, formatContext, addDocument } from './rag-search.js';
import { connectToMongo, getMessagesCollection } from './db.js';
import {
  analyzeQuestionType,
  extractEntities,
  generateIntelligentContext,
  learnFromConversation,
  generateSmartSuggestions,
  analyzeSentiment,
  personalizeResponse,
  calculateIntelligenceMetrics
} from './ai-intelligence-system.js';

dotenv.config();

// ===== PERSISTENCIA APENAS VIA MONGODB =====
// Removido sistema de arquivos locais - usar APENAS MongoDB via process.env.MONGODB_URI
console.log('🔧 Sistema configurado para usar APENAS MongoDB para persistencia');

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

// Sugestões de conhecimento e pedidos customizados pendentes (em memoria - persistidos via MongoDB)
const knowledgeSuggestions = [];
const customRequests = [];

// Métricas e Analytics (em memoria - persistidos via MongoDB)
const conversationMetrics = [];
const userRegistrations = [];
const siteVisits = [];

// NOTA: Dados sao persistidos via MongoDB, nao mais em arquivos locais

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
    // 🚀 SISTEMA DE INTELIGÊNCIA AVANÇADA ATIVADO 🚀
    // ======================================================

    console.log('🔬 Analisando pergunta com IA avançada...');

    // 1. ANÁLISE INTELIGENTE DA PERGUNTA
    const questionType = analyzeQuestionType(message);
    const entities = extractEntities(message);
    const sentiment = analyzeSentiment(message);

    console.log(`📊 Tipo: ${questionType.type} (${(questionType.confidence * 100).toFixed(1)}%)`);
    console.log(`🏷️ Entidades: Resinas[${entities.resins.join(',')}] Problemas[${entities.problems.join(',')}]`);
    console.log(`😊 Sentimento: ${sentiment.sentiment} | Urgência: ${sentiment.urgency}`);

    // 2. BUSCAR CONHECIMENTO RELEVANTE (RAG INTELIGENTE)
    console.log('🔍 Buscando conhecimento relevante...');
    const relevantKnowledge = await searchKnowledge(message, 5); // Aumentado para 5 documentos
    const knowledgeContext = formatContext(relevantKnowledge);
    console.log(`✅ Encontrados ${relevantKnowledge.length} documentos relevantes`);

    // 3. GERAR CONTEXTO INTELIGENTE
    const intelligentContext = await generateIntelligentContext(message, questionType, entities, history);

    // 4. PERSONALIZAÇÃO DA RESPOSTA
    const personalization = personalizeResponse(userName, history, sentiment);

    // 5. CONSTRUIR PROMPT AVANÇADO COM INTELIGÊNCIA
    let contextualPrompt = `Você é o assistente oficial da Quanton3D, especialista em resinas UV para impressoras SLA/LCD/DLP e suporte técnico.

🎯 CONTEXTO INTELIGENTE:
${intelligentContext}

💡 PERSONALIZAÇÃO:
${personalization}

📊 ANÁLISE DA PERGUNTA:
- Tipo: ${questionType.type} (${(questionType.confidence * 100).toFixed(1)}% confiança)
- Sentimento: ${sentiment.sentiment} | Urgência: ${sentiment.urgency}
- Resinas mencionadas: ${entities.resins.join(', ') || 'Nenhuma'}
- Impressoras mencionadas: ${entities.printers.join(', ') || 'Nenhuma'}
- Problemas identificados: ${entities.problems.join(', ') || 'Nenhum'}

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

    // 6. AJUSTAR TEMPERATURA BASEADA NO TIPO DE PERGUNTA
    // Temperatura baixa (0.05-0.1) para respostas precisas e sem criatividade
    let adjustedTemperature = 0.1; // Base: precisao maxima
    if (questionType.type === 'parameters' || questionType.type === 'safety') {
      adjustedTemperature = 0.05; // Ultra preciso para parametros e seguranca
    } else if (questionType.type === 'comparison' || questionType.type === 'product') {
      adjustedTemperature = 0.1; // Ainda preciso para comparacoes
    }

    console.log(`🎛️ Temperatura ajustada: ${adjustedTemperature} (tipo: ${questionType.type})`);

    const completion = await openai.chat.completions.create({
      model,
      temperature: adjustedTemperature,
      messages,
    });

    let reply = completion.choices[0].message.content;

    // 7. GERAR SUGESTÕES INTELIGENTES
    const smartSuggestions = generateSmartSuggestions(message, entities, questionType);
    if (smartSuggestions.length > 0 && Math.random() < 0.3) { // 30% chance de mostrar sugestões
      reply += "\n\n💡 " + smartSuggestions[0];
    }

    // Atualizar histórico
    history.push({ role: "user", content: message });
    history.push({ role: "assistant", content: reply });

    // Limitar histórico a últimas 20 mensagens
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // 8. APRENDIZADO CONTÍNUO
    learnFromConversation(message, reply, entities, questionType);

    // 9. CALCULAR MÉTRICAS DE INTELIGÊNCIA
    const intelligenceMetrics = calculateIntelligenceMetrics(message, reply, entities, questionType, relevantKnowledge);

    // 10. ADICIONAR MÉTRICA DE CONVERSA AVANÇADA
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
      documentsFound: relevantKnowledge.length,
      // Métricas de inteligência
      questionType: questionType.type,
      questionConfidence: questionType.confidence,
      entitiesDetected: entities,
      sentiment: sentiment.sentiment,
      urgency: sentiment.urgency,
      intelligenceMetrics,
      adjustedTemperature
    });

    console.log(`🎉 Resposta inteligente gerada! Tipo: ${questionType.type}, Relevância: ${(intelligenceMetrics.contextRelevance * 100).toFixed(1)}%`);

    res.json({
      reply,
      // Dados adicionais para debugging (opcional)
      intelligence: {
        questionType: questionType.type,
        confidence: questionType.confidence,
        entities,
        sentiment: sentiment.sentiment,
        documentsFound: relevantKnowledge.length,
        relevanceScore: intelligenceMetrics.contextRelevance
      }
    });
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

// Rota para perguntas com imagem - VISION-TO-RAG FLOW
// Fluxo: 1) GPT-4o Vision analisa imagem -> 2) Busca no RAG -> 3) Resposta baseada em conhecimento Quanton3D
app.post("/ask-with-image", upload.single('image'), async (req, res) => {
  try {
    const { message, sessionId, userName } = req.body;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ success: false, message: "Nenhuma imagem foi enviada." });
    }

    console.log(`📷 [VISION-TO-RAG] Iniciando análise de imagem para sessão ${sessionId}`);

    // Converter imagem para base64
    const base64Image = imageFile.buffer.toString('base64');
    const imageUrl = `data:${imageFile.mimetype};base64,${base64Image}`;

    const model = process.env.OPENAI_MODEL || "gpt-4o";

    // Buscar histórico da sessão
    if (!conversationHistory.has(sessionId)) {
      conversationHistory.set(sessionId, []);
    }
    const history = conversationHistory.get(sessionId);

    // ======================================================
    // 🔍 PASSO 1: ANÁLISE DA IMAGEM COM GPT-4o VISION
    // Objetivo: Obter descrição TEXTUAL do problema/objeto
    // ======================================================
    console.log('🔍 [PASSO 1] Analisando imagem com GPT-4o Vision...');

    const visionResponse = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: `Você é um especialista técnico em impressão 3D com resina UV SLA da Quanton3D.

TAREFA: Analise a imagem e forneça uma DESCRIÇÃO TÉCNICA DETALHADA do que você vê.

INSTRUÇÕES:
1. Descreva APENAS o que você observa na imagem (defeitos, aparência, características da peça)
2. NÃO dê soluções ou recomendações ainda - apenas descreva o problema
3. NÃO mencione marcas de resina específicas na descrição
4. Se a imagem NÃO estiver relacionada a impressão 3D com resina, diga explicitamente: "Esta imagem não parece estar relacionada a impressão 3D com resina."
5. Seja objetivo e técnico na descrição

FORMATO DA RESPOSTA:
- Tipo de objeto/peça (se identificável)
- Problemas visíveis (rachaduras, falhas de aderência, deformações, etc.)
- Características da superfície
- Qualquer outro detalhe técnico relevante`
        },
        {
          role: "user",
          content: [
            { type: "text", text: message || "Analise esta imagem relacionada a impressão 3D com resina e descreva o que você vê." },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500,
    });

    const imageDescription = visionResponse.choices[0].message.content;
    console.log(`✅ [PASSO 1] Descrição da imagem: ${imageDescription.substring(0, 100)}...`);

    // Verificar se a imagem é relacionada a impressão 3D
    const isUnrelated = imageDescription.toLowerCase().includes('não parece estar relacionada') ||
                        imageDescription.toLowerCase().includes('não está relacionada') ||
                        imageDescription.toLowerCase().includes('não é relacionada');

    if (isUnrelated) {
      console.log('⚠️ Imagem não relacionada a impressão 3D detectada');
      const unrelatedReply = "Essa imagem não parece estar relacionada a impressão 3D com resina. Meu foco é suporte técnico para resinas Quanton3D e impressão 3D SLA/LCD/DLP. Posso te ajudar com alguma dúvida sobre impressão 3D com resina?";
      
      // Adicionar ao histórico como texto simples
      history.push({ role: "user", content: message || "(imagem enviada)" });
      history.push({ role: "assistant", content: unrelatedReply });
      
      return res.json({ success: true, reply: unrelatedReply });
    }

    // ======================================================
    // 🔍 PASSO 2: BUSCA NO RAG COM A DESCRIÇÃO DA IMAGEM
    // Objetivo: Encontrar conhecimento relevante da Quanton3D
    // ======================================================
    console.log('🔍 [PASSO 2] Buscando conhecimento relevante no RAG...');

    // Combinar mensagem do usuário com descrição da imagem para busca mais precisa
    const combinedText = (message ? `Relato do usuário: ${message}\n\n` : '') +
                         `Descrição da imagem (analisada pela IA): ${imageDescription}`;

    // Extrair entidades e analisar tipo de pergunta
    const entities = extractEntities(combinedText);
    const questionType = analyzeQuestionType(combinedText);
    const sentiment = analyzeSentiment(combinedText);

    console.log(`📊 Tipo: ${questionType.type} | Entidades: Resinas[${entities.resins.join(',')}] Problemas[${entities.problems.join(',')}]`);

    // Buscar conhecimento relevante no RAG
    let relevantKnowledge = [];
    let knowledgeContext = '';
    
    try {
      relevantKnowledge = await searchKnowledge(combinedText, 5);
      knowledgeContext = formatContext(relevantKnowledge);
      console.log(`✅ [PASSO 2] Encontrados ${relevantKnowledge.length} documentos relevantes`);
    } catch (ragError) {
      console.error('⚠️ Erro ao buscar no RAG:', ragError.message);
      knowledgeContext = '(Base de conhecimento temporariamente indisponível)';
    }

    // Verificar se encontrou conhecimento relevante
    const hasRelevantKnowledge = relevantKnowledge.length > 0 && 
                                  relevantKnowledge[0].similarity > 0.2;

    // ======================================================
    // 🎯 PASSO 3: GERAR RESPOSTA BASEADA NO RAG
    // Objetivo: Resposta usando EXCLUSIVAMENTE conhecimento Quanton3D
    // ======================================================
    console.log('🎯 [PASSO 3] Gerando resposta baseada no conhecimento Quanton3D...');

    const ragSystemPrompt = `Você é o assistente oficial da Quanton3D, especialista em resinas UV para impressoras SLA/LCD/DLP.

REGRAS ABSOLUTAS:
1. Use EXCLUSIVAMENTE o conhecimento técnico fornecido no contexto abaixo (documentos da Quanton3D).
2. NÃO use conhecimento genérico da internet ou do seu próprio treinamento para dados técnicos (parâmetros, propriedades, marcas, etc).
3. Se a informação necessária NÃO estiver claramente no contexto, diga explicitamente:
   - "Para este caso específico, recomendo entrar em contato com o suporte técnico da Quanton3D para uma análise mais detalhada."
   - E dê apenas orientações gerais seguras (sem inventar parâmetros).
4. Não invente propriedades, valores de tempo de exposição ou características de resinas que não apareçam no contexto.
5. Sempre mantenha o foco em resinas Quanton3D e impressão 3D com resina.
6. NUNCA recomende produtos de outras marcas.
7. Quando mencionar parâmetros de impressão, eles DEVEM corresponder a valores presentes no contexto.
8. Seja educado, objetivo e use no máximo 3 parágrafos.
9. Sempre termine oferecendo mais ajuda.

${hasRelevantKnowledge ? '' : '⚠️ ATENÇÃO: Poucos documentos relevantes encontrados. Seja conservador nas recomendações e sugira contato com suporte humano se necessário.'}

=== CONHECIMENTO DA QUANTON3D ===
${knowledgeContext}
=== FIM DO CONHECIMENTO ===

DESCRIÇÃO DO PROBLEMA (baseada na análise da imagem):
${combinedText}`;

    // Gerar resposta final baseada no RAG (chamada TEXT-ONLY, sem imagem)
    const finalResponse = await openai.chat.completions.create({
      model: model,
      temperature: 0.0, // Temperatura zero para máxima precisão
      messages: [
        { role: "system", content: ragSystemPrompt },
        { role: "user", content: "Com base APENAS no conhecimento da Quanton3D fornecido, analise o problema descrito e forneça recomendações técnicas específicas." }
      ],
      max_tokens: 1000,
    });

    let reply = finalResponse.choices[0].message.content;

    // Adicionar nota sobre análise de imagem se relevante
    if (!hasRelevantKnowledge) {
      reply += "\n\n💡 *Dica: Para uma análise mais precisa, me informe qual resina Quanton3D você está usando e qual modelo de impressora.*";
    }

    // ======================================================
    // 📝 PASSO 4: ATUALIZAR HISTÓRICO E MÉTRICAS
    // ======================================================
    
    // Adicionar ao histórico como texto (não multimodal) para consistência
    history.push({ 
      role: "user", 
      content: `${message || '(imagem enviada)'}\n[Análise da imagem: ${imageDescription.substring(0, 200)}...]` 
    });
    history.push({ role: "assistant", content: reply });

    // Limitar histórico
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }

    // Calcular métricas de inteligência
    const intelligenceMetrics = calculateIntelligenceMetrics(combinedText, reply, entities, questionType, relevantKnowledge);

    // Registrar métrica de conversa com imagem
    const registeredUser = registeredUsers.get(sessionId);
    const finalUserName = registeredUser ? registeredUser.name : (userName || 'Anônimo');

    conversationMetrics.push({
      sessionId,
      userName: finalUserName,
      userPhone: registeredUser ? registeredUser.phone : null,
      userEmail: registeredUser ? registeredUser.email : null,
      message: message || '(imagem enviada)',
      reply,
      timestamp: new Date().toISOString(),
      documentsFound: relevantKnowledge.length,
      // Métricas específicas de imagem
      isImageAnalysis: true,
      imageDescription: imageDescription.substring(0, 500),
      questionType: questionType.type,
      questionConfidence: questionType.confidence,
      entitiesDetected: entities,
      sentiment: sentiment.sentiment,
      urgency: sentiment.urgency,
      intelligenceMetrics,
      hasRelevantKnowledge
    });

    console.log(`🎉 [VISION-TO-RAG] Resposta gerada com sucesso! Docs: ${relevantKnowledge.length}, Relevância: ${hasRelevantKnowledge ? 'Alta' : 'Baixa'}`);

    res.json({ 
      success: true, 
      reply,
      // Dados adicionais para debugging (opcional)
      visionToRag: {
        imageAnalyzed: true,
        documentsFound: relevantKnowledge.length,
        hasRelevantKnowledge,
        questionType: questionType.type,
        entitiesDetected: entities
      }
    });

  } catch (err) {
    console.error("❌ Erro ao processar imagem com Vision-to-RAG:", err);
    res.status(500).json({ success: false, message: "Erro ao analisar imagem. Tente novamente." });
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

  conversationMetrics.forEach(conv => {
    // Buscar menções tanto na pergunta quanto na resposta
    const fullText = (conv.message + ' ' + conv.reply).toLowerCase();
    let found = false;

    Object.keys(resinMentions).forEach(resin => {
      const resinLower = resin.toLowerCase();
      // Buscar variações do nome
      const variations = [
        resinLower,
        resinLower.replace('+', ''),
        resinLower.replace('/', ' '),
        resinLower.split('/')[0] // Primeiro nome (ex: "iron" de "iron/iron 7030")
      ];

      if (variations.some(v => fullText.includes(v))) {
        resinMentions[resin]++;
        found = true;
      }
    });

    if (!found && (fullText.includes('resina') || fullText.includes('material'))) {
      resinMentions['Outras']++;
    }
  });

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

// ===== NOVAS ROTAS DE APROVAÇÃO =====

// Função para logging de operacoes (apenas console - sem arquivos locais)
function logOperation(operation, details) {
  const logEntry = `${new Date().toISOString()} - ${operation}: ${JSON.stringify(details)}`;
  console.log(`📝 [LOG] ${logEntry}`);
}

// Rota para aprovar sugestão
app.put("/approve-suggestion/:id", async (req, res) => {
  try {
    const { auth } = req.body;
    const suggestionId = parseInt(req.params.id);

    console.log(`🔍 Tentativa de aprovação da sugestão ID: ${suggestionId}`);

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      console.log('❌ Tentativa de acesso não autorizado');
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    // Encontrar sugestão
    const suggestionIndex = knowledgeSuggestions.findIndex(s => s.id === suggestionId);
    if (suggestionIndex === -1) {
      console.log(`❌ Sugestão ${suggestionId} não encontrada`);
      return res.status(404).json({ success: false, message: 'Sugestão não encontrada' });
    }

    const suggestion = knowledgeSuggestions[suggestionIndex];
    console.log(`📝 Aprovando sugestão de ${suggestion.userName}: ${suggestion.suggestion.substring(0, 50)}...`);

    // Formatar conteúdo com metadados para o MongoDB
    const documentTitle = `Sugestao Aprovada - ${suggestion.userName} - ${suggestionId}`;
    const formattedContent = `SUGESTAO APROVADA - ${suggestion.userName}
Data da Sugestao: ${suggestion.timestamp}
Data de Aprovacao: ${new Date().toISOString()}
Usuario: ${suggestion.userName}
Telefone: ${suggestion.userPhone || 'N/A'}

CONTEUDO DA SUGESTAO:
${suggestion.suggestion}

CONTEXTO DA CONVERSA:
Ultima mensagem do usuario: ${suggestion.lastUserMessage}
Ultima resposta do bot: ${suggestion.lastBotReply}`;

    // Adicionar documento ao MongoDB via RAG
    console.log('📝 Adicionando conhecimento ao MongoDB...');
    const addResult = await addDocument(documentTitle, formattedContent, 'suggestion');
    console.log(`✅ Documento adicionado ao MongoDB: ${addResult.documentId}`);

    // Atualizar status da sugestão
    knowledgeSuggestions[suggestionIndex].status = 'approved';
    knowledgeSuggestions[suggestionIndex].approvedAt = new Date().toISOString();
    knowledgeSuggestions[suggestionIndex].documentId = addResult.documentId.toString();
    knowledgeSuggestions[suggestionIndex].approvedBy = 'admin';

    console.log('✅ Conhecimento integrado ao RAG com sucesso!');

    // Log da operação
    logOperation('APPROVE_SUGGESTION', {
      suggestionId,
      userName: suggestion.userName,
      documentId: addResult.documentId.toString(),
      timestamp: new Date().toISOString()
    });

    console.log(`🎉 Sugestão ${suggestionId} aprovada com sucesso!`);

    res.json({
      success: true,
      message: 'Sugestão aprovada e conhecimento adicionado ao MongoDB com sucesso!',
      documentId: addResult.documentId.toString(),
      suggestionId,
      approvedAt: new Date().toISOString()
    });
  } catch (err) {
    console.error(`❌ Erro ao aprovar sugestão ${req.params.id}:`, err);

    // Log do erro
    logOperation('APPROVE_SUGGESTION_ERROR', {
      suggestionId: req.params.id,
      error: err.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: 'Erro interno ao aprovar sugestão',
      message: 'Tente novamente. Se o problema persistir, verifique os logs.'
    });
  }
});

// Rota para rejeitar sugestão
app.put("/reject-suggestion/:id", async (req, res) => {
  try {
    const { auth, reason } = req.body;
    const suggestionId = parseInt(req.params.id);

    console.log(`🔍 Tentativa de rejeição da sugestão ID: ${suggestionId}`);

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      console.log('❌ Tentativa de acesso não autorizado');
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    // Encontrar sugestão
    const suggestionIndex = knowledgeSuggestions.findIndex(s => s.id === suggestionId);
    if (suggestionIndex === -1) {
      console.log(`❌ Sugestão ${suggestionId} não encontrada`);
      return res.status(404).json({ success: false, message: 'Sugestão não encontrada' });
    }

    const suggestion = knowledgeSuggestions[suggestionIndex];
    console.log(`❌ Rejeitando sugestão de ${suggestion.userName}: ${suggestion.suggestion.substring(0, 50)}...`);

    // Atualizar status da sugestão
    knowledgeSuggestions[suggestionIndex].status = 'rejected';
    knowledgeSuggestions[suggestionIndex].rejectedAt = new Date().toISOString();
    knowledgeSuggestions[suggestionIndex].rejectionReason = reason || 'Não especificado';
    knowledgeSuggestions[suggestionIndex].rejectedBy = 'admin';

    // Log da operação
    logOperation('REJECT_SUGGESTION', {
      suggestionId,
      userName: suggestion.userName,
      reason: reason || 'Não especificado',
      timestamp: new Date().toISOString()
    });

    console.log(`❌ Sugestão ${suggestionId} rejeitada com sucesso!`);

    res.json({
      success: true,
      message: 'Sugestão rejeitada com sucesso!',
      suggestionId,
      rejectedAt: new Date().toISOString(),
      reason: reason || 'Não especificado'
    });
  } catch (err) {
    console.error(`❌ Erro ao rejeitar sugestão ${req.params.id}:`, err);

    // Log do erro
    logOperation('REJECT_SUGGESTION_ERROR', {
      suggestionId: req.params.id,
      error: err.message,
      timestamp: new Date().toISOString()
    });

    res.status(500).json({
      success: false,
      error: 'Erro interno ao rejeitar sugestão',
      message: 'Tente novamente. Se o problema persistir, verifique os logs.'
    });
  }
});

// Rota para verificar integridade do RAG
app.get("/rag-status", async (req, res) => {
  try {
    const { auth } = req.query;

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    const knowledgeDir = path.join(process.cwd(), 'rag-knowledge');
    const files = fs.readdirSync(knowledgeDir).filter(f => f.endsWith('.txt'));
    const dbPath = path.join(process.cwd(), 'embeddings-database.json');

    let databaseStatus = 'not_found';
    let databaseCount = 0;

    if (fs.existsSync(dbPath)) {
      try {
        const database = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
        databaseCount = database.length;
        databaseStatus = 'loaded';
      } catch (err) {
        databaseStatus = 'corrupted';
      }
    }

    const status = {
      knowledgeFiles: files.length,
      databaseEntries: databaseCount,
      databaseStatus,
      isHealthy: files.length === databaseCount && databaseStatus === 'loaded',
      lastCheck: new Date().toISOString()
    };

    console.log('🔍 Status do RAG verificado:', status);

    res.json({
      success: true,
      status
    });
  } catch (err) {
    console.error('❌ Erro ao verificar status do RAG:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para estatísticas de inteligência
app.get("/intelligence-stats", (req, res) => {
  try {
    const { auth } = req.query;

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    // Filtrar conversas com métricas de inteligência
    const intelligentConversations = conversationMetrics.filter(conv => conv.questionType);

    if (intelligentConversations.length === 0) {
      return res.json({
        success: true,
        message: 'Nenhuma conversa com métricas de inteligência encontrada',
        stats: null
      });
    }

    // Calcular estatísticas
    const questionTypes = {};
    const sentiments = { positive: 0, negative: 0, neutral: 0 };
    const urgencyLevels = { normal: 0, high: 0 };
    let totalRelevance = 0;
    let totalEntities = 0;

    intelligentConversations.forEach(conv => {
      // Tipos de pergunta
      questionTypes[conv.questionType] = (questionTypes[conv.questionType] || 0) + 1;

      // Sentimentos
      sentiments[conv.sentiment] = (sentiments[conv.sentiment] || 0) + 1;

      // Urgência
      urgencyLevels[conv.urgency] = (urgencyLevels[conv.urgency] || 0) + 1;

      // Relevância média
      if (conv.intelligenceMetrics && conv.intelligenceMetrics.contextRelevance) {
        totalRelevance += conv.intelligenceMetrics.contextRelevance;
      }

      // Entidades detectadas
      if (conv.entitiesDetected) {
        totalEntities += Object.values(conv.entitiesDetected).flat().length;
      }
    });

    const stats = {
      totalIntelligentConversations: intelligentConversations.length,
      questionTypes,
      sentiments,
      urgencyLevels,
      averageRelevance: totalRelevance / intelligentConversations.length,
      averageEntitiesPerConversation: totalEntities / intelligentConversations.length,
      lastUpdated: new Date().toISOString(),
      recentConversations: intelligentConversations.slice(-10).map(conv => ({
        timestamp: conv.timestamp,
        questionType: conv.questionType,
        sentiment: conv.sentiment,
        entitiesCount: Object.values(conv.entitiesDetected || {}).flat().length,
        relevance: conv.intelligenceMetrics?.contextRelevance || 0
      }))
    };

    console.log('📊 Estatísticas de inteligência calculadas');

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('❌ Erro ao calcular estatísticas de inteligência:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== ENDPOINT FALE CONOSCO (MongoDB) =====
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, message, source } = req.body;

    console.log(`📧 Nova mensagem de contato de: ${name || 'Anonimo'}`);

    // Validacao basica
    if (!message || message.trim().length < 5) {
      return res.status(400).json({
        success: false,
        error: 'Mensagem muito curta. Por favor, descreva sua duvida ou solicitacao.'
      });
    }

    if (!email && !phone) {
      return res.status(400).json({
        success: false,
        error: 'Por favor, informe um email ou telefone para contato.'
      });
    }

    // Salvar no MongoDB
    const messagesCollection = getMessagesCollection();
    const contactMessage = {
      name: name || 'Anonimo',
      email: email || null,
      phone: phone || null,
      message: message.trim(),
      source: source || 'site-form',
      status: 'new',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await messagesCollection.insertOne(contactMessage);

    console.log(`✅ Mensagem salva no MongoDB: ${result.insertedId}`);

    // Log da operacao
    logOperation('CONTACT_MESSAGE', {
      messageId: result.insertedId.toString(),
      name: contactMessage.name,
      hasEmail: !!email,
      hasPhone: !!phone,
      timestamp: new Date().toISOString()
    });

    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso! Entraremos em contato em breve.',
      messageId: result.insertedId.toString()
    });
  } catch (err) {
    console.error('❌ Erro ao salvar mensagem de contato:', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao enviar mensagem. Tente novamente.'
    });
  }
});

// Rota para listar mensagens de contato (admin)
app.get("/api/contact", async (req, res) => {
  try {
    const { auth } = req.query;

    // Autenticacao
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const messagesCollection = getMessagesCollection();
    const messages = await messagesCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(100)
      .toArray();

    res.json({
      success: true,
      messages,
      count: messages.length
    });
  } catch (err) {
    console.error('❌ Erro ao listar mensagens:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Configuração da porta Render
const PORT = process.env.PORT || 3001;

// Inicializar MongoDB e RAG antes de iniciar o servidor
async function startServer() {
  try {
    console.log('🚀 Conectando ao MongoDB...');
    await connectToMongo();
    console.log('✅ MongoDB conectado com sucesso!');

    console.log('🚀 Inicializando sistema RAG...');
    await initializeRAG();
    console.log('✅ RAG inicializado com sucesso!');

    app.listen(PORT, () => {
      console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT}`);
      console.log('🤖 Bot com RAG + MongoDB ativado e pronto para uso!');
    });
  } catch (err) {
    console.error('❌ Erro na inicialização:', err);
    console.log('⚠️ Servidor iniciando com funcionalidade limitada...');
    app.listen(PORT, () =>
      console.log(`✅ Servidor Quanton3D IA rodando na porta ${PORT} (funcionalidade limitada)`)
    );
  }
}

startServer();
