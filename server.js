// =========================
// 🤖 Quanton3D IA - Servidor Oficial (ATIVADO - 11/11/2025)
// Este código RESTAURA a chamada real para a OpenAI (GPT) e remove o código de teste.
// =========================

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";
import multer from "multer";
import { initializeRAG, searchKnowledge, formatContext, addDocument, listDocuments, deleteDocument, updateDocument, addVisualKnowledge, searchVisualKnowledge, formatVisualResponse, listVisualKnowledge, deleteVisualKnowledge, generateEmbedding } from './rag-search.js';
import { connectToMongo, getMessagesCollection, getGalleryCollection, getVisualKnowledgeCollection, getSuggestionsCollection } from './db.js';
import { v2 as cloudinary } from 'cloudinary';
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

// ===== CONFIGURACAO DO CLOUDINARY =====
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

if (process.env.CLOUDINARY_CLOUD_NAME) {
  console.log('☁️ Cloudinary configurado:', process.env.CLOUDINARY_CLOUD_NAME);
} else {
  console.warn('⚠️ Cloudinary nao configurado - galeria de fotos desabilitada');
}

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

    // Salvar no MongoDB para persistencia
    try {
      const suggestionsCollection = getSuggestionsCollection();
      if (suggestionsCollection) {
        await suggestionsCollection.insertOne({
          ...newSuggestion,
          createdAt: new Date()
        });
        console.log(`💾 Sugestao salva no MongoDB`);
      }
    } catch (dbErr) {
      console.warn('⚠️ Erro ao salvar sugestao no MongoDB:', dbErr.message);
    }

    // Manter em memoria tambem para compatibilidade
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
    const { name, phone, email, sessionId, resin } = req.body;

    const userData = {
      name,
      phone,
      email,
      resin: resin || 'Nao informada',
      sessionId,
      registeredAt: new Date().toISOString()
    };

    registeredUsers.set(sessionId, userData);

    // Adicionar aos registros para métricas
    userRegistrations.push(userData);

    // Salvar no MongoDB para persistencia e metricas
    try {
      const messagesCollection = getMessagesCollection();
      if (messagesCollection) {
        await messagesCollection.insertOne({
          type: 'user_registration',
          ...userData,
          createdAt: new Date()
        });
        console.log(`💾 Registro de usuario salvo no MongoDB`);
      }
    } catch (dbErr) {
      console.warn('⚠️ Erro ao salvar registro no MongoDB:', dbErr.message);
    }

    console.log(`👤 Novo usuário registrado: ${name} (${email}) - Resina: ${resin || 'Nao informada'}`);

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
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Voce e um especialista em impressao 3D com RESINA UV (SLA/LCD/DLP) da Quanton3D.

REGRAS GERAIS:
- Trate APENAS de impressao com resina UV.
- NUNCA fale de filamento, FDM, bico, nozzle, extrusora ou mesa aquecida.
- NAO assuma "descolamento da base" se isso NAO estiver claramente visivel na imagem.
- NAO invente detalhes que nao aparecem na foto. Use apenas o que e visualmente observavel.

=== PASSO 1: A IMAGEM E RELACIONADA A IMPRESSAO 3D COM RESINA? ===

Considere como RELACIONADA se houver QUALQUER indicacao de:
- Impressora 3D de resina, cuba, plataforma, tanque, tela LCD/UV
- Peca impressa em resina (mesmo parcialmente), suportes, base de impressao
- Fotos do processo ou do resultado de uma impressao em resina
- Objetos pequenos que parecem pecas impressas (miniaturas, prototipos, joias, dentaduras)
- Qualquer objeto com textura de camadas tipica de impressao 3D

IMPORTANTE: Se tiver QUALQUER duvida, considere como RELACIONADA e escolha um defeito.
So use "imagem nao relacionada" quando for CLARAMENTE algo totalmente diferente
(paisagem, pessoas, animais, carro, documento, tela de computador sem impressora, comida, etc).

=== PASSO 2: SE FOR RELACIONADA, ESCOLHA UM UNICO DEFEITO PRINCIPAL ===

Escolha UMA e apenas UMA categoria:
- "descolamento da base" (peca soltando da plataforma)
- "falha de suportes" (suportes quebrados, soltos ou falhando)
- "rachadura/quebra da peca" (trincas, quebras, fragmentos)
- "falha de adesao entre camadas / delaminacao" (camadas separando)
- "deformacao/warping" (peca entortada, curvada)
- "problema de superficie/acabamento" (rugosidade, bolhas, manchas)
- "excesso ou falta de cura" (peca mole, pegajosa ou quebradiça)
- "sem defeito aparente" (peca parece OK)
- "imagem nao relacionada a impressao 3D com resina"

=== FORMATO DE SAIDA OBRIGATORIO (UMA INFORMACAO POR LINHA) ===

Relacionada: SIM ou NAO
Problema: <uma das categorias acima, exatamente como escrito>
Confianca: ALTA, MEDIA ou BAIXA
Descricao: <1-2 frases do que voce ve na foto>
Causas: <1-2 causas provaveis ESPECIFICAS com parametros>
Acoes: <1-2 acoes praticas ESPECIFICAS com valores>

=== DIRETRIZES PARA CAUSAS E ACOES ===

SEJA ESPECIFICO! Em vez de "verifique os parametros", diga por exemplo:
- "Aumentar tempo de exposicao das camadas normais em 0.5-1 segundo"
- "Aumentar numero de camadas de base de 4 para 6-8"
- "Aumentar densidade dos suportes de 50% para 70-80%"
- "Reduzir velocidade de elevacao de 60mm/min para 30-40mm/min"
- "Aumentar tempo de exposicao da base de 30s para 45-60s"

Sempre mencione parametros tipicos de resina quando relevante:
- Espessura de camada (0.05mm, 0.03mm)
- Tempo de exposicao normal (2-4s) e da base (30-60s)
- Numero de camadas de base (4-8)
- Velocidade e altura de elevacao
- Densidade e espessura de suportes

NAO de dicas genericas como "limpe a plataforma" ou "verifique se esta nivelada"
a menos que o defeito tenha relacao DIRETA com adesao a base.`
        },
        {
          role: "user",
          content: [
            { type: "text", text: message || "Analise esta imagem relacionada a impressao 3D com resina e descreva o que voce ve." },
            { type: "image_url", image_url: { url: imageUrl } }
          ]
        }
      ],
      max_tokens: 500,
    });

    const imageDescription = visionResponse.choices[0].message.content;
    console.log(`✅ [PASSO 1] Descrição da imagem: ${imageDescription.substring(0, 150)}...`);

    // Extrair campos estruturados da resposta do Vision
    const extractField = (text, fieldName) => {
      const regex = new RegExp(`${fieldName}:\\s*(.+)`, 'i');
      const match = text.match(regex);
      return match ? match[1].trim() : null;
    };

    const relacionada = extractField(imageDescription, 'Relacionada');
    const problema = extractField(imageDescription, 'Problema');
    const confianca = extractField(imageDescription, 'Confianca');
    const descricao = extractField(imageDescription, 'Descricao');
    const causas = extractField(imageDescription, 'Causas');
    const acoes = extractField(imageDescription, 'Acoes');

    console.log(`📊 [VISION] Relacionada: ${relacionada} | Problema: ${problema} | Confiança: ${confianca}`);

    // Verificar se a imagem é relacionada a impressão 3D usando o novo formato estruturado
    // Fallback para o método antigo se o formato não for reconhecido
    const isUnrelated = (relacionada && relacionada.toUpperCase() === 'NAO') ||
                        (!relacionada && (
                          imageDescription.toLowerCase().includes('imagem nao relacionada') ||
                          imageDescription.toLowerCase().includes('não parece estar relacionada') ||
                          imageDescription.toLowerCase().includes('não está relacionada')
                        ));

    if (isUnrelated) {
      console.log('⚠️ Imagem não relacionada a impressão 3D detectada');
      const unrelatedReply = "Essa imagem não parece estar relacionada a impressão 3D com resina. Meu foco é suporte técnico para resinas Quanton3D e impressão 3D SLA/LCD/DLP. Posso te ajudar com alguma dúvida sobre impressão 3D com resina?";
      
      // Adicionar ao histórico como texto simples
      history.push({ role: "user", content: message || "(imagem enviada)" });
      history.push({ role: "assistant", content: unrelatedReply });
      
      return res.json({ success: true, reply: unrelatedReply });
    }

    // ======================================================
    // 🖼️ PASSO 1.5: BUSCA NO VISUAL RAG (BANCO DE CONHECIMENTO VISUAL)
    // Objetivo: Verificar se existe um exemplo visual similar no banco de treinamento
    // ======================================================
    console.log('🖼️ [PASSO 1.5] Buscando no Visual RAG (banco de conhecimento visual)...');

    const visionDescriptionObj = {
      problema: problema || 'problema nao identificado',
      descricao: descricao || imageDescription.substring(0, 200),
      causas: causas || '',
      acoes: acoes || ''
    };

    // Log detalhado para diagnostico
    console.log(`🔍 [VISUAL-RAG] Query: problema="${visionDescriptionObj.problema}", descricao="${visionDescriptionObj.descricao?.substring(0, 50)}..."`);

    let visualMatch = null;
    try {
      const visualResults = await searchVisualKnowledge(visionDescriptionObj, 1);
      console.log(`📊 [VISUAL-RAG] Resultados retornados: ${visualResults.length}`);
      
      if (visualResults.length > 0) {
        visualMatch = visualResults[0];
        console.log(`✅ [VISUAL-RAG] Match encontrado! Similaridade: ${(visualMatch.similarity * 100).toFixed(1)}%`);
        console.log(`   Defeito: ${visualMatch.defectType}`);
        console.log(`   Diagnostico: ${visualMatch.diagnosis?.substring(0, 50)}...`);
      } else {
        console.log('⚠️ [VISUAL-RAG] Nenhum exemplo visual similar encontrado no banco de treinamento');
      }
    } catch (visualErr) {
      console.error('⚠️ [VISUAL-RAG] Erro ao buscar conhecimento visual:', visualErr.message);
    }

    // Se encontrou match visual com alta similaridade, usar resposta do Visual RAG
    if (visualMatch && visualMatch.similarity >= 0.7) {
      console.log('🎯 [VISUAL-RAG] Usando resposta do banco de conhecimento visual!');
      
      const visualReply = formatVisualResponse(visualMatch);
      
      // Adicionar ao histórico
      history.push({ 
        role: "user", 
        content: `${message || '(imagem enviada)'}\n[Análise da imagem: ${imageDescription.substring(0, 200)}...]` 
      });
      history.push({ role: "assistant", content: visualReply });

      // Limitar histórico
      if (history.length > 20) {
        history.splice(0, history.length - 20);
      }

      // Registrar métrica
      const registeredUser = registeredUsers.get(sessionId);
      const finalUserName = registeredUser ? registeredUser.name : (userName || 'Anônimo');

      conversationMetrics.push({
        sessionId,
        userName: finalUserName,
        message: message || '(imagem enviada)',
        reply: visualReply,
        timestamp: new Date().toISOString(),
        isImageAnalysis: true,
        imageDescription: imageDescription.substring(0, 500),
        usedVisualRAG: true,
        visualMatchSimilarity: visualMatch.similarity,
        visualMatchDefectType: visualMatch.defectType
      });

      return res.json({ 
        success: true, 
        reply: visualReply,
        usedVisualRAG: true,
        visualMatchSimilarity: visualMatch.similarity
      });
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

    // Verificar se encontrou conhecimento relevante (threshold 0.7 - consistente com rag-search.js)
    const relevanceThreshold = parseFloat(process.env.RAG_MIN_RELEVANCE || '0.7');
    const hasRelevantKnowledge = relevantKnowledge.length > 0 && 
                                  relevantKnowledge[0].similarity >= relevanceThreshold;

    // ======================================================
    // 🎯 PASSO 3: GERAR RESPOSTA - SMART FALLBACK
    // Se RAG tem conhecimento relevante -> usa RAG estrito
    // Se RAG NÃO tem conhecimento -> usa conhecimento geral do GPT-4o
    // ======================================================
    
    let reply;

    if (hasRelevantKnowledge) {
      // MODO RAG ESTRITO - Usa APENAS conhecimento da Quanton3D
      console.log('🎯 [PASSO 3] MODO RAG: Gerando resposta baseada no conhecimento Quanton3D...');

      const ragSystemPrompt = `Voce e o assistente da Quanton3D, especialista em resinas UV (SLA/LCD/DLP).

REGRAS:
1. Use o conhecimento da Quanton3D fornecido abaixo.
2. NUNCA fale de filamento, FDM, bico, nozzle ou extrusora.
3. Responda em NO MAXIMO 2 paragrafos curtos.
4. Seja direto e objetivo. Nada de introducoes longas.
5. NAO repita dicas genericas (limpar plataforma, nivelar) se o problema NAO for de adesao a base.
6. Foque no problema ESPECIFICO identificado na descricao.

IMPORTANTE:
- Se o problema for "rachadura/quebra", foque em cura e tensoes - NAO em adesao da base.
- Se o problema for "falha de suportes", foque em configuracao de suportes - NAO em adesao da base.
- Responda APENAS sobre o defeito identificado.

DIFERENCIACAO DE RESINAS IRON:
- "Iron" e "Iron 7030" sao resinas DIFERENTES com parametros DIFERENTES.
- Se o usuario mencionar apenas "Iron" (sem numero), considere a resina Iron padrao.
- Se o usuario mencionar "Iron 7030" ou "7030", considere a resina Iron 7030 especifica.
- NUNCA confunda os parametros de uma com a outra.

=== CONHECIMENTO QUANTON3D ===
${knowledgeContext}
=== FIM ===

PROBLEMA IDENTIFICADO:
${combinedText}`;

      const ragResponse = await openai.chat.completions.create({
        model: model,
        temperature: 0.0,
        messages: [
          { role: "system", content: ragSystemPrompt },
          { role: "user", content: "Analise o problema e de uma resposta curta e direta." }
        ],
        max_tokens: 400,
      });

      reply = ragResponse.choices[0].message.content;

    } else {
      // MODO SEM CONHECIMENTO - RAG não encontrou solução, NÃO usa conhecimento genérico
      console.log('🎯 [PASSO 3] SEM CONHECIMENTO NO RAG - Informando cliente para chamar WhatsApp');

      // Extrair apenas a primeira linha da descrição (problema principal)
      const problemaPrincipal = imageDescription.split('\n')[0] || 'Problema visual identificado na imagem';

      reply = `**Análise da Imagem:**
${problemaPrincipal}

**Resultado da Busca:**
Não encontrei uma solução específica para esse problema no banco de conhecimento Quanton3D.

📞 **Por favor, entre em contato pelo WhatsApp** para uma análise detalhada com nossa equipe técnica. Eles poderão avaliar sua situação específica e fornecer a orientação correta.

WhatsApp: (31) 3271-6935`;

      // ======================================================
      // 📸 SALVAR FOTO AUTOMATICAMENTE PARA TREINAMENTO
      // Quando o bot não encontra solução, salva a foto como pendente
      // para o admin adicionar o conhecimento depois
      // ======================================================
      try {
        const registeredUser = registeredUsers.get(sessionId);
        const collection = getVisualKnowledgeCollection();
        
        // Upload da imagem para Cloudinary (usando base64 do imageFile)
        const cloudinaryResult = await new Promise((resolve, reject) => {
          const uploadStream = cloudinary.uploader.upload_stream(
            {
              folder: 'quanton3d/visual-knowledge-pending',
              resource_type: 'image',
              transformation: [{ width: 800, height: 800, crop: 'limit' }]
            },
            (error, result) => {
              if (error) reject(error);
              else resolve(result);
            }
          );
          uploadStream.end(imageFile.buffer);
        });

        const pendingDoc = {
          imageUrl: cloudinaryResult.secure_url,
          status: 'pending',
          source: 'auto',
          userName: registeredUser ? registeredUser.name : (userName || 'Anonimo'),
          userPhone: registeredUser ? registeredUser.phone : null,
          lastUserMessage: message || null,
          autoAnalysis: imageDescription,
          defectType: null,
          diagnosis: '',
          solution: '',
          embedding: null,
          createdAt: new Date()
        };

        await collection.insertOne(pendingDoc);
        console.log(`📸 [VISUAL-RAG] Foto salva automaticamente para treinamento`);
      } catch (pendingErr) {
        console.error('⚠️ Erro ao salvar foto pendente:', pendingErr.message);
        // Não interrompe o fluxo principal se falhar
      }
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
app.get("/metrics", async (req, res) => {
  const { auth } = req.query;

  // Autenticação
  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }

  // Calcular estatísticas em memoria
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

    // Buscar estatisticas de resinas do MongoDB (dados reais dos registros de usuarios)
    // Lista completa: Quanton antigas + Athon novas (16 resinas)
    const resinMentions = {
      'Pyroblast+': 0,
      'Iron': 0,
      'Iron 7030': 0,
      'Spin+': 0,
      'Spark': 0,
      'FlexForm': 0,
      'Castable': 0,
      'Low Smell': 0,
      'Spare': 0,
      'ALCHEMIST': 0,
      'POSEIDON': 0,
      'RPG': 0,
      'Athon ALINHADORES': 0,
      'Athon DENTAL': 0,
      'Athon GENGIVA': 0,
      'Athon WASHABLE': 0
    };

  try {
    const messagesCollection = getMessagesCollection();
    if (messagesCollection) {
      // Buscar todos os registros de usuarios com resina selecionada
      const userResinData = await messagesCollection.find({ 
        type: 'user_registration',
        resin: { $exists: true, $ne: null, $ne: 'Nao informada' }
      }).toArray();

      // Contar cada resina
      userResinData.forEach(user => {
        const resin = user.resin;
        if (resinMentions.hasOwnProperty(resin)) {
          resinMentions[resin]++;
        }
      });

      console.log(`📊 Estatisticas de resinas carregadas do MongoDB: ${userResinData.length} registros`);
    }
  } catch (dbErr) {
    console.warn('⚠️ Erro ao buscar estatisticas de resinas do MongoDB:', dbErr.message);
    // Fallback: usar dados em memoria
    userRegistrations.forEach(user => {
      if (user.resin && resinMentions.hasOwnProperty(user.resin)) {
        resinMentions[user.resin]++;
      }
    });
  }

  // Top Clientes com Duvidas (baseado em nome/email que mais iniciaram conversas)
  const clientCounts = {};
  userRegistrations.forEach(user => {
    const clientKey = user.email || user.name || 'Anonimo';
    clientCounts[clientKey] = (clientCounts[clientKey] || 0) + 1;
  });
  
  const topClients = Object.entries(clientCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([client, count]) => ({ client, count }));

  // Topicos Mais Acessados (baseado em palavras-chave frequentes nas perguntas)
  const topicKeywords = {};
  const stopWords = ['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'em', 'no', 'na', 'para', 'com', 'que', 'e', 'ou', 'se', 'por', 'como', 'qual', 'quais', 'minha', 'meu', 'sua', 'seu', 'esta', 'esse', 'isso', 'aqui', 'ali', 'la', 'nao', 'sim', 'muito', 'mais', 'menos', 'bem', 'mal', 'so', 'ja', 'ainda', 'tambem', 'ate', 'sobre', 'entre', 'depois', 'antes', 'quando', 'onde', 'porque', 'pois', 'entao', 'assim', 'agora', 'sempre', 'nunca', 'talvez', 'pode', 'posso', 'tenho', 'tem', 'ter', 'ser', 'esta', 'estou', 'voce', 'vc', 'eu', 'ele', 'ela', 'nos', 'eles', 'elas'];
  
  conversationMetrics.forEach(conv => {
    const words = conv.message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3 && !stopWords.includes(word));
    
    words.forEach(word => {
      topicKeywords[word] = (topicKeywords[word] || 0) + 1;
    });
  });
  
  const topTopics = Object.entries(topicKeywords)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([topic, count]) => ({ topic, count }));

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
      topClients,
      topTopics,
      lastUpdated: new Date().toISOString()
    }
  });
});

// Endpoint para detalhes de clientes por resina (CORRECAO 3)
// Retorna lista de clientes que usam uma resina especifica e historico de conversas
app.get("/metrics/resin-details", async (req, res) => {
  const { auth, resin } = req.query;

  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }

  if (!resin) {
    return res.status(400).json({ success: false, error: 'Parametro resin é obrigatorio' });
  }

  try {
    // Buscar clientes que usam essa resina do MongoDB
    const messagesCollection = getMessagesCollection();
    let customers = [];
    
    if (messagesCollection) {
      const userResinData = await messagesCollection.find({ 
        type: 'user_registration',
        resin: resin
      }).toArray();
      
      customers = userResinData.map(user => ({
        name: user.name || 'Anonimo',
        email: user.email || '',
        phone: user.phone || '',
        printer: user.printer || '',
        registeredAt: user.registeredAt || user.createdAt
      }));
    }

    // Buscar conversas relacionadas a essa resina (em memoria)
    // Filtra conversas de usuarios que usam essa resina
    const customerEmails = customers.map(c => c.email).filter(e => e);
    const customerNames = customers.map(c => c.name).filter(n => n && n !== 'Anonimo');
    
    const conversations = conversationMetrics
      .filter(conv => {
        // Verifica se a conversa é de um cliente que usa essa resina
        const matchEmail = conv.userEmail && customerEmails.includes(conv.userEmail);
        const matchName = conv.userName && customerNames.includes(conv.userName);
        // Ou se a mensagem menciona a resina
        const mentionsResin = conv.message && conv.message.toLowerCase().includes(resin.toLowerCase());
        return matchEmail || matchName || mentionsResin;
      })
      .slice(-50) // Ultimas 50 conversas
      .reverse()
      .map(conv => ({
        timestamp: conv.timestamp,
        customerName: conv.userName || 'Anonimo',
        email: conv.userEmail || '',
        userPrompt: conv.message,
        botReply: conv.reply,
        questionType: conv.questionType,
        documentsFound: conv.documentsFound
      }));

    res.json({
      success: true,
      resin,
      customersCount: customers.length,
      customers,
      conversationsCount: conversations.length,
      conversations
    });
  } catch (err) {
    console.error('❌ Erro ao buscar detalhes da resina:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint para historico de um cliente especifico (CORRECAO 4)
// Retorna duvidas, respostas e status de resolucao
app.get("/metrics/client-history", async (req, res) => {
  const { auth, clientKey } = req.query;

  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }

  if (!clientKey) {
    return res.status(400).json({ success: false, error: 'Parametro clientKey é obrigatorio' });
  }

  try {
    // Buscar dados do cliente no MongoDB
    const messagesCollection = getMessagesCollection();
    let clientInfo = null;
    let registrations = [];
    let contacts = [];
    
    if (messagesCollection) {
      // Buscar registros do cliente
      const userRegistrations = await messagesCollection.find({ 
        type: 'user_registration',
        $or: [
          { email: clientKey },
          { name: clientKey }
        ]
      }).toArray();
      
      if (userRegistrations.length > 0) {
        const firstReg = userRegistrations[0];
        clientInfo = {
          key: clientKey,
          name: firstReg.name || clientKey,
          email: firstReg.email || '',
          phone: firstReg.phone || ''
        };
        
        registrations = userRegistrations.map(reg => ({
          resin: reg.resin || 'Nao informada',
          printer: reg.printer || 'Nao informado',
          registeredAt: reg.registeredAt || reg.createdAt
        }));
      }
      
      // Buscar mensagens de contato do cliente
      const contactMessages = await messagesCollection.find({
        $or: [
          { email: clientKey },
          { name: clientKey }
        ],
        type: { $ne: 'user_registration' }
      }).sort({ createdAt: -1 }).limit(20).toArray();
      
      contacts = contactMessages.map(msg => ({
        createdAt: msg.createdAt,
        message: msg.message || msg.content || '',
        resolved: msg.resolved || false,
        resolvedAt: msg.resolvedAt || null
      }));
    }

    // Buscar conversas do chat (em memoria)
    const conversations = conversationMetrics
      .filter(conv => {
        const matchEmail = conv.userEmail === clientKey;
        const matchName = conv.userName === clientKey;
        return matchEmail || matchName;
      })
      .slice(-30) // Ultimas 30 conversas
      .reverse()
      .map(conv => ({
        timestamp: conv.timestamp,
        prompt: conv.message,
        reply: conv.reply,
        questionType: conv.questionType,
        documentsFound: conv.documentsFound,
        feedbackAdded: conv.feedbackAdded || false,
        markedAsBad: conv.markedAsBad || false
      }));

    res.json({
      success: true,
      client: clientInfo || { key: clientKey, name: clientKey, email: '', phone: '' },
      registrations,
      contacts,
      conversations,
      totalInteractions: registrations.length + contacts.length + conversations.length
    });
  } catch (err) {
    console.error('❌ Erro ao buscar historico do cliente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para adicionar conhecimento manualmente ao RAG
// CORRIGIDO: Agora usa addDocument() que salva no MongoDB com embedding
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

    console.log(`📚 [ADD-KNOWLEDGE] Adicionando conhecimento: ${title}`);

    // Usar addDocument() que gera embedding e salva no MongoDB
    // Isso garante que o conhecimento persiste e é encontrado pelo RAG
    const result = await addDocument(title, content, 'admin_panel');

    console.log(`✅ [ADD-KNOWLEDGE] Conhecimento adicionado com sucesso! ID: ${result.documentId}`);

    res.json({
      success: true,
      message: 'Conhecimento adicionado com sucesso ao RAG!',
      documentId: result.documentId.toString()
    });
  } catch (err) {
    console.error('❌ Erro ao adicionar conhecimento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para listar todos os documentos de conhecimento (para admin)
// Aceita filtros opcionais: start (data inicio) e end (data fim)
app.get("/api/knowledge", async (req, res) => {
  try {
    const { auth, start, end } = req.query;

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, error: 'Não autorizado' });
    }

    console.log(`📚 [LIST-KNOWLEDGE] Listando documentos de conhecimento...`);
    if (start || end) {
      console.log(`📅 Filtro de data: ${start || 'inicio'} até ${end || 'fim'}`);
    }

    let documents = await listDocuments();

    // Aplicar filtro de data se fornecido
    if (start || end) {
      documents = documents.filter(doc => {
        if (!doc.createdAt) return true;
        const docDate = new Date(doc.createdAt);
        if (start && docDate < new Date(start)) return false;
        if (end && docDate > new Date(end + 'T23:59:59')) return false;
        return true;
      });
    }

    console.log(`✅ [LIST-KNOWLEDGE] ${documents.length} documentos encontrados`);

    res.json({
      success: true,
      documents,
      count: documents.length
    });
  } catch (err) {
    console.error('❌ Erro ao listar conhecimento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para deletar documento de conhecimento (para admin)
app.delete("/api/knowledge/:id", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, error: 'Não autorizado' });
    }

    console.log(`🗑️ [DELETE-KNOWLEDGE] Deletando documento: ${id}`);

    const result = await deleteDocument(id);

    if (result.success) {
      console.log(`✅ [DELETE-KNOWLEDGE] Documento deletado com sucesso`);
      res.json({ success: true, message: 'Documento deletado com sucesso' });
    } else {
      res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
  } catch (err) {
    console.error('❌ Erro ao deletar conhecimento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para atualizar documento de conhecimento (para admin)
app.put("/api/knowledge/:id", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;
    const { title, content } = req.body;

    // Autenticação
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, error: 'Não autorizado' });
    }

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'Titulo e conteudo sao obrigatorios' });
    }

    console.log(`✏️ [UPDATE-KNOWLEDGE] Atualizando documento: ${id}`);

    const result = await updateDocument(id, title, content);

    if (result.success) {
      console.log(`✅ [UPDATE-KNOWLEDGE] Documento atualizado com sucesso`);
      res.json({ success: true, message: 'Documento atualizado com sucesso' });
    } else {
      res.status(404).json({ success: false, error: 'Documento não encontrado' });
    }
  } catch (err) {
    console.error('❌ Erro ao atualizar conhecimento:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para listar sugestões (apenas para Ronei)
app.get("/suggestions", async (req, res) => {
  const { auth } = req.query;

  // Autenticação simples
  if (auth !== 'quanton3d_admin_secret') {
    return res.status(401).json({ success: false, message: 'Não autorizado' });
  }

  // Tentar carregar do MongoDB primeiro
  try {
    const suggestionsCollection = getSuggestionsCollection();
    if (suggestionsCollection) {
      const mongoSuggestions = await suggestionsCollection
        .find({ status: 'pending' })
        .sort({ createdAt: -1 })
        .toArray();
      
      if (mongoSuggestions.length > 0) {
        return res.json({
          success: true,
          suggestions: mongoSuggestions,
          count: mongoSuggestions.length
        });
      }
    }
  } catch (dbErr) {
    console.warn('⚠️ Erro ao carregar sugestoes do MongoDB:', dbErr.message);
  }

  // Fallback para memoria
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

// Rota para aprovar sugestão (com suporte a edição da resposta)
app.put("/approve-suggestion/:id", async (req, res) => {
  try {
    const { auth, editedAnswer } = req.body;
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

    // Usar resposta editada pelo admin se fornecida, senão usar resposta original do bot
    const finalAnswer = editedAnswer && editedAnswer.trim() ? editedAnswer : suggestion.lastBotReply;
    const wasEdited = editedAnswer && editedAnswer.trim() ? true : false;

    if (wasEdited) {
      console.log(`✏️ Resposta foi editada pelo admin`);
    }

    // Formatar conteúdo com metadados para o MongoDB
    const documentTitle = `Conhecimento Curado - ${suggestion.userName} - ${suggestionId}`;
    const formattedContent = `CONHECIMENTO CURADO PELO ADMIN
Data da Sugestao: ${suggestion.timestamp}
Data de Aprovacao: ${new Date().toISOString()}
Usuario: ${suggestion.userName}
Telefone: ${suggestion.userPhone || 'N/A'}
Resposta Editada: ${wasEdited ? 'Sim' : 'Nao'}

PERGUNTA ORIGINAL DO CLIENTE:
${suggestion.lastUserMessage}

RESPOSTA CORRETA (CURADA):
${finalAnswer}

RESPOSTA ORIGINAL DO BOT:
${suggestion.lastBotReply}

SUGESTAO DO CLIENTE:
${suggestion.suggestion}`;

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

// Rota para atualizar status de mensagem (marcar como resolvido)
app.put("/api/contact/:id", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;
    const { resolved } = req.body;

    // Autenticacao
    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const { ObjectId } = await import('mongodb');
    const messagesCollection = getMessagesCollection();
    
    const result = await messagesCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { resolved: resolved, resolvedAt: resolved ? new Date() : null } }
    );

    if (result.modifiedCount > 0) {
      console.log(`✅ Mensagem ${id} marcada como ${resolved ? 'resolvida' : 'pendente'}`);
      res.json({ success: true, message: `Mensagem ${resolved ? 'resolvida' : 'reaberta'}` });
    } else {
      res.status(404).json({ success: false, error: 'Mensagem nao encontrada' });
    }
  } catch (err) {
    console.error('❌ Erro ao atualizar mensagem:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== ENDPOINTS DA GALERIA DE FOTOS =====

// Configuracao do multer para upload de multiplas imagens (galeria)
const galleryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB por imagem
  fileFilter: (req, file, cb) => {
    // Aceitar apenas imagens
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Apenas imagens sao permitidas'), false);
    }
  }
});

// Funcao auxiliar para upload no Cloudinary
async function uploadToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: 'quanton3d-gallery',
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 1200, crop: 'limit' }, // Limitar tamanho
          { quality: 'auto:good' } // Otimizar qualidade
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    uploadStream.end(buffer);
  });
}

// POST /api/gallery - Enviar nova foto para galeria
app.post("/api/gallery", galleryUpload.array('images', 2), async (req, res) => {
  try {
    const { 
      name, resin, printer, comment,
      // Campos de configuracao de impressao
      layerHeight, baseLayers, exposureTime, baseExposureTime,
      transitionLayers, uvOffDelay,
      lowerLiftDistance1, lowerLiftDistance2,
      liftDistance1, liftDistance2,
      liftSpeed1, liftSpeed2,
      lowerRetractSpeed1, lowerRetractSpeed2,
      retractSpeed1, retractSpeed2
    } = req.body;
    const imageFiles = req.files;

    console.log(`📸 [GALERIA] Nova submissao de ${name || 'Anonimo'}`);

    // Validacoes
    if (!process.env.CLOUDINARY_CLOUD_NAME) {
      return res.status(503).json({
        success: false,
        error: 'Servico de galeria nao configurado. Entre em contato com o suporte.'
      });
    }

    if (!imageFiles || imageFiles.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Pelo menos uma foto e obrigatoria.'
      });
    }

    if (!resin || !printer) {
      return res.status(400).json({
        success: false,
        error: 'Resina e impressora sao obrigatorios.'
      });
    }

    // Verificar limite de 2 fotos por configuracao
    const galleryCollection = getGalleryCollection();
    const existingCount = await galleryCollection.countDocuments({
      resin: resin,
      printer: printer,
      status: { $in: ['pending', 'approved'] }
    });

    if (existingCount >= 2) {
      return res.status(400).json({
        success: false,
        error: `Ja existem 2 fotos para a configuracao ${resin} + ${printer}. Limite atingido.`
      });
    }

    // Upload das imagens para o Cloudinary
    const uploadedImages = [];
    for (const file of imageFiles) {
      try {
        const result = await uploadToCloudinary(file.buffer, file.mimetype);
        uploadedImages.push({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height
        });
        console.log(`✅ Imagem enviada para Cloudinary: ${result.public_id}`);
      } catch (uploadErr) {
        console.error('❌ Erro no upload para Cloudinary:', uploadErr);
        return res.status(500).json({
          success: false,
          error: 'Erro ao fazer upload da imagem. Tente novamente.'
        });
      }
    }

    // Salvar no MongoDB
    const galleryEntry = {
      name: name || 'Anonimo',
      resin,
      printer,
      comment: comment || '',
      images: uploadedImages,
      // Parametros de configuracao de impressao
      params: {
        layerHeight: layerHeight || '',
        baseLayers: baseLayers || '',
        exposureTime: exposureTime || '',
        baseExposureTime: baseExposureTime || '',
        transitionLayers: transitionLayers || '',
        uvOffDelay: uvOffDelay || '',
        lowerLiftDistance: { value1: lowerLiftDistance1 || '', value2: lowerLiftDistance2 || '' },
        liftDistance: { value1: liftDistance1 || '', value2: liftDistance2 || '' },
        liftSpeed: { value1: liftSpeed1 || '', value2: liftSpeed2 || '' },
        lowerRetractSpeed: { value1: lowerRetractSpeed1 || '', value2: lowerRetractSpeed2 || '' },
        retractSpeed: { value1: retractSpeed1 || '', value2: retractSpeed2 || '' }
      },
      status: 'pending', // pending, approved, rejected
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await galleryCollection.insertOne(galleryEntry);

    console.log(`✅ [GALERIA] Entrada salva: ${result.insertedId}`);

    res.json({
      success: true,
      message: 'Fotos enviadas com sucesso! Aguarde aprovacao do administrador.',
      entryId: result.insertedId.toString()
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao salvar:', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao enviar fotos. Tente novamente.'
    });
  }
});

// GET /api/gallery - Listar fotos aprovadas (publico)
app.get("/api/gallery", async (req, res) => {
  try {
    const { page = 1, limit = 20, resin, printer } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const galleryCollection = getGalleryCollection();

    // Filtros opcionais
    const filter = { status: 'approved' };
    if (resin) filter.resin = resin;
    if (printer) filter.printer = printer;

    const [entries, total] = await Promise.all([
      galleryCollection
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .toArray(),
      galleryCollection.countDocuments(filter)
    ]);

    res.json({
      success: true,
      entries,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao listar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/gallery/pending - Listar fotos pendentes (admin)
app.get("/api/gallery/pending", async (req, res) => {
  try {
    const { auth } = req.query;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const galleryCollection = getGalleryCollection();
    const entries = await galleryCollection
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      entries,
      count: entries.length
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao listar pendentes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/gallery/all - Listar todas as fotos (admin)
app.get("/api/gallery/all", async (req, res) => {
  try {
    const { auth } = req.query;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const galleryCollection = getGalleryCollection();
    const entries = await galleryCollection
      .find({})
      .sort({ createdAt: -1 })
      .limit(200)
      .toArray();

    res.json({
      success: true,
      entries,
      count: entries.length
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao listar todas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/gallery/:id/approve - Aprovar foto (admin)
app.put("/api/gallery/:id/approve", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const galleryCollection = getGalleryCollection();
    const { ObjectId } = await import('mongodb');

    const result = await galleryCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'approved',
          approvedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Entrada nao encontrada' });
    }

    console.log(`✅ [GALERIA] Foto aprovada: ${id}`);

    res.json({
      success: true,
      message: 'Foto aprovada com sucesso!'
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao aprovar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/gallery/:id/reject - Rejeitar foto (admin)
app.put("/api/gallery/:id/reject", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const galleryCollection = getGalleryCollection();
    const { ObjectId } = await import('mongodb');

    // Buscar entrada para deletar imagens do Cloudinary
    const entry = await galleryCollection.findOne({ _id: new ObjectId(id) });

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entrada nao encontrada' });
    }

    // Deletar imagens do Cloudinary
    if (entry.images && entry.images.length > 0) {
      for (const img of entry.images) {
        try {
          await cloudinary.uploader.destroy(img.publicId);
          console.log(`🗑️ Imagem deletada do Cloudinary: ${img.publicId}`);
        } catch (delErr) {
          console.error('⚠️ Erro ao deletar imagem do Cloudinary:', delErr);
        }
      }
    }

    // Atualizar status para rejeitado
    await galleryCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'rejected',
          rejectedAt: new Date(),
          updatedAt: new Date()
        }
      }
    );

    console.log(`❌ [GALERIA] Foto rejeitada: ${id}`);

    res.json({
      success: true,
      message: 'Foto rejeitada e removida.'
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao rejeitar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/gallery/:id - Deletar foto (admin)
app.delete("/api/gallery/:id", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const galleryCollection = getGalleryCollection();
    const { ObjectId } = await import('mongodb');

    // Buscar entrada para deletar imagens do Cloudinary
    const entry = await galleryCollection.findOne({ _id: new ObjectId(id) });

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entrada nao encontrada' });
    }

    // Deletar imagens do Cloudinary
    if (entry.images && entry.images.length > 0) {
      for (const img of entry.images) {
        try {
          await cloudinary.uploader.destroy(img.publicId);
          console.log(`🗑️ Imagem deletada do Cloudinary: ${img.publicId}`);
        } catch (delErr) {
          console.error('⚠️ Erro ao deletar imagem do Cloudinary:', delErr);
        }
      }
    }

    // Deletar do MongoDB
    await galleryCollection.deleteOne({ _id: new ObjectId(id) });

    console.log(`🗑️ [GALERIA] Entrada deletada: ${id}`);

    res.json({
      success: true,
      message: 'Foto deletada com sucesso.'
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao deletar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/gallery/:id - Atualizar entrada da galeria (admin)
app.put("/api/gallery/:id", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const galleryCollection = getGalleryCollection();
    const entry = await galleryCollection.findOne({ _id: new ObjectId(id) });

    if (!entry) {
      return res.status(404).json({ success: false, message: 'Entrada nao encontrada' });
    }

    // Campos que podem ser atualizados
    const {
      name, resin, printer, comment,
      layerHeight, baseLayers, exposureTime, baseExposureTime,
      transitionLayers, uvOffDelay,
      lowerLiftDistance1, lowerLiftDistance2,
      liftDistance1, liftDistance2,
      lowerRetractDistance1, lowerRetractDistance2,
      retractDistance1, retractDistance2,
      lowerLiftSpeed1, lowerLiftSpeed2,
      liftSpeed1, liftSpeed2,
      lowerRetractSpeed1, lowerRetractSpeed2,
      retractSpeed1, retractSpeed2
    } = req.body;

    // Atualizar apenas os campos fornecidos
    const updateData = {
      updatedAt: new Date()
    };

    // Campos basicos
    if (name !== undefined) updateData.name = name;
    if (resin !== undefined) updateData.resin = resin;
    if (printer !== undefined) updateData.printer = printer;
    if (comment !== undefined) updateData.comment = comment;

    // Configuracoes de impressao
    if (layerHeight !== undefined) updateData.layerHeight = layerHeight;
    if (baseLayers !== undefined) updateData.baseLayers = baseLayers;
    if (exposureTime !== undefined) updateData.exposureTime = exposureTime;
    if (baseExposureTime !== undefined) updateData.baseExposureTime = baseExposureTime;
    if (transitionLayers !== undefined) updateData.transitionLayers = transitionLayers;
    if (uvOffDelay !== undefined) updateData.uvOffDelay = uvOffDelay;

    // Distancias de Elevacao
    if (lowerLiftDistance1 !== undefined) updateData.lowerLiftDistance1 = lowerLiftDistance1;
    if (lowerLiftDistance2 !== undefined) updateData.lowerLiftDistance2 = lowerLiftDistance2;
    if (liftDistance1 !== undefined) updateData.liftDistance1 = liftDistance1;
    if (liftDistance2 !== undefined) updateData.liftDistance2 = liftDistance2;

    // Distancias de Retracao
    if (lowerRetractDistance1 !== undefined) updateData.lowerRetractDistance1 = lowerRetractDistance1;
    if (lowerRetractDistance2 !== undefined) updateData.lowerRetractDistance2 = lowerRetractDistance2;
    if (retractDistance1 !== undefined) updateData.retractDistance1 = retractDistance1;
    if (retractDistance2 !== undefined) updateData.retractDistance2 = retractDistance2;

    // Velocidades de Elevacao Inferior
    if (lowerLiftSpeed1 !== undefined) updateData.lowerLiftSpeed1 = lowerLiftSpeed1;
    if (lowerLiftSpeed2 !== undefined) updateData.lowerLiftSpeed2 = lowerLiftSpeed2;

    // Velocidades de Elevacao Normal
    if (liftSpeed1 !== undefined) updateData.liftSpeed1 = liftSpeed1;
    if (liftSpeed2 !== undefined) updateData.liftSpeed2 = liftSpeed2;

    // Velocidades de Retracao Inferior
    if (lowerRetractSpeed1 !== undefined) updateData.lowerRetractSpeed1 = lowerRetractSpeed1;
    if (lowerRetractSpeed2 !== undefined) updateData.lowerRetractSpeed2 = lowerRetractSpeed2;

    // Velocidades de Retracao Normal
    if (retractSpeed1 !== undefined) updateData.retractSpeed1 = retractSpeed1;
    if (retractSpeed2 !== undefined) updateData.retractSpeed2 = retractSpeed2;

    await galleryCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    console.log(`✏️ [GALERIA] Entrada atualizada: ${id}`);

    res.json({
      success: true,
      message: 'Entrada atualizada com sucesso.'
    });
  } catch (err) {
    console.error('❌ [GALERIA] Erro ao atualizar:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== FIM DOS ENDPOINTS DA GALERIA =====

// ===== VISUAL RAG - BANCO DE CONHECIMENTO VISUAL =====
// Permite admin treinar o bot com fotos de problemas + diagnostico + solucao

// POST /api/visual-knowledge - Adicionar conhecimento visual (admin)
app.post("/api/visual-knowledge", upload.single('image'), async (req, res) => {
  try {
    const { auth } = req.query;
    const { defectType, diagnosis, solution } = req.body;
    const imageFile = req.file;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    if (!imageFile) {
      return res.status(400).json({ success: false, message: 'Imagem obrigatoria' });
    }

    if (!defectType || !diagnosis || !solution) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tipo de defeito, diagnostico e solucao sao obrigatorios' 
      });
    }

    console.log(`📸 [VISUAL-RAG] Processando imagem de treinamento: ${defectType}`);

    // 1. Upload da imagem para Cloudinary
    const cloudinaryResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'quanton3d/visual-knowledge',
          resource_type: 'image',
          transformation: [{ width: 800, height: 800, crop: 'limit' }]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(imageFile.buffer);
    });

    const imageUrl = cloudinaryResult.secure_url;
    const publicId = cloudinaryResult.public_id;

    console.log(`☁️ [VISUAL-RAG] Imagem enviada para Cloudinary: ${publicId}`);

    // 2. Analisar imagem com GPT-4o Vision para obter descricao estruturada
    const base64Image = imageFile.buffer.toString('base64');
    const imageDataUrl = `data:${imageFile.mimetype};base64,${base64Image}`;

    const model = process.env.OPENAI_MODEL || "gpt-4o";

    const visionResponse = await openai.chat.completions.create({
      model: model,
      temperature: 0,
      messages: [
        {
          role: "system",
          content: `Voce e um especialista em impressao 3D com RESINA UV (SLA/LCD/DLP) da Quanton3D.
Analise esta imagem de TREINAMENTO e descreva o problema de forma estruturada.

=== FORMATO DE SAIDA OBRIGATORIO (UMA INFORMACAO POR LINHA) ===

Relacionada: SIM ou NAO
Problema: <tipo do defeito>
Confianca: ALTA, MEDIA ou BAIXA
Descricao: <1-2 frases do que voce ve na foto>
Causas: <1-2 causas provaveis ESPECIFICAS>
Acoes: <1-2 acoes praticas ESPECIFICAS>`
        },
        {
          role: "user",
          content: [
            { type: "text", text: `Analise esta imagem de treinamento. O admin classificou como: "${defectType}"` },
            { type: "image_url", image_url: { url: imageDataUrl } }
          ]
        }
      ],
      max_tokens: 500
    });

    const visionText = visionResponse.choices[0].message.content;
    console.log(`🔍 [VISUAL-RAG] Analise Vision: ${visionText.substring(0, 100)}...`);

    // 3. Extrair campos estruturados
    const extractField = (text, fieldName) => {
      const regex = new RegExp(`${fieldName}:\\s*(.+)`, 'i');
      const match = text.match(regex);
      return match ? match[1].trim() : null;
    };

    const visionDescription = {
      relacionada: extractField(visionText, 'Relacionada'),
      problema: extractField(visionText, 'Problema') || defectType,
      confianca: extractField(visionText, 'Confianca'),
      descricao: extractField(visionText, 'Descricao'),
      causas: extractField(visionText, 'Causas'),
      acoes: extractField(visionText, 'Acoes'),
      rawText: visionText
    };

    // 4. Adicionar ao banco de conhecimento visual
    const result = await addVisualKnowledge(
      imageUrl,
      defectType,
      diagnosis,
      solution,
      visionDescription
    );

    console.log(`✅ [VISUAL-RAG] Conhecimento visual adicionado: ${result.documentId}`);

    res.json({
      success: true,
      message: 'Conhecimento visual adicionado com sucesso!',
      documentId: result.documentId.toString(),
      imageUrl,
      defectType,
      visionDescription
    });
  } catch (err) {
    console.error('❌ [VISUAL-RAG] Erro ao adicionar conhecimento visual:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/visual-knowledge - Listar conhecimentos visuais (admin)
app.get("/api/visual-knowledge", async (req, res) => {
  try {
    const { auth } = req.query;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const documents = await listVisualKnowledge();

    res.json({
      success: true,
      documents,
      count: documents.length
    });
  } catch (err) {
    console.error('❌ [VISUAL-RAG] Erro ao listar conhecimento visual:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /api/visual-knowledge/:id - Deletar conhecimento visual (admin)
app.delete("/api/visual-knowledge/:id", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    // Buscar documento para deletar imagem do Cloudinary
    const collection = getVisualKnowledgeCollection();
    const { ObjectId } = await import('mongodb');
    const doc = await collection.findOne({ _id: new ObjectId(id) });

    if (doc && doc.imageUrl) {
      // Extrair publicId da URL do Cloudinary
      const urlParts = doc.imageUrl.split('/');
      const publicIdWithExt = urlParts.slice(-2).join('/');
      const publicId = publicIdWithExt.replace(/\.[^/.]+$/, '');
      
      try {
        await cloudinary.uploader.destroy(publicId);
        console.log(`🗑️ [VISUAL-RAG] Imagem deletada do Cloudinary: ${publicId}`);
      } catch (delErr) {
        console.error('⚠️ Erro ao deletar imagem do Cloudinary:', delErr);
      }
    }

    const result = await deleteVisualKnowledge(id);

    if (!result.success) {
      return res.status(404).json({ success: false, message: 'Documento nao encontrado' });
    }

    console.log(`🗑️ [VISUAL-RAG] Conhecimento visual deletado: ${id}`);

    res.json({
      success: true,
      message: 'Conhecimento visual deletado com sucesso!'
    });
  } catch (err) {
    console.error('❌ [VISUAL-RAG] Erro ao deletar conhecimento visual:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/visual-knowledge/pending - Listar fotos pendentes para treinamento (admin)
app.get("/api/visual-knowledge/pending", async (req, res) => {
  try {
    const { auth } = req.query;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    const collection = getVisualKnowledgeCollection();
    const documents = await collection
      .find({ status: 'pending' })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      success: true,
      documents,
      count: documents.length
    });
  } catch (err) {
    console.error('❌ [VISUAL-RAG] Erro ao listar fotos pendentes:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/visual-knowledge/:id/approve - Aprovar foto pendente e adicionar conhecimento (admin)
app.put("/api/visual-knowledge/:id/approve", async (req, res) => {
  try {
    const { auth } = req.query;
    const { id } = req.params;
    const { defectType, diagnosis, solution } = req.body;

    if (auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Nao autorizado' });
    }

    if (!defectType || !diagnosis || !solution) {
      return res.status(400).json({ 
        success: false, 
        message: 'Tipo de defeito, diagnostico e solucao sao obrigatorios' 
      });
    }

    const collection = getVisualKnowledgeCollection();
    const { ObjectId } = await import('mongodb');
    
    // Buscar documento pendente
    const doc = await collection.findOne({ _id: new ObjectId(id), status: 'pending' });
    
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Documento pendente nao encontrado' });
    }

    // Gerar embedding para o texto combinado
    const combinedText = `${defectType} ${diagnosis} ${solution}`;
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-large",
      input: combinedText
    });
    const embedding = embeddingResponse.data[0].embedding;

    // Atualizar documento com conhecimento e status aprovado
    const result = await collection.updateOne(
      { _id: new ObjectId(id) },
      {
        $set: {
          status: 'approved',
          defectType,
          diagnosis,
          solution,
          embedding,
          approvedAt: new Date()
        }
      }
    );

    if (result.modifiedCount === 0) {
      return res.status(500).json({ success: false, message: 'Erro ao aprovar documento' });
    }

    console.log(`✅ [VISUAL-RAG] Foto pendente aprovada e treinada: ${id}`);

    res.json({
      success: true,
      message: 'Conhecimento visual aprovado e adicionado com sucesso!'
    });
  } catch (err) {
    console.error('❌ [VISUAL-RAG] Erro ao aprovar foto pendente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/visual-knowledge/pending - Adicionar foto pendente automaticamente (chamado pelo bot)
app.post("/api/visual-knowledge/pending", upload.single('image'), async (req, res) => {
  try {
    const { userName, userPhone, lastUserMessage, autoAnalysis } = req.body;
    const imageFile = req.file;

    if (!imageFile) {
      return res.status(400).json({ success: false, message: 'Imagem obrigatoria' });
    }

    console.log(`📸 [VISUAL-RAG] Salvando foto pendente para treinamento`);

    // Upload da imagem para Cloudinary
    const cloudinaryResult = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder: 'quanton3d/visual-knowledge-pending',
          resource_type: 'image',
          transformation: [{ width: 800, height: 800, crop: 'limit' }]
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(imageFile.buffer);
    });

    const imageUrl = cloudinaryResult.secure_url;

    // Salvar documento pendente no MongoDB
    const collection = getVisualKnowledgeCollection();
    const pendingDoc = {
      imageUrl,
      status: 'pending',
      source: 'user',
      userName: userName || 'Anonimo',
      userPhone: userPhone || null,
      lastUserMessage: lastUserMessage || null,
      autoAnalysis: autoAnalysis || null,
      defectType: null,
      diagnosis: '',
      solution: '',
      embedding: null,
      createdAt: new Date()
    };

    const result = await collection.insertOne(pendingDoc);

    console.log(`✅ [VISUAL-RAG] Foto pendente salva: ${result.insertedId}`);

    res.json({
      success: true,
      message: 'Foto salva para treinamento',
      documentId: result.insertedId.toString()
    });
  } catch (err) {
    console.error('❌ [VISUAL-RAG] Erro ao salvar foto pendente:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== FIM DO VISUAL RAG =====

// ===== SISTEMA DE FEEDBACK E MELHORIA DE CONHECIMENTO =====
// Adicionar no server.js - NOVAS ROTAS

// Rota para adicionar conhecimento baseado em feedback
app.post("/api/add-knowledge-from-feedback", async (req, res) => {
  try {
    const { auth, title, content, conversationId, originalQuestion, originalReply } = req.body;

    // Autenticação
    if (auth !== process.env.ADMIN_SECRET || auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    if (!title || !content) {
      return res.status(400).json({ 
        success: false, 
        error: 'Título e conteúdo são obrigatórios' 
      });
    }

    console.log(`📚 [FEEDBACK] Adicionando conhecimento: ${title}`);

    // Formatar conteúdo com metadados
    const formattedContent = `${title}

${content}

---
ORIGEM: Feedback de conversa
DATA: ${new Date().toISOString()}
PERGUNTA ORIGINAL: ${originalQuestion || 'N/A'}
RESPOSTA ANTERIOR (INCORRETA): ${originalReply ? originalReply.substring(0, 200) + '...' : 'N/A'}`;

    // Adicionar ao RAG usando função existente
    const result = await addDocument(title, formattedContent, 'admin_feedback');

    console.log(`✅ [FEEDBACK] Conhecimento adicionado ao RAG: ${result.documentId}`);

    // Marcar conversa como "melhorada" nas métricas
    if (conversationId) {
      const metricIndex = conversationMetrics.findIndex(
        m => m.sessionId === conversationId || 
             (m.message === originalQuestion && m.reply === originalReply)
      );
      
      if (metricIndex !== -1) {
        conversationMetrics[metricIndex].feedbackAdded = true;
        conversationMetrics[metricIndex].feedbackDocumentId = result.documentId.toString();
        conversationMetrics[metricIndex].feedbackAddedAt = new Date().toISOString();
      }
    }

    res.json({
      success: true,
      message: 'Conhecimento adicionado com sucesso ao RAG!',
      documentId: result.documentId.toString(),
      title
    });
  } catch (err) {
    console.error('❌ [FEEDBACK] Erro ao adicionar conhecimento:', err);
    res.status(500).json({
      success: false,
      error: 'Erro ao adicionar conhecimento',
      message: err.message
    });
  }
});

// Rota para marcar conversa como "resposta ruim"
app.put("/api/mark-bad-response/:index", async (req, res) => {
  try {
    const { auth, reason } = req.body;
    const index = parseInt(req.params.index);

    // Autenticação
    if (auth !== process.env.ADMIN_SECRET || auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    if (index < 0 || index >= conversationMetrics.length) {
      return res.status(404).json({ success: false, message: 'Conversa não encontrada' });
    }

    conversationMetrics[index].markedAsBad = true;
    conversationMetrics[index].badResponseReason = reason || 'Não especificado';
    conversationMetrics[index].markedAt = new Date().toISOString();

    console.log(`⚠️ [FEEDBACK] Conversa ${index} marcada como ruim: ${reason}`);

    res.json({
      success: true,
      message: 'Resposta marcada como ruim',
      index
    });
  } catch (err) {
    console.error('❌ [FEEDBACK] Erro ao marcar resposta:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Rota para obter estatísticas de feedback
app.get("/api/feedback-stats", async (req, res) => {
  try {
    const { auth } = req.query;

    // Autenticação
    if (auth !== process.env.ADMIN_SECRET || auth !== 'quanton3d_admin_secret') {
      return res.status(401).json({ success: false, message: 'Não autorizado' });
    }

    const totalConversations = conversationMetrics.length;
    const conversationsWithFeedback = conversationMetrics.filter(c => c.feedbackAdded).length;
    const badResponses = conversationMetrics.filter(c => c.markedAsBad).length;
    const pendingReview = conversationMetrics.filter(
      c => !c.feedbackAdded && !c.markedAsBad && c.documentsFound === 0
    ).length;

    const stats = {
      total: totalConversations,
      withFeedback: conversationsWithFeedback,
      markedAsBad: badResponses,
      pendingReview,
      improvementRate: totalConversations > 0 
        ? ((conversationsWithFeedback / totalConversations) * 100).toFixed(1)
        : 0
    };

    res.json({
      success: true,
      stats
    });
  } catch (err) {
    console.error('❌ [FEEDBACK] Erro ao obter estatísticas:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ===== ADICIONAR ESTAS ROTAS NO server.js =====
// Cole este código ANTES da linha "const PORT = process.env.PORT || 3001;"
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
